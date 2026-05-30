'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ServerCrash,
  Database,
  Zap,
  RefreshCw,
  ArrowLeft,
  Download,
} from 'lucide-react';
import Link from 'next/link';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { createClient } from '@/lib/supabase/client';
import { getSystemHealthMetrics } from '@/app/actions/health';
import { getIntegrationHealth, type IntegrationStatus, type IntegrationHealth } from '@/app/actions/integrations';

type MetricsResponse = Awaited<ReturnType<typeof getSystemHealthMetrics>>;

type ActiveRetry = {
  id: string;
  workflow_name: string;
  retry_count: number;
  error_message?: string | null;
  next_retry_at?: string | null;
  leads?: {
    name?: string | null;
  } | null;
};

type EscalationEvent = {
  id: string;
  event_type: string;
  description: string;
  severity: 'HIGH' | 'CRITICAL' | string;
  created_at: string;
  leads?: {
    name?: string | null;
  } | null;
};

function RetryCountdown({ nextRetryAt }: { nextRetryAt: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    return Math.max(0, new Date(nextRetryAt).getTime() - Date.now());
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, new Date(nextRetryAt).getTime() - Date.now());
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [nextRetryAt]);

  if (timeLeft === 0) return <span className="text-yellow-500 font-bold">Retrying now...</span>;

  const seconds = Math.floor(timeLeft / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return <span suppressHydrationWarning>T-minus {m}:{s.toString().padStart(2, '0')}</span>;
}

function StatusBadge({ status }: { status: IntegrationStatus | 'UP' | 'DOWN' }) {
  const normalized = status === 'UP' ? 'healthy' : status === 'DOWN' ? 'down' : status;
  switch (normalized) {
    case 'healthy':
      return (
        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10">
          <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-none" />
          NOMINAL
        </Badge>
      );
    case 'degraded':
      return (
        <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10">
          <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
          DEGRADED
        </Badge>
      );
    case 'down':
      return (
        <Badge className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/10">
          <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          DOWN
        </Badge>
      );
    default:
      return (
        <Badge className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/10">
          UNKNOWN
        </Badge>
      );
  }
}

