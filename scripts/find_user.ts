import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!; // Using Anon for public search if RLS allows, or Service Role if needed.
// Actually, auth.users is not accessible via Anon. I need Service Role.
// I'll try to read SERVICE_ROLE from .env if available, otherwise I might be stuck.
// The user provided .env content earlier? No, I viewed it.
// Let's check .env again to see if I have SERVICE_ROLE.

// If I don't have SERVICE_ROLE, I can't query auth.users from script.
// But I can query `user_settings` which is public/authenticated.

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .limit(5);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Found users:', data);
    }
}

main();
