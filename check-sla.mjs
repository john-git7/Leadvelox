import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Find one 'ashok' lead
  const { data: leads, error: fetchError } = await supabase
    .from('leads')
    .select('id, name')
    .ilike('name', '%ashok%')
    .limit(1);

  if (fetchError || !leads || leads.length === 0) {
    console.error("Error fetching lead:", fetchError);
    return;
  }

  const targetId = leads[0].id;
  
  // Set deadline to exactly 16 minutes AGO. 
  // This will instantly trigger a Level 3 breach (15m threshold) on the next cron run.
  const targetDeadline = new Date(Date.now() - 16 * 60000).toISOString();

  const { error: updateError } = await supabase
    .from('leads')
    .update({ 
        response_deadline: targetDeadline,
        escalation_level: 0,
        sla_status: 'HEALTHY'
    })
    .eq('id', targetId);

  if (updateError) {
    console.error("Update Error:", updateError);
  } else {
    console.log(`Successfully primed lead ${targetId} for SLA breach in 5 minutes. Deadline set to: ${targetDeadline}`);
  }
}

check();
