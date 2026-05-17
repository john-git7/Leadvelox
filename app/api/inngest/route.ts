import { serve } from "inngest/next";
import { inngest } from "../../../inngest/client";
import { slaCheck, retryQueue } from "../../../inngest/functions";

// Create an API that serves zero-downtime background jobs
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    slaCheck,
    retryQueue,
  ],
});
