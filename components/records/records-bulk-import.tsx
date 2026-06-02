'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { bulkUpsertRecordsAction, type BulkRecordSummary } from '@/actions/records';
import { parseRecordsImport, recordImportHeader } from '@/lib/records/bulk-import';

const GHOST_BUTTON =
  'rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50';
const PRIMARY_BUTTON =
  'rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50';

const COPY_RESET_MS = 2000;
const MAX_PROBLEMS_SHOWN = 50;

function ImportResult({ summary }: { summary: BulkRecordSummary }) {
  const saved = summary.created + summary.updated;
  const notable = summary.outcomes.filter(
    (outcome) => outcome.status === 'error' || outcome.status === 'skipped' || outcome.message !== null,
  );

  return (
    <div className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 p-4">
      <p className="text-sm font-medium text-neutral-800">
        Saved {saved} record{saved === 1 ? '' : 's'} ({summary.created} new, {summary.updated} updated)
        {summary.skipped > 0 ? `, skipped ${summary.skipped}` : ''}
        {summary.errors > 0 ? `, ${summary.errors} with errors` : ''}.
      </p>
      {notable.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs">
          {notable.map((outcome) => (
            <li
              key={`${outcome.line}-${outcome.label}`}
              className={outcome.status === 'error' ? 'text-red-600' : 'text-neutral-600'}
            >
              Row {outcome.line} ({outcome.label}): {outcome.status}
              {outcome.message ? ` — ${outcome.message}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RecordsBulkImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<BulkRecordSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const header = recordImportHeader();
  const rows = useMemo(() => (text.trim() === '' ? [] : parseRecordsImport(text)), [text]);
  const problemRows = rows.filter((row) => row.errors.length > 0);
  const warningRows = rows.filter((row) => row.errors.length === 0 && row.warnings.length > 0);
  const readyCount = rows.length - problemRows.length;

  async function copyHeader() {
    setError(null);
    try {
      await globalThis.navigator.clipboard.writeText(header);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      setError('Could not copy automatically — select the header text and copy it manually.');
    }
  }

  function runImport() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await bulkUpsertRecordsAction({ text });
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
            <h2 className="text-lg font-semibold tracking-tight">Bulk add / update</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Manage the whole dataset by pasting a spreadsheet. Existing records (same region, gender, class, age,
              lift and equipment) are updated; new ones are added.
            </p>
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
        <h2 className="text-lg font-semibold tracking-tight">Bulk add / update</h2>
        <button type="button" onClick={() => setOpen(false)} className={GHOST_BUTTON}>
          Close
        </button>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-sm font-medium text-neutral-800">1. Copy these headers into row 1 of a Google Sheet</p>
        <div className="flex items-start gap-2">
          <code className="block flex-1 overflow-x-auto whitespace-pre rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            {header}
          </code>
          <button type="button" onClick={() => void copyHeader()} className={PRIMARY_BUTTON}>
            {copied ? 'Copied' : 'Copy headers'}
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          Gender accepts M/F or Male/Female. Lift accepts Squat, Bench Press, Bench Press A/C, Deadlift, Total.
          Equipment accepts Equipped/Unequipped (or Raw/Classic). Dates accept YYYY-MM-DD or DD/MM/YYYY.
        </p>
      </div>

      <div className="mt-5 space-y-2">
        <p className="text-sm font-medium text-neutral-800">2. Fill one record per row, then paste the rows back here</p>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          placeholder="Paste rows from Google Sheets…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs text-neutral-900 focus:border-neutral-500 focus:outline-none"
        />
      </div>

      {rows.length > 0 ? (
        <div className="mt-3 text-sm text-neutral-700">
          <p>
            {readyCount} ready to import
            {warningRows.length > 0 ? `, ${warningRows.length} with warnings (still imported)` : ''}
            {problemRows.length > 0 ? `, ${problemRows.length} with problems (will be skipped)` : ''}.
          </p>
          {problemRows.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-red-600">
              {problemRows.slice(0, MAX_PROBLEMS_SHOWN).map((row) => (
                <li key={row.line}>
                  Row {row.line}: {row.errors.join(' ')}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={runImport} disabled={pending || readyCount === 0} className={PRIMARY_BUTTON}>
          {pending ? 'Importing…' : `Import ${readyCount} record${readyCount === 1 ? '' : 's'}`}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>

      {result ? <ImportResult summary={result} /> : null}
    </section>
  );
}
