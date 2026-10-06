// The emails a lifter gets about their public-form entry: "we've got your entry" on submit, then
// "you're in" on approval or (when the admin ticks it) "not accepted" on rejection. Pure, so the
// wording is unit-tested; actions/entry-form.ts sends them, only to the address the lifter gave.

export type EntryEmailComp = {
  name: string;
  // ISO dates; either may be missing on a comp still being set up.
  startsOn: string | null;
  endsOn: string | null;
  // The comp's public landing page, or null when it can't be built.
  url: string | null;
};

export type EntryEmail = { subject: string; text: string };

// "11 July 2026", or "11 to 12 July 2026" for a two-day comp.
export function formatCompDates(startsOn: string | null, endsOn: string | null): string | null {
  if (!startsOn) {
    return null;
  }
  const format = (iso: string, parts: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { ...parts, timeZone: 'UTC' });
  const full: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  if (!endsOn || endsOn === startsOn) {
    return format(startsOn, full);
  }
  const sameMonth = startsOn.slice(0, 7) === endsOn.slice(0, 7);
  const start = sameMonth ? format(startsOn, { day: 'numeric' }) : format(startsOn, full);
  return `${start} to ${format(endsOn, full)}`;
}

function compWithDates(comp: EntryEmailComp): string {
  const dates = formatCompDates(comp.startsOn, comp.endsOn);
  return dates ? `${comp.name} (${dates})` : comp.name;
}

// The closing line: replies go to the organisers when a reply-to address is set up, otherwise the
// email comes from a no-reply address and says so.
function contactLine(canReply: boolean): string {
  return canReply
    ? 'If you have any questions, just reply to this email.'
    : 'Please don’t reply to this email; contact the organisers directly if you have any questions.';
}

function detailLines(details: Array<[label: string, value: string | null]>): string[] {
  return details
    .filter((detail): detail is [string, string] => Boolean(detail[1]))
    .map(([label, value]) => {
      return `${label}: ${value}`;
    });
}

export type EntryReceivedEmailInput = {
  comp: EntryEmailComp;
  firstName: string;
  fullName: string;
  weightClass: string | null;
  club: string | null;
  division: string | null;
  kit: string | null;
  event: string | null;
  canReply: boolean;
};

export function buildEntryReceivedEmail(input: EntryReceivedEmailInput): EntryEmail {
  const lines = [
    `Hi ${input.firstName},`,
    '',
    `Thanks for entering ${compWithDates(input.comp)}. We’ve received your entry and the organisers will review it shortly.`,
    '',
    'What you sent us:',
    ...detailLines([
      ['Name', input.fullName],
      ['Weight class', input.weightClass],
      ['Club', input.club],
      ['Division', input.division],
      ['Kit', input.kit],
      ['Event', input.event],
    ]),
    '',
    'Your place isn’t confirmed yet. You’ll get another email once the organisers have accepted your entry.',
  ];
  if (input.comp.url) {
    lines.push('', `Competition page: ${input.comp.url}`);
  }
  lines.push('', contactLine(input.canReply));
  return { subject: `We’ve got your entry for ${input.comp.name}`, text: lines.join('\n') };
}

export type EntryAcceptedEmailInput = {
  comp: EntryEmailComp;
  firstName: string;
  weightClass: string | null;
  ageCategory: string | null;
  canReply: boolean;
};

export function buildEntryAcceptedEmail(input: EntryAcceptedEmailInput): EntryEmail {
  const details = detailLines([
    ['Weight class', input.weightClass],
    ['Age category', input.ageCategory],
  ]);
  const lines = [
    `Hi ${input.firstName},`,
    '',
    `Good news: your entry for ${compWithDates(input.comp)} has been accepted. You’re in!`,
  ];
  if (details.length > 0) {
    lines.push('', ...details);
  }
  lines.push(
    '',
    input.comp.url
      ? `Session, flight and weigh-in times will be on the competition page nearer the day: ${input.comp.url}`
      : 'The organisers will share session, flight and weigh-in times nearer the day.',
    '',
    contactLine(input.canReply),
    '',
    'See you on the platform!',
  );
  return { subject: `You’re in: ${input.comp.name}`, text: lines.join('\n') };
}

export type EntryRejectedEmailInput = {
  comp: EntryEmailComp;
  firstName: string;
  canReply: boolean;
};

export function buildEntryRejectedEmail(input: EntryRejectedEmailInput): EntryEmail {
  const lines = [
    `Hi ${input.firstName},`,
    '',
    `Thank you for entering ${compWithDates(input.comp)}. Unfortunately the organisers weren’t able to accept your entry this time.`,
    '',
    contactLine(input.canReply),
  ];
  return { subject: `Your entry for ${input.comp.name}`, text: lines.join('\n') };
}
