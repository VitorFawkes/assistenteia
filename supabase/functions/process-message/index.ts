import "jsr:@supabase/functions-js/edge-runtime.d.ts";
declare const Deno: any;
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Modules
import { ActiveContextService } from './services/active_context.ts';
import { HeuristicRouter } from './routing/heuristic_router.ts';
import { LLMRouter } from './routing/llm_router.ts';
import { WorkerFactory } from './workers/worker_factory.ts';
import { Renderer } from './render/renderer.ts';
import { WorkerOutputSchema } from './validation/schemas.ts';

// Tools Definition
const TOOLS_DEFINITION = [
    { type: 'function', function: { name: 'manage_tasks', description: 'Manage tasks and checklists', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['create', 'update_checklist_item', 'add_item'] }, title: { type: 'string', description: 'Task title (for create)' }, description: { type: 'string', description: 'Task description or checklist (for create)' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }, task_id: { type: 'string', description: 'Required for update_checklist_item and add_item. Get from Active Context → active_list → id.' }, item_content: { type: 'string', description: 'Required for update_checklist_item. The item name to check/uncheck.' }, items: { type: 'array', items: { type: 'string' }, description: 'Required for add_item. List of items to add.' } }, required: ['action'] } } },
    { type: 'function', function: { name: 'manage_reminders', description: 'Manage reminders', parameters: { type: 'object', properties: { action: { type: 'string' } } } } },
    { type: 'function', function: { name: 'manage_collections', description: 'Manage collections', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['create', 'add_item', 'update_item', 'archive_list'] }, name: { type: 'string' }, items: { type: 'array', items: { type: 'string' } }, list_id: { type: 'string' }, item_id: { type: 'string' }, status: { type: 'string' }, content: { type: 'string' } } } } },
    { type: 'function', function: { name: 'manage_inventory', description: 'Manage inventory', parameters: { type: 'object', properties: { action: { type: 'string' } } } } },
    { type: 'function', function: { name: 'manage_financials', description: 'Manage financials', parameters: { type: 'object', properties: { action: { type: 'string' } } } } },
    { type: 'function', function: { name: 'recall_memory', description: 'Recall memory', parameters: { type: 'object', properties: { query: { type: 'string' } } } } },
    { type: 'function', function: { name: 'save_memory', description: 'Save memory', parameters: { type: 'object', properties: { content: { type: 'string' } } } } },
    { type: 'function', function: { name: 'query_messages', description: 'Query messages', parameters: { type: 'object', properties: { limit: { type: 'number' } } } } },
    { type: 'function', function: { name: 'update_user_settings', description: 'Update settings', parameters: { type: 'object', properties: { preferred_name: { type: 'string' } } } } }
];

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
    }

    try {
        const { content, userId, conversationId, sender_number } = await req.json();
        console.log(`🚀 Pipeline Start: ${content?.substring(0, 50)}...`);

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const openaiKey = Deno.env.get('OPENAI_API_KEY')!;

        // 1. Build Active Context
        const activeContext = await ActiveContextService.build(supabase, userId);

        // 2. Routing
        let routerOutput = HeuristicRouter.route(content || '', activeContext);
        let routerSource = 'heuristic';

        if (!routerOutput) {
            // Fallback to LLM Router
            const { data: history } = await supabase.rpc('get_messages_decrypted', {
                p_encryption_key: Deno.env.get('ENCRYPTION_KEY'),
                p_limit: 5,
                p_user_id: userId,
                p_conversation_id: conversationId
            });

            routerOutput = await LLMRouter.route(content || '', activeContext, openaiKey, history || []);
            routerSource = 'llm';
        }

        console.log(`🧭 Routed to: ${routerOutput.mode} (${routerSource})`);

        // 3. Worker Execution (Initial)
        const { data: fullHistory } = await supabase.rpc('get_messages_decrypted', {
            p_encryption_key: Deno.env.get('ENCRYPTION_KEY'),
            p_limit: 20,
            p_user_id: userId,
            p_conversation_id: conversationId
        });

        let history = fullHistory?.reverse() || [];

        let workerResponse = await WorkerFactory.run(
            routerOutput,
            content || '',
            activeContext,
            history,
            openaiKey,
            TOOLS_DEFINITION
        );

        // 3.5 Tool Execution Loop
        if (workerResponse.tool_calls && workerResponse.tool_calls.length > 0) {
            console.log(`🛠️ Handling ${workerResponse.tool_calls.length} tool calls...`);

            // Append assistant's tool call message to history
            history.push(workerResponse);

            for (const toolCall of workerResponse.tool_calls) {
                const toolName = toolCall.function.name;
                const toolArgs = JSON.parse(toolCall.function.arguments);

                // Execute Tool
                const toolResult = await import('./tools/tool_executor.ts').then(m =>
                    m.ToolExecutor.execute(toolName, toolArgs, supabase, userId)
                );

                // Append tool result to history
                history.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: toolResult
                });
            }

            // Call Worker again with updated history (Recursive Step)
            console.log('🔄 Re-calling Worker with Tool Results...');
            workerResponse = await WorkerFactory.run(
                routerOutput,
                content || '',
                activeContext,
                history, // Now contains tool calls and results
                openaiKey,
                TOOLS_DEFINITION
            );
        }

        // 4. Validation & Retry (JSON Strictness)
        let parsedOutput = null;
        if (routerOutput.mode !== 'CHAT') {
            try {
                const rawContent = workerResponse.content || '{}';
                const jsonContent = JSON.parse(rawContent);

                // DYNAMIC SCHEMA SELECTION
                if (routerOutput.mode === 'TRANSFORM' && routerOutput.intent === 'list_normalization') {
                    // Import schema dynamically or use a loose schema first
                    const { ListNormalizationSchema } = await import('./validation/schemas.ts');
                    parsedOutput = ListNormalizationSchema.parse(jsonContent);
                } else {
                    parsedOutput = WorkerOutputSchema.parse(jsonContent);
                }
            } catch (e) {
                console.warn('⚠️ Invalid JSON from Worker. Retrying...', e);
                // Fallback: try to just use the raw JSON if schema validation failed but it looks okay-ish?
                // Or just fail gracefully.
                parsedOutput = { response: workerResponse.content || 'Action completed.' };
            }
        } else {
            parsedOutput = { response: workerResponse.content };
        }

        // 4.5 Persistence (Side Effects for TRANSFORM)
        if (routerOutput.mode === 'TRANSFORM' && routerOutput.intent === 'list_normalization') {
            const { action, data, list_name } = parsedOutput;

            // LOGGING: Deep dive into what the AI decided
            try {
                await supabase.from('debug_logs').insert({
                    function_name: 'process-message',
                    level: 'info',
                    message: `TRANSFORM Decision: ${action}`,
                    meta: { action, list_name, data_length: data?.length, data }
                });
            } catch (e) { console.error('Log failed', e); }

            console.log(`💾 Persisting List Data. Action: ${action}, Name: ${list_name}`);

            const ToolExecutor = await import('./tools/tool_executor.ts').then(m => m.ToolExecutor);

            try {
                if (action === 'create_list' || action === 'create_collection') {
                    // Create new list with dynamic name
                    const nameToUse = list_name || 'Nova Lista';

                    // Allow creating empty lists
                    const result = await ToolExecutor.execute('manage_collections', {
                        action: 'create',
                        name: nameToUse,
                        items: data || []
                    }, supabase, userId);

                    await supabase.from('debug_logs').insert({
                        function_name: 'process-message',
                        level: 'info',
                        message: 'Tool Execution Result (Create Collection)',
                        meta: { result }
                    });

                } else if (action === 'create_checklist') {
                    // EPHEMERAL LIST: Create a Task with Checklist Description
                    const nameToUse = list_name || 'Lista Rápida';

                    // Format items as markdown checklist
                    const checklistDescription = (data || []).map((item: string) => `[ ] ${item}`).join('\n');

                    const result = await ToolExecutor.execute('manage_tasks', {
                        action: 'create',
                        title: nameToUse,
                        description: checklistDescription,
                        priority: 'medium'
                    }, supabase, userId);

                    await supabase.from('debug_logs').insert({
                        function_name: 'process-message',
                        level: 'info',
                        message: 'Tool Execution Result (Create Checklist)',
                        meta: { result }
                    });

                } else if (action === 'add_to_context' && data?.length > 0) {
                    if (activeContext.active_list?.id) {
                        // Add to active list
                        await ToolExecutor.execute('manage_collections', {
                            action: 'add_item',
                            list_id: activeContext.active_list.id,
                            items: data
                        }, supabase, userId);
                    } else {
                        console.warn('⚠️ Action was add_to_context but no active list found. Creating new list instead.');
                        // Fallback to creating a new list if context is lost
                        await ToolExecutor.execute('manage_collections', {
                            action: 'create',
                            name: 'Lista Recuperada',
                            items: data
                        }, supabase, userId);
                    }
                }
            } catch (toolError: any) {
                console.error('Tool Execution Failed', toolError);
                await supabase.from('debug_logs').insert({
                    function_name: 'process-message',
                    level: 'error',
                    message: 'Tool Execution Failed',
                    meta: { error: toolError.message, stack: toolError.stack }
                });
            }
        }

        // 5. Rendering
        const finalResponse = Renderer.render(parsedOutput);

        // 6. Observability
        const endTime = new Date();
        const latencyMs = endTime.getTime() - new Date().getTime(); // Placeholder for start time

        await supabase.from('run_logs').insert({
            session_id: conversationId || null,
            user_id: userId,
            thread_id: sender_number,
            mode: routerOutput.mode,
            intent: routerOutput.intent,
            confidence: routerOutput.confidence,
            router_source: routerSource,
            active_context_size: JSON.stringify(activeContext).length,
            tool_calls: workerResponse.tool_calls || null
        });

        return new Response(JSON.stringify({ success: true, response: finalResponse }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error: any) {
        console.error('CRITICAL PIPELINE ERROR:', error);

        try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseKey);
            await supabase.from('debug_logs').insert({
                function_name: 'process-message',
                level: 'error',
                message: error.message || 'Unknown error',
                meta: { stack: error.stack, error: String(error) }
            });
        } catch (logError) {
            console.error('Failed to log to debug_logs:', logError);
        }

        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});
