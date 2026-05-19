'use server';

import { createClient } from '@/lib/supabase/server';

async function assertAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return { supabase, user };
}

export async function getSystemHealthMetrics() {
  const { supabase } = await assertAuth();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: dbProbeError } = await supabase.from('leads').select('id').limit(1);
  const dbStatus = dbProbeError ? 'DOWN' : 'UP';

  // 1. Fetch Workflow Success/Failure/Retry Counts
  const { data: events } = await supabase
    .from('automation_events')
    .select('status, duration_ms')
    .gte('created_at', sevenDaysAgo)
    .limit(1000);

  let successCount = 0;
  let failureCount = 0;
  let retryCount = 0;
  let totalDuration = 0;

  if (events) {
    events.forEach(e => {
      if (e.status === 'Success') successCount++;
      if (e.status === 'Failed') failureCount++;
      if (e.status === 'Retrying') retryCount++;
      if (e.duration_ms) totalDuration += e.duration_ms;
    });
  }

  const totalCompleted = successCount + failureCount;
  const successRatio = totalCompleted > 0 ? (successCount / totalCompleted) * 100 : 100;
  const avgDuration = totalCompleted > 0 ? totalDuration / totalCompleted : 0;

  // 2. Fetch SLA Breaches
  const { count: activeBreaches } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('sla_status', 'BREACHED');

  // 3. Fetch Active Retries
  const { data: activeRetries } = await supabase
    .from('automation_events')
    .select('*, leads(name, email)')
    .eq('status', 'Retrying')
    .order('next_retry_at', { ascending: true });

  // 4. Fetch Escalation Events Timeline
  const { data: escalationEvents } = await supabase
    .from('lead_events')
    .select('*, leads(name)')
    .in('severity', ['HIGH', 'CRITICAL'])
    .order('created_at', { ascending: false })
    .limit(20);

  return {
    successRatio: successRatio.toFixed(1),
    failureCount,
    retryCount,
    avgDurationMs: Math.round(avgDuration),
    activeBreaches: activeBreaches || 0,
    activeRetries: activeRetries || [],
    escalationEvents: escalationEvents || [],
    dbStatus
  };
}
