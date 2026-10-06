import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildEntryAcceptedEmail,
  buildEntryReceivedEmail,
  buildEntryRejectedEmail,
  formatCompDates,
} from '@/lib/entries/entry-emails';
import { organiserReplyTo } from '@/lib/email/resend';

const comp = {
  name: 'Summer Showdown',
  startsOn: '2026-07-11',
  endsOn: '2026-07-12',
  url: 'https://platformpro.app/summer-showdown',
};

describe('formatCompDates', () => {
  it('formats one day, a weekend and a month-spanning comp', () => {
    expect(formatCompDates('2026-07-11', null)).toBe('11 July 2026');
    expect(formatCompDates('2026-07-11', '2026-07-11')).toBe('11 July 2026');
    expect(formatCompDates('2026-07-11', '2026-07-12')).toBe('11 to 12 July 2026');
    expect(formatCompDates('2026-07-31', '2026-08-01')).toBe('31 July 2026 to 1 August 2026');
    expect(formatCompDates(null, '2026-07-12')).toBeNull();
  });
});

describe('buildEntryReceivedEmail', () => {
  const input = {
    comp,
    firstName: 'Jane',
    fullName: 'Jane Smith',
    weightClass: '-63 kg',
    club: 'Iron Works',
    division: null,
    kit: 'Raw',
    event: null,
    canReply: true,
  };

  it('thanks the lifter, lists what they sent and says their place is not confirmed yet', () => {
    const email = buildEntryReceivedEmail(input);
    expect(email.subject).toBe('We’ve got your entry for Summer Showdown');
    expect(email.text).toContain('Hi Jane,');
    expect(email.text).toContain('Thanks for entering Summer Showdown (11 to 12 July 2026).');
    expect(email.text).toContain('Name: Jane Smith\nWeight class: -63 kg\nClub: Iron Works\nKit: Raw\n');
    expect(email.text).not.toContain('Division:');
    expect(email.text).not.toContain('Event:');
    expect(email.text).toContain('Your place isn’t confirmed yet.');
    expect(email.text).toContain('Competition page: https://platformpro.app/summer-showdown');
    expect(email.text).toContain('just reply to this email');
  });

  it('says not to reply when there is no reply-to address, and copes without a link', () => {
    const email = buildEntryReceivedEmail({ ...input, canReply: false, comp: { ...comp, url: null } });
    expect(email.text).toContain('Please don’t reply to this email');
    expect(email.text).not.toContain('Competition page:');
  });
});

describe('buildEntryAcceptedEmail', () => {
  it('confirms the place with the class, category and where times will appear', () => {
    const email = buildEntryAcceptedEmail({
      comp,
      firstName: 'Jane',
      weightClass: '-63 kg',
      ageCategory: 'Open',
      canReply: false,
    });
    expect(email.subject).toBe('You’re in: Summer Showdown');
    expect(email.text).toContain('your entry for Summer Showdown (11 to 12 July 2026) has been accepted');
    expect(email.text).toContain('Weight class: -63 kg\nAge category: Open');
    expect(email.text).toContain('on the competition page nearer the day: https://platformpro.app/summer-showdown');
    expect(email.text).toContain('See you on the platform!');
  });

  it('leaves out missing details, dates and the link', () => {
    const email = buildEntryAcceptedEmail({
      comp: { ...comp, startsOn: null, url: null },
      firstName: 'Jane',
      weightClass: null,
      ageCategory: null,
      canReply: true,
    });
    expect(email.text).toContain('your entry for Summer Showdown has been accepted');
    expect(email.text).not.toContain('Weight class:');
    expect(email.text).toContain('The organisers will share session, flight and weigh-in times nearer the day.');
  });
});

describe('buildEntryRejectedEmail', () => {
  it('lets the lifter down politely', () => {
    const email = buildEntryRejectedEmail({ comp, firstName: 'Jane', canReply: true });
    expect(email.subject).toBe('Your entry for Summer Showdown');
    expect(email.text).toContain('weren’t able to accept your entry this time');
    expect(email.text).toContain('just reply to this email');
  });
});

describe('organiserReplyTo', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers the comp's organiser email, then RESEND_REPLY_TO_EMAIL, treating blank as unset", () => {
    vi.stubEnv('RESEND_REPLY_TO_EMAIL', ' comps@platformpro.app ');
    expect(organiserReplyTo('henry@example.com')).toBe('henry@example.com');
    expect(organiserReplyTo(null)).toBe('comps@platformpro.app');
    vi.stubEnv('RESEND_REPLY_TO_EMAIL', '  ');
    expect(organiserReplyTo(null)).toBeUndefined();
  });
});
