'use client';

import { useState } from 'react';
import { approveSubmissionAction, rejectSubmissionAction } from '@/actions/entry-form';
import {
  ENTRY_FORM_EVENT_LABELS,
  ENTRY_FORM_KIT_LABELS,
  type EntryFormEventChoice,
  type EntryFormKitChoice,
} from '@/lib/constants';
import { useDebouncedRefresh } from '@/lib/realtime/use-debounced-refresh';
import { useEntrySubmissionsSubscription } from '@/lib/realtime/use-entry-submissions-subscription';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// What the entries page passes per pending submission — the card shows exactly what the lifter
// answered, so every toggleable field is nullable.
export type PendingSubmission = {
  id: string;
  firstName: string;
  surname: string;
  gender: string;
  dateOfBirth: string;
  club: string | null;
  ipfMemberId: string | null;
  division: string | null;
  weightClass: string | null;
  predictedTotalKg: number | null;
  recentBestTotalKg: number | null;
  kitChoice: string | null;
  eventChoice: string | null;
  instagram: string | null;
  email: string | null;
  phone: string | null;
  disclaimerAcceptedAt: string | null;
  createdAt: string;
  // True when a lifter with this name is already registered in this comp — the likeliest duplicate.
  possibleDuplicate: boolean;
};

type SubmissionsInboxProps = {
  competitionId: string;
  submissions: PendingSubmission[];
};

// "11 Jul 2026, 14:32" — when the submission arrived.
function formatSubmittedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function kitLabel(value: string): string {
  // The CHECK constraint pins the stored codes to the choice values; anything else shows raw.
  return value in ENTRY_FORM_KIT_LABELS ? ENTRY_FORM_KIT_LABELS[value as EntryFormKitChoice] : value;
}

function eventLabel(value: string): string {
  // Same CHECK-constraint narrowing as kitLabel.
  return value in ENTRY_FORM_EVENT_LABELS ? ENTRY_FORM_EVENT_LABELS[value as EntryFormEventChoice] : value;
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (value === null || value === '') {
    return null;
  }
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="truncate text-right font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

// One pending submission: a red-tinted review card. Approve runs the standard registration path
// server-side; Reject asks for an inline confirm first. Both reconcile via router.refresh — the
// card leaves the inbox when the server snapshot no longer lists it as pending.
function SubmissionCard({
  competitionId,
  submission,
  onResolved,
}: {
  competitionId: string;
  submission: PendingSubmission;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [confirmingReject, setConfirmingReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(kind: 'approve' | 'reject') {
    setBusy(kind);
    setError(null);
    const action = kind === 'approve' ? approveSubmissionAction : rejectSubmissionAction;
    const result = await action({ competitionId, submissionId: submission.id });
    setBusy(null);
    if (result.status === 'error') {
      setError(result.message);
      setConfirmingReject(false);
      return;
    }
    onResolved();
  }

  const name = `${submission.firstName} ${submission.surname}`.trim();

  return (
    <li className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{name}</p>
          <p className="text-xs text-neutral-500">
            Submitted {formatSubmittedAt(submission.createdAt)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          Awaiting approval
        </span>
      </div>

      {submission.possibleDuplicate ? (
        <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          A lifter with this name is already registered in this competition — check before approving.
        </p>
      ) : null}

      <dl className="mt-3 space-y-1 border-t border-red-100 pt-3">
        <Detail label="Sex" value={submission.gender === 'male' ? 'Male' : 'Female'} />
        <Detail label="Date of birth" value={submission.dateOfBirth} />
        <Detail label="Club" value={submission.club} />
        <Detail label="Membership no." value={submission.ipfMemberId} />
        <Detail label="Division" value={submission.division} />
        <Detail label="Weight class" value={submission.weightClass} />
        <Detail
          label="Predicted total"
          value={submission.predictedTotalKg === null ? null : `${submission.predictedTotalKg} kg`}
        />
        <Detail
          label="Best total (12 months)"
          value={submission.recentBestTotalKg === null ? null : `${submission.recentBestTotalKg} kg`}
        />
        <Detail label="Kit" value={submission.kitChoice === null ? null : kitLabel(submission.kitChoice)} />
        <Detail
          label="Event"
          value={submission.eventChoice === null ? null : eventLabel(submission.eventChoice)}
        />
        <Detail
          label="Instagram"
          value={submission.instagram === null ? null : `@${submission.instagram}`}
        />
        <Detail label="Email" value={submission.email} />
        <Detail label="Phone" value={submission.phone} />
        <Detail
          label="Disclaimer"
          value={submission.disclaimerAcceptedAt === null ? null : 'Accepted'}
        />
      </dl>

      <div className="mt-3 flex items-center gap-2 border-t border-red-100 pt-3">
        {confirmingReject ? (
          <>
            <Button variant="danger" size="sm" disabled={busy !== null} onClick={() => review('reject')}>
              {busy === 'reject' ? 'Rejecting…' : 'Confirm reject'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => setConfirmingReject(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={busy !== null} onClick={() => review('approve')}>
              {busy === 'approve' ? 'Approving…' : 'Approve entry'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => setConfirmingReject(true)}
            >
              Reject
            </Button>
          </>
        )}
      </div>

      {error === null ? null : (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}

// The public entry form's review inbox — the "Awaiting approval" tab on the entries screen: every
// pending submission as a red card, refreshing live as lifters submit (or another device reviews).
// The tab's count badge comes from the same server-snapshot list, so a review here updates it too.
// The label and count live on the tab, so the panel itself is just the cards (or the empty state).
export function SubmissionsInbox({ competitionId, submissions }: SubmissionsInboxProps) {
  const scheduleRefresh = useDebouncedRefresh();
  useEntrySubmissionsSubscription(competitionId, scheduleRefresh);

  if (submissions.length === 0) {
    return (
      <EmptyState
        title="No entries awaiting approval"
        description="When lifters register through the public entry form, their submissions wait here for your review — nothing joins the competition until you approve it. Share the form from the Add lifters tab."
      />
    );
  }

  return (
    <section aria-label="Entry submissions awaiting approval">
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {submissions.map((submission) => (
          <SubmissionCard
            key={submission.id}
            competitionId={competitionId}
            submission={submission}
            onResolved={scheduleRefresh}
          />
        ))}
      </ul>
    </section>
  );
}
