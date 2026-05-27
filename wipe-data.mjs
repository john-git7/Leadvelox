import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('Wiping operational data...');
  const nilUUID = '00000000-0000-0000-0000-000000000000';
  
  const { error: err1 } = await supabase.from('lead_events').delete().neq('id', nilUUID);
  if (err1) console.error('Error wiping lead_events:', err1);
  
  const { error: err2 } = await supabase.from('automation_events').delete().neq('id', nilUUID);
  if (err2) console.error('Error wiping automation_events:', err2);
  
  const { error: err3 } = await supabase.from('leads').delete().neq('id', nilUUID);
  if (err3) console.error('Error wiping leads:', err3);
  
  const { error: err4 } = await supabase.from('lead_groups').delete().neq('id', nilUUID);
  if (err4) console.error('Error wiping lead_groups:', err4);

  console.log('Done wiping data!');
}

run();
