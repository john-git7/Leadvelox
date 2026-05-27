import { createAdminClient } from '@/lib/supabase/server';
import { EventSeverity } from './sla';

export type DecayStatus = 'HOT' | 'WARM' | 'COLD' | 'HIGH_RISK';

type LeadWebhookPayload = {
  id?: string;
  created_at?: string;
  response_deadline?: string | null;
  [key: string]: unknown;
};

/**
 * INTELLIGENCE: Calculate Lead Decay Status
 *
 * Real estate speed-to-lead thresholds (industry benchmark):
 *   HOT       < 5 minutes  — Lead is live, contact rate ~71% (MIT/InsideSales study)
 *   WARM      < 60 minutes — First hour, still high intent, ~35% contact rate
 *   COLD      < 24 hours   — Same-day reach out, intent dropping, ~15% contact rate
 *   HIGH_RISK ≥ 24 hours   — Missed window, lead likely contacted a competitor
 *
 * Uses lastContactedAt when available so a touched lead does not continue
 * decaying as if it was never reached.
 */
export function calculateDecayStatus(createdAt: string, lastContactedAt?: string | null): DecayStatus {
  const now = new Date().getTime();
  const referenceTime = lastContactedAt
    ? new Date(lastContactedAt).getTime()
    : new Date(createdAt).getTime();
  const diffMinutes = (now - referenceTime) / (1000 * 60);

  if (diffMinutes < 5) return 'HOT';           // < 5 minutes: critical window open
  if (diffMinutes < 60) return 'WARM';          // < 1 hour: urgent, act now
  if (diffMinutes < 1440) return 'COLD';        // < 24 hours: same-day recovery possible
  return 'HIGH_RISK';                           // ≥ 24 hours: likely lost to competition
}

/**
 * INTELLIGENCE: Calculate Urgency Score
 *
 * Scores are non-linear to reflect the sharp drop in contact rates.
 * HIGH_RISK scores highest (100) to surface lost-opportunity risk at the top of the queue.
 */
export function calculateUrgencyScore(decayStatus: DecayStatus): number {
  switch (decayStatus) {
    case 'HOT':       return 95;  // Immediate — do not let this cool
    case 'WARM':      return 75;  // Urgent — within the first hour
    case 'COLD':      return 40;  // Degraded — same-day recovery
    case 'HIGH_RISK': return 100; // Max urgency — revenue at risk
    default:          return 50;
  }
}

/**
 * OPERATIONAL LOGGING: Create Lead Event
 */
export async function logLeadEvent(
  leadId: string,
  type: string,
  description: string,
  severity: EventSeverity = 'INFO',
  metadata: Record<string, unknown> = {}
) {
  const supabase = await createAdminClient();
  const { error } = await supabase.from('lead_events').insert([{
    lead_id: leadId,
    event_type: type,
    description: description,
    severity: severity,
    metadata: metadata,
  }]);

  if (error) {
    // Surface the failure — silent audit-log loss is worse than a thrown error
    console.error(`[logLeadEvent] Failed to write event for lead ${leadId}:`, error.message);
    throw new Error(`Audit log failure: ${error.message}`);
  }
}

/**
 * OBSERVABILITY: Log Automation Attempt
 */
export async function logAutomationEvent(
  leadId: string, 
  workflowName: string, 
  status: string, 
  durationMs?: number,
  error?: string,
  payload?: Record<string, unknown>,
  endpointUrl?: string,
  nextRetryAt?: string
) {
  const supabase = await createAdminClient();
  const { error: insertError } = await supabase.from('automation_events').insert([{
    lead_id: leadId,
    workflow_name: workflowName,
    status: status,
    duration_ms: durationMs,
    error_message: error,
    payload: payload,
    endpoint_url: endpointUrl,
    next_retry_at: nextRetryAt
  }]);

  if (insertError) {
    console.error(`[logAutomationEvent] Failed to write event for lead ${leadId}:`, insertError.message);
    throw new Error(`Automation audit log failure: ${insertError.message}`);
  }
}

/**
 * ORCHESTRATION: Trigger Automation Webhook
 * Environment-aware, retry-safe logic.
 */
export async function triggerOrchestration(leadId: string, leadData: LeadWebhookPayload) {
  const webhookUrl = process.env.NODE_ENV === 'production' 
    ? process.env.N8N_PROD_WEBHOOK_URL 
    : process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn('Orchestration skipped: No webhook URL configured.');
    return;
  }

  const supabase = await createAdminClient();
  const startTime = Date.now();

  // 1. Generate Idempotency Key (orchestration_id) by inserting the initial event
  const { data: event, error: insertError } = await supabase.from('automation_events').insert([{
    lead_id: leadId,
    workflow_name: 'Lead Intake Workflow',
    status: 'Pending',
    payload: leadData,
    endpoint_url: webhookUrl
  }]).select('id').single();

  if (insertError || !event) {
    await logLeadEvent(leadId, 'System', `Failed to create orchestration event: ${insertError?.message}`, 'CRITICAL');
    return;
  }

  const orchestration_id = event.id;
  const payloadWithIdempotency = {
    event: 'lead_intake',
    notification_type: 'new_lead',
    lead_id: leadId,
    submitted_at: leadData.created_at,
    response_deadline: leadData.response_deadline,
    ...leadData,
    orchestration_id,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Orchestration-ID': orchestration_id
      },
      body: JSON.stringify(payloadWithIdempotency),
      signal: controller.signal
    });
    
    clearTimeout(timer);

    const duration = Date.now() - startTime;

    if (res.ok) {
      // 2. We only log that it was submitted. The n8n callback will mark it 'Success'.
      await supabase.from('automation_events').update({
        payload: payloadWithIdempotency
      }).eq('id', orchestration_id);
      
      await logLeadEvent(leadId, 'Workflow', 'Intake orchestration submitted successfully (Pending)', 'INFO');
    } else {
      // 3. Mark for retry
      const nextRetryAt = new Date(Date.now() + 30 * 1000).toISOString();
      await supabase.from('automation_events').update({
        status: 'Retrying',
        error_message: `HTTP Error ${res.status}`,
        payload: payloadWithIdempotency,
        next_retry_at: nextRetryAt
      }).eq('id', orchestration_id);
      
      await logLeadEvent(leadId, 'Workflow', `Intake orchestration submission failed: ${res.status}. Queued for retry.`, 'HIGH');
    }
  } catch (err: unknown) {
    const duration = Date.now() - startTime;
    const nextRetryAt = new Date(Date.now() + 30 * 1000).toISOString();
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    
    await supabase.from('automation_events').update({
      status: 'Retrying',
      error_message: errMsg,
      payload: payloadWithIdempotency,
      next_retry_at: nextRetryAt
    }).eq('id', orchestration_id);

    await logLeadEvent(leadId, 'Workflow', `Intake orchestration error: ${errMsg}. Queued for retry.`, 'CRITICAL');
  }
}
