// Sends one plain-text email through Resend's HTTP API (https://resend.com/docs/api-reference) —
// a single fetch, so no SDK dependency. Server-only: RESEND_API_KEY has no NEXT_PUBLIC_ prefix.
//
// Email is a nice-to-have alongside the app (the thing it reports is already saved), so this never
// throws: it reports whether the email went, and the caller decides whether to log. When Resend
// isn't set up (no API key) it does nothing.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Resend's shared test sender. It works with no domain set up, but only delivers to the email
// address that owns the Resend account — enough for "email me", until RESEND_FROM_EMAIL is set to an
// address on a verified domain.
const DEFAULT_FROM = 'Comp Software <onboarding@resend.dev>';

export type EmailMessage = {
  to: string[];
  subject: string;
  text: string;
  // Where a reply goes (e.g. the volunteer who wrote in), when that's an email address.
  replyTo?: string;
};

export type EmailResult = { status: 'sent' } | { status: 'not_configured' } | { status: 'failed'; error: Error };

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || message.to.length === 0) {
    return { status: 'not_configured' };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
    });
    if (!response.ok) {
      // Only the status: the request body carries personal details, which never go to Sentry.
      return { status: 'failed', error: new Error(`Resend responded ${response.status}`) };
    }
    return { status: 'sent' };
  } catch {
    return { status: 'failed', error: new Error('Could not reach Resend') };
  }
}

// Where replies to the app's emails to lifters should go (RESEND_REPLY_TO_EMAIL, e.g. the
// organisers' inbox). Undefined when unset, and those emails then say not to reply.
export function organiserReplyTo(): string | undefined {
  return process.env.RESEND_REPLY_TO_EMAIL?.trim() || undefined;
}

// Comma-separated addresses from an env var, trimmed, blanks dropped.
export function parseEmailList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
