import * as Sentry from '@sentry/nextjs';
import { initSentryClient } from '@/sentry/client';

initSentryClient();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
