import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase/server";
import { logLeadEvent, calculateDecayStatus, calculateUrgencyScore } from "@/lib/orchestration";

type EscalationThreshold = {
  level: number;
  delayMinutes: number;
  description: string;
};

// Fallback used only if the DB fetch fails
const DEFAULT_ESCALATION_THRESHOLDS: EscalationThreshold[] = [
  { level: 1, delayMinutes: 0, description: 'SLA Warning Triggered' },
  { level: 2, delayMinutes: 5, description: 'Dashboard Priority Escalation' },
  { level: 3, delayMinutes: 15, description: 'Escalation Webhook Fired' },
  { level: 4, delayMinutes: 60, description: 'Critical Operational Alert Fired' },
];

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

export const slaCheck = inngest.createFunction(
  { id: "sla-check-cron", triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => {
    // 1. Fetch configurable thresholds
    const settings = await step.run('fetch-settings', async () => {
      const supabase = await createAdminClient();
      const { data } = await supabase
        .from('system_settings')
        .select('escalation_thresholds, ack_suppression_minutes')
        .eq('id', 1)
        .single();
      return data;
    });

    const escalationThresholds: EscalationThreshold[] =
      settings?.escalation_thresholds ?? DEFAULT_ESCALATION_THRESHOLDS;
    const ackSuppressionMinutes: number = settings?.ack_suppression_minutes ?? 30;

    // 2. Fetch leads
    const leads = await step.run('fetch-leads', async () => {
      const supabase = await createAdminClient();
      const { data } = await supabase
        .from('leads')
        .select('id, created_at, last_contacted_at, response_deadline, decay_status, urgency_score, escalation_level, sla_status, last_acknowledged_at')
        .in('status', ['New Lead'])
        .order('created_at', { ascending: true })
        .limit(500);
      return data || [];
    });

    let totalEscalated = 0;

    for (const lead of leads) {
      const escalated = await step.run(`process-lead-${lead.id}`, async () => {
        const supabase = await createAdminClient();
        const now = Date.now();
        const deadlineMs = lead.response_deadline ? new Date(lead.response_deadline).getTime() : now;
        const delayMinutes = lead.response_deadline ? (now - deadlineMs) / (1000 * 60) : 0;

        const newDecay = calculateDecayStatus(lead.created_at, lead.last_contacted_at);
        const newScore = calculateUrgencyScore(newDecay);

        const updateData: Record<string, unknown> = {};
        let needsUpdate = false;

        if (newDecay !== lead.decay_status || newScore !== lead.urgency_score) {
          updateData.decay_status = newDecay;
          updateData.urgency_score = newScore;
          needsUpdate = true;
        }

        // Only compute escalation if the deadline has actually passed.
        // delayMinutes is negative when the deadline is still in the future.
        let targetLevel = 0;
        if (delayMinutes > 0) {
          for (const threshold of escalationThresholds) {
            if (delayMinutes >= threshold.delayMinutes) {
              targetLevel = threshold.level;
            }
          }
        }

        const lastAckMs = lead.last_acknowledged_at ? new Date(lead.last_acknowledged_at).getTime() : 0;
        const minutesSinceAck = (now - lastAckMs) / (1000 * 60);
        const isSuppressed = minutesSinceAck < ackSuppressionMinutes;

        let didEscalate = false;

        if (targetLevel > lead.escalation_level && !isSuppressed) {
          const threshold = escalationThresholds.find(t => t.level === targetLevel);

          updateData.escalation_level = targetLevel;
          needsUpdate = true;
          didEscalate = true;

          // Target level 1 is warning, target level > 1 is breached (depending on thresholds, but delayMinutes >= 0 is usually Warning)
          if (targetLevel === 1 && lead.sla_status === 'HEALTHY') {
             updateData.sla_status = 'WARNING';
          } else if (targetLevel > 1 && lead.sla_status !== 'BREACHED') {
             updateData.sla_status = 'BREACHED';
             // Store actual deadline as breach time, not now
             updateData.sla_breached_at = lead.response_deadline || new Date().toISOString();
          }

          let severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
          if (targetLevel === 2) severity = 'MEDIUM';
          if (targetLevel === 3) severity = 'HIGH';
          if (targetLevel === 4) severity = 'CRITICAL';

          try {
            await logLeadEvent(lead.id, 'SLA Escalation', `Level ${targetLevel}: ${threshold?.description}`, severity);
          } catch { /* ignore */ }

          if (targetLevel >= 3) {
            const webhookUrl = process.env.NODE_ENV === 'production' ? process.env.N8N_PROD_WEBHOOK_URL : process.env.N8N_WEBHOOK_URL;
            if (webhookUrl) {
              try {
                await fetchWithTimeout(webhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ event: 'sla_escalation', lead_id: lead.id, level: targetLevel, delay_minutes: Math.round(delayMinutes) }),
                });
                try { await logLeadEvent(lead.id, 'System', `Escalation notification triggered for Level ${targetLevel}`, 'INFO'); } catch { }
              } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Unknown error';
                try { await logLeadEvent(lead.id, 'System', `Failed to fire escalation webhook: ${msg}`, 'CRITICAL'); } catch { }
              }
            }
          }
        }

        if (needsUpdate) {
          await supabase.from('leads').update(updateData).eq('id', lead.id);
        }

        return didEscalate;
      });

      if (escalated) totalEscalated++;
    }

    await step.run('update-heartbeat', async () => {
      const supabase = await createAdminClient();
      await supabase.from('cron_heartbeat').upsert([{ id: 1, last_heartbeat: new Date().toISOString() }]);
    });

    return { processed: leads.length, escalated: totalEscalated };
  }
);

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

    if (!events.length) {
      return { processed: 0 };
    }

    const results = [];

    for (const event of events) {
      const res = await step.run(`retry-event-${event.id}`, async () => {
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

          const duration = Date.now() - startTime;

          if (res.ok) {
            await supabase
              .from('automation_events')
              .update({ status: 'Pending', duration_ms: duration, error_message: null })
              .eq('id', event.id);

            try { await logLeadEvent(event.lead_id, 'Workflow', `Intake orchestration queued for retry #${event.retry_count + 1}`, 'INFO'); } catch {}
            return { id: event.id, status: 'Pending' };
          } else {
            throw new Error(`HTTP Error ${res.status}`);
          }
        } catch (err: unknown) {
          const duration = Date.now() - startTime;
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          const nextCount = event.retry_count + 1;

          if (nextCount >= MAX_RETRIES) {
            await supabase
              .from('automation_events')
              .update({ status: 'Failed', retry_count: nextCount, duration_ms: duration, error_message: errMsg })
              .eq('id', event.id);

            try { await logLeadEvent(event.lead_id, 'Workflow', `Intake orchestration FAILED permanently after ${MAX_RETRIES} retries.`, 'CRITICAL'); } catch {}
            return { id: event.id, status: 'Failed' };
          } else {
            const nextRetryAt = calculateBackoff(nextCount).toISOString();
            await supabase
              .from('automation_events')
              .update({ retry_count: nextCount, duration_ms: duration, error_message: errMsg, next_retry_at: nextRetryAt })
              .eq('id', event.id);

            return { id: event.id, status: 'Retrying', attempt: nextCount };
          }
        }
      });
      results.push(res);
    }

    return { processed: events.length, results };
  }
);
