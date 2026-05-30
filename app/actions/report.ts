'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Generates a 30-day operational summary report as a CSV-formatted string.
 *
 * Called by the /api/report download route. Requires authentication.
 * Returns structured data that the route handler serialises to CSV.
 */
export async function generateOpsReport() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('Unauthorized');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // 1. Settings for context
  const { data: settings } = await supabase
    .from('system_settings')
    .select('agency_name, sla_response_minutes, avg_deal_value')
    .eq('id', 1)
    .single();

  // 2. Lead volume & status breakdown
  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, email, source, status, decay_status, sla_status, escalation_level, created_at, sla_breached_at, last_contacted_at, is_duplicate')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false });

  // 3. Workflow health
  const { data: automationEvents } = await supabase
    .from('automation_events')
    .select('status, created_at, duration_ms, error_message')
    .gte('created_at', thirtyDaysAgo);

  // 4. SLA breach events
  const { data: breachEvents } = await supabase
    .from('lead_events')
    .select('description, severity, created_at')
    .in('severity', ['HIGH', 'CRITICAL'])
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(100);

  // --- Compute summary metrics ---
  const totalLeads = leads?.length ?? 0;
  const contactedLeads = leads?.filter(l => l.status !== 'New Lead').length ?? 0;
  const breachedLeads = leads?.filter(l => l.sla_status === 'BREACHED').length ?? 0;
  const duplicateLeads = leads?.filter(l => l.is_duplicate).length ?? 0;

  const successEvents = automationEvents?.filter(e => e.status === 'Success').length ?? 0;
  const failedEvents = automationEvents?.filter(e => e.status === 'Failed').length ?? 0;
  const totalCompleted = successEvents + failedEvents;
  const successRate = totalCompleted > 0
    ? ((successEvents / totalCompleted) * 100).toFixed(1)
    : 'N/A';

  const avgDuration = (() => {
    const timed = automationEvents?.filter(e => e.status === 'Success' && (e.duration_ms ?? 0) > 0) ?? [];
    if (!timed.length) return 'N/A';
    const sum = timed.reduce((acc, e) => acc + (e.duration_ms ?? 0), 0);
    return `${Math.round(sum / timed.length)}ms`;
  })();

  const lostRevenue = breachedLeads * (settings?.avg_deal_value ?? 1200);

  return {
    meta: {
      agency: settings?.agency_name || 'Unnamed Agency',
      period: `${thirtyDaysAgo.slice(0, 10)} to ${now.slice(0, 10)}`,
      sla_minutes: settings?.sla_response_minutes ?? 5,
      generated_at: now,
    },
    summary: {
      total_leads: totalLeads,
      contacted_leads: contactedLeads,
      contact_rate: totalLeads > 0 ? `${((contactedLeads / totalLeads) * 100).toFixed(1)}%` : '0%',
      sla_breached: breachedLeads,
      breach_rate: totalLeads > 0 ? `${((breachedLeads / totalLeads) * 100).toFixed(1)}%` : '0%',
      duplicate_leads: duplicateLeads,
      workflow_success_rate: `${successRate}%`,
      avg_webhook_duration: avgDuration,
      permanent_failures: failedEvents,
      estimated_revenue_at_risk: `$${lostRevenue.toLocaleString()}`,
    },
    leads: leads ?? [],
    escalation_log: breachEvents ?? [],
  };
}
