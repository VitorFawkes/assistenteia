
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    console.log('\n--- CHECKING DATABASE TABLES ---');
    const { error: tasksError } = await supabase.from('tasks').select('id').limit(1);
    if (tasksError) console.error('❌ Table "tasks" error:', tasksError.message);
    else console.log('✅ Table "tasks" exists.');

    const { error: memError } = await supabase.from('memories').select('id').limit(1);
    if (memError) console.error('❌ Table "memories" error:', memError.message);
    else console.log('✅ Table "memories" exists.');
}

async function testInteraction(testName: string, input: string, expectedKeywords: string[], userId: string) {
    console.log(`\n--- TEST: ${testName} ---`);
    console.log(`Input: "${input}"`);

    try {
        const { data, error } = await supabase.functions.invoke('process-message', {
            body: {
                content: input,
                userId: userId,
                mediaUrl: null,
                mediaType: 'text'
            }
        });

        if (error) {
            console.error('❌ Function Error:', error);
            return;
        }

        console.log('🔍 FULL DATA:', JSON.stringify(data, null, 2));

        const response = data?.response || "NO RESPONSE";
        console.log(`AI Response: "${response}"`);

        // Debug: Print tool outputs if available
        if (data?.history) {
            const toolMessages = data.history.filter((m: any) => m.role === 'tool');
            if (toolMessages.length > 0) {
                console.log('🔧 Tool Outputs:');
                toolMessages.forEach((m: any) => console.log(`   - ${m.content}`));
            }
        }

        const passed = expectedKeywords.some(kw => response.toLowerCase().includes(kw.toLowerCase()));
        if (passed) console.log('✅ PASSED');
        else console.log(`❌ FAILED. Expected one of: [${expectedKeywords.join(', ')}]`);

    } catch (err) {
        console.error('❌ Exception:', err);
    }
}

async function runAudit() {
    console.log('🕵️‍♂️ STARTING INTELLIGENCE AUDIT...');

    // Authenticate a test user to get a valid ID
    const email = process.env.TEST_EMAIL || 'test_intelligence@example.com';
    const password = process.env.TEST_PASSWORD || 'testpassword123';

    let { data: { user }, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !user) {
        console.log('⚠️ User not found, creating test user...');
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
            console.error('❌ Failed to create test user:', signUpError.message);
            return;
        }
        user = signUpData.user;
    }

    if (!user) {
        console.error('❌ Could not authenticate test user.');
        return;
    }

    const userId = user.id;
    console.log(`✅ Authenticated as user: ${userId}`);

    await checkTables();

    // 1. RAG: Save Memory
    await testInteraction(
        "RAG - Save Memory",
        "Lembre-se que minha cor favorita é azul cobalto.",
        ["salv", "memória", "lembr", "ok", "anotado"],
        userId
    );

    // 2. RAG: Recall Memory
    await testInteraction(
        "RAG - Recall Memory",
        "Qual é a minha cor favorita?",
        ["azul", "cobalto"],
        userId
    );

    // 3. Task Management: Create Task
    await testInteraction(
        "Task Creation",
        "Preciso comprar leite em pó algum dia.",
        ["tarefa", "lista", "adicionada", "salv"],
        userId
    );

    // 4. Reminder Management: Create Reminder
    await testInteraction(
        "Reminder Creation",
        "Me lembre de ligar para o João amanhã às 14h.",
        ["lembrete", "agendado", "amanhã", "14h"],
        userId
    );

    // 5. Financial Intelligence: Query Data (Extraction)
    // First add an item
    await testInteraction(
        "Add Expense",
        "Gastei 50 reais no almoço hoje.",
        ["adicionado", "item", "gasto", "50"],
        userId
    );

    // Then query it
    await testInteraction(
        "Query Expense",
        "Quanto eu gastei com almoço?",
        ["50", "total", "gasto"],
        userId
    );

    console.log('\n🏁 AUDIT COMPLETE');
}

runAudit();
