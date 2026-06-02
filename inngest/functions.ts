import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase/server";
import { logLeadEvent } from "@/lib/orchestration";

const MAX_RETRIES = 5;
const FETCH_TIMEOUT_MS = 10_000; // 10 second hard timeout on all outbound webhook calls

/**
 * Exponential backoff: 30s, 60s, 120s, 240s, 480s
 */
function calculateBackoff(retryCount: number): Date {
  const baseDelaySecs = 30;
  const exponentialDelay = baseDelaySecs * Math.pow(2, retryCount);
  return new Date(Date.now() + exponentialDelay * 1000);
}

/**
 * Fetch wrapper with AbortController timeout.
 * Prevents cron function from hanging indefinitely on a slow/dead endpoint.
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * NOTE: SLA checking is driven exclusively by the Vercel HTTP cron at /api/cron/sla.
 * The Inngest slaCheck cron has been intentionally removed to eliminate the dual-cron
 * race condition that caused:
 *   - Duplicate escalation events in lead_events
 *   - Double n8n webhook fires at escalation level 3+
 *   - Double operator notifications
 *
 * Do NOT re-add an Inngest SLA cron here.
 */

/**
 * RETRY QUEUE — Inngest cron (every minute)
 *
 * Picks up automation_events with status='Retrying' whose next_retry_at has passed
 * and re-fires the webhook with exponential backoff. Permanently fails after MAX_RETRIES.
 */
export const retryQueue = inngest.createFunction(
  { id: "retry-queue-cron", triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => {
    const events = await step.run('fetch-retries', async () => {
      const supabase = await createAdminClient();
      const { data, error } = await supabase
        .from('automation_events')
        .select('id, lead_id, endpoint_url, payload, retry_count, created_at')
        .eq('status', 'Retrying')
        .lte('next_retry_at', new Date().toISOString())
        .limit(10);

      if (error) throw new Error(`Failed to fetch retry queue: ${error.message}`);
      return data || [];
    });

    await step.run('update-heartbeat', async () => {
      const supabase = await createAdminClient();
      await supabase.from('cron_heartbeat').upsert([{ id: 1, last_heartbeat: new Date().toISOString() }]);
    });

    if (!events.length) {
      return { processed: 0 };
    }

    const results = await Promise.all(
      events.map(event =>
        step.run(`retry-event-${event.id}`, async () => {
          const supabase = await createAdminClient();
          const startTime = Date.now();
          try {
            if (!event.endpoint_url || !event.payload) {
              throw new Error('Missing payload or endpoint URL');
            }

            const res = await fetchWithTimeout(event.endpoint_url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Orchestration-ID': event.id,
              },
              body: JSON.stringify(event.payload),
            });

            void (Date.now() - startTime);

            if (res.ok) {
              await supabase
                .from('automation_events')
                .update({ status: 'Success', error_message: null })
                .eq('id', event.id);

              try {
                await logLeadEvent(
                  event.lead_id,
                  'Workflow',
                  `Intake orchestration succeeded on retry #${event.retry_count + 1}`,
                  'INFO'
                );
              } catch { /* ignore audit log errors */ }

              return { id: event.id, status: 'Success' };
            } else {
              throw new Error(`HTTP Error ${res.status}`);
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            const nextCount = event.retry_count + 1;

            if (nextCount >= MAX_RETRIES) {
              await supabase
                .from('automation_events')
                .update({ status: 'Failed', retry_count: nextCount, error_message: errMsg })
                .eq('id', event.id);

              try {
                await logLeadEvent(
                  event.lead_id,
                  'Workflow',
                  `Intake orchestration FAILED permanently after ${MAX_RETRIES} retries. Manual intervention required.`,
                  'CRITICAL'
                );
              } catch { /* ignore */ }

              return { id: event.id, status: 'Failed' };
            } else {
              const nextRetryAt = calculateBackoff(nextCount).toISOString();
              await supabase
                .from('automation_events')
                .update({ retry_count: nextCount, error_message: errMsg, next_retry_at: nextRetryAt })
                .eq('id', event.id);

              return { id: event.id, status: 'Retrying', attempt: nextCount };
            }
          }
        })
      )
    );

    return { processed: events.length, results };
  }
);
