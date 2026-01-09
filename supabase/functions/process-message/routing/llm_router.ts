import { RouterOutput } from './heuristic_router.ts';

export class LLMRouter {
    static async route(
        content: string,
        context: any,
        openaiKey: string,
        history: any[]
    ): Promise<RouterOutput> {

        const systemPrompt = `You are the Router. Classify the user message into one of these modes:
- CAPTURE: Add/Edit tasks, reminders, lists, memories. (Action oriented)
- QUERY: Ask about data (agenda, lists, reminders, history). (Read only)
- TRANSFORM: Process data (summarize, extract, format).
- CHAT: Casual conversation, greetings, philosophy. (No actions)

Active Context:
${JSON.stringify(context)}

Return JSON only.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.map(m => {
                const msg: any = { role: m.role, content: m.content || (m.tool_calls ? null : '') };
                if (m.tool_calls) msg.tool_calls = m.tool_calls;
                if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
                return msg;
            }),
            { role: 'user', content: content }
        ];

        // DEBUG: Log payload to diagnose 400 errors
        console.log('🔍 LLMRouter Payload:', JSON.stringify({ model: 'gpt-5.1', messages }));

        let response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-5.1',
                messages: messages,
                temperature: 0,
                max_completion_tokens: 250,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ LLMRouter Error Body: ${errorText}`);
            console.error(`❌ LLMRouter: gpt-5.1 failed (${response.status}). STRICT MODE: No fallback.`);
            throw new Error(`Router Error: ${errorText}`);
        }

        const data = await response.json();
        if (!response.ok) throw new Error(`Router Error: ${data.error?.message}`);

        const result = JSON.parse(data.choices[0].message.content);

        // Normalize output
        const routerOutput = {
            mode: result.mode || 'CHAT',
            intent: result.intent || 'general_chat',
            confidence: result.confidence || 0.5,
            entities: result.entities || {},
            direct_action: false
        };

        console.log(`🧭 LLMRouter Decision: ${routerOutput.mode} (${routerOutput.intent}) - Confidence: ${routerOutput.confidence}`);
        return routerOutput;
    }
}
