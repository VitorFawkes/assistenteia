import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/process-message`;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testReminder() {
    console.log('🤖 Testing AI Reminder Logic...');
    console.log(`Target: ${FUNCTION_URL}\n`);

    // Use a known user ID or fetch one
    const TEST_USER_ID = 'd64a0686-1015-4dc4-ba3d-e98eada227fa';

    const input = "Me lembra daqui 1 min de ir no mercado";

    try {
        const response = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                content: input,
                userId: TEST_USER_ID,
                conversationId: 'test-suite-reminder-' + Date.now(),
                sender_number: 'TEST_SUITE'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));

        if (data.success && data.response) {
            if (data.response.toLowerCase().includes('lembrete') || data.response.toLowerCase().includes('criado') || data.response.toLowerCase().includes('agendado')) {
                console.log('✅ PASS: Reminder created successfully.');
            } else {
                console.warn('⚠️ WARNING: Response might not indicate success explicitly. Check logs.');
            }
        } else {
            console.error('❌ FAIL: Invalid response format.');
        }

    } catch (err: any) {
        console.error('❌ ERROR:', err.message);
    }
}

testReminder();
