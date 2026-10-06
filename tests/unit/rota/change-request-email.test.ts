import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChangeRequestEmail, isEmailAddress } from '@/lib/rota/change-request-email';
import { parseEmailList, sendEmail } from '@/lib/email/resend';

describe('buildChangeRequestEmail', () => {
  const base = {
    competitionName: 'Summer Showdown',
    name: 'Beth',
    contact: 'beth@example.com',
    kind: 'drop_out' as const,
    slotLabel: 'Sat AM · MC',
    message: null,
    rotaUrl: 'https://example.com/summer-showdown/rota',
  };

  it('says who, what and which slot, with a link to the rota', () => {
    const email = buildChangeRequestEmail(base);
    expect(email.subject).toBe('Summer Showdown rota: Beth wants to drop out');
    expect(email.text).toContain('Request: Drop out of a slot');
    expect(email.text).toContain('Slot: Sat AM · MC');
    expect(email.text).toContain('Contact: beth@example.com');
    expect(email.text).toContain('https://example.com/summer-showdown/rota');
    expect(email.text).toContain('Reply to this email to answer Beth directly.');
    expect(email.text).not.toContain('Message:');
  });

  it('keeps the subject on one line whatever the name contains', () => {
    const email = buildChangeRequestEmail({ ...base, name: 'Beth\r\nBcc: x@y.z' });
    expect(email.subject).toBe('Summer Showdown rota: Beth Bcc: x@y.z wants to drop out');
  });

  it('includes the message, a missing slot, and no reply hint for a phone number', () => {
    const email = buildChangeRequestEmail({
      ...base,
      kind: 'swap',
      contact: '07700 900123',
      slotLabel: null,
      message: 'Could I do Sunday instead?',
      rotaUrl: null,
    });
    expect(email.subject).toBe('Summer Showdown rota: Beth wants to swap slots');
    expect(email.text).toContain('Slot: Not given');
    expect(email.text).toContain('Message:\nCould I do Sunday instead?');
    expect(email.text).toContain('Open the Staff rota screen');
    expect(email.text).not.toContain('Reply to this email');
  });
});

describe('isEmailAddress', () => {
  it('tells an email from a phone number', () => {
    expect(isEmailAddress(' beth@example.com ')).toBe(true);
    expect(isEmailAddress('07700 900123')).toBe(false);
  });
});

describe('parseEmailList', () => {
  it('splits, trims and drops blanks', () => {
    expect(parseEmailList(' a@x.com, ,b@y.com ')).toEqual(['a@x.com', 'b@y.com']);
    expect(parseEmailList(process.env.SOME_UNSET_ENV_VAR_FOR_TEST)).toEqual([]);
  });
});

describe('sendEmail', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const message = { to: ['henry@example.com'], subject: 'Hi', text: 'Hello', replyTo: 'beth@example.com' };

  it('does nothing when Resend is not set up', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendEmail(message)).toEqual({ status: 'not_configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the email to Resend', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('RESEND_FROM_EMAIL', '');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendEmail(message)).toEqual({ status: 'sent' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body)).toEqual({
      from: 'Comp Software <onboarding@resend.dev>',
      to: ['henry@example.com'],
      subject: 'Hi',
      text: 'Hello',
      reply_to: 'beth@example.com',
    });
  });

  it('reports a failure without the message details', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    const result = await sendEmail(message);
    expect(result.status).toBe('failed');
    expect(result.status === 'failed' && result.error.message).toBe('Resend responded 403');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const offline = await sendEmail(message);
    expect(offline.status === 'failed' && offline.error.message).toBe('Could not reach Resend');
  });
});
