import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { logLeadEvent } from '@/lib/orchestration';

const ESCALATION_THRESHOLDS = [
  { level: 1, delayMinutes: 0, description: 'SLA Warning Triggered' },
  { level: 2, delayMinutes: 5, description: 'Dashboard Priority Escalation' },
  { level: 3, delayMinutes: 15, description: 'Escalation Webhook Fired' },
  { level: 4, delayMinutes: 60, description: 'Critical Operational Alert Fired' },
];

export async function GET(req: Request) {
  const supabase = await createAdminClient();

  // Find leads that are not yet closed/contacted and have passed their deadline
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .in('status', ['New Lead'])
    .lt('response_deadline', new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch SLA data' }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ success: true, processed: 0 });
  }

  const results = [];
  const now = new Date().getTime();

  for (const lead of leads) {
    const deadlineMs = new Date(lead.response_deadline).getTime();
    const delayMinutes = (now - deadlineMs) / (1000 * 60);

    // Determine target escalation level based on delay
    let targetLevel = 0;
    for (const threshold of ESCALATION_THRESHOLDS) {
      if (delayMinutes >= threshold.delayMinutes) {
        targetLevel = threshold.level;
      }
    }

    if (targetLevel > lead.escalation_level) {
      // We need to escalate
      const threshold = ESCALATION_THRESHOLDS.find(t => t.level === targetLevel);
      const isBreach = targetLevel > 0;
      
      const updateData: any = {
        escalation_level: targetLevel,
      };

      if (isBreach && lead.sla_status === 'HEALTHY') {
        updateData.sla_status = 'BREACHED';
        updateData.sla_breached_at = new Date().toISOString();
      }

      await supabase
        .from('leads')
        .update(updateData)
        .eq('id', lead.id);

      // Log the event
      let severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      if (targetLevel === 2) severity = 'MEDIUM';
      if (targetLevel === 3) severity = 'HIGH';
      if (targetLevel === 4) severity = 'CRITICAL';

      await logLeadEvent(lead.id, 'SLA Escalation', `Level ${targetLevel}: ${threshold?.description}`, severity);

      // Fire outward webhook for levels 3 and 4
      if (targetLevel >= 3) {
        const webhookUrl = process.env.NODE_ENV === 'production' 
          ? process.env.N8N_PROD_WEBHOOK_URL 
          : process.env.N8N_WEBHOOK_URL;
          
        if (webhookUrl) {
          try {
            await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                event: 'sla_escalation', 
                lead_id: lead.id, 
                level: targetLevel, 
                delay_minutes: Math.round(delayMinutes) 
              }),
            });
            await logLeadEvent(lead.id, 'System', `Slack/Email notification triggered for Level ${targetLevel}`, 'INFO');
          } catch (e: any) {
            await logLeadEvent(lead.id, 'System', `Failed to fire escalation webhook: ${e.message}`, 'CRITICAL');
          }
        }
      }

      results.push({ id: lead.id, targetLevel });
    }
  }

  return NextResponse.json({ success: true, processed: leads.length, escalated: results.length, results });
}
