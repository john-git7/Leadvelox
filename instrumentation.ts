/**
 * instrumentation.ts — server-side observability hook (Next.js 15+)
 *
 * Initialises Sentry on the Node.js and Edge runtimes.
 * Called once when the Next.js server boots; runs before any requests are handled.
 *
 * NEXT_PUBLIC_SENTRY_DSN must be set in Vercel environment variables.
 * If the DSN is absent this file is a no-op (safe in local dev).
 */
import { type Instrumentation } from 'next';

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,        // 10% of transactions sampled
      environment: process.env.NODE_ENV,
      debug: false,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV,
      debug: false,
    });
  }
}

/**
 * onRequestError — surfaces unhandled Server Component and Route Handler errors
 * to Sentry with full request context.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  const { captureException, withScope } = await import('@sentry/nextjs');

  withScope(scope => {
    scope.setTag('routeType', context.routeType);
    scope.setTag('routePath', context.routePath);
    scope.setTag('routerKind', context.routerKind);
    scope.setExtra('request', {
      path: request.path,
      method: request.method,
    });
    captureException(err);
  });
};
