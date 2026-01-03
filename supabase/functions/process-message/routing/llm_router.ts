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

        let response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-5.1',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...history.map(m => ({ role: m.role, content: m.content })),
                    { role: 'user', content: content }
                ],
                temperature: 0,
                max_tokens: 250,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            console.warn(`⚠️ LLMRouter: gpt-5.1 failed (${response.status}). Falling back to gpt-4o.`);
            response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...history.map(m => ({ role: m.role, content: m.content })),
                        { role: 'user', content: content }
                    ],
                    temperature: 0,
                    max_tokens: 250,
                    response_format: { type: 'json_object' }
                })
            });
        }

        const data = await response.json();
        if (!response.ok) throw new Error(`Router Error: ${data.error?.message}`);

        const result = JSON.parse(data.choices[0].message.content);

        // Normalize output
        return {
            mode: result.mode || 'CHAT',
            intent: result.intent || 'general_chat',
            confidence: result.confidence || 0.5,
            entities: result.entities || {},
            direct_action: false
        };
    }
}