function IntegrationRow({
  icon: Icon,
  label,
  status,
  detail,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  status: IntegrationStatus;
  detail: string;
  sub?: string | null;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-1.5 rounded bg-zinc-800/60">
          <Icon className="h-3.5 w-3.5 text-zinc-400" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-200">{label}</div>
          <div className="text-xs text-zinc-500 truncate max-w-[280px]">{detail}</div>
          {sub && <div suppressHydrationWarning className="text-[10px] text-zinc-600 font-mono mt-0.5">{sub}</div>}
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

export default function SystemHealthDashboard({
  initialMetrics,
  initialIntegration,
}: {
  initialMetrics: MetricsResponse | null;
  initialIntegration: IntegrationHealth | null;
}) {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(initialMetrics);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealth | null>(initialIntegration);

  const silentRefreshRef = useRef<(() => void) | null>(null);

  silentRefreshRef.current = async () => {
    try {
      const [newMetrics, newIntegrationHealth] = await Promise.all([
        getSystemHealthMetrics().catch(() => null),
        getIntegrationHealth().catch(() => null),
      ]);
      if (newMetrics) setMetrics(newMetrics);
      if (newIntegrationHealth) setIntegrationHealth(newIntegrationHealth);
    } catch {}
  };

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel('system-health-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_events' }, () => {
        silentRefreshRef.current?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_events' }, () => {
        silentRefreshRef.current?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        silentRefreshRef.current?.();
      })
      .subscribe();

    const interval = setInterval(() => silentRefreshRef.current?.(), 30000);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const successRatio = metrics?.successRatio ?? '—';
  const failureCount = metrics?.failureCount ?? 0;
  const retryCount = metrics?.retryCount ?? 0;
  const avgDurationMs = metrics?.avgDurationMs ?? 0;
  const activeBreaches = metrics?.activeBreaches ?? 0;
  const activeRetries = (metrics?.activeRetries ?? []) as ActiveRetry[];
  const escalationEvents = (metrics?.escalationEvents ?? []) as EscalationEvent[];

  const overallStatus: IntegrationStatus = (() => {
    if (!integrationHealth) return 'unknown';
    const statuses = [
      integrationHealth.cronEngine.status,
      integrationHealth.webhookPipeline.status,
      integrationHealth.retryQueue.status,
      integrationHealth.database.status,
    ];
    if (statuses.includes('down')) return 'down';
    if (statuses.includes('degraded')) return 'degraded';
    if (statuses.includes('unknown')) return 'unknown';
    return 'healthy';
  })();

  const summaryRatioNum = successRatio === '—' ? null : parseFloat(String(successRatio));

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* PAGE HEADER */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest hover:text-zinc-300 transition-colors mb-3"
          >
            <ArrowLeft className="h-3 w-3" />
            Command Center
          </Link>
          <h1 className="text-4xl font-black tracking-tight uppercase leading-none italic flex items-center">
            System <span className="text-muted-foreground ml-2">Health</span>
            <InfoTooltip content="A real-time overview of the engine capturing and routing your leads. This page tracks if external tools (like your CRM) are successfully receiving data, and catches leads that might otherwise slip through the cracks." />
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/report"
            download
            className="inline-flex items-center gap-2 px-3 py-2 bg-[#111111] border border-[#262626] rounded text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-[#FAFAFA] hover:border-[#404040] transition-colors"
            title="Download 30-day CSV operational summary"
          >
            <Download className="h-3 w-3" />
            Download 30-Day Report
          </a>
          <StatusBadge status={overallStatus} />
        </div>
      </div>

      {/* TIER 1: SUMMARY METRIC CARDS */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center">
              Workflow Success Rate
              <InfoTooltip content="How reliably we are capturing and processing leads into your CRM. If this drops below 95%, external tools may be experiencing network errors." />
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-black tracking-tight ${
                summaryRatioNum !== null && summaryRatioNum < 90
                  ? 'text-yellow-400'
                  : 'text-white'
              }`}
            >
              {successRatio === '—' ? '—' : `${successRatio}%`}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {avgDurationMs > 0 ? `Avg duration: ${avgDurationMs}ms` : 'No completed events yet'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center">
              Pending Retries
              <InfoTooltip content="Our safety net. When an external tool goes offline, we catch the lead here and automatically retry sending it later so you never lose a prospect." />
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-black tracking-tight ${retryCount > 0 ? 'text-yellow-400' : 'text-white'}`}>
              {retryCount}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {retryCount === 0 ? 'Retry queue clean' : 'Queued for exponential backoff'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center">
              Permanent Failures
              <InfoTooltip content="Leads that failed to sync even after days of automatic retrying. These require manual review immediately to ensure the lead isn't lost forever." />
            </CardTitle>
            <ServerCrash className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-black tracking-tight ${failureCount > 0 ? 'text-red-400' : 'text-white'}`}>
              {failureCount}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {failureCount === 0 ? 'No failed workflows' : 'Max retries exceeded'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center">
              Active SLA Breaches
              <InfoTooltip content="Leads that have sat untouched past your guaranteed response time. This directly impacts revenue and requires immediate escalation." />
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-black tracking-tight ${activeBreaches > 0 ? 'text-orange-400' : 'text-white'}`}>
              {activeBreaches}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {activeBreaches === 0 ? 'All leads within SLA' : 'Unresponded leads past deadline'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* TIER 2: INTEGRATION HEALTH + RETRY QUEUE */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Integration Health */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100 text-base flex items-center">
              Integration Status
              <InfoTooltip content="The real-time pulse of your automation stack. Tells you instantly if your database or sync engines are experiencing downtime." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!integrationHealth ? (
              <div className="text-sm text-zinc-500 py-4 text-center">
                Integration health unavailable — auth or DB error.
              </div>
            ) : (
              <div>
                <IntegrationRow
                  icon={Database}
                  label={integrationHealth.database.label}
                  status={integrationHealth.database.status}
                  detail={integrationHealth.database.detail}
                />
                <IntegrationRow
                  icon={Activity}
                  label={integrationHealth.cronEngine.label}
                  status={integrationHealth.cronEngine.status}
                  detail={integrationHealth.cronEngine.detail}
                  sub={
                    integrationHealth.cronEngine.lastHeartbeat
                      ? `Last heartbeat: ${new Date(integrationHealth.cronEngine.lastHeartbeat).toLocaleString()}`
                      : null
                  }
                />
                <IntegrationRow
                  icon={Zap}
                  label={integrationHealth.webhookPipeline.label}
                  status={integrationHealth.webhookPipeline.status}
                  detail={integrationHealth.webhookPipeline.detail}
                  sub={
                    integrationHealth.webhookPipeline.lastSuccess
                      ? `Last success: ${new Date(integrationHealth.webhookPipeline.lastSuccess).toLocaleString()}`
                      : null
                  }
                />
                <IntegrationRow
                  icon={RefreshCw}
                  label={integrationHealth.retryQueue.label}
                  status={integrationHealth.retryQueue.status}
                  detail={integrationHealth.retryQueue.detail}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Retry Queue */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-100 text-base flex items-center">
              Active Retry Queue
              <InfoTooltip content="A live, transparent look at exactly which leads are currently stuck waiting for external systems to come back online." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeRetries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500/40" />
                <p className="text-sm text-zinc-500">No pending retries. Retry queue is clean.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeRetries.map((retry) => (
                  <div
                    key={retry.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-950/50"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-200 text-sm truncate">{retry.workflow_name}</div>
                      <div className="text-xs text-zinc-500">
                        Attempt {retry.retry_count + 1} · {retry.leads?.name ?? 'Unknown Lead'}
                      </div>
                      {retry.error_message && (
                        <div className="text-[10px] text-red-400 font-mono mt-1 truncate max-w-[220px]">
                          {retry.error_message}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <Badge variant="outline" className="text-yellow-500 border-yellow-500/20 bg-yellow-500/10">
                        Retrying
                      </Badge>
                      {retry.next_retry_at && (
                        <div suppressHydrationWarning className="text-[10px] text-zinc-500 mt-1 font-mono">
                          Next: <RetryCountdown nextRetryAt={retry.next_retry_at} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* TIER 3: RECENT CRITICAL ESCALATIONS */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-zinc-100 text-base flex items-center">
            Recent Critical Escalations
            <InfoTooltip content="The audit trail. A log of severe system errors (like complete database outages) so you know exactly why and when automation stopped working." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {escalationEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500/40" />
              <p className="text-sm text-zinc-500">No critical escalations recorded.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {escalationEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex gap-3 text-sm p-3 rounded-lg border border-zinc-800 bg-zinc-950/50"
                >
                  <div className="mt-0.5 shrink-0">
                    {event.severity === 'CRITICAL' ? (
                      <ServerCrash className="h-4 w-4 text-red-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-zinc-200 flex items-center justify-between gap-2">
                      <span className="truncate">{event.event_type}</span>
                      <span suppressHydrationWarning className="text-xs text-zinc-500 font-normal font-mono shrink-0">
                        {new Date(event.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="text-zinc-400 mt-1 text-xs leading-relaxed">{event.description}</div>
                    {event.leads && (
                      <div className="text-[10px] text-zinc-600 mt-2 border-t border-zinc-800 pt-2 font-mono">
                        Lead: {event.leads.name}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    <Badge
                      variant="outline"
                      className={
                        event.severity === 'CRITICAL'
                          ? 'text-red-400 border-red-500/20 bg-red-500/5 text-[9px]'
                          : 'text-orange-400 border-orange-500/20 bg-orange-500/5 text-[9px]'
                      }
                    >
                      {event.severity}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* FOOTER: n8n Callback Reference */}
      <Card className="bg-zinc-950 border-zinc-800/50">
        <CardHeader>
          <CardTitle className="text-zinc-400 text-sm font-mono flex items-center">
            n8n Callback Endpoint
            <InfoTooltip content="The secure digital bridge. This is the exact address your external automation tools use to report back to this dashboard when they successfully finish processing a lead." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-xs font-mono">
            <div className="flex items-center gap-3 p-3 rounded bg-zinc-900 border border-zinc-800">
              <Badge variant="outline" className="text-emerald-400 border-emerald-500/20 bg-emerald-500/5 shrink-0">
                POST
              </Badge>
              <code className="text-zinc-300">/api/orchestration/complete</code>
            </div>
            <div className="p-3 rounded bg-zinc-900 border border-zinc-800 text-zinc-500 leading-loose">
              <span className="text-zinc-300">&#123;</span>
              <br />
              &nbsp;&nbsp;<span className="text-blue-400">&quot;orchestration_id&quot;</span>:{' '}
              <span className="text-amber-400">&quot;uuid&quot;</span>,
              <br />
              &nbsp;&nbsp;<span className="text-blue-400">&quot;lead_id&quot;</span>:{' '}
              <span className="text-amber-400">&quot;uuid&quot;</span>,
              <br />
              &nbsp;&nbsp;<span className="text-blue-400">&quot;status&quot;</span>:{' '}
              <span className="text-amber-400">&quot;Success&quot; | &quot;Failed&quot;</span>,
              <br />
              &nbsp;&nbsp;<span className="text-blue-400">&quot;error_message&quot;</span>:{' '}
              <span className="text-zinc-600">&quot;optional&quot;</span>
              <br />
              <span className="text-zinc-300">&#125;</span>
            </div>
            <p className="text-zinc-600 leading-relaxed">
              Secured with HMAC-SHA256 via{' '}
              <code className="text-zinc-500">X-Webhook-Signature</code> header when{' '}
              <code className="text-zinc-500">N8N_WEBHOOK_SECRET</code> is set.
              Idempotent — safe to replay.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
