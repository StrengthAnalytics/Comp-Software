import { ROTA_CHANGE_KIND_LABELS, type RotaChangeKind } from '@/types/rota';

// The email the organisers get when a volunteer sends a "Request a change" from the public rota
// board. Pure, so its wording is unit-tested; actions/rota.ts sends it.

export type ChangeRequestEmailInput = {
  competitionName: string;
  name: string;
  contact: string;
  kind: RotaChangeKind;
  // "Sat AM · MC", or null when the volunteer didn't pick a slot.
  slotLabel: string | null;
  message: string | null;
  // The admin rota screen, where the request waits to be marked done. Null when it can't be built.
  rotaUrl: string | null;
};

const SUBJECT_ACTION: Record<RotaChangeKind, string> = {
  drop_out: 'wants to drop out',
  swap: 'wants to swap slots',
  other: 'has a rota request',
};

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(value: string): boolean {
  return LOOKS_LIKE_EMAIL.test(value.trim());
}

export function buildChangeRequestEmail(input: ChangeRequestEmailInput): { subject: string; text: string } {
  const subject = `${input.competitionName} rota: ${input.name} ${SUBJECT_ACTION[input.kind]}`;
  const lines = [
    `${input.name} has sent a change request on the ${input.competitionName} volunteer rota.`,
    '',
    `Request: ${ROTA_CHANGE_KIND_LABELS[input.kind]}`,
    `Slot: ${input.slotLabel ?? 'Not given (several slots / not sure)'}`,
    `Contact: ${input.contact}`,
  ];
  if (input.message) {
    lines.push('', 'Message:', input.message);
  }
  lines.push(
    '',
    input.rotaUrl
      ? `Open the rota to sort it out and mark it done: ${input.rotaUrl}`
      : 'Open the Staff rota screen to sort it out and mark it done.',
  );
  if (isEmailAddress(input.contact)) {
    lines.push('', `Reply to this email to answer ${input.name} directly.`);
  }
  return { subject, text: lines.join('\n') };
}
