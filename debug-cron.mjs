import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_ESCALATION_THRESHOLDS = [
  { level: 1, delayMinutes: 0,  description: 'SLA Warning Triggered' },
  { level: 2, delayMinutes: 5,  description: 'Dashboard Priority Escalation' },
  { level: 3, delayMinutes: 15, description: 'Escalation Webhook Fired' },
  { level: 4, delayMinutes: 60, description: 'Critical Operational Alert Fired' },
];

async function run() {
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .limit(10);
  
  if (!leads || leads.length === 0) return console.log('No leads found.');

  for (const lead of leads) {
    const now = Date.now();
    const deadlineMs = lead.response_deadline
      ? new Date(lead.response_deadline).getTime()
      : now;
    const delayMinutes = (now - deadlineMs) / (1000 * 60);

    let targetLevel = 0;
    if (delayMinutes > 0) {
      for (const threshold of DEFAULT_ESCALATION_THRESHOLDS) {
        if (delayMinutes >= threshold.delayMinutes) {
          targetLevel = threshold.level;
        }
      }
    }

    const lastAckMs = lead.last_acknowledged_at
      ? new Date(lead.last_acknowledged_at).getTime()
      : 0;
    const minutesSinceAck = (now - lastAckMs) / (1000 * 60);
    const isSuppressed = minutesSinceAck < 30; // default 30 mins

    console.log({
      id: lead.id,
      name: lead.name,
      status: lead.status,
      escalation_level: lead.escalation_level,
      delayMinutes,
      targetLevel,
      isSuppressed,
      condition: (targetLevel > lead.escalation_level && !isSuppressed)
    });
  }
}

run();
