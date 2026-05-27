'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Database, Zap, RefreshCw, Activity } from 'lucide-react';
import { getIntegrationHealth, IntegrationHealth, IntegrationStatus } from '@/app/actions/integrations';
import { InfoTooltip } from '@/components/ui/info-tooltip';

const REFRESH_INTERVAL_MS = 30_000;

function StatusIcon({ status }: { status: IntegrationStatus }) {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />;
    case 'degraded':
      return <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />;
    case 'down':
      return <XCircle className="w-3 h-3 text-red-500 shrink-0" />;
    default:
      return <HelpCircle className="w-3 h-3 text-muted-foreground shrink-0" />;
  }
}

function statusDotClass(status: IntegrationStatus) {
  switch (status) {
    case 'healthy': return 'bg-green-500';
    case 'degraded': return 'bg-yellow-500 animate-pulse';
    case 'down': return 'bg-red-500 animate-pulse';
    default: return 'bg-muted-foreground';
  }
}

function overallStatus(health: IntegrationHealth): IntegrationStatus {
  const statuses = [
    health.cronEngine.status,
    health.webhookPipeline.status,
    health.retryQueue.status,
    health.database.status,
  ];
  if (statuses.includes('down')) return 'down';
  if (statuses.includes('degraded')) return 'degraded';
  if (statuses.includes('unknown')) return 'unknown';
  return 'healthy';
}

function overallLabel(status: IntegrationStatus) {
  switch (status) {
    case 'healthy': return 'ALL SYSTEMS NOMINAL';
    case 'degraded': return 'DEGRADED';
    case 'down': return 'SERVICE DOWN';
    default: return 'CHECKING...';
  }
}

export default function IntegrationIndicators() {
  const [health, setHealth] = useState<IntegrationHealth | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getIntegrationHealth();
      setHealth(data);
      setLastChecked(new Date());
    } catch {
      // Keep stale data if refresh fails
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const overall = health ? overallStatus(health) : 'unknown';

  const integrations = health
    ? [
        { name: health.database.label, status: health.database.status, detail: health.database.detail, icon: Database },
        { name: health.cronEngine.label, status: health.cronEngine.status, detail: health.cronEngine.detail, icon: Activity },
        { name: health.webhookPipeline.label, status: health.webhookPipeline.status, detail: health.webhookPipeline.detail, icon: Zap },
        { name: health.retryQueue.label, status: health.retryQueue.status, detail: health.retryQueue.detail, icon: RefreshCw },
      ]
    : [];

  return (
    <div className="bg-[#111111] border border-[#262626] rounded-lg p-4 space-y-4 shadow-xl">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center">
            Ecosystem Status
            <InfoTooltip content="Live health checks of the infrastructure powering your automations." />
          </h3>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className={`w-1.5 h-1.5 rounded-full ${statusDotClass(overall)}`} />
          <span className="text-[8px] font-mono text-muted-foreground">{overallLabel(overall)}</span>
        </div>
      </div>

      {isLoading && !health ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex flex-col gap-1 p-2 rounded bg-[#0A0A0A] border border-[#262626] animate-pulse">
              <div className="h-2 bg-[#262626] rounded w-3/4" />
              <div className="h-2 bg-[#1a1a1a] rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {integrations.map((int) => (
            <div key={int.name} className="flex flex-col gap-1.5 p-2 rounded bg-[#0A0A0A] border border-[#262626]">
              <div className="flex items-center gap-1.5">
                <int.icon className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] font-bold text-[#FAFAFA] truncate">{int.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <StatusIcon status={int.status} />
                <span className="text-[8px] font-mono text-muted-foreground truncate leading-tight">{int.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {lastChecked && (
        <p className="text-[8px] font-mono text-muted-foreground text-right">
          checked {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </p>
      )}
    </div>
  );
}
