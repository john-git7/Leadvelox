'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { leadSchema } from '@/lib/validations';
import { calculateDecayStatus, calculateUrgencyScore, logLeadEvent, triggerOrchestration } from '@/lib/orchestration';
import { calculateResponseDeadline, getSeverityForDecay } from '@/lib/sla';

/**
 * AUTHENTICATION GUARD
 */
async function assertAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return { supabase, user };
}

/**
 * FEATURE 1: LEAD INTAKE ENGINE
 */
export async function submitLead(formData: FormData) {
  const rawData = {
    name: formData.get('name'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    source: formData.get('source'),
  };

  const validation = leadSchema.safeParse(rawData);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  const supabase = await createAdminClient();
  
  // Fetch dynamic system settings
  const { data: settings } = await supabase.from('system_settings').select('enforce_business_hours, sla_response_minutes').eq('id', 1).single();
  const enforceBusinessHours = settings ? settings.enforce_business_hours : true;
  const responseMinutes = settings?.sla_response_minutes ?? 5;

  const decayStatus = calculateDecayStatus(new Date().toISOString());
  const urgencyScore = calculateUrgencyScore(decayStatus);
  const responseDeadline = calculateResponseDeadline(new Date().toISOString(), enforceBusinessHours, responseMinutes);

  try {
    // Determine severity ahead of time based on decay, we'll adjust if duplicate in the DB or keep simple
    // Actually, RPC handles duplicate detection but we need description.
    // Let's pass generic intake description to RPC, and let the DB return if it was duplicate.
    const severity = getSeverityForDecay(decayStatus);
    const description = `New lead captured via ${validation.data.source}`;

    // Use Postgres Transaction via RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('insert_lead_intake', {
      p_name: validation.data.name,
      p_email: validation.data.email,
      p_phone: validation.data.phone,
      p_source: validation.data.source,
      p_decay_status: decayStatus,
      p_urgency_score: urgencyScore,
      p_response_deadline: responseDeadline,
      p_severity: severity,
      p_description: description
    });

    if (rpcError) throw rpcError;

    const leadId = rpcData.lead_id;
    const isDuplicate = rpcData.is_duplicate;

    // Fetch the inserted lead to pass to orchestration
    const { data: lead } = await supabase.from('leads').select('*').eq('id', leadId).single();

    if (isDuplicate) {
       // Log additional warning if duplicate
       await logLeadEvent(leadId, 'Intake', `Repeated inquiry detected from ${lead.name} (Source: ${lead.source}). Flagged as Potential Duplicate.`, 'MEDIUM', { is_duplicate: true });
    }

    // 4. Trigger Orchestration
    await triggerOrchestration(lead.id, lead);

    return { success: true, data: lead };
  } catch (err) {
    console.error('Submission error:', err);
    return { success: false, error: 'Operational failure during intake.' };
  }
}

/**
 * FEATURE 7: EVENT TIMELINE RETRIEVAL
 */
export async function getLeadEvents(leadId: string) {
  const { supabase } = await assertAuth();
  const { data } = await supabase
    .from('lead_events')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  return data || [];
}

/**
 * FEATURE 5: AUTOMATION HEALTH MONITORING
 */
export async function getAutomationHealth() {
  const { supabase } = await assertAuth();
  const { data } = await supabase
    .from('automation_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  return data || [];
}

/**
 * DASHBOARD DATA FETCH — Paginated
 */
export async function getLeads(page: number = 0, limit: number = 50) {
  const { supabase } = await assertAuth();
  const { data, error } = await supabase
    .from('leads')
    .select('id, name, email, phone, source, status, urgency_score, decay_status, is_duplicate, response_deadline, sla_status, sla_breached_at, created_at, escalation_level, last_acknowledged_at')
    .order('urgency_score', { ascending: false }) // Highest urgency first
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) return [];
  return data;
}

/**
 * AGGREGATE STATS — Used by CommandCenter header cards
 * Fetches counts server-side; not affected by pagination.
 */
export async function getLeadStats() {
  const { supabase } = await assertAuth();

  const [total, hot, highRisk, duplicates, uncontacted] = await Promise.all([
    supabase.from('leads').select('*', { count: 'exact', head: true }),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('decay_status', 'HOT'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).or('decay_status.eq.HIGH_RISK,sla_status.eq.BREACHED'),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('is_duplicate', true),
    supabase.from('leads').select('*', { count: 'exact', head: true }).eq('status', 'New Lead'),
  ]);

  return {
    total: total.count ?? 0,
    hot: hot.count ?? 0,
    highRisk: highRisk.count ?? 0,
    duplicates: duplicates.count ?? 0,
    uncontacted: uncontacted.count ?? 0,
  };
}

/**
 * LEAD STATUS MANAGEMENT
 */
export async function updateLeadStatus(id: string, status: string) {
  const { supabase } = await assertAuth();
  const { error } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', id);

  if (error) return { success: false };

  await logLeadEvent(id, 'Status Change', `Status updated to ${status}`);
  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * ACKNOWLEDGE SLA ALERT
 * Sets last_acknowledged_at so the Inngest cron respects the suppression window
 * and does not immediately re-escalate the same lead.
 */
export async function acknowledgeAlert(id: string) {
  const { supabase } = await assertAuth();

  const { error } = await supabase
    .from('leads')
    .update({
      escalation_level: 0,
      last_acknowledged_at: new Date().toISOString(),
      // Do NOT change sla_status: the SLA is still breached.
      // Acknowledging means "I know about this" — not "this is resolved".
    })
    .eq('id', id);

  if (error) return { success: false };

  await logLeadEvent(id, 'System', 'Alert acknowledged by operator. Escalation suppressed for 30 minutes.', 'INFO');
  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * DELETE LEAD
 */
export async function deleteLead(id: string) {
  const { supabase } = await assertAuth();
  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id);

  if (error) return { success: false };
  revalidatePath('/dashboard');
  return { success: true };
}

/**
 * SYSTEM SETTINGS
 */
export async function getSystemSettings() {
  const { supabase } = await assertAuth();
  const { data } = await supabase.from('system_settings').select('*').eq('id', 1).single();
  return data || { enforce_business_hours: true };
}

export async function toggleBusinessHours(enforce: boolean) {
  const { supabase } = await assertAuth();
  const { error } = await supabase
    .from('system_settings')
    .update({ enforce_business_hours: enforce })
    .eq('id', 1);

  if (error) return { success: false };
  revalidatePath('/dashboard');
  return { success: true };
}
