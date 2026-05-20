import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/server';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';

/**
 * SLABreachBanner
 *
 * Server component. Fetches active SLA breach count directly from DB.
 * Renders nothing when there are no breaches — zero runtime overhead on clean state.
 * Placed above all dashboard content so operators see it immediately on load.
 */
export default async function SLABreachBanner() {
  let breachCount = 0;
  let oldestBreachMinutes = 0;

  try {
    const supabase = await createAdminClient();

    const [countRes, oldestRes] = await Promise.all([
      supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('sla_status', 'BREACHED')
        .in('status', ['New Lead']),
      supabase
        .from('leads')
        .select('sla_breached_at')
        .eq('sla_status', 'BREACHED')
        .in('status', ['New Lead'])
        .order('sla_breached_at', { ascending: true })
        .limit(1)
        .single(),
    ]);

    breachCount = countRes.count ?? 0;

    if (oldestRes.data?.sla_breached_at) {
      oldestBreachMinutes = Math.round(
        (Date.now() - new Date(oldestRes.data.sla_breached_at).getTime()) / (1000 * 60)
      );
    }
  } catch {
    // Fail silently — do not crash the dashboard on a banner fetch error
    return null;
  }

  if (breachCount === 0) return null;

  const urgencyClass =
    oldestBreachMinutes >= 60
      ? 'border-red-500/40 bg-red-950/30'
      : 'border-orange-500/40 bg-orange-950/20';

  const dotClass =
    oldestBreachMinutes >= 60
      ? 'bg-red-500'
      : 'bg-orange-500';

  const textClass =
    oldestBreachMinutes >= 60
      ? 'text-red-400'
      : 'text-orange-400';

  const ageLabel =
    oldestBreachMinutes >= 60
      ? `${Math.floor(oldestBreachMinutes / 60)}h ${oldestBreachMinutes % 60}m`
      : `${oldestBreachMinutes}m`;

  return (
    <div
      className={`flex items-center justify-between gap-4 px-8 py-2.5 border-b ${urgencyClass} transition-colors`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Pulsing indicator */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotClass} opacity-75`}
          />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`} />
        </span>

        <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${textClass}`} />

        <p className={`text-[11px] font-bold uppercase tracking-widest ${textClass} truncate`}>
          {breachCount === 1
            ? `1 ACTIVE SLA BREACH`
            : `${breachCount} ACTIVE SLA BREACHES`}
          {oldestBreachMinutes > 0 && (
            <span className="font-normal text-[10px] ml-2 opacity-70 tracking-wide normal-case">
              — oldest breach {ageLabel} overdue
            </span>
          )}
        </p>
      </div>

      <Link
        href="/dashboard/system-health"
        className={`flex items-center gap-1.5 shrink-0 text-[10px] font-bold uppercase tracking-widest ${textClass} hover:opacity-80 transition-opacity`}
      >
        View System Health
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
