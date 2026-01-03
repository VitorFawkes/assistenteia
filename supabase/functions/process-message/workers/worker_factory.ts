import { RouterOutput } from '../routing/heuristic_router.ts';

// --- TOOL SETS ---
const READ_ONLY_TOOLS = [
    'manage_tasks', 'manage_reminders', 'manage_collections', 'recall_memory', 'query_messages'
];
const WRITE_TOOLS = [
    'manage_tasks', 'manage_reminders', 'manage_collections', 'manage_inventory', 'save_memory', 'update_user_settings'
];

export class WorkerFactory {
    static async run(
        routerOutput: RouterOutput,
        content: string,
        context: any,
        history: any[],
        openaiKey: string,
        allTools: any[]
    ): Promise<any> {

        const { mode, intent, entities } = routerOutput;

        // 1. Tool Gating & Prompt Selection
        let allowedTools: any[] = [];
        let toolChoice = 'none';
        let systemPrompt = '';
        let responseFormat: any = { type: 'text' }; // Default to text for CHAT

        const baseContext = `Active Context: ${JSON.stringify(context)}\nEntities: ${JSON.stringify(entities)}`;

        switch (mode) {
            case 'CHAT':
                allowedTools = allTools.filter(t => READ_ONLY_TOOLS.includes(t.function.name) || t.function.name === 'save_memory');
                toolChoice = 'auto';
                systemPrompt = `You are a helpful assistant. Engage in casual conversation.
${baseContext}
You can use tools if the user asks for something specific (like recalling a memory or checking a list), but prioritize conversation.`;
                responseFormat = { type: 'text' };
                break;

            case 'QUERY':
                allowedTools = allTools.filter(t => READ_ONLY_TOOLS.includes(t.function.name));
                toolChoice = 'auto';
                systemPrompt = `You are the QUERY Worker. Intent: ${intent}.
${baseContext}
You have read-only access. Answer the user's question using the tools if needed.
Return JSON with 'response' field.`;
                responseFormat = { type: 'json_object' };
                break;

            case 'CAPTURE':
                allowedTools = allTools.filter(t => WRITE_TOOLS.includes(t.function.name));
                toolChoice = 'auto';
                systemPrompt = `You are the CAPTURE Worker. Intent: ${intent}.
${baseContext}

CRITICAL: You have write access.
1. Analyze the 'Active Context' (e.g., active_list).
2. Compare it with the User's Input.
3. SEMANTIC CHECK: Does the Input belong to the Active List?
   - YES (e.g., Context="Groceries", Input="Buy milk") -> Add to Active List.
   - NO (e.g., Context="Travel", Input="Buy milk") -> IGNORE Active List. Create a NEW list or use a more appropriate one.
   - AMBIGUOUS -> Ask for confirmation.

PREFERENCE HANDLING:
- If the user states a preference (e.g., "We like Malbec"), SAVE IT using 'save_memory'.
- If it *might* be relevant to the active context (e.g., wine for a trip), you can ALSO suggest adding it as a task, but do NOT be negative.
- Example: "Saved your preference for Malbec. Should I add 'Buy Malbec' to the [Active List]?"

LIST TYPE HANDLING:
- If Active List Type is 'checklist' (Task): Use 'manage_tasks' with action='update_checklist_item'.
  - REQUIRED: task_id = Get from Active Context → active_list → id
  - REQUIRED: item_content = Extract the item name from user message (e.g., "pão" from "comprei o pão")
- If Active List Type is 'collection': Use 'manage_collections' with action='update_item'.

Return JSON with 'response' field describing what was done.`;
                responseFormat = { type: 'json_object' };
                break;

            case 'TRANSFORM':
                allowedTools = [];
                toolChoice = 'none';

                if (intent === 'list_normalization') {
                    let contextStr = '{}';
                    try {
                        contextStr = JSON.stringify(context);
                    } catch (e) {
                        console.warn('Failed to stringify context:', e);
                        contextStr = JSON.stringify({ error: 'Context serialization failed', message: String(e) });
                    }

                    systemPrompt = `You are a LIST NORMALIZER. Your ONLY job is to format the user's input list.
Input: ${content}
Context: ${contextStr} (IGNORE for content generation, use ONLY for conflict detection)

Rules:
1. Output ONLY the items provided in the INPUT.
2. Do NOT add sub-items, suggestions, or extra text.
3. Do NOT infer a destination/title from Context. Use only Input.
4. CONTEXT SAFETY:
   - NEVER suggest the Context Collection for generic inputs (e.g., "Shopping", "To-do").
   - ONLY suggest the Context Collection if the Input EXPLICITLY names it (e.g. Input="Items for Project X", Context="Project X").
   - If no explicit match, assume NEW LIST.
5. DECISION LOGIC (Collection vs Checklist):
   - 'create_collection': For PERMANENT/LONG-TERM lists (e.g., "Viagem Curitiba", "Infos Importantes", "Filmes para ver").
   - 'create_checklist': For EPHEMERAL/SHORT-TERM lists (e.g., "Lista de Compras", "Mercado", "Tarefas de Hoje").

6. Return JSON with:
   - 'response': (natural language confirmation)
   - 'data': (array of items)
   - 'action': 'create_collection' | 'create_checklist' | 'add_to_context' | 'ask_confirmation'
   - 'list_name': (REQUIRED for create actions)`;
                } else {
                    systemPrompt = `You are the TRANSFORM Worker. Intent: ${intent}.
${baseContext}
Process the input data. Do NOT hallucinate missing fields. Use null for missing data.
Return JSON with 'response' and 'data' fields.`;
                }

                responseFormat = { type: 'json_object' };
                break;

            default: // Fallback
                allowedTools = [];
                toolChoice = 'none';
                systemPrompt = `You are a helper. ${baseContext}`;
        }

        // 2. Call LLM
        // 2. Call LLM (with Fallback)
        const payload = {
            model: 'gpt-5.1',
            messages: [
                { role: 'system', content: systemPrompt },
                ...history.map(m => {
                    const msg: any = { role: m.role, content: m.content };
                    if (m.tool_calls) msg.tool_calls = m.tool_calls;
                    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
                    return msg;
                }),
                { role: 'user', content: content }
            ],
            tools: allowedTools.length > 0 ? allowedTools : undefined,
            tool_choice: allowedTools.length > 0 ? toolChoice : undefined,
            temperature: mode === 'CHAT' ? 0.7 : 0,
            response_format: responseFormat
        };

        let response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.warn(`⚠️ WorkerFactory: gpt-5.1 failed (${response.status}). Falling back to gpt-4o.`);
            payload.model = 'gpt-4o';
            response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        const data = await response.json();
        if (!response.ok) throw new Error(`Worker Error: ${data.error?.message}`);

        return data.choices[0].message;
    }
}
