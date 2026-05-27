import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // Sentry org/project — read from env so the config works without credentials
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps when an auth token is available (CI/Vercel)
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.SENTRY_AUTH_TOKEN, // Suppress warnings in local dev

  // Automatically instrument Vercel AI SDK + server components
  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware: true,
});
