import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCompBySlug } from '@/lib/comps/get-comp-by-slug';
import { isCompPubliclyVisible } from '@/lib/comps/meet-status';
import { daysBetweenIsoDates } from '@/lib/dates';
import {
  buildSetupChecklist,
  checklistProgress,
  type ChecklistItem,
} from '@/lib/comps/setup-checklist';
import { EVENT_TYPE_LABELS, KIT_TYPE_LABELS } from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { CompStatusBadge } from '@/components/ui/status-badge';
import { IconCheck, IconExternalLink } from '@/components/shell/icons';

// UK-style "11 July 2026"; comp dates are stored as ISO date strings.
function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function dateRangeText(startsOn: string | null, endsOn: string | null): string {
  if (!startsOn) {
    return 'No date set';
  }
  if (!endsOn || endsOn === startsOn) {
    return formatDate(startsOn);
  }
  return `${formatDate(startsOn)} – ${formatDate(endsOn)}`;
}

function daysToGoText(daysToGo: number | null): string {
  if (daysToGo === null) {
    return '—';
  }
  if (daysToGo > 0) {
    return `${daysToGo}`;
  }
  return daysToGo === 0 ? 'Today' : 'Done';
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}

function StateIndicator({ state }: { state: ChecklistItem['state'] }) {
  if (state === 'done') {
    return (
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <IconCheck className="h-3 w-3" />
      </span>
    );
  }
  if (state === 'partial') {
    return (
      <span
        className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-amber-400 bg-amber-100"
        aria-hidden="true"
      />
    );
  }
  return (
    <span className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-neutral-300" aria-hidden="true" />
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-neutral-50"
      >
        <StateIndicator state={item.state} />
        <span
          className={`min-w-0 flex-1 truncate text-sm font-medium ${
            item.state === 'done' ? 'text-neutral-500' : 'text-neutral-900'
          }`}
        >
          {item.label}
        </span>
        <span className="flex-shrink-0 text-xs text-neutral-500">{item.detail}</span>
      </Link>
    </li>
  );
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ 'comp-slug': string }>;
}) {
  const { 'comp-slug': slug } = await params;
  const comp = await getCompBySlug(slug);

  if (!comp) {
    notFound();
  }

  // Head-only count queries — the overview needs numbers, never rows. Run in parallel; a failed
  // count is reported (Sentry + a banner) rather than silently rendering 0 as if it were true.
  const supabase = await createClient();
  const countOf = (table: 'age_categories' | 'weight_classes' | 'platforms' | 'sessions' | 'teams') =>
    supabase.from(table).select('id', { count: 'exact', head: true }).eq('competition_id', comp.id);

  const [
    ageCategories,
    weightClasses,
    platforms,
    sessions,
    entries,
    entriesInFlights,
    entriesWeighedIn,
    teams,
  ] = await Promise.all([
    countOf('age_categories'),
    countOf('weight_classes'),
    countOf('platforms'),
    countOf('sessions'),
    supabase.from('entries').select('id', { count: 'exact', head: true }).eq('competition_id', comp.id),
    supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', comp.id)
      .not('flight_id', 'is', null),
    supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', comp.id)
      .not('bodyweight_kg', 'is', null),
    countOf('teams'),
  ]);

  const results = [
    ageCategories,
    weightClasses,
    platforms,
    sessions,
    entries,
    entriesInFlights,
    entriesWeighedIn,
    teams,
  ];
  const failed = results.filter((result) => result.error);
  for (const result of failed) {
    Sentry.captureException(result.error);
  }

  const items = buildSetupChecklist({
    compId: comp.id,
    slug: comp.slug,
    isTeamCompetition: comp.is_team_competition,
    hasStartDate: comp.starts_on !== null,
    ageCategoryCount: ageCategories.count ?? 0,
    weightClassCount: weightClasses.count ?? 0,
    platformCount: platforms.count ?? 0,
    sessionCount: sessions.count ?? 0,
    entryCount: entries.count ?? 0,
    entriesInFlights: entriesInFlights.count ?? 0,
    entriesWeighedIn: entriesWeighedIn.count ?? 0,
    teamCount: teams.count ?? 0,
  });
  const progress = checklistProgress(items);

  const todayIso = new Date().toISOString().slice(0, 10);
  const daysToGo = comp.starts_on ? daysBetweenIsoDates(todayIso, comp.starts_on) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{comp.name}</h1>
            <CompStatusBadge status={comp.status} />
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            {dateRangeText(comp.starts_on, comp.ends_on)} · {KIT_TYPE_LABELS[comp.kit_type]} ·{' '}
            {EVENT_TYPE_LABELS[comp.event_type]}
            {comp.is_team_competition ? ' · Team competition' : ''}
          </p>
        </div>
        {isCompPubliclyVisible(comp.status) ? (
          <Link
            href={`/${comp.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            View public page
            <IconExternalLink className="h-3.5 w-3.5 text-neutral-400" />
            <span className="sr-only"> (opens in new tab)</span>
          </Link>
        ) : null}
      </div>

      {failed.length > 0 ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Some of these numbers couldn&rsquo;t be loaded just now — they may read low. Refresh to try
          again.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Lifters" value={`${entries.count ?? 0}`} />
        <StatCard
          label="Weighed in"
          value={`${entriesWeighedIn.count ?? 0} / ${entries.count ?? 0}`}
        />
        {comp.is_team_competition ? (
          <StatCard label="Teams" value={`${teams.count ?? 0}`} />
        ) : (
          <StatCard label="Sessions" value={`${sessions.count ?? 0}`} />
        )}
        <StatCard label="Days to go" value={daysToGoText(daysToGo)} />
      </div>

      <Card
        title="Setup checklist"
        action={
          <span className="text-sm text-neutral-500">
            {progress.done} of {progress.total} complete
          </span>
        }
      >
        <ul className="divide-y divide-neutral-100">
          {items.map((item) => (
            <ChecklistRow key={item.key} item={item} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
