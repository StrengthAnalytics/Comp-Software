import * as Sentry from '@sentry/nextjs';

export function initSentryClient() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: process.env.NODE_ENV === 'production',
    tracesSampleRate: 1,
  });
}
