/**
 * instrumentation-client.ts — client-side observability (Next.js 15.3+)
 *
 * Runs in the browser after HTML is loaded but before React hydration.
 * Sets up Sentry for client-side error tracking and navigation breadcrumbs.
 *
 * NEXT_PUBLIC_SENTRY_DSN must be set for any events to be captured.
 */
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV,
    debug: false,
    // Capture unhandled promise rejections and global window errors
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
  });
}

/**
 * onRouterTransitionStart — adds navigation breadcrumbs so Sentry issue traces
 * show which route the user was navigating to when an error occurred.
 */
export function onRouterTransitionStart(url: string, navigationType: string) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  Sentry.addBreadcrumb({
    category: 'navigation',
    message: `${navigationType} → ${url}`,
    level: 'info',
  });
}
