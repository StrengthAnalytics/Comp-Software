'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bulkAddTeamsAction, type BulkTeamSummary } from '@/actions/teams';
import { parseTeamNames } from '@/lib/teams/bulk-add';
import { buttonClasses } from '@/components/ui/button';

const GHOST_BUTTON = buttonClasses('secondary');
const PRIMARY_BUTTON = buttonClasses('primary');

const MAX_PROBLEMS_SHOWN = 50;

function AddResult({ summary }: { summary: BulkTeamSummary }) {
  const notable = summary.outcomes.filter((outcome) => outcome.status !== 'created');

  return (
    <div className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-sm font-medium text-neutral-800">
        Added {summary.created} team{summary.created === 1 ? '' : 's'}
        {summary.skipped > 0 ? `, skipped ${summary.skipped}` : ''}
        {summary.errors > 0 ? `, ${summary.errors} with errors` : ''}.
      </p>
      {notable.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs">
          {notable.slice(0, MAX_PROBLEMS_SHOWN).map((outcome) => (
            <li
              key={`${outcome.line}-${outcome.name}`}
              className={outcome.status === 'error' ? 'text-red-600' : 'text-neutral-600'}
            >
              {outcome.name}: {outcome.status}
              {outcome.message ? ` — ${outcome.message}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function BulkAddTeams({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState<BulkTeamSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const names = useMemo(() => (text.trim() === '' ? [] : parseTeamNames(text)), [text]);

  function run() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await bulkAddTeamsAction({ competitionId, text });
      if (outcome.status === 'error') {
        setError(outcome.message);
        return;
      }
      setResult(outcome.data);
      setText('');
      router.refresh();
    });
  }

  if (!open) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Bulk add teams</h2>
            <p className="mt-1 text-sm text-neutral-600">Create many teams at once by pasting a list of names.</p>
          </div>
          <button type="button" onClick={() => setOpen(true)} className={GHOST_BUTTON}>
            Open
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Bulk add teams</h2>
        <button type="button" onClick={() => setOpen(false)} className={GHOST_BUTTON}>
          Close
        </button>
      </div>

      <p className="mt-4 text-sm text-neutral-600">
        Paste one team name per line. Names that already exist are skipped. Add the lifters to each team afterwards.
      </p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={8}
        placeholder={'City Barbell A\nCity Barbell B\nIron Temple'}
        className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none"
      />

      {names.length > 0 ? (
        <p className="mt-2 text-sm text-neutral-700">
          {names.length} name{names.length === 1 ? '' : 's'} detected.
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={run} disabled={pending || names.length === 0} className={PRIMARY_BUTTON}>
          {pending ? 'Adding…' : `Add ${names.length} team${names.length === 1 ? '' : 's'}`}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      {result ? <AddResult summary={result} /> : null}
    </section>
  );
}
