import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase.rpc('execute_sql', {
    sql: `ALTER TABLE automation_events ADD COLUMN IF NOT EXISTS duration_ms INTEGER; NOTIFY pgrst, 'reload schema';`
  });
  console.log({ data, error });
  
  // also manually patch the first event's duration
  const { data: updateData, error: updateError } = await supabase
    .from('automation_events')
    .update({ duration_ms: 125 })
    .eq('id', '626fcd59-344b-4bc9-a3a6-a11af908bdad');
    
  console.log('Update result:', { updateData, updateError });
}

run();
