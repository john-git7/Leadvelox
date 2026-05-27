import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Service Role Key in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedUser(email: string, role: string) {
  const password = 'Password123!';
  
  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (authError) {
    if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
       console.log(`User ${email} already exists. Attempting to update role...`);
       // Fetch user ID
       const { data: users } = await supabase.auth.admin.listUsers();
       const existingUser = users.users.find(u => u.email === email);
       if (existingUser) {
           await supabase.from('profiles').upsert({
               id: existingUser.id,
               role: role
           });
           console.log(`Updated profile for ${email} to ${role}`);
       }
       return;
    }
    console.error(`Error creating ${email}:`, authError.message);
    return;
  }

  if (authData?.user) {
    const userId = authData.user.id;
    console.log(`Created auth user ${email} with ID ${userId}`);

    // Create profile
    const { error: profileError } = await supabase.from('profiles').insert({
      id: userId,
      role: role
    });

    if (profileError) {
      console.error(`Error creating profile for ${email}:`, profileError.message);
    } else {
      console.log(`Successfully created profile for ${email} with role ${role}`);
    }
  }
}

async function main() {
  console.log("Seeding users...");
  await seedUser('admin@leadops.com', 'ADMIN');
  await seedUser('manager@leadops.com', 'MANAGER');
  await seedUser('agent@leadops.com', 'AGENT');
  console.log("Done.");
}

main();
