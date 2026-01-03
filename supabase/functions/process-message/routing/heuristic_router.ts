export interface RouterOutput {
    mode: 'CAPTURE' | 'QUERY' | 'TRANSFORM' | 'CHAT' | 'WHATSAPP_SUMMARY';
    intent: string;
    confidence: number;
    entities?: any;
    direct_action?: boolean; // If true, execute immediately without LLM Worker
}

export class HeuristicRouter {
    static route(content: string, context: any): RouterOutput | null {
        const text = content.toLowerCase().trim();

        // 0. TRANSFORM: List Normalization (Explicit Request + Items) - HIGH PRIORITY
        // Matches: "Faz uma lista de X: item1, item2" or multiline
        // Moved to top to prevent "Add Item" capture from stealing it.
        // 0. TRANSFORM: List Normalization (Explicit Request + Items) - HIGH PRIORITY
        // Matches: "Faz uma lista de X: item1, item2" or multiline
        // Moved to top to prevent "Add Item" capture from stealing it.
        if (text.match(/^(faz(er)?|cria(r)?|monta(r)?) (uma )?lista/) || text.match(/^lista de/)) {
            // TRUST THE REGEX: If user explicitly asks to create a list, route to TRANSFORM.
            // The Worker (LLM) will handle extraction (even without commas) or empty lists.
            return {
                mode: 'TRANSFORM',
                intent: 'list_normalization',
                confidence: 0.95,
                direct_action: false
            };
        }

        // 1. QUERY: "O que tenho hoje?", "Minha agenda"
        if (text.match(/^(o que (tenho|h[áa])|minha agenda|compromissos|tarefas de hoje)/)) {
            return {
                mode: 'QUERY',
                intent: 'agenda_check',
                confidence: 1.0,
                direct_action: true // Can go straight to Query Worker (or direct tool call if we implemented it here)
            };
        }

        // 2. QUERY: "Mostra a lista", "Ver lista"
        if (text.match(/^(mostra|ver|ler) (a )?lista/)) {
            return {
                mode: 'QUERY',
                intent: 'list_view',
                confidence: 1.0,
                entities: { list_id: context.active_list?.id },
                direct_action: true
            };
        }

        // 3. CAPTURE: "Adicionar X", "Comprar Y" (Simple Add)
        // Regex: (add|adicionar|comprar|pôr) (rest of text)
        const addMatch = text.match(/^(adicionar|add|comprar|p[ôo]r|incluir) (.+)$/);
        if (addMatch) {
            const item = addMatch[2].trim();
            // Trust the LLM/Worker to handle complexity. 
            // If it looks like an add command, route to CAPTURE.
            return {
                mode: 'CAPTURE',
                intent: 'add_item',
                confidence: 0.9,
                entities: {
                    action: 'add',
                    items: [item],
                    list_id: context.active_list?.id
                },
                direct_action: false // Let Worker validate/refine
            };
        }

        // 3b. CAPTURE: Implicit List Items - REMOVED for Safety
        // We do NOT want to capture "beer, chips, soda" as a list automatically.
        // Users must use explicit commands or natural language that the LLM can parse safely.

        // 4. CAPTURE: "Lembrar de X" (Simple Reminder)
        // If it has time, it's safer to let LLM parse time. 
        // But if it's just "Lembrar de comprar leite", we might need LLM to ask "When?".
        // So we route to CAPTURE mode but NOT direct_action, so Worker can handle it.
        if (text.startsWith('lembrar') || text.startsWith('me lembre')) {
            return {
                mode: 'CAPTURE',
                intent: 'reminder_create',
                confidence: 0.9,
                direct_action: false // Let Worker parse time or ask followup
            };
        }



        // 6. TRANSFORM: Attachments or keywords
        if (text.includes('agrupar') || text.includes('somar') || text.includes('csv')) {
            return {
                mode: 'TRANSFORM',
                intent: 'data_processing',
                confidence: 0.9,
                direct_action: false
            };
        }

        return null; // Fallback to LLM Router
    }
}
