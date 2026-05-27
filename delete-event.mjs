import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('automation_events')
    .delete()
    .eq('workflow_name', 'Lead Intake Workflow');
    
  if (error) {
    console.error('Delete error:', error);
  } else {
    console.log('Successfully deleted Lead Intake Workflow events.');
  }
}

run();
