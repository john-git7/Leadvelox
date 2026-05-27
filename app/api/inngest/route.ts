import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { retryQueue } from "../../../inngest/functions";

// Create an API that serves the retry-queue background job.
// SLA escalation is handled exclusively by the Vercel HTTP cron at /api/cron/sla.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    retryQueue,
  ],
});
