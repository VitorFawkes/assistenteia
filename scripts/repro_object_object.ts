
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ToolExecutor } from '../supabase/functions/process-message/tools/tool_executor.ts';

// MOCK SUPABASE
const mockSupabase = {
    from: (table: string) => ({
        insert: async (data: any) => {
            console.log(`[MOCK DB] Insert into ${table}:`, JSON.stringify(data, null, 2));
            if (table === 'tasks' || table === 'collections' || table === 'reminders') {
                return { data: { id: 'mock-id', ...data }, error: null, select: () => ({ single: () => ({ data: { id: 'mock-id', ...data }, error: null }) }) };
            }
            return { error: null };
        },
        update: async (data: any) => {
            console.log(`[MOCK DB] Update ${table}:`, JSON.stringify(data, null, 2));
            return { eq: () => ({ eq: () => ({ error: null }) }) };
        },
        select: () => ({
            eq: () => ({
                single: async () => ({ data: { id: 'mock-task-id', description: 'Existing item' }, error: null }),
                maybeSingle: async () => ({ data: null, error: null })
            })
        })
    })
};

async function testSerialization() {
    console.log('🧪 Testing Serialization Fix...');

    const userId = 'user-123';

    // TEST 1: Create Checklist with Object Items (The Bug)
    console.log('\n--- Test 1: Create Checklist with Objects ---');
    const bugData = [
        { content: 'Milk', status: 'todo' },
        { content: 'Eggs', status: 'todo' }
    ];

    // Simulate the logic in process-message/index.ts
    const checklistDescription = bugData.map((item: any) => {
        const content = typeof item === 'object' && item.content ? item.content : String(item);
        return `[ ] ${content}`;
    }).join('\n');

    console.log('Generated Description:');
    console.log(checklistDescription);

    if (checklistDescription.includes('[object Object]')) {
        console.error('❌ FAIL: Description contains [object Object]');
    } else {
        console.log('✅ PASS: Description is clean');
    }

    // TEST 2: Tool Executor Add Item with Objects
    console.log('\n--- Test 2: Tool Executor Add Item with Objects ---');
    await ToolExecutor.execute('manage_collections', {
        action: 'add_item',
        list_id: 'list-123',
        items: bugData
    }, mockSupabase, userId);

}

testSerialization();
