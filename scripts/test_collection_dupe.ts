
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { ToolExecutor } from '../supabase/functions/process-message/tools/tool_executor.ts';

// MOCK Supabase Client
const mockSupabase = {
    from: (table: string) => {
        return {
            select: (cols: string) => ({
                eq: (col: string, val: any) => ({
                    ilike: (col: string, val: any) => ({
                        single: async () => {
                            if (table === 'collections' && val === 'Endereço') {
                                return { data: { id: 'existing-id-123', name: 'Endereço' }, error: null };
                            }
                            return { data: null, error: null };
                        }
                    }),
                    single: async () => ({ data: { id: 'task-id-123', description: '[ ] item 1' }, error: null })
                }),
                single: async () => ({ data: { id: 'task-id-123', description: '[ ] item 1' }, error: null })
            }),
            insert: (data: any) => ({
                select: () => ({
                    single: async () => ({ data: { ...data, id: 'new-id-456' }, error: null })
                })
            }),
            update: (data: any) => ({
                eq: (col: string, val: any) => ({
                    eq: (col2: string, val2: any) => ({
                        single: async () => ({ data: null, error: null })
                    }),
                    single: async () => ({ data: null, error: null })
                })
            })
        };
    },
    rpc: async () => ({ data: [], error: null })
};

async function testDuplicateCollection() {
    console.log('--- Testing Duplicate Collection Prevention ---');
    const userId = 'user-123';

    // 1. Try to create "Endereço" (Should exist in mock)
    const result1 = await ToolExecutor.execute('manage_collections', {
        action: 'create',
        name: 'Endereço',
        items: ['Rua Teste, 123']
    }, mockSupabase as any, userId);

    console.log('Result 1 (Should match existing):', result1);

    if (result1.includes('existing-id-123') && result1.includes('já existia')) {
        console.log('✅ SUCCESS: Existing collection used.');
    } else {
        console.error('❌ FAILURE: Did not use existing collection or wrong message.');
    }

    // 2. Try to create "Nova Lista" (Should NOT exist)
    const result2 = await ToolExecutor.execute('manage_collections', {
        action: 'create',
        name: 'Nova Lista Unica',
        items: ['Item A']
    }, mockSupabase as any, userId);

    console.log('Result 2 (Should create new):', result2);

    if (result2.includes('new-id-456') && result2.includes('criada')) {
        console.log('✅ SUCCESS: New collection created.');
    } else {
        console.error('❌ FAILURE: Did not create new collection or wrong message.');
    }
}

testDuplicateCollection();
