import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EVENT_TYPE_LABELS, KIT_TYPE_LABELS } from '@/lib/constants';
import { DuplicateCompButton } from '@/components/comps/duplicate-comp-button';
import { buttonClasses } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { CompStatusBadge } from '@/components/ui/status-badge';

function formatDateRange(startsOn: string | null, endsOn: string | null): string {
  if (!startsOn && !endsOn) {
    return '—';
  }
  if (startsOn && endsOn && startsOn !== endsOn) {
    return `${startsOn} – ${endsOn}`;
  }
  return startsOn ?? endsOn ?? '—';
}

export default async function CompsPage() {
  const supabase = await createClient();
  const { data: comps } = await supabase
    .from('competitions')
    .select('id, name, slug, status, kit_type, event_type, starts_on, ends_on')
    .order('created_at', { ascending: false });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Competitions</h1>
        <Link href="/comps/new" className={buttonClasses('primary')}>
          New competition
        </Link>
      </div>

      {!comps || comps.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No competitions yet"
          description="A competition holds everything for one meet — its weight classes, age categories, lifters, flights and results. Create one to get started."
          action={
            <Link href="/comps/new" className={buttonClasses('primary')}>
              Create your first competition
            </Link>
          }
        />
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Kit</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {comps.map((comp) => (
                <tr key={comp.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/${comp.slug}/checklist`} className="font-medium text-neutral-900 hover:underline">
                      {comp.name}
                    </Link>
                    <div className="text-xs text-neutral-500">/{comp.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <CompStatusBadge status={comp.status} />
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{EVENT_TYPE_LABELS[comp.event_type]}</td>
                  <td className="px-4 py-3 text-neutral-700">{KIT_TYPE_LABELS[comp.kit_type]}</td>
                  <td className="px-4 py-3 text-neutral-700">
                    {formatDateRange(comp.starts_on, comp.ends_on)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/comps/${comp.id}/edit`}
                        className="text-sm text-neutral-600 hover:text-neutral-900 hover:underline"
                      >
                        Setup
                      </Link>
                      <DuplicateCompButton competitionId={comp.id} name={comp.name} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
