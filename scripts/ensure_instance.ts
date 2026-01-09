import { createClient } from 'jsr:@supabase/supabase-js@2';
import "jsr:@std/dotenv/load";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const instanceName = 'fawkes-sdr';
    console.log(`🔍 Checking for instance: ${instanceName}...`);

    // 1. Check if instance exists
    const { data: existing } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('instance_name', instanceName)
        .maybeSingle();

    if (existing) {
        console.log(`✅ Instance '${instanceName}' already exists!`);
        console.log(existing);
        return;
    }

    console.log(`⚠️ Instance '${instanceName}' NOT found. Attempting to create...`);

    // 2. Get a User ID to link to
    // We'll try to find a user in user_settings
    const { data: users, error: userError } = await supabase
        .from('user_settings')
        .select('user_id, phone_number')
        .limit(1);

    if (userError || !users || users.length === 0) {
        console.error('❌ No users found in user_settings to link the instance to.');
        console.log('Please sign up a user first or manually insert the instance with a valid user_id.');
        return;
    }

    const targetUser = users[0];
    console.log(`👤 Found user to link: ${targetUser.user_id} (${targetUser.phone_number || 'No Phone'})`);

    // 3. Insert Instance
    const { data: newInstance, error: insertError } = await supabase
        .from('whatsapp_instances')
        .insert({
            user_id: targetUser.user_id,
            instance_name: instanceName,
            status: 'connected',
            type: 'assistant', // Default to assistant/master based on context
            is_master: true    // Assuming fawkes-sdr is the master instance
        })
        .select()
        .single();

    if (insertError) {
        console.error('❌ Failed to create instance:', insertError);
    } else {
        console.log(`✅ Instance '${instanceName}' created successfully!`);
        console.log(newInstance);
    }
}

main();
