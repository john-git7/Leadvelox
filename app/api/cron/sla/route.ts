import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { logLeadEvent, calculateDecayStatus, calculateUrgencyScore } from '@/lib/orchestration';

/**
 * GET /api/cron/sla
 *
 * HTTP-based SLA check endpoint. Invoked by Vercel Cron (every minute).
 * Mirrors the Inngest sla-check-cron function so either runtime can drive SLA.
 *
 * Security: Requires Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set.
 * In development (no CRON_SECRET) the endpoint is open for testing.
 */
export const runtime = 'nodejs';

type EscalationThreshold = {
  level: number;
  delayMinutes: number;
  description: string;
};

const DEFAULT_ESCALATION_THRESHOLDS: EscalationThreshold[] = [
  { level: 1, delayMinutes: 0,  description: 'SLA Warning Triggered' },
  { level: 2, delayMinutes: 5,  description: 'Dashboard Priority Escalation' },
  { level: 3, delayMinutes: 15, description: 'Escalation Webhook Fired' },
  { level: 4, delayMinutes: 60, description: 'Critical Operational Alert Fired' },
];

export async function GET(req: Request) {
  // --- Auth guard ---
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else {
    // Warn in production if secret is not configured
    if (process.env.NODE_ENV === 'production') {
      console.warn('[cron/sla] CRON_SECRET is not set — endpoint is unauthenticated in production');
    }
  }

  const supabase = await createAdminClient();
  const startTime = Date.now();

  // 1. Fetch configurable thresholds + suppression window
  const { data: settings } = await supabase
    .from('system_settings')
    .select('escalation_thresholds, ack_suppression_minutes')
    .eq('id', 1)
    .single();

  const escalationThresholds: EscalationThreshold[] =
    settings?.escalation_thresholds ?? DEFAULT_ESCALATION_THRESHOLDS;
  const ackSuppressionMinutes: number = settings?.ack_suppression_minutes ?? 30;

  // 2. Fetch unresolved New Leads
  const { data: leads, error: fetchError } = await supabase
    .from('leads')
    .select('id, created_at, last_contacted_at, response_deadline, decay_status, urgency_score, escalation_level, sla_status, last_acknowledged_at')
    .in('status', ['New Lead'])
    .order('created_at', { ascending: true })
    .limit(500);

  if (fetchError) {
    console.error('[cron/sla] Failed to fetch leads:', fetchError.message);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }

  const now = Date.now();
  let totalEscalated = 0;
  let totalUpdated = 0;

  for (const lead of leads ?? []) {
    try {
      const deadlineMs = lead.response_deadline
        ? new Date(lead.response_deadline).getTime()
        : now;
      const delayMinutes = (now - deadlineMs) / (1000 * 60);

      const newDecay = calculateDecayStatus(lead.created_at, lead.last_contacted_at);
      const newScore = calculateUrgencyScore(newDecay);

      const updateData: Record<string, unknown> = {};
      let needsUpdate = false;

      if (newDecay !== lead.decay_status || newScore !== lead.urgency_score) {
        updateData.decay_status = newDecay;
        updateData.urgency_score = newScore;
        needsUpdate = true;
      }

      // Compute target escalation level — only when deadline has passed
      let targetLevel = 0;
      if (delayMinutes > 0) {
        for (const threshold of escalationThresholds) {
          if (delayMinutes >= threshold.delayMinutes) {
            targetLevel = threshold.level;
          }
        }
      }

      // Respect acknowledgement suppression window
      const lastAckMs = lead.last_acknowledged_at
        ? new Date(lead.last_acknowledged_at).getTime()
        : 0;
      const minutesSinceAck = (now - lastAckMs) / (1000 * 60);
      const isSuppressed = minutesSinceAck < ackSuppressionMinutes;

      if (targetLevel > lead.escalation_level && !isSuppressed) {
        const threshold = escalationThresholds.find(t => t.level === targetLevel);
        updateData.escalation_level = targetLevel;
        needsUpdate = true;

        if (targetLevel === 1 && lead.sla_status === 'HEALTHY') {
          updateData.sla_status = 'WARNING';
        } else if (targetLevel > 1 && lead.sla_status !== 'BREACHED') {
          updateData.sla_status = 'BREACHED';
          updateData.sla_breached_at = lead.response_deadline ?? new Date().toISOString();
        }

        const severityMap: Record<number, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> = {
          1: 'LOW', 2: 'MEDIUM', 3: 'HIGH', 4: 'CRITICAL',
        };
        const severity = severityMap[targetLevel] ?? 'LOW';

        try {
          await logLeadEvent(
            lead.id,
            'SLA Escalation',
            `Level ${targetLevel}: ${threshold?.description}`,
            severity
          );
        } catch { /* do not fail cron run on audit log error */ }

        // Fire escalation webhook at level 3+
        if (targetLevel >= 3) {
          const webhookUrl =
            process.env.NODE_ENV === 'production'
              ? process.env.N8N_PROD_WEBHOOK_URL
              : process.env.N8N_WEBHOOK_URL;

          if (webhookUrl) {
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 10_000);
              await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'sla_escalation',
                  lead_id: lead.id,
                  level: targetLevel,
                  delay_minutes: Math.round(delayMinutes),
                }),
                signal: controller.signal,
              });
              clearTimeout(timer);
              try {
                await logLeadEvent(lead.id, 'System', `Escalation notification triggered for Level ${targetLevel}`, 'INFO');
              } catch { /* ignore */ }
            } catch (webhookErr: unknown) {
              const msg = webhookErr instanceof Error ? webhookErr.message : 'Unknown error';
              try {
                await logLeadEvent(lead.id, 'System', `Escalation webhook failed: ${msg}`, 'CRITICAL');
              } catch { /* ignore */ }
            }
          }
        }

        totalEscalated++;
      }

      if (needsUpdate) {
        await supabase.from('leads').update(updateData).eq('id', lead.id);
        totalUpdated++;
      }
    } catch (leadErr: unknown) {
      const msg = leadErr instanceof Error ? leadErr.message : 'Unknown error';
      console.error(`[cron/sla] Error processing lead ${lead.id}:`, msg);
    }
  }

  // 3. Update cron heartbeat — this keeps IntegrationIndicators green
  await supabase
    .from('cron_heartbeat')
    .upsert([{ id: 1, last_heartbeat: new Date().toISOString() }]);

  const durationMs = Date.now() - startTime;

  return NextResponse.json({
    success: true,
    processed: leads?.length ?? 0,
    updated: totalUpdated,
    escalated: totalEscalated,
    duration_ms: durationMs,
  });
}
