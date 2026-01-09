import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env manually if needed or via dotenv
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

console.log(`🔌 Connecting to ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const instanceName = 'fawkes-sdr';
    console.log(`🔍 Checking for instance: ${instanceName}...`);

    const { data: existing, error: fetchError } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('instance_name', instanceName)
        .maybeSingle();

    if (fetchError) {
        console.error('❌ Error fetching instance:', fetchError);
        return;
    }

    if (existing) {
        console.log(`✅ Instance '${instanceName}' already exists!`);
        console.log(existing);
        return;
    }

    console.log(`⚠️ Instance '${instanceName}' NOT found. Creating...`);

    // Get user from Auth Admin
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();

    if (userError) {
        console.error('❌ Error fetching auth users:', userError);
        return;
    }

    if (!users || users.length === 0) {
        console.error('❌ No users found in Auth. Please sign up a user first.');
        return;
    }

    const userId = users[0].id;
    console.log(`👤 Found Auth User ID: ${userId} (${users[0].email})`);

    // Ensure user is in user_settings
    const { data: settings } = await supabase.from('user_settings').select('user_id').eq('user_id', userId).maybeSingle();
    if (!settings) {
        console.log('⚠️ User not in user_settings. Inserting...');
        await supabase.from('user_settings').insert({ user_id: userId });
    }

    console.log(`👤 Linking to User ID: ${userId}`);

    const { data: newInstance, error: insertError } = await supabase.from('whatsapp_instances').insert({
        user_id: userId,
        instance_name: instanceName,
        status: 'connected',
        type: 'assistant',
        is_master: true
    }).select().single();

    if (insertError) {
        console.error('❌ Insert failed:', insertError);
    } else {
        console.log('✅ Instance created successfully!');
        console.log(newInstance);
    }
}

main();
