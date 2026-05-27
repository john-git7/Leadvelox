import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://svadhckzyttvhbjhvncw.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2YWRoY2t6eXR0dmhiamh2bmN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODEwODY3OCwiZXhwIjoyMDkzNjg0Njc4fQ.r59Ut8EKpWGPIXqpfPSxv0YAGxns-umRQJEtY2362CE'
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
