import { createClient, createAdminClient } from '@/lib/supabase/server';
import { EventSeverity } from './sla';

export type DecayStatus = 'HOT' | 'WARM' | 'COLD' | 'HIGH_RISK';

/**
 * INTELLIGENCE: Calculate Lead Decay Status
 */
export function calculateDecayStatus(createdAt: string, lastContactedAt?: string | null): DecayStatus {
  const now = new Date().getTime();
  // Use lastContactedAt when available — a recently-touched lead should not
  // decay as if it was never contacted.
  const referenceTime = lastContactedAt
    ? new Date(lastContactedAt).getTime()
    : new Date(createdAt).getTime();
  const diffHours = (now - referenceTime) / (1000 * 60 * 60);

  if (diffHours < 2) return 'HOT';
  if (diffHours < 24) return 'WARM';
  if (diffHours < 72) return 'COLD';
  return 'HIGH_RISK';
}

/**
 * INTELLIGENCE: Calculate Urgency Score
 */
export function calculateUrgencyScore(decayStatus: DecayStatus): number {
  switch (decayStatus) {
    case 'HOT': return 100;
    case 'WARM': return 70;
    case 'COLD': return 30;
    case 'HIGH_RISK': return 90;
    default: return 50;
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
  payload?: any,
  endpointUrl?: string,
  nextRetryAt?: string
) {
  const supabase = await createAdminClient();
  await supabase.from('automation_events').insert([{
    lead_id: leadId,
    workflow_name: workflowName,
    status: status,
    duration_ms: durationMs,
    error_message: error,
    payload: payload,
    endpoint_url: endpointUrl,
    next_retry_at: nextRetryAt
  }]);
}

/**
 * ORCHESTRATION: Trigger Automation Webhook
 * Environment-aware, retry-safe logic.
 */
export async function triggerOrchestration(leadId: string, leadData: any) {
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
  const payloadWithIdempotency = { ...leadData, orchestration_id: orchestration_id };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Orchestration-ID': orchestration_id
      },
      body: JSON.stringify(payloadWithIdempotency),
    });

    const duration = Date.now() - startTime;

    if (res.ok) {
      // 2. We only log that it was submitted. The n8n callback will mark it 'Success'.
      await supabase.from('automation_events').update({
        payload: payloadWithIdempotency,
        duration_ms: duration
      }).eq('id', orchestration_id);
      
      await logLeadEvent(leadId, 'Workflow', 'Intake orchestration submitted successfully (Pending)', 'INFO');
    } else {
      // 3. Mark for retry
      const nextRetryAt = new Date(Date.now() + 30 * 1000).toISOString();
      await supabase.from('automation_events').update({
        status: 'Retrying',
        duration_ms: duration,
        error_message: `HTTP Error ${res.status}`,
        payload: payloadWithIdempotency,
        next_retry_at: nextRetryAt
      }).eq('id', orchestration_id);
      
      await logLeadEvent(leadId, 'Workflow', `Intake orchestration submission failed: ${res.status}. Queued for retry.`, 'HIGH');
    }
  } catch (err: any) {
    const duration = Date.now() - startTime;
    const nextRetryAt = new Date(Date.now() + 30 * 1000).toISOString();
    
    await supabase.from('automation_events').update({
      status: 'Retrying',
      duration_ms: duration,
      error_message: err.message,
      payload: payloadWithIdempotency,
      next_retry_at: nextRetryAt
    }).eq('id', orchestration_id);

    await logLeadEvent(leadId, 'Workflow', `Intake orchestration error: ${err.message}. Queued for retry.`, 'CRITICAL');
  }
}
