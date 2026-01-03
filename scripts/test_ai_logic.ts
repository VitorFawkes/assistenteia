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

// Test Cases
const TEST_CASES = [
    {
        name: '1. Explicit List Creation',
        input: 'Faz uma lista de compras com leite, pão e manteiga',
        expectedMode: 'TRANSFORM',
        // AI says: "Criei a lista..."
        validate: (res: any) => res.response.toLowerCase().includes('criei') && res.response.toLowerCase().includes('lista')
    },
    {
        name: '2. Implicit List Creation (The "Ghost List" Fix)',
        input: 'leite pão manteiga',
        // Note: Without "Faz uma lista", this might go to CAPTURE if it looks like items, 
        // OR TRANSFORM if the router is smart. 
        // My recent fix was for "Faz uma lista" without commas.
        // Let's test the specific failure case: "Faz uma lista de compras leite pão manteiga" (no commas)
        inputOverride: 'Faz uma lista de compras leite pão manteiga',
        expectedMode: 'TRANSFORM',
        validate: (res: any) => res.response.toLowerCase().includes('criei') && res.response.toLowerCase().includes('lista')
    },
    {
        name: '3. Add Item to Context',
        input: 'Adicionar café',
        expectedMode: 'CAPTURE',
        validate: (res: any) => res.response.toLowerCase().includes('adicion') || res.response.toLowerCase().includes('café')
    },
    {
        name: '4. Casual Chat',
        input: 'Oi, tudo bem?',
        expectedMode: 'CHAT',
        validate: (res: any) => !res.response.includes('lista') // Should not create anything
    }
];

async function runTests() {
    console.log('🤖 Starting AI Logic Automated Tests...');
    console.log(`Target: ${FUNCTION_URL}\n`);

    let passed = 0;
    let failed = 0;

    // We need a real user ID for this to work. 
    // I'll grab the first user from the DB or use a hardcoded test ID if available.
    // For safety, let's try to find a user.
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    // Admin API might not work with Anon key. 
    // Let's assume the user ID from the logs: d64a0686-1015-4dc4-ba3d-e98eada227fa
    const TEST_USER_ID = 'd64a0686-1015-4dc4-ba3d-e98eada227fa';

    for (const test of TEST_CASES) {
        console.log(`Testing: ${test.name}...`);
        const input = test.inputOverride || test.input;

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
                    conversationId: 'test-suite-' + Date.now(),
                    sender_number: 'TEST_SUITE'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            const data = await response.json();

            // Validation
            let isSuccess = false;
            if (data.success && data.response) {
                isSuccess = test.validate(data);
            }

            if (isSuccess) {
                console.log('✅ PASS');
                passed++;
            } else {
                console.error('❌ FAIL');
                console.error('   Input:', input);
                console.error('   Response:', data.response);
                failed++;
            }

        } catch (err: any) {
            console.error('❌ ERROR (Exception)');
            console.error('   ', err.message);
            failed++;
        }
        console.log('---');
    }

    console.log(`\nResults: ${passed} Passed, ${failed} Failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
