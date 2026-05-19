'use server';

import { createClient } from '@/lib/supabase/server';

export type IntegrationStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export type IntegrationHealth = {
  cronEngine: {
    status: IntegrationStatus;
    label: string;
    detail: string;
    lastHeartbeat: string | null;
  };
  webhookPipeline: {
    status: IntegrationStatus;
    label: string;
    detail: string;
    lastSuccess: string | null;
  };
  retryQueue: {
    status: IntegrationStatus;
    label: string;
    detail: string;
    activeRetries: number;
  };
  database: {
    status: IntegrationStatus;
    label: string;
    detail: string;
  };
};

/**
 * Returns real integration health based on observable DB state.
 *
 * - Cron Engine: measured by cron_heartbeat.last_heartbeat age
 * - Webhook Pipeline: measured by most recent automation_events success + stuck Pending count
 * - Retry Queue: measured by active Retrying event count
 * - Database: always healthy if this function executes (connection is active)
 */
export async function getIntegrationHealth(): Promise<IntegrationHealth> {
  const supabase = await createClient();
  const now = Date.now();

  // Real DB probe — if this function can run, Supabase auth works,
  // but the data plane could still be degraded.
  const { error: dbProbeError } = await supabase.from('leads').select('id').limit(1);

  // 1. Cron Engine Health — last heartbeat from Inngest sla-check cron
  const { data: heartbeat } = await supabase
    .from('cron_heartbeat')
    .select('last_heartbeat')
    .eq('id', 1)
    .single();

  let cronStatus: IntegrationStatus = 'down';
  let cronDetail = 'No heartbeat recorded';
  const lastHeartbeat = heartbeat?.last_heartbeat ?? null;

  if (lastHeartbeat) {
    const ageMinutes = (now - new Date(lastHeartbeat).getTime()) / (1000 * 60);
    if (ageMinutes < 2) {
      cronStatus = 'healthy';
      cronDetail = `Last beat ${Math.round(ageMinutes * 60)}s ago`;
    } else if (ageMinutes < 5) {
      cronStatus = 'degraded';
      cronDetail = `Last beat ${Math.round(ageMinutes)}m ago — delayed`;
    } else {
      cronStatus = 'down';
      cronDetail = `Last beat ${Math.round(ageMinutes)}m ago — cron may be stopped`;
    }
  }

  // 2. Webhook Pipeline Health — last success + stuck Pending events
  const [lastSuccessRes, stuckRes] = await Promise.all([
    supabase
      .from('automation_events')
      .select('created_at')
      .eq('status', 'Success')
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('automation_events')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .lt('created_at', new Date(now - 10 * 60 * 1000).toISOString()), // Stuck > 10 min
  ]);

  const lastSuccess = lastSuccessRes.data?.created_at ?? null;
  const stuckCount = stuckRes.count ?? 0;

  let webhookStatus: IntegrationStatus = 'unknown';
  let webhookDetail = 'No webhook activity recorded';

  if (stuckCount > 0) {
    webhookStatus = 'degraded';
    webhookDetail = `${stuckCount} event(s) stuck in Pending >10min`;
  } else if (lastSuccess) {
    const ageHours = (now - new Date(lastSuccess).getTime()) / (1000 * 60 * 60);
    webhookStatus = 'healthy';
    webhookDetail = `Last success ${ageHours < 1 ? `${Math.round(ageHours * 60)}m` : `${ageHours.toFixed(1)}h`} ago`;
  } else {
    webhookStatus = 'unknown';
    webhookDetail = 'No successful events yet';
  }

  // 3. Retry Queue Health
  const { count: retryCount } = await supabase
    .from('automation_events')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Retrying');

  const activeRetries = retryCount ?? 0;
  let retryStatus: IntegrationStatus = 'healthy';
  let retryDetail = 'No active retries';

  if (activeRetries >= 5) {
    retryStatus = 'degraded';
    retryDetail = `${activeRetries} events in retry backoff`;
  } else if (activeRetries > 0) {
    retryStatus = 'healthy';
    retryDetail = `${activeRetries} event(s) retrying`;
  }

  return {
    cronEngine: {
      status: cronStatus,
      label: 'Inngest Cron',
      detail: cronDetail,
      lastHeartbeat,
    },
    webhookPipeline: {
      status: webhookStatus,
      label: 'n8n Webhook',
      detail: webhookDetail,
      lastSuccess,
    },
    retryQueue: {
      status: retryStatus,
      label: 'Retry Queue',
      detail: retryDetail,
      activeRetries,
    },
    database: {
      status: dbProbeError ? 'down' : 'healthy',
      label: 'Supabase',
      detail: dbProbeError ? `DB error: ${dbProbeError.message}` : 'Connection active',
    },
  };
}
