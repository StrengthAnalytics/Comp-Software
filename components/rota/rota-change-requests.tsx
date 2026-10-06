'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeRotaSignupAction, resolveRotaChangeRequestAction } from '@/actions/rota';
import { ROTA_CHANGE_KIND_LABELS, type RotaChangeKind } from '@/types/rota';
import { Button } from '@/components/ui/button';
import { rotaSlotLabel } from '@/components/rota/rota-admin-grid';
import type { RotaBuilderSection, RotaSignupSummary } from '@/components/rota/rota-builder';

const NETWORK_ERROR = 'Could not reach the server — please try again.';

export type RotaChangeRequestSummary = {
  id: string;
  role_id: string | null;
  name: string;
  contact: string;
  kind: RotaChangeKind;
  message: string | null;
  created_at: string;
};

// "5 Oct, 14:32" — when the request arrived, in UK style.
function formatReceived(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase().replaceAll(/\s+/g, ' ');
}

// The contact details on a sign-up, to compare with a change request's.
function signupContact(signup: RotaSignupSummary): string {
  const details = [signup.email, signup.phone].filter(Boolean);
  return details.length > 0 ? details.join(' / ') : 'no contact details';
}

function ContactLink({ contact }: { contact: string }) {
  if (contact.includes('@')) {
    return (
      <a href={`mailto:${contact}`} className="text-brand-700 hover:underline">
        {contact}
      </a>
    );
  }
  return (
    <a href={`tel:${contact}`} className="text-brand-700 hover:underline">
      {contact}
    </a>
  );
}

function RequestCard({
  request,
  slotLabel,
  matchingSignup,
}: {
  request: RotaChangeRequestSummary;
  // Null when the request names no slot, or the slot it named has since been deleted (the request's
  // role_id is cleared when its role goes).
  slotLabel: string | null;
  // The sign-up in the named slot whose name matches the request's, offered for removal. The name
  // was typed by an anonymous visitor, so removal is confirmed against the contact details first.
  matchingSignup: RotaSignupSummary | null;
}) {
  const router = useRouter();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function markDone() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await resolveRotaChangeRequestAction({ id: request.id });
        if (result.status === 'error') {
          setError(result.message);
          return;
        }
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  function removeAndMarkDone() {
    if (!matchingSignup) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const removed = await removeRotaSignupAction({ id: matchingSignup.id });
        if (removed.status === 'error') {
          setError(removed.message);
          setConfirmingRemove(false);
          return;
        }
        const resolved = await resolveRotaChangeRequestAction({ id: request.id });
        if (resolved.status === 'error') {
          setError(`Removed ${matchingSignup.name}, but ${resolved.message.toLowerCase()}`);
        }
        router.refresh();
      } catch {
        setError(NETWORK_ERROR);
      }
    });
  }

  return (
    <li className="rounded-md border border-amber-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-neutral-900">
          {request.name} <span className="font-normal text-neutral-600">· {ROTA_CHANGE_KIND_LABELS[request.kind]}</span>
        </p>
        <p className="text-xs text-neutral-500">{formatReceived(request.created_at)}</p>
      </div>
      <p className="mt-1 text-sm text-neutral-700">
        Slot: <span className="font-medium">{slotLabel ?? 'Several slots / not sure, or a slot since removed'}</span>
      </p>
      {request.message ? <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{request.message}</p> : null}
      <p className="mt-1 text-sm">
        <ContactLink contact={request.contact} />
      </p>
      {matchingSignup && request.kind === 'drop_out' && confirmingRemove ? (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-neutral-800">
          <p>
            Remove {matchingSignup.name} from {slotLabel}? Anyone can send a request, so check it&rsquo;s really
            them: the request came from <span className="font-medium">{request.contact}</span>, and their sign-up
            has <span className="font-medium">{signupContact(matchingSignup)}</span>.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="danger" onClick={removeAndMarkDone} disabled={pending}>
              Yes, remove and mark done
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmingRemove(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {matchingSignup && request.kind === 'drop_out' ? (
            <Button size="sm" variant="danger" onClick={() => setConfirmingRemove(true)} disabled={pending}>
              Remove {matchingSignup.name} and mark done
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={markDone} disabled={pending}>
            Mark as done
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}

type RotaChangeRequestsProps = {
  requests: RotaChangeRequestSummary[];
  sections: RotaBuilderSection[];
};

// The organiser's inbox of volunteers' "Request a change" messages (they can't edit the rota
// themselves). Each request can be marked done; a drop-out whose name matches someone in the slot
// they picked gets a "remove and mark done", confirmed against that person's contact details. Swaps are done from the grid (tap the name,
// Move), then marked done here.
export function RotaChangeRequests({ requests, sections }: RotaChangeRequestsProps) {
  if (requests.length === 0) {
    return <p className="text-sm text-neutral-500">No change requests waiting.</p>;
  }

  const slotByRole = new Map(
    sections.flatMap((section) => section.roles.map((role) => [role.id, { section, role }] as const)),
  );

  const ordered = requests.toSorted((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <section aria-labelledby="rota-change-requests-heading" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 id="rota-change-requests-heading" className="text-base font-semibold text-amber-900">
        Change requests ({requests.length})
      </h2>
      <p className="mt-0.5 text-sm text-amber-800">
        Volunteers asking to drop out or swap. Update the rota, then mark each one done.
      </p>
      <ul aria-live="polite" className="mt-3 space-y-2">
        {ordered.map((request) => {
          const slot = request.role_id ? slotByRole.get(request.role_id) : undefined;
          const slotLabel = slot ? rotaSlotLabel(slot.section, slot.role) : null;
          const matchingSignup =
            slot?.role.signups.find((signup) => normaliseName(signup.name) === normaliseName(request.name)) ?? null;
          return (
            <RequestCard key={request.id} request={request} slotLabel={slotLabel} matchingSignup={matchingSignup} />
          );
        })}
      </ul>
    </section>
  );
}
