import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testRaceCondition() {
    console.log('🏎️ Starting Race Condition Test...');

    const userId = '00000000-0000-0000-0000-000000000000'; // Replace with valid user ID if needed, or mock
    // Actually we need a real user ID for FK constraint.
    // Let's fetch the first user from DB
    const { data: users } = await supabase.from('auth.users').select('id').limit(1); // This might fail if no access to auth schema
    // Alternative: fetch from user_settings
    const { data: settings } = await supabase.from('user_settings').select('user_id').limit(1).single();

    if (!settings) {
        console.error('❌ No user found to test with.');
        return;
    }

    const targetUserId = settings.user_id;
    const testThreadId = `race_test_${Date.now()}@s.whatsapp.net`;

    console.log(`👤 Testing with User: ${targetUserId}`);
    console.log(`🧵 Thread ID: ${testThreadId}`);

    // Simulate 2 concurrent requests to Webhook (SessionManager logic)
    // We can't call the webhook directly easily without mocking event structure, 
    // but we can simulate the DB calls if we were running inside Deno.
    // Since we are running this script externally, we should call the Webhook Function URL if possible.
    // But we might not have it deployed yet or want to test local logic.

    // BETTER APPROACH: Call the deployed webhook with a mock payload concurrently.
    const webhookUrl = 'https://vitorfawkes-assistenteia.supabase.co/functions/v1/whatsapp-webhook'; // Replace with actual project ref if known
    // We don't know the project ref from env vars easily here unless we parse SUPABASE_URL.

    const projectRef = SUPABASE_URL.split('://')[1].split('.')[0];
    const url = `https://${projectRef}.supabase.co/functions/v1/whatsapp-webhook`;

    console.log(`🌐 Target URL: ${url}`);

    const payload = {
        event: "messages.upsert",
        instance: "test_instance",
        data: {
            key: {
                remoteJid: testThreadId,
                fromMe: false,
                id: "TEST_MSG_1"
            },
            message: {
                conversation: "Test Message"
            }
        }
    };

    // We need to make sure the instance exists in DB or the webhook will fail early.
    // Let's assume 'test_instance' might not exist.
    // We should use an existing instance name if possible or insert one.
    // Let's try to insert a test instance first.
    await supabase.from('whatsapp_instances').upsert({
        instance_name: 'test_race_instance',
        user_id: targetUserId,
        status: 'connected',
        type: 'user_personal'
    });

    const racePayload = {
        ...payload,
        instance: 'test_race_instance'
    };

    // Fire 2 requests concurrently
    const req1 = fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...racePayload, data: { ...racePayload.data, key: { ...racePayload.data.key, id: "RACE_1" } } })
    });

    const req2 = fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...racePayload, data: { ...racePayload.data, key: { ...racePayload.data.key, id: "RACE_2" } } })
    });

    console.log('🚀 Firing 2 concurrent requests...');
    const [res1, res2] = await Promise.all([req1, req2]);

    console.log(`Response 1: ${res1.status}`);
    console.log(`Response 2: ${res2.status}`);

    // Check DB for duplicates
    const { data: sessions, error } = await supabase
        .from('conversations')
        .select('id, created_at')
        .eq('thread_id', testThreadId)
        .eq('status', 'active');

    if (error) {
        console.error('❌ DB Error:', error);
    } else {
        console.log(`📊 Active Sessions found: ${sessions.length}`);
        if (sessions.length === 1) {
            console.log('✅ SUCCESS: Only 1 active session created!');
        } else {
            console.error(`❌ FAILURE: ${sessions.length} sessions created! Race condition exists.`);
        }
    }

    // Cleanup
    await supabase.from('conversations').delete().eq('thread_id', testThreadId);
    await supabase.from('whatsapp_instances').delete().eq('instance_name', 'test_race_instance');
}

testRaceCondition();
