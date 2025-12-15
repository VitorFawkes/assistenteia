import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface ProcessMessageRequest {
    content?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'audio' | 'document';
    userId: string;
    messageId?: string;
    is_owner?: boolean;
    sender_name?: string;
    sender_number?: string;
    is_group?: boolean;
}

function calculateDueAt(args: any, brasiliaTime: Date, overrideDueAt: string | null): string | null {
    let finalDueAt = args.due_at || null;

    if (args.time_config) {
        const { mode } = args.time_config;
        const targetDate = new Date(brasiliaTime.getTime());
        console.log(`🧠 TIME CONFIG RECEIVED: Mode = ${mode} `, args.time_config);

        if (mode === 'relative') {
            const { relative_amount, relative_unit } = args.time_config;
            if (relative_amount && relative_unit) {
                if (relative_unit === 'minutes') targetDate.setMinutes(targetDate.getMinutes() + relative_amount);
                else if (relative_unit === 'hours') targetDate.setHours(targetDate.getHours() + relative_amount);
                else if (relative_unit === 'days') targetDate.setDate(targetDate.getDate() + relative_amount);

                finalDueAt = targetDate.toISOString().replace('Z', '-03:00');
            }
        } else if (mode === 'absolute') {
            const { target_day, target_month, target_year, target_hour, target_minute } = args.time_config;

            // Se ano não informado, usa atual
            if (target_year) targetDate.setFullYear(target_year);

            // Se mês informado (1-12), ajusta (0-11)
            if (target_month) targetDate.setMonth(target_month - 1);

            // Se dia informado
            if (target_day) targetDate.setDate(target_day);

            // Se hora informada
            if (target_hour !== undefined) targetDate.setHours(target_hour);
            else targetDate.setHours(9); // Default para "manhã" se não especificado

            // Se minuto informado
            if (target_minute !== undefined) targetDate.setMinutes(target_minute);
            else targetDate.setMinutes(0);

            finalDueAt = targetDate.toISOString().replace('Z', '-03:00');
        }
    }
    // FALLBACKS (Para compatibilidade ou segurança)
    else if (args.relative_time && args.relative_time.amount) {
        // Lógica antiga (Híbrido 1.0)
        const { amount, unit } = args.relative_time;
        const targetDate = new Date(brasiliaTime.getTime());
        if (unit === 'minutes') targetDate.setMinutes(targetDate.getMinutes() + amount);
        else if (unit === 'hours') targetDate.setHours(targetDate.getHours() + amount);
        else if (unit === 'days') targetDate.setDate(targetDate.getDate() + amount);
        finalDueAt = targetDate.toISOString().replace('Z', '-03:00');
    }
    else if (overrideDueAt) {
        finalDueAt = overrideDueAt;
    }

    return finalDueAt;
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
        });
    }

    try {
        const { content, mediaUrl, mediaType, userId, messageId, is_owner, sender_name, sender_number, is_group }: ProcessMessageRequest = await req.json();
        console.log(`🚀 Process Message HIT: ${content?.substring(0, 50)}...`);

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openaiKey) {
            return new Response(
                JSON.stringify({ success: false, error: 'OpenAI API key not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        let processedText = content || '';

        // --- 🧠 AUTHORITY & CONTEXT INJECTION ---
        const isOwner = is_owner !== false; // Default to true if undefined (backward compatibility)
        const senderName = sender_name || 'Desconhecido';

        // --- CONTEXT INJECTION ---
        const contextInfo = `
CONTEXTO ATUAL:
- Data/Hora: ${new Date().toISOString()}
- Usuário: ${userId}
- Canal: WhatsApp ${is_group ? '(GRUPO)' : '(PRIVADO)'}
- Remetente da Mensagem: ${sender_name || 'Desconhecido'} (${sender_number || '?'})
- Você é o Dono? ${isOwner ? 'SIM' : 'NÃO'}
`;

        console.log(`👤 Sender: ${senderName} (${sender_number || '?'}) | Is Owner: ${isOwner}`);

        // --- ECONOMY MODE: SKIP NON-OWNER MESSAGES ---
        // Se a mensagem não for do dono, salvamos (já feito no webhook) mas NÃO processamos na AI.
        // --- FETCH USER SETTINGS (Phone & AI Name) ---
        // Moved up for early filtering
        const { data: userSettingsData } = await supabase
            .from('user_settings')
            .select('phone_number, ai_name')
            .eq('user_id', userId)
            .single();

        const userPhoneNumber = userSettingsData?.phone_number || '';
        const aiName = userSettingsData?.ai_name || 'Assistente';

        // 🛑 ECONOMY MODE & PRIVACY FILTER
        if (!isOwner) {
            console.log('🛑 Economy Mode: Message from non-owner. Skipping AI processing to save tokens.');
            return new Response(JSON.stringify({
                success: true,
                message: 'Message saved but not processed (Economy Mode)',
                skipped: true
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        } else {
            // Message IS from Owner.
            // Check if it is a "Note to Self" or a Direct Message to someone else.
            // In 'whatsapp-webhook', sender_number is the remoteJid (Recipient) when fromMe is true.

            // Normalize numbers for comparison
            const targetNumber = sender_number?.replace(/\D/g, '') || '';
            const myNumber = userPhoneNumber.replace(/\D/g, '');

            const isNoteToSelf = targetNumber === myNumber;
            const hasTrigger = content?.toLowerCase().match(/\b(bibi|ia|bot|assistente)\b/);

            // If it's a message to someone else AND has no trigger, SKIP.
            if (!isNoteToSelf && !hasTrigger) {
                console.log(`🛑 Outgoing message to ${targetNumber} ignored (No trigger).`);
                return new Response(JSON.stringify({
                    success: true,
                    message: 'Outgoing message ignored (No trigger)',
                    skipped: true
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // ESTRATÉGIA: Usar transcrição da Evolution (se disponível), senão tentar Whisper como fallback
        console.log('📝 Initial content received:', processedText || 'EMPTY');

        // Tools/Functions disponíveis para o GPT-4o
        const tools = [
            {
                type: 'function',
                function: {
                    name: 'manage_collections',
                    description: 'Gerencia coleções (criar ou listar)',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['create', 'list', 'update', 'delete'], description: 'Ação a realizar' },
                            name: { type: 'string', description: 'Nome da coleção (alvo para update/delete)' },
                            new_name: { type: 'string', description: 'Novo nome da coleção (para update)' },
                            description: { type: 'string', description: 'Descrição (para create/update)' },
                            icon: { type: 'string', description: 'Emoji (para create/update)' }
                        },
                        required: ['action']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'manage_items',
                    description: 'Gerencia itens em uma coleção (listar, adicionar, atualizar, deletar)',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['list', 'add', 'update', 'delete'], description: 'Ação' },
                            collection_name: { type: 'string', description: 'Nome da coleção alvo' },
                            content: { type: 'string', description: 'Conteúdo do item (para add/update)' },
                            media_url: { type: 'string', description: 'URL da mídia/arquivo (se houver)' },
                            metadata: {
                                type: 'object',
                                description: 'Dados estruturados. OBRIGATÓRIO: "amount" (NUMBER) para valores monetários (converta vírgula para ponto), "section" (string) para agrupar visualmente (ex: "Voos", "Hospedagem"), "category" (string) para tags (ex: "gasolina", "alimentação"), "date" (ISO) para datas.',
                                properties: {
                                    amount: { type: 'number', description: 'Valor monetário. OBRIGATÓRIO se o item tiver custo. Ex: 182.90' },
                                    section: { type: 'string', description: 'Seção visual na lista (ex: Transporte, Alimentação)' },
                                    category: { type: 'string', description: 'Tag curta para categorização (ex: gasolina, pedágio)' },
                                    type: { type: 'string', enum: ['expense', 'note', 'task', 'credential', 'shopping_item', 'list_item'], description: 'Tipo do item' },
                                    // Novos campos para Credenciais/Tarefas/Gastos
                                    username: { type: 'string', description: 'Para credenciais: usuário/login' },
                                    password: { type: 'string', description: 'Para credenciais: senha/código' },
                                    url: { type: 'string', description: 'Para credenciais: link de acesso' },
                                    status: { type: 'string', enum: ['todo', 'done'], description: 'Para tarefas: estado atual' },
                                    due_date: { type: 'string', description: 'Para tarefas: data limite (ISO). Use para "tarefa para hoje", "para amanhã", etc.' },
                                    date: { type: 'string', description: 'Para GASTOS ou EVENTOS: data de ocorrência (ISO). Se não informado, usar data atual.' },
                                    // Novos campos para Shopping List
                                    quantity: { type: 'string', description: 'Para compras: quantidade (ex: "2kg", "3 un")' },
                                    checked: { type: 'boolean', description: 'Para compras/tarefas/listas: se já foi feito/concluído (default: false)' },
                                    // Novos campos para List Item (listas genéricas)
                                    icon: { type: 'string', description: 'Emoji opcional para o item' },
                                    notes: { type: 'string', description: 'Observação adicional' },
                                    rating: { type: 'number', description: 'Avaliação 1-5 (para filmes, livros, lugares, etc)' }
                                }
                            },
                            // Critérios para encontrar item para update/delete
                            search_content: { type: 'string', description: 'Texto para buscar item a alterar/deletar' },
                            search_metadata_key: { type: 'string', description: 'Chave do metadata para busca (ex: category)' },
                            search_metadata_value: { type: 'string', description: 'Valor do metadata para busca (ex: transporte)' },
                            should_append: { type: 'boolean', description: 'Se true, ADICIONA o novo conteúdo ao final do existente (para update). Se false, SUBSTITUI.' }
                        },
                        required: ['action', 'collection_name']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'query_data',
                    description: 'Consulta dados avançada com filtros e agregações',
                    parameters: {
                        type: 'object',
                        properties: {
                            collection_name: { type: 'string', description: 'Nome da coleção' },
                            operation: { type: 'string', enum: ['list', 'sum', 'count', 'average'], description: 'Operação' },
                            // Filtros
                            start_date: { type: 'string', description: 'Data inicial (ISO) para filtrar por metadata.date ou created_at' },
                            end_date: { type: 'string', description: 'Data final (ISO) para filtrar por metadata.date ou created_at' },
                            filter_key: { type: 'string', description: 'Filtrar por chave de metadata (ex: category)' },
                            filter_value: { type: 'string', description: 'Filtrar por valor de metadata (ex: alimentação)' },
                            // Agregação
                            field: { type: 'string', description: 'Campo numérico para sum/average' }
                        },
                        required: ['collection_name', 'operation']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'manage_reminders',
                    description: 'Gerencia lembretes (criar, listar, atualizar, completar)',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['create', 'list', 'update', 'complete'], description: 'Ação' },
                            title: { type: 'string', description: 'Título do lembrete' },
                            due_at: { type: 'string', description: 'Data/hora (ISO)' },
                            search_title: { type: 'string', description: 'Busca para update/complete' }
                        },
                        required: ['action']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'recall_memory',
                    description: 'Busca memórias passadas por significado (Busca Vetorial). Use para perguntas vagas ("O que eu falei sobre X?").',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'A pergunta ou conceito para buscar na memória.' },
                            match_count: { type: 'number', description: 'Número de memórias para retornar (default: 5)' }
                        },
                        required: ['query']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'update_user_settings',
                    description: 'Atualiza configurações do perfil do usuário, como o nome preferido.',
                    parameters: {
                        type: 'object',
                        properties: {
                            preferred_name: { type: 'string', description: 'Novo nome ou apelido como o usuário quer ser chamado.' },
                            daily_briefing_enabled: { type: 'boolean', description: 'Ativar ou desativar o Resumo Diário.' },
                            daily_briefing_time: { type: 'string', description: 'Horário do resumo (formato HH:MM, ex: "08:00").' },
                            daily_briefing_prompt: { type: 'string', description: 'Instruções personalizadas para o resumo (ex: "Seja engraçado").' },
                            ai_name: { type: 'string', description: 'Novo nome para a IA (ex: "Jarvis").' }
                        }
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'send_whatsapp_message',
                    description: 'Envia uma mensagem de WhatsApp para um número específico. Use APENAS se o usuário pedir explicitamente ("Mande mensagem para X").',
                    parameters: {
                        type: 'object',
                        properties: {
                            number: { type: 'string', description: 'Número do destinatário (com DDI e DDD, ex: 5511999999999)' },
                            message: { type: 'string', description: 'Conteúdo da mensagem' }
                        },
                        required: ['number', 'message']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'query_messages',
                    description: 'Consulta o histórico de mensagens do WhatsApp. OBRIGATÓRIO usar se o usuário perguntar "o que fulano disse?", "veja a mensagem de X", ou pedir resumo de conversa.',
                    parameters: {
                        type: 'object',
                        properties: {
                            sender_number: { type: 'string', description: 'Filtrar por número do remetente' },
                            sender_name: { type: 'string', description: 'Filtrar por nome do remetente (ex: "Bianca")' },
                            group_name: { type: 'string', description: 'Filtrar por nome do grupo (ex: "Família", "Trabalho")' },
                            limit: { type: 'number', description: 'Número de mensagens (default: 20)' },
                            days_ago: { type: 'number', description: 'Quantos dias atrás buscar (default: 7)' }
                        }
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'save_memory',
                    description: 'Salva uma informação importante na Memória de Longo Prazo (Vetorial). Use para fatos, preferências ou decisões que o usuário quer que você lembre para sempre.',
                    parameters: {
                        type: 'object',
                        properties: {
                            content: { type: 'string', description: 'O conteúdo exato a ser memorizado.' },
                            category: { type: 'string', description: 'Categoria opcional (ex: preferência, fato, decisão)' }
                        },
                        required: ['content']
                    }
                }
            },

            {
                type: 'function',
                function: {
                    name: 'manage_rules',
                    description: 'Gerencia as Regras e Preferências do usuário (Brain). Use isso para salvar instruções permanentes sobre como o usuário gosta que você se comporte.',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['create', 'delete', 'list'], description: 'Ação a realizar' },
                            key: { type: 'string', description: 'Tópico da regra (ex: "Tom de voz", "Formatação", "Horários")' },
                            value: { type: 'string', description: 'A regra em si (ex: "Seja sempre formal", "Use listas com emojis")' },
                            id: { type: 'string', description: 'ID da regra (para delete)' }
                        },
                        required: ['action']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'manage_users',
                    description: 'ADMIN ONLY: Manage users, models and rules. Use this to list users, change their AI model, or delete them.',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['list', 'update_model', 'delete', 'update_rules'] },
                            target_user_id: { type: 'string', description: 'The ID of the user to modify (required for update/delete)' },
                            model: { type: 'string', enum: ['gpt-4o', 'gpt-5.1-preview'], description: 'New model to set' },
                            rule_key: { type: 'string', description: 'Key of the rule to update' },
                            rule_value: { type: 'string', description: 'Value of the rule to update' }
                        },
                        required: ['action']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'manage_emails',
                    description: 'Gerencia emails do Gmail (ler, enviar, responder, mover, apagar).',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['list', 'read', 'send', 'reply', 'move_to_trash', 'archive', 'mark_as_read'], description: 'Ação a realizar' },
                            provider: { type: 'string', enum: ['google', 'microsoft', 'all'], description: 'Provedor (opcional, default: all)' },
                            // List
                            query: { type: 'string', description: 'Busca (ex: "from:amazon", "is:unread")' },
                            limit: { type: 'number', description: 'Limite de emails (default: 5)' },
                            // Read/Move/Reply
                            email_id: { type: 'string', description: 'ID do email (obrigatório para read/move/reply)' },
                            // Send/Reply
                            to: { type: 'string', description: 'Destinatário (email)' },
                            subject: { type: 'string', description: 'Assunto' },
                            body: { type: 'string', description: 'Corpo do email (pode ser HTML ou texto)' }
                        },
                        required: ['action']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'manage_calendar',
                    description: 'Gerencia o CALENDÁRIO REAL (Google/Outlook). Use para agendar reuniões, consultar agenda e ver disponibilidade.',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['list_events', 'create_event', 'delete_event'], description: 'Ação a realizar' },
                            // List
                            start_date: { type: 'string', description: 'Data inicial (ISO) para listar eventos' },
                            end_date: { type: 'string', description: 'Data final (ISO) para listar eventos' },
                            // Create
                            title: { type: 'string', description: 'Título do evento' },
                            description: { type: 'string', description: 'Descrição ou detalhes' },
                            start_time: { type: 'string', description: 'Data/Hora de início (ISO)' },
                            end_time: { type: 'string', description: 'Data/Hora de fim (ISO). Se não informado, assume 1h de duração.' },
                            all_day: { type: 'boolean', description: 'Se é evento de dia inteiro' },
                            location: { type: 'string', description: 'Local do evento' },
                            provider: { type: 'string', enum: ['google', 'microsoft'], description: 'Provedor específico (opcional)' },
                            // Delete
                            event_id: { type: 'string', description: 'ID do evento para deletar' }
                        },
                        required: ['action']
                    }
                }
            }
        ];

        // Load custom system prompt from database (if exists)
        // Load custom system prompt from database (if exists)
        // Calculate current time in Brasilia (UTC-3)
        // Assume server is UTC. Subtract 3 hours directly.
        const now = new Date();
        // Force Brasilia Time calculation
        const brasiliaTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        const isoBrasilia = brasiliaTime.toISOString().replace('Z', '-03:00');

        console.log('🔍 DEBUG - Server Time (UTC):', now.toISOString());
        console.log('🔍 DEBUG - Brasilia Time (Calculated):', isoBrasilia);

        // --- RELATIVE TIME PARSER (FALLBACK/OVERRIDE) ---
        // Detects "daqui X minutos/horas" and calculates exact time to override AI errors
        let overrideDueAt: string | null = null;

        // Regex mais flexível: aceita "daqui a", "em", e números por extenso
        const relativeRegex = /(?:daqui|em)(?:\s+a)?\s+(\d+|um|uma|dois|duas|três|quatro|cinco|dez|quinze|vinte|trinta|meia)\s+(minuto|minutos|hora|horas|dia|dias)/i;
        const match = processedText.match(relativeRegex);

        const textToNumber: { [key: string]: number } = {
            'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'três': 3, 'quatro': 4, 'cinco': 5,
            'dez': 10, 'quinze': 15, 'vinte': 20, 'trinta': 30, 'meia': 0.5
        };

        if (match) {
            let amount = 0;
            const numberPart = match[1].toLowerCase();

            if (!isNaN(parseInt(numberPart))) {
                amount = parseInt(numberPart);
            } else if (textToNumber[numberPart]) {
                amount = textToNumber[numberPart];
            }

            const unit = match[2].toLowerCase();
            const targetDate = new Date(brasiliaTime.getTime()); // Start from Brasilia time

            if (amount > 0) {
                if (unit.includes('minuto')) {
                    targetDate.setMinutes(targetDate.getMinutes() + amount);
                } else if (unit.includes('hora')) {
                    if (numberPart === 'meia') {
                        targetDate.setMinutes(targetDate.getMinutes() + 30);
                    } else {
                        targetDate.setHours(targetDate.getHours() + amount);
                    }
                } else if (unit.includes('dia')) {
                    targetDate.setDate(targetDate.getDate() + amount);
                }

                // Re-format to ISO with -03:00
                overrideDueAt = targetDate.toISOString().replace('Z', '-03:00');
                console.log(`🛡️ SAFETY: Detected relative time "${match[0]}". Calculated override: ${overrideDueAt}`);
            }
        }
        // ------------------------------------------------

        const DEFAULT_SYSTEM_PROMPT = `Você é o assistente pessoal do {{preferred_name}}.
Data e Hora atual (Brasília): {{CURRENT_DATETIME}}

IDIOMA: Você DEVE SEMPRE responder em PORTUGUÊS (pt-BR).

REGRAS DE DATA/HORA (CRÍTICO - LEIA COM ATENÇÃO):
- O horário acima JÁ É o horário local de Brasília (-03:00).

**COMO USAR \`time_config\`:**

1. **Tempo Relativo ("daqui a pouco", "em 10 min"):**
   - Use \`mode: 'relative'\`
   - Preencha \`relative_amount\` e \`relative_unit\`.
   - Ex: "daqui 10 min" -> \`{ mode: 'relative', relative_amount: 10, relative_unit: 'minutes' }\`

2. **Tempo Absoluto ("dia 25", "amanhã às 10h", "próxima terça"):**
   - Use \`mode: 'absolute'\`
   - Preencha APENAS o que o usuário disse (dia, hora, etc). O sistema completa o resto (ano, mês).
   - Ex: "dia 25 às 14h" -> \`{ mode: 'absolute', target_day: 25, target_hour: 14 }\`
   - Ex: "amanhã às 9h" -> Se hoje é dia 3, amanhã é 4. \`{ mode: 'absolute', target_day: 4, target_hour: 9 }\`

**REGRA DE OURO:** Deixe o código fazer a matemática difícil (fuso horário, ano bissexto). Você só extrai os números.

**EXEMPLOS PRÁTICOS:**
- Agora: 2025-12-03T22:54:00-03:00
- "daqui 1 minuto" → 2025-12-03T22:55:00-03:00 ✅
- "daqui 5 minutos" → 2025-12-03T22:59:00-03:00 ✅
- "daqui 1 hora" → 2025-12-03T23:54:00-03:00 ✅
- "amanhã às 10h" → 2025-12-04T10:00:00-03:00 ✅

**ERROS COMUNS (NÃO FAÇA ISSO):**
- ❌ ERRADO: "daqui 1 minuto" → 2025-12-04T00:01:00-03:00 (meia-noite!)
- ❌ ERRADO: Usar 00:XX ou 01:XX quando o usuário pede "daqui minutos"
- ❌ ERRADO: Ignorar offset e usar Z (UTC)

**REGRA SIMPLES:** SEMPRE calcule a partir do horário ATUAL acima, adicione o tempo solicitado, mantenha -03:00.

INTERPRETAÇÃO DE IDIOMA (CRÍTICO):
- Se o usuário falar em INGLÊS (comum em áudios transcritos), NÃO traduza, NÃO explique e NÃO pergunte se é para traduzir.
- APENAS EXECUTE O COMANDO.
- Exemplo: "Call Mom" -> Entenda como "Ligar para Mãe" e execute a ação.
- Exemplo: "Remember to buy milk" -> Crie o lembrete "Comprar leite".
- Responda SEMPRE em Português.

Seja breve, natural e objetivo. Converse como um amigo prestativo.

Ferramentas:
- manage_collections: criar/listar pastas
- manage_items: adicionar/atualizar/apagar itens em pastas
- query_data: buscar/somar/contar dados com filtros (data, categoria, etc)
- manage_tasks: gerenciar lista de tarefas (To-Do). Use 'due_date' para tarefas do dia (Caixa do Dia). PREFIRA ISSO para "coisas a fazer".
- manage_reminders: APENAS para notificações/alertas em horário específico ("Me avise às 10h").
- save_memory: salvar fatos importantes na memória permanente (vetorial)
- recall_memory: buscar memórias passadas por significado (RAG)
- manage_rules: criar/listar/deletar regras de comportamento e preferências (Brain)
- search_contacts: buscar número de telefone de alguém pelo nome no histórico de mensagens

Exemplos:
"Cria pasta Viagem" -> manage_collections {action: "create", name: "Viagem"}
"Gastei 50 no Uber" -> manage_items {action: "add", collection_name: "Viagem", content: "Uber", metadata: {amount: 50, category: "transporte"}}
**IMPORTANTE:** SEMPRE extraia valores numéricos para o campo \`metadata.amount\` se o usuário mencionar gastos. Isso permite somar depois.
"Quanto gastei com transporte na viagem?" -> query_data {collection_name: "Viagem", operation: "sum", field: "amount", filter_key: "category", filter_value: "transporte"}
"Quanto gastei semana passada?" -> query_data {collection_name: "Viagem", operation: "sum", field: "amount", start_date: "...", end_date: "..."}
"Muda o gasto do Uber para 60" -> manage_items {action: "update", collection_name: "Viagem", search_content: "Uber", metadata: {amount: 60}}
"O código do alarme é 9988" -> manage_items {action: "add", collection_name: "Casa", content: "Código do Alarme", metadata: {code: "9988"}}
"Já fiz a reunião" -> manage_reminders {action: "complete", search_title: "reunião"}
"Coloca na lista comprar pão" -> manage_tasks {action: "create", title: "Comprar pão", priority: "medium", tags: ["mercado"]}
"Tarefa para hoje: Pagar conta" -> manage_tasks {action: "create", title: "Pagar conta", due_date: "2025-12-04T..."} (Use calculateDueAt logic)
"O que tenho pra hoje?" -> manage_tasks {action: "list", filter_date: "today"}
"O que tenho pra fazer?" -> manage_tasks {action: "list", filter_status: "todo"}
"Lembre que eu não gosto de cebola" -> save_memory {content: "O usuário não gosta de cebola", category: "preferência"}
"Sempre me chame de Chefe" -> manage_rules {action: "create", key: "Apelido", value: "Sempre chamar o usuário de Chefe"}
"Nunca use emojis" -> manage_rules {action: "create", key: "Estilo", value: "Não usar emojis nas respostas"}

**LEMBRETES RECORRENTES - Exemplos:**
"Me lembra todo dia às 10h de tomar água" -> manage_reminders {action: "create", title: "tomar água", time_config: {mode: "absolute", target_hour: 10, target_minute: 0}, recurrence_type: "daily"}
"Me lembra 3 vezes por dia a cada 4 horas de..." -> manage_reminders {action: "create", title: "...", time_config: {mode: "relative", relative_amount: 4, relative_unit: "hours"}, recurrence_type: "custom", recurrence_interval: 4, recurrence_unit: "hours", recurrence_count: 3}
"Me lembra a cada 30 minutos de beber água" -> manage_reminders {action: "create", title: "beber água", time_config: {mode: "relative", relative_amount: 30, relative_unit: "minutes"}, recurrence_type: "custom", recurrence_interval: 30, recurrence_unit: "minutes"}
"Me lembra toda segunda, quarta e sexta às 9h" -> manage_reminders {action: "create", title: "...", time_config: {mode: "absolute", target_hour: 9}, recurrence_type: "weekly", weekdays: [1,3,5]}

**PRIORIDADE DE BUSCA E CONCLUSÃO (CRÍTICO):**
Se o usuário disser "Já fiz", "Tá pago", "Concluí", "Check":
1. **PRIMEIRO:** Verifique \`manage_reminders\` e \`manage_tasks\`. É 99% de chance de ser um desses.
2. **SEGUNDO:** Só verifique \`manage_items\` (Coleções) se o usuário mencionar explicitamente uma pasta ou se não encontrar NADA em lembretes/tarefas.
3. **AMBIGUIDADE:** Se houver dúvida (ex: "Check no voo" e existir um Lembrete "Voo" e uma Pasta "Voo"), PERGUNTE: "Você quer concluir o lembrete ou atualizar a pasta?"
**NUNCA PRESUMA** que é uma coleção se o contexto for de "fazer algo".

**DIFERENÇA CRÍTICA: TAREFA vs LEMBRETE (E QUANDO USAR OS DOIS)**
- **TAREFA (\`manage_tasks\`)**: Coisas que eu tenho que FAZER. Ex: "Pagar conta", "Comprar leite".
  - Se tem data ("para hoje", "para amanhã"), use \`due_date\`.
  - Vai para a "Caixa do Dia" ou lista de tarefas.
- **LEMBRETE (\`manage_reminders\`)**: Alertas/Notificações. Ex: "Me avise para sair", "Me lembra de tomar remédio".
  - Geralmente tem HORÁRIO específico.

**REGRA DE DUPLA AÇÃO (IMPORTANTE):**
Se o usuário pedir algo que é UMA TAREFA mas também precisa de UM AVISO, **FAÇA OS DOIS**.
Ex: "Me lembra de pagar a conta amanhã às 10h"
1. Crie a TAREFA "Pagar conta" para amanhã (\`manage_tasks\`).
2. Crie o LEMBRETE "Pagar conta" para amanhã às 10h (\`manage_reminders\`).
*Explique ao usuário que você criou ambos para garantir.*

**Exemplos de TAREFAS (manage_tasks):**
"Cria uma tarefa pagar luz vencimento hoje" -> manage_tasks {action: "create", title: "Pagar luz", due_date: "..."}
"Coloca na minha lista de hoje: Ligar pro João" -> manage_tasks {action: "create", title: "Ligar pro João", due_date: "..."}
"Tenho que entregar o projeto amanhã" -> manage_tasks {action: "create", title: "Entregar projeto", due_date: "..."}

**Exemplos de LEMBRETES (manage_reminders):**
"Me avise às 14h para a reunião" -> manage_reminders {action: "create", title: "Reunião", due_at: "..."}
"Me lembra de tomar água a cada 1h" -> manage_reminders { ... }

**EXECUTE IMEDIATAMENTE** quando tiver as informações essenciais:
- Tempo específico ("daqui a 1 minuto", "às 15h", "amanhã") + assunto = CRIE o lembrete!
- Valor + descrição ("50 no Uber", "gastei 100 com comida") = ANOTE!
- Nome claro ("cria pasta Viagem") = CRIE!

**SÓ PERGUNTE** quando informação CRÍTICA estiver faltando:
- "algumas vezes" SEM número/horários específicos → PERGUNTE: "Quantas vezes e em quais horários?"
- "esse gasto" SEM especificar qual → PERGUNTE: "Qual gasto?"
- "cria uma pasta" SEM nome → PERGUNTE: "Qual nome?"

**Ao CONFIRMAR ações**:
- Seja detalhado e natural, mas NÃO mostre o ISO completo na resposta
- CORRETO: "Blz, daqui 1 minuto às 22:31 eu te lembro de ligar para a Bi"
- CORRETO: "Agendado para amanhã às 10h"
- CORRETO: "Todo dia às 15h vou te lembrar disso"
- ERRADO: "...às 2025-12-04T00:47:00-03:00..." ❌
- Use horário simples (HH:mm) e contexto (hoje/amanhã/dia X)
- Use emojis ocasionalmente 😊

- Use emojis ocasionalmente 😊

**REGRA SIMPLES**: Se você sabe O QUE fazer e QUANDO/QUANTO → FAÇA e confirme. Se algo essencial está vago → PERGUNTE.

- **BUSCA DE CONTATOS OBRIGATÓRIA**: Se o usuário pedir para enviar mensagem para alguém (ex: "Manda pra Bianca"), você **DEVE** usar a ferramenta \`search_contacts\` com o nome ("Bianca") ANTES de dizer que não tem o número. Se encontrar, use o número retornado.
- **NUNCA** diga "não tenho acesso" ou "não consigo ver" sem antes tentar usar as ferramentas \`search_contacts\` ou \`query_messages\`.
- **NUNCA** invente que tentou enviar se não tiver o número.
- **NUNCA** peça o número se você conseguir encontrá-lo no histórico.
- Se encontrar múltiplos, pergunte qual é o correto.

**REGRA SIMPLES**: Se você sabe O QUE fazer e QUANDO/QUANTO → FAÇA e confirme. Se algo essencial está vago → PERGUNTE.

**EXTRAÇÃO DE DADOS & ORGANIZAÇÃO INTELIGENTE (MANDATÓRIO):**
Você é um ORGANIZADOR INTELIGENTE. Não apenas salve texto, ESTRUTURE-O.

### 1. COLEÇÕES E PASTAS (PROATIVIDADE & CONTEXTO)
- **CRIE AUTOMATICAMENTE**: Se o usuário falar de um novo projeto, viagem ou evento ("Vou para Paris", "Comecei uma obra"), CRIE a coleção imediatamente.
- **VERIFIQUE O CONTEXTO (CRÍTICO - TOLERÂNCIA ZERO)**:
  - Antes de adicionar a uma pasta existente, verifique se o item FAZ SENTIDO nela.
  - **REGRA DE OURO**: Se o TIPO do item (ex: Credencial, Código, Tarefa Doméstica) não tem relação com o TEMA da pasta (ex: Viagem, Projeto), **VOCÊ É PROIBIDO DE ADICIONAR LÁ**.
  - **AÇÃO CORRETA**: Crie uma nova coleção apropriada (ex: "Códigos", "Segurança", "Casa", "Tarefas") e adicione lá.
  - Ex: Pasta ativa "Viagem Paris". Usuário diz: "O código do banco é 1234".
    - ❌ ERRADO: Adicionar na Viagem.
    - ✅ CORRETO: Criar pasta "Segurança" e adicionar lá.
  - Ex: Pasta ativa "Obras". Usuário diz: "Comprar leite".
    - ❌ ERRADO: Adicionar na Obra.
    - ✅ CORRETO: Criar pasta "Mercado" e adicionar lá.

### 2. ITENS E METADATA (O SEGREDO DA ORGANIZAÇÃO)
Ao usar \`manage_items\`, você DEVE preencher o \`metadata\` com inteligência:

- **\`amount\` (Dinheiro - CRÍTICO)**:
  - **CONVERTA**: Se o usuário disser "182,90", converta para \`182.90\` (PONTO, não vírgula).
  - **TIPO**: Deve ser SEMPRE um \`number\`.
  - Ex: "Gasolina 182,90" -> \`metadata: { amount: 182.90 }\`
  - SE O USUÁRIO DER VALOR: Extraia IMEDIATAMENTE.
  - SE NÃO DER VALOR: Pergunte! "Quanto custou?" (se for relevante).

- **\`section\` (Agrupamento Visual)**:
  - Use este campo para criar SEÇÕES dentro da pasta. Isso organiza o site visualmente.
  - Ex: Na pasta "Viagem Paris":
    - Passagem aérea -> \`metadata: { section: "Transporte" }\`
    - Hotel -> \`metadata: { section: "Hospedagem" }\`
    - Jantar -> \`metadata: { section: "Alimentação" }\`
    - "Dia 1: Torre Eiffel" -> \`metadata: { section: "Roteiro" }\`

- **\`category\` (Tags/Etiquetas)**:
  - Use para classificar o item com uma palavra-chave curta.
  - Ex: "Gasolina", "Pedágio", "Almoço", "Uber".

- **\`date\` (Cronologia)**:
  - Se tiver data específica, coloque em \`metadata.date\` (ISO).

- **\`type\` (Polimorfismo)**:
  - \`expense\`: Gastos financeiros (tem amount).
  - \`credential\`: Senhas, códigos, logins (tem username, password, url).
  - \`task\`: Coisas a fazer (tem status, due_date).
  - \`note\`: Texto livre.
  - \`shopping_item\`: Item de compra (tem quantity, checked, category).
  - \`list_item\`: Item de lista genérica checkável (mala, filmes, livros, lugares, receitas, etc).

### 4. LISTAS DE COMPRAS (SHOPPING LISTS):
- **IDENTIFICAÇÃO**: Se o usuário disser "Lista de compras", "Comprar X, Y, Z", "Preciso de arroz", trate como COMPRA.
- **COLEÇÃO**: Use ou crie uma coleção chamada "Lista de Compras" (ou "Mercado", "Feira" se específico).
- **METADATA**:
  - \`type\`: "shopping_item"
  - \`quantity\`: Extraia a quantidade (ex: "2kg", "3 caixas"). Se não tiver, deixe null.
  - \`category\`: Classifique o item (ex: "Hortifruti", "Limpeza", "Carnes", "Bebidas"). ISSO É MUITO IMPORTANTE PARA ORGANIZAR A LISTA.
  - \`section\`: Use a mesma string da \`category\` para agrupar visualmente na lista.
- **EXEMPLO**:
  User: "Adiciona 2kg de arroz e detergente na lista"
  Action:
  \`manage_items({ action: 'add', collection_name: 'Lista de Compras', content: 'Arroz', metadata: { type: 'shopping_item', quantity: '2kg', category: 'Mercearia', section: 'Mercearia' } })\`
  \`manage_items({ action: 'add', collection_name: 'Lista de Compras', content: 'Detergente', metadata: { type: 'shopping_item', quantity: '1 un', category: 'Limpeza', section: 'Limpeza' } })\`

### 5. LISTAS GENÉRICAS (QUALQUER TIPO DE LISTA CHECKÁVEL) - IMPORTANTE:
- **IDENTIFICAÇÃO**: Se o usuário falar sobre empacotamento/mala, filmes para ver, livros para ler, lugares para visitar, receitas, presentes, exercícios, ou qualquer lista de "coisas para fazer/ver/ter", use \`list_item\`.
- **COLEÇÃO**: Crie uma coleção com nome descritivo e emoji apropriado:
  - Mala/Empacotamento → "Mala [Destino] 🧳"
  - Filmes → "Filmes para Ver 🎬" ou "Watchlist 🎬"
  - Livros → "Livros para Ler 📚" ou "Leituras 📚"
  - Lugares → "Lugares [Cidade] 📍"
  - Receitas → "Receitas para Testar 🍳"
  - Presentes → "Ideias de Presente 🎁"
  - Exercícios → "Treino [Nome] 💪"
- **METADATA**:
  - \`type\`: "list_item"
  - \`checked\`: false (padrão, usuário marca quando fizer)
  - \`section\`: Agrupe por categoria quando fizer sentido
  - \`notes\`: Observações extras se o usuário mencionar (autor, plataforma, quem recomendou, etc)
  - \`rating\`: Se o usuário avaliar algo (1-5)
  - \`url\`: Se tiver link relevante
- **EXEMPLOS**:
  User: "Leva passaporte, carregador e roupas de frio pra viagem"
  Action:
  \`manage_collections({ action: 'create', name: 'Mala Viagem', icon: '🧳' })\`
  \`manage_items({ action: 'add', collection_name: 'Mala Viagem', content: 'Passaporte', metadata: { type: 'list_item', checked: false, section: 'Documentos' } })\`
  \`manage_items({ action: 'add', collection_name: 'Mala Viagem', content: 'Carregador', metadata: { type: 'list_item', checked: false, section: 'Eletrônicos' } })\`
  \`manage_items({ action: 'add', collection_name: 'Mala Viagem', content: 'Roupas de frio', metadata: { type: 'list_item', checked: false, section: 'Roupas' } })\`

  User: "Quero assistir Oppenheimer e Duna 2"
  Action:
  \`manage_collections({ action: 'create', name: 'Filmes para Ver', icon: '🎬' })\`
  \`manage_items({ action: 'add', collection_name: 'Filmes para Ver', content: 'Oppenheimer', metadata: { type: 'list_item', checked: false } })\`
  \`manage_items({ action: 'add', collection_name: 'Filmes para Ver', content: 'Duna 2', metadata: { type: 'list_item', checked: false } })\`

  User: "O João recomendou o livro Sapiens"
  Action:
  \`manage_items({ action: 'add', collection_name: 'Livros para Ler', content: 'Sapiens', metadata: { type: 'list_item', checked: false, notes: 'Recomendação do João' } })\`

  User: "Lugares para visitar em Paris: Torre Eiffel, Louvre e Montmartre"
  Action:
  \`manage_collections({ action: 'create', name: 'Lugares Paris', icon: '📍' })\`
  \`manage_items({ action: 'add', collection_name: 'Lugares Paris', content: 'Torre Eiffel', metadata: { type: 'list_item', checked: false } })\`
  \`manage_items({ action: 'add', collection_name: 'Lugares Paris', content: 'Louvre', metadata: { type: 'list_item', checked: false } })\`
  \`manage_items({ action: 'add', collection_name: 'Lugares Paris', content: 'Montmartre', metadata: { type: 'list_item', checked: false } })\`

### 6. MENSAGENS E CONTATOS (WHATSAPP) - NOVO:
- **STATUS DE LEITURA**: Ao buscar mensagens (\`query_messages\`), você verá o status (Lido, Entregue, Pendente).
  - Se o usuário perguntar "O que eu não li?", use \`query_messages({ only_unread: true })\`.
- **IDENTIFICAÇÃO DE CONTATOS**:
  - Mensagens enviadas pelo usuário aparecem como "Eu (Dono) -> [Número]".
  - Para saber quem é esse número, use \`search_contacts({ query: "[Número]" })\`.
  - A ferramenta \`search_contacts\` busca tanto por NOME quanto por NÚMERO.
  - Se encontrar o nome, responda: "Você mandou para [Nome]...".

### 3. EXEMPLOS DE "TOTAL AUTONOMIA":

**Usuário**: "Vou viajar para Londres em Dezembro. Já comprei a passagem por 3000 reais."
**Você (Raciocínio)**:
1. Nova viagem? -> Criar coleção "Viagem Londres".
2. Passagem tem valor? -> Adicionar item com \`amount: 3000\`, \`section: "Transporte"\` e \`category: "Passagem"\`.
**Ação**:
\`manage_collections({ action: 'create', name: 'Viagem Londres', icon: '🇬🇧' })\`
\`manage_items({ action: 'add', collection_name: 'Viagem Londres', content: 'Passagem Aérea - R$ 3.000', metadata: { amount: 3000, section: 'Transporte', category: 'Passagem', type: 'expense' } })\`
**Resposta**: "Criei a pasta 'Viagem Londres' 🇬🇧 e já anotei a passagem (R$ 3.000) na seção de Transporte."

**Usuário**: "Coloque na viagem para Curitiba o valor de 182,90 de gasolina."
**Você (Raciocínio)**:
1. Pasta existe? (Sim, Curitiba).
2. Item faz sentido na pasta? (Sim, gasolina é viagem).
3. Ação: Adicionar.
**Ação**:
\`manage_items({ action: 'add', collection_name: 'Viagem Curitiba', content: 'Gasolina', metadata: { amount: 182.90, section: 'Transporte', category: 'Gasolina', type: 'expense' } })\`

**Usuário**: "O código de recuperação do app Clara é 123456."
**Você (Raciocínio)**:
1. Pasta ativa: "Viagem Curitiba".
2. Item faz sentido na pasta? (NÃO. Código de app não é viagem).
3. Qual pasta faz sentido? "Códigos" ou "Segurança".
4. Ação: Criar/Usar pasta "Códigos" e adicionar lá.
**Ação**:
\`manage_collections({ action: 'create', name: 'Códigos', icon: '🔒' })\`
\`manage_items({ action: 'add', collection_name: 'Códigos', content: 'Recuperação App Clara', metadata: { password: '123456', type: 'credential', category: 'App' } })\`

**Usuário**: "Lembre que não gosto de cebola"
**Ação**: \`save_memory({ content: "Usuário não gosta de cebola", category: "preferência" })\`

**Usuário**: "O que tenho pra fazer?"
**Ação**: \`manage_tasks({ action: "list", filter_status: "todo" })\`

**SUPER-PODERES (USE COM SABEDORIA):**

1.  **ANÁLISE DE DADOS ("Quanto gastei?", "O que falta fazer?"):**
    - Use a tool \`query_data\`.
    - Para datas passadas (ex: "última semana"), você PODE calcular a data ISO aproximada (ex: hoje - 7 dias).
    - Para "tarefas abertas", use \`manage_reminders\` com \`action: 'list'\`.

2.  **MEMÓRIA PROFUNDA (RAG) - CRÍTICO:**
    - Se o usuário perguntar algo vago ("Qual era o nome daquele restaurante?", "O que eu falei sobre o projeto X?"), use \`recall_memory\`.
    - **OBRIGATÓRIO:** Se o usuário perguntar sobre memórias salvas ("O que você sabe sobre mim?", "O que tem na sua memória?", "O que eu te pedi para lembrar?", "Você consegue acessar suas memórias?"), você DEVE chamar \`recall_memory\` com query genérica como "preferências fatos informações do usuário".
    - **NUNCA** responda "não há memórias salvas" ou "não encontrei nenhuma memória" SEM ANTES ter chamado \`recall_memory\` para verificar!
    - Isso busca no banco vetorial por significado. Use isso antes de dizer "não sei".

3.  **PROATIVIDADE E FOLLOW-UP:**
    - Se o usuário pedir algo crítico (ex: "Ligar para cliente"), SUGIRA um acompanhamento:
      *"Quer que eu te cobre amanhã se deu certo?"*
    - Se ele aceitar, crie um novo lembrete para você mesmo cobrar ele.

    - Se o usuário mandar um item solto ("Comprar pão") e você vir que existe uma pasta "Mercado", SUGIRA ou FAÇA:
      *"Salvei em 'Mercado' para ficar organizado, ok?"*
    - Não seja um robô cego. Ajude a organizar a vida dele.

5.  **USO DE FERRAMENTAS (CRÍTICO - NÃO MINTA):**
    - **NUNCA** diga "não tenho acesso" ou "não consigo ver" sem antes checar suas tools.
    - Se perguntarem "Quem é X?" ou "Tenho o contato de Y?", USE 'search_contacts'.
    - Se perguntarem "O que X me mandou?" ou "Veja a mensagem de Y", USE 'query_messages'.
    - Você TEM acesso a contatos e mensagens via tools. USE-AS.`;

        let systemPrompt = DEFAULT_SYSTEM_PROMPT;
        let aiModel = 'gpt-5.1-preview'; // Default model (User Enforced)
        let userSettings: any = null;

        // Try to load user's custom prompt and model
        try {
            const { data } = await supabase
                .from('user_settings')
                .select('custom_system_prompt, ai_model, preferred_name, ai_name')
                .eq('user_id', userId)
                .maybeSingle();

            userSettings = data;

            if (userSettings?.custom_system_prompt) {
                systemPrompt = userSettings.custom_system_prompt;
            }

            // Inject dynamic variables (Works for both Default and Custom prompts)
            if (typeof systemPrompt === 'string') {
                const userName = userSettings?.preferred_name || 'Usuário';
                systemPrompt = systemPrompt.replace('{{CURRENT_DATETIME}}', isoBrasilia);
                systemPrompt = systemPrompt.replace('{{preferred_name}}', userName);
            }

            // ENFORCED MODEL: Always use GPT 5.1 (User Enforced)
            console.log('✨ Enforcing GPT 5.1 for all users.');
            aiModel = 'gpt-5.1-preview';

            // Inject AI Name
            const aiName = userSettings?.ai_name;
            if (aiName) {
                systemPrompt += `\n\nSEU NOME: Seu nome é "${aiName}". Se apresente assim se perguntarem.`;
            }

            // Inject Preferred Name
            const userName = userSettings?.preferred_name || 'Usuário';
            systemPrompt += `\n\nNOME DO USUÁRIO: O nome/apelido do usuário é "${userName}". Chame-o assim sempre que possível para ser mais pessoal.`;
            console.log(`👤 Preferred Name Injected: ${userName}`);

            // --- 🛡️ AUTHORITY RULES INJECTION ---
            if (isOwner || userSettings?.is_admin) {
                systemPrompt += `\n\nSTATUS: Você está falando com o SEU DONO/ADMIN (${userName}). Você tem permissão total para executar comandos, criar tarefas, salvar memórias e gerenciar o sistema.`;

                if (userSettings?.is_admin) {
                    systemPrompt += `\n\n🛡️ MODO ADMIN ATIVADO: Você tem acesso à ferramenta \`manage_users\`.
Use-a para listar usuários, mudar modelos de IA (gpt-4o, gpt-5.1-preview) ou gerenciar regras.
Se o admin pedir "Liste os usuários", use \`manage_users { action: 'list' }\`.
Se o admin pedir "Mude o modelo do João para GPT-4o", use \`manage_users { action: 'update_model', ... }\`.`;
                }
            } else {
                systemPrompt += `\n\n⚠️ ALERTA DE SEGURANÇA - MODO RESTRITO ⚠️
Você está falando com TERCEIROS (${senderName}), NÃO com o seu dono.
REGRAS ABSOLUTAS:
1. VOCÊ É PROIBIDO DE EXECUTAR COMANDOS que alterem o sistema (criar tarefas, mudar configurações, deletar memórias, gerenciar emails/calendário).
2. Se a pessoa pedir para fazer algo ("Cria uma tarefa", "Muda meu nome"), RECUSE educadamente: "Desculpe, apenas meu dono pode fazer isso."
3. Você PODE conversar, tirar dúvidas e ser simpático, mas aja como uma secretária/assistente pessoal que protege a agenda do chefe.
4. Se perguntarem sobre o ${userName}, responda com base no que você sabe, mas não revele dados sensíveis (senhas, endereços privados).`;
            }

        } catch (error: any) {
            console.error('Error loading user settings:', error);
        }

        // DEBUG: Log qual modelo e prompt estão sendo usados
        console.log('🤖 AI Model:', aiModel);
        console.log('📝 System Prompt (primeiras 100 chars):', systemPrompt.substring(0, 100) + '...');
        console.log('✅ Custom settings loaded:', !!userSettings);


        // --- 🧠 DATA INTELLIGENCE LAYER: FETCH CONTEXT ---
        // Buscar coleções existentes para a IA não criar duplicadas
        const { data: collections } = await supabase
            .from('collections')
            .select('name')
            .eq('user_id', userId);

        const existingCollections = collections?.map((c: any) => c.name).join(', ') || "Nenhuma";
        console.log(`📂 Existing Collections: ${existingCollections}`);

        // Injetar no System Prompt
        systemPrompt += `\n\nCONTEXTO DE DADOS ATUAL: \n - Coleções / Pastas Existentes: [${existingCollections}]\n - Use essas pastas se apropriado antes de criar novas.`;

        // --- 🧠 DEEP LEARNING: FETCH USER RULES ---
        // Buscar regras que o usuário ensinou (salvas na tabela 'user_preferences')
        const { data: userRules } = await supabase
            .from('user_preferences')
            .select('key, value')
            .eq('user_id', userId);

        if (userRules && userRules.length > 0) {
            const rulesText = userRules.map((r: any) => `- [${r.key}]: ${r.value}`).join('\n');
            systemPrompt += `\n\nREGRAS APRENDIDAS (PREFERÊNCIAS DO USUÁRIO):\n${rulesText}\n(Siga estas regras acima de tudo).`;
            console.log(`🧠 Injected ${userRules.length} user rules.`);
        }

        // User settings fetched at the top


        // const messages: any[] = []; // REMOVIDO: Será declarado abaixo com histórico

        // --- AUDIO TRANSCRIPTION (WHISPER FALLBACK) ---
        // Só usa Whisper se Evolution não enviou transcrição
        if (mediaType === 'audio' && mediaUrl) {

            // DEBUG: Log start of audio processing
            await supabase.from('debug_logs').insert({
                function_name: 'process-message',
                level: 'info',
                message: 'Starting audio processing',
                meta: { mediaUrlLength: mediaUrl.length, isDataUri: mediaUrl.startsWith('data:') }
            });

            // Verifica se já tem algum texto útil da Evolution
            const hasEvolutionText = processedText &&
                !processedText.includes('[Áudio') &&
                !processedText.includes('processando') &&
                processedText.length > 3;

            if (hasEvolutionText) {
                console.log('✅ Using Evolution API transcription (PT-BR):', processedText);
                await supabase.from('debug_logs').insert({ function_name: 'process-message', level: 'info', message: 'Using Evolution transcription', meta: { text: processedText } });
            } else {
                console.log('⚠️ No useful text from Evolution - attempting Whisper fallback...');

                try {
                    let audioBlob: Blob;

                    if (mediaUrl.startsWith('data:')) {
                        // HANDLE DATA URI MANUALLY
                        console.log('Processing Data URI...');
                        const base64Data = mediaUrl.split(',')[1];
                        const mimeType = mediaUrl.split(';')[0].split(':')[1];

                        // Convert Base64 to Uint8Array
                        const binaryString = atob(base64Data);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let i = 0; i < binaryString.length; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        audioBlob = new Blob([bytes], { type: mimeType });
                        console.log(`✅ Converted Base64 to Blob: ${audioBlob.size} bytes, type: ${mimeType}`);

                        await supabase.from('debug_logs').insert({
                            function_name: 'process-message',
                            level: 'info',
                            message: 'Converted Base64 to Blob',
                            meta: { size: audioBlob.size, type: mimeType }
                        });

                    } else {
                        // HANDLE REMOTE URL
                        console.log('📥 Downloading audio from URL:', mediaUrl);
                        const audioResponse = await fetch(mediaUrl);

                        if (!audioResponse.ok) {
                            console.error(`❌ Failed to fetch audio: ${audioResponse.status} `);
                            await supabase.from('debug_logs').insert({
                                function_name: 'process-message',
                                level: 'error',
                                message: 'Failed to fetch audio URL',
                                meta: { status: audioResponse.status, url: mediaUrl }
                            });
                            throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
                        }
                        audioBlob = await audioResponse.blob();
                        console.log(`✅ Audio downloaded: ${audioBlob.size} bytes`);
                    }

                    // SEND TO WHISPER
                    const formData = new FormData();
                    formData.append('file', audioBlob, 'audio.ogg');
                    formData.append('model', 'whisper-1');
                    formData.append('language', 'pt');
                    formData.append('prompt', 'Esta é uma mensagem de áudio em português brasileiro. Transcrever em português do Brasil.');
                    formData.append('temperature', '0');

                    console.log('🚀 Sending to Whisper API...');
                    const transResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${openaiKey}`,
                        },
                        body: formData,
                    });

                    const transData = await transResponse.json();

                    if (transData.text) {
                        console.log('✅ Whisper Fallback SUCCESS:', transData.text);
                        processedText = transData.text;

                        await supabase.from('debug_logs').insert({
                            function_name: 'process-message',
                            level: 'success',
                            message: 'Whisper Transcription Success',
                            meta: { text: transData.text }
                        });

                    } else {
                        console.error('❌ Whisper Error:', transData);
                        await supabase.from('debug_logs').insert({
                            function_name: 'process-message',
                            level: 'error',
                            message: 'Whisper API Error',
                            meta: transData
                        });

                        if (transData.error?.message?.includes('Invalid file format')) {
                            processedText = 'O áudio está criptografado ou em formato inválido.';
                        } else {
                            processedText = 'Não foi possível transcrever o áudio.';
                        }
                    }

                } catch (error: any) {
                    console.error('❌ Error processing audio:', error);
                    await supabase.from('debug_logs').insert({
                        function_name: 'process-message',
                        level: 'error',
                        message: 'Audio processing exception',
                        meta: { error: error.message, stack: error.stack }
                    });
                    processedText = 'Erro ao processar áudio. Por favor, envie novamente.';
                }
            }
        }

        console.log('📝 FINAL TEXT SENT TO AI:', processedText);

        // --- AUDIO TRANSCRIPTION UPDATE (FIX VISIBILITY) ---
        // If we have a messageId and the text was transcribed (it was audio), update the DB
        if (messageId && processedText && mediaType === 'audio') {
            console.log(`💾 Updating transcription for message ${messageId}...`);
            await supabase.from('messages').update({
                content: processedText
            }).eq('id', messageId);
        }

        // --- 🧠 MEMORY LAYER: SAVE USER MESSAGE & RETRIEVE HISTORY ---

        // 1. Salvar mensagem do usuário no histórico
        // REMOVIDO: A responsabilidade de salvar a mensagem do usuário é do CLIENTE (App ou Webhook).
        // Isso evita duplicação.
        /*
        if (processedText) {
            await supabase.from('messages').insert({
                user_id: userId,
                role: 'user',
                content: processedText,
                media_url: mediaUrl || null,
                media_type: mediaType || null
            });
        }
        */

        // 2. Recuperar histórico recente (Curto Prazo)
        // Pegamos as últimas 10 mensagens para dar contexto
        const { data: historyData } = await supabase
            .from('messages')
            .select('role, content')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(10);

        // Reverter para ordem cronológica (mais antigo -> mais novo)
        const history = historyData ? historyData.reverse() : [];

        // Filtrar mensagens de sistema ou erros se necessário (opcional)
        // E remover a última mensagem se ela for a que acabamos de inserir (para não duplicar no prompt se o delay for curto)
        // Mas como inserimos agora, ela vai vir no select.
        // A lógica padrão da OpenAI é: System -> History -> User (New)
        // Se a mensagem nova já está no history, não precisamos dar push de novo no final, OU removemos do history.
        // Vamos remover a última do history se for igual ao processedText, para garantir a estrutura correta.

        const contextMessages = history.filter((msg: any) => msg.content !== processedText);

        console.log(`🧠 Context loaded: ${contextMessages.length} previous messages.`);

        // --- BUILD MESSAGES ARRAY ---
        const messages: any[] = [
            { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
            ...contextMessages.map((msg: any) => ({
                role: msg.role,
                content: msg.content || (msg.media_url ? '[Media Message]' : '') // Fallback for null content
            }))
        ];

        if (mediaUrl && mediaType !== 'audio') {
            messages.push({
                role: 'system',
                content: `[User attached a file / media.URL: ${mediaUrl} (Type: ${mediaType})]`
            });
        }

        if (mediaUrl && mediaType === 'image') {
            messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: processedText },
                    { type: 'image_url', image_url: { url: mediaUrl } }
                ]
            });
        } else {
            messages.push({ role: 'user', content: processedText });
        }

        // Multi-turn loop (ReAct pattern)
        let loopCount = 0;
        const MAX_LOOPS = 5;
        let finalResponse = "";

        while (loopCount < MAX_LOOPS) {
            loopCount++;

            // Call OpenAI with current history
            // --- MODEL SELECTION LOGIC ---
            // User requires GPT 5.1. We try to use it.
            // If it fails (because it might not exist yet publicly), we fallback to GPT-4o.
            let modelToUse = aiModel;

            // REMOVED: Forced mapping. We now trust the user and try the model.
            // if (aiModel === 'gpt-5.1-preview') { ... }

            console.log(`🤖 Final Model for Inference: ${modelToUse} (Requested: ${aiModel})`);

            let gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openaiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelToUse,
                    messages: messages,
                    tools: tools,
                    tool_choice: 'auto',
                    temperature: 0.7, // Criatividade balanceada
                }),
            });

            // --- FALLBACK LOGIC ---
            if (!gptResponse.ok && modelToUse === 'gpt-5.1-preview') {
                console.warn('⚠️ GPT 5.1 failed (likely not available). Falling back to GPT-4o.');
                await supabase.from('debug_logs').insert({
                    function_name: 'process-message',
                    level: 'warning',
                    message: 'GPT 5.1 failed, falling back to GPT-4o',
                    meta: { status: gptResponse.status }
                });

                modelToUse = 'gpt-4o';
                gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openaiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: modelToUse,
                        messages: messages,
                        tools: tools,
                        tool_choice: 'auto',
                        temperature: 0.7,
                    }),
                });
            }

            const gptData = await gptResponse.json();

            if (!gptData.choices?.[0]) {
                console.error('GPT Error:', gptData);
                throw new Error('Erro na comunicação com a AI');
            }

            const message = gptData.choices[0].message;

            // Add assistant's message to history
            messages.push(message);

            // LOG THOUGHTS (Chain of Thought)
            if (message.content) {
                console.log('💭 THOUGHT:', message.content);
            }

            // If no tool calls, this is the final answer
            if (!message.tool_calls || message.tool_calls.length === 0) {
                finalResponse = message.content;
                break;
            }

            // Execute tool calls
            for (const toolCall of message.tool_calls) {
                const functionName = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);

                console.log(`🔧 TOOL CALL: ${functionName}`);
                console.log(`🔧 ARGS:`, JSON.stringify(args));

                let toolOutput = "";

                try {
                    // 🛑 SECURITY GUARD: AUTHORITY CHECK
                    if (!isOwner) {
                        console.warn(`🛑 BLOCKED TOOL EXECUTION: ${functionName} called by non-owner (${senderName})`);
                        throw new Error(`⛔ Ação Bloqueada: Apenas o dono (${userSettings?.preferred_name || 'Vitor'}) pode executar comandos.`);
                    }

                    // LOG TOOL EXECUTION
                    await supabase.from('debug_logs').insert({
                        function_name: 'process-message',
                        level: 'info',
                        message: `Executing tool: ${functionName}`,
                        meta: { args: args }
                    });

                    // --- MANAGE COLLECTIONS ---
                    if (functionName === 'manage_collections') {
                        if (args.action === 'create') {
                            await supabase.from('collections').insert({
                                user_id: userId,
                                name: args.name,
                                description: args.description || null,
                                icon: args.icon || '📁'
                            });
                            toolOutput = `Pasta "${args.name}" criada com sucesso.`;
                        } else if (args.action === 'list') {
                            const { data } = await supabase.from('collections').select('name').eq('user_id', userId);
                            toolOutput = `Pastas existentes: ${data?.map((c: any) => c.name).join(', ') || 'Nenhuma'} `;
                        } else if (args.action === 'update') {
                            // Find collection by name
                            const { data: coll } = await supabase.from('collections').select('id').eq('user_id', userId).eq('name', args.name).maybeSingle();
                            if (!coll) {
                                toolOutput = `Erro: Pasta "${args.name}" não encontrada.`;
                            } else {
                                const updateData: any = {};
                                if (args.new_name) updateData.name = args.new_name;
                                if (args.description) updateData.description = args.description;
                                if (args.icon) updateData.icon = args.icon;

                                if (Object.keys(updateData).length === 0) {
                                    toolOutput = "Nenhuma alteração fornecida. Informe new_name, description ou icon.";
                                } else {
                                    const { error } = await supabase.from('collections').update(updateData).eq('id', coll.id);
                                    if (error) {
                                        toolOutput = `Erro ao atualizar pasta: ${error.message}`;
                                    } else {
                                        toolOutput = `Pasta "${args.name}" atualizada com sucesso.`;
                                    }
                                }
                            }
                        } else if (args.action === 'delete') {
                            // Safety check: Check if collection has items
                            const { data: collToDelete } = await supabase.from('collections').select('id').eq('user_id', userId).eq('name', args.name).maybeSingle();

                            if (collToDelete) {
                                const { count } = await supabase.from('collection_items').select('*', { count: 'exact', head: true }).eq('collection_id', collToDelete.id);

                                if (count && count > 0 && !args.force) {
                                    toolOutput = `⚠️ A pasta "${args.name}" não está vazia (${count} itens). Se você realmente quer apagar TUDO (pasta + itens), use action: 'delete' com force: true. Se quer apagar apenas os itens, use manage_items com action: 'delete'.`;
                                } else {
                                    const { error } = await supabase.from('collections').delete().eq('user_id', userId).eq('name', args.name);
                                    if (error) {
                                        toolOutput = `Erro ao apagar pasta: ${error.message}`;
                                    } else {
                                        toolOutput = `Pasta "${args.name}" apagada com sucesso.`;
                                    }
                                }
                            } else {
                                toolOutput = `Pasta "${args.name}" não encontrada.`;
                            }
                        }
                    }

                    // --- MANAGE ITEMS ---
                    else if (functionName === 'manage_items') {
                        // Buscar coleção ID
                        const { data: coll } = await supabase.from('collections').select('id').eq('user_id', userId).eq('name', args.collection_name).maybeSingle();

                        if (!coll) {
                            // Se não achar, tenta criar automaticamente (comportamento proativo)
                            const { data: newColl, error: createError } = await supabase.from('collections').insert({
                                user_id: userId,
                                name: args.collection_name,
                                icon: '📁'
                            }).select().single();

                            if (createError || !newColl) {
                                toolOutput = `Erro: Não foi possível criar a pasta "${args.collection_name}".`;
                            } else {
                                // Agora adiciona o item na pasta nova
                                const { error: insertError } = await supabase.from('collection_items').insert({
                                    collection_id: newColl.id,
                                    user_id: userId, // Adicionado user_id explicitamente
                                    type: args.type || 'text',
                                    content: args.content || null,
                                    media_url: args.media_url || mediaUrl || null,
                                    metadata: args.metadata ? {
                                        ...args.metadata,
                                        amount: args.metadata.amount ? Number(args.metadata.amount) : undefined
                                    } : null,
                                });

                                if (insertError) {
                                    console.error('❌ Error inserting item into NEW collection:', insertError);
                                    toolOutput = `Erro ao salvar item na nova pasta: ${insertError.message} `;
                                } else {
                                    console.log(`✅ Item inserted into NEW collection ${newColl.id} `);
                                    toolOutput = `Pasta "${args.collection_name}" criada automaticamente e item adicionado com sucesso.`;
                                }
                            }
                        } else {
                            if (args.action === 'list') {
                                // List all items in this collection
                                const { data: items, error } = await supabase
                                    .from('collection_items')
                                    .select('id, content, metadata, created_at, media_url')
                                    .eq('collection_id', coll.id)
                                    .order('created_at', { ascending: false });

                                if (error) {
                                    toolOutput = `Erro ao listar itens: ${error.message}`;
                                } else if (!items || items.length === 0) {
                                    toolOutput = `A pasta "${args.collection_name}" está vazia (0 itens).`;
                                } else {
                                    toolOutput = `Itens na pasta "${args.collection_name}" (${items.length} total):\n\n` +
                                        items.map((item, i) => {
                                            const amountInfo = item.metadata?.amount ? ` → R$ ${item.metadata.amount}` : '';
                                            const sectionInfo = item.metadata?.section ? ` [${item.metadata.section}]` : '';
                                            return `${i + 1}. ${item.content || '[sem texto]'}${amountInfo}${sectionInfo}`;
                                        }).join('\n');
                                }
                            }
                            else if (args.action === 'add') {
                                const { error: insertError } = await supabase.from('collection_items').insert({
                                    collection_id: coll.id,
                                    user_id: userId, // Adicionado user_id explicitamente
                                    type: args.type || 'text',
                                    content: args.content || null,
                                    media_url: args.media_url || mediaUrl || null,
                                    metadata: args.metadata ? {
                                        ...args.metadata,
                                        amount: args.metadata.amount ? Number(args.metadata.amount) : undefined
                                    } : null,
                                });

                                if (insertError) {
                                    console.error('❌ Error inserting item into EXISTING collection:', insertError);
                                    toolOutput = `Erro ao salvar item: ${insertError.message} `;
                                } else {
                                    console.log(`✅ Item inserted into EXISTING collection ${coll.id} `);
                                    toolOutput = `Item adicionado na pasta "${args.collection_name}".`;
                                }
                            }
                            else if (args.action === 'update' || args.action === 'delete') {
                                // Lógica de busca para encontrar o item
                                let query = supabase.from('collection_items').select('id, content, metadata').eq('collection_id', coll.id);

                                if (args.search_content) query = query.ilike('content', `%${args.search_content}%`);
                                if (args.search_metadata_key && args.search_metadata_value) {
                                    query = query.eq(`metadata ->> ${args.search_metadata_key} `, args.search_metadata_value);
                                }

                                // SMART LOGIC: Fetch candidates to handle ambiguity
                                const { data: items } = await query.limit(5);

                                let targetItem = null;

                                if (!items || items.length === 0) {
                                    toolOutput = `Erro: Não encontrei nenhum item correspondente na pasta "${args.collection_name}".`;
                                } else if (items.length > 1) {
                                    // Ambiguity detected
                                    const options = items.map((i: any) => `- ${i.content} (ID: ${i.id})`).join('\n');
                                    toolOutput = `Encontrei múltiplos itens parecidos. Qual deles você quer ${args.action === 'delete' ? 'apagar' : 'alterar'}?\n${options}\n\nPor favor, seja mais específico.`;
                                } else {
                                    // Single match found
                                    targetItem = items[0];

                                    if (args.action === 'delete') {
                                        await supabase.from('collection_items').delete().eq('id', targetItem.id);
                                        toolOutput = `Item apagado da pasta "${args.collection_name}".`;
                                    } else {
                                        let newContent = args.content || targetItem.content;
                                        if (args.should_append && args.content) {
                                            newContent = `${targetItem.content}\n${args.content}`;
                                        }

                                        await supabase.from('collection_items').update({
                                            content: newContent,
                                            metadata: args.metadata ? {
                                                ...targetItem.metadata,
                                                ...args.metadata,
                                                amount: args.metadata.amount ? Number(args.metadata.amount) : (targetItem.metadata?.amount || undefined)
                                            } : targetItem.metadata
                                        }).eq('id', targetItem.id);
                                        toolOutput = `Item atualizado na pasta "${args.collection_name}".`;
                                    }
                                }
                            }
                        }
                    }

                    // --- MANAGE RULES ---
                    else if (functionName === 'manage_rules') {
                        console.log('rules manager called', args);
                        if (args.action === 'create') {
                            if (!args.key || !args.value) {
                                toolOutput = "Erro: 'key' e 'value' são obrigatórios para criar uma regra.";
                            } else {
                                const { error } = await supabase.from('user_preferences').insert({
                                    user_id: userId,
                                    key: args.key,
                                    value: args.value
                                });
                                if (error) {
                                    console.error('Error creating rule:', error);
                                    toolOutput = `Erro ao criar regra: ${error.message}`;
                                } else {
                                    toolOutput = `Regra criada: [${args.key}] ${args.value}`;
                                }
                            }
                        } else if (args.action === 'delete') {
                            if (!args.id && !args.key) {
                                toolOutput = "Erro: Forneça o ID da regra ou o 'key' para deletar.";
                            } else {
                                let query = supabase.from('user_preferences').delete().eq('user_id', userId);

                                if (args.id) {
                                    query = query.eq('id', args.id);
                                } else if (args.key) {
                                    query = query.eq('key', args.key);
                                }

                                const { error } = await query;
                                if (error) {
                                    console.error('Error deleting rule:', error);
                                    toolOutput = `Erro ao deletar regra: ${error.message}`;
                                } else {
                                    toolOutput = "Regra(s) removida(s) com sucesso.";
                                }
                            }
                        } else if (args.action === 'list') {
                            const { data } = await supabase.from('user_preferences').select('*').eq('user_id', userId);
                            if (data && data.length > 0) {
                                toolOutput = "Regras Atuais:\n" + data.map((r: any) => `ID: ${r.id} | [${r.key}]: ${r.value}`).join('\n');
                            } else {
                                toolOutput = "Nenhuma regra definida.";
                            }
                        }
                    }

                    // --- MANAGE EMAILS (GMAIL & OUTLOOK) ---
                    else if (functionName === 'manage_emails') {
                        console.log('📧 Managing Emails:', args);
                        const targetProvider = args.provider || 'all';
                        const providersToFetch = targetProvider === 'all' ? ['google', 'microsoft'] : [targetProvider];

                        const { data: integrations } = await supabase
                            .from('user_integrations')
                            .select('*')
                            .eq('user_id', userId)
                            .in('provider', providersToFetch);

                        if (!integrations || integrations.length === 0) {
                            toolOutput = "Nenhuma conta de email conectada para o provedor solicitado. Por favor, conecte suas contas nas configurações.";
                        } else {
                            const results = [];

                            for (const integration of integrations) {
                                try {
                                    let accessToken = integration.access_token;
                                    const expiresAt = new Date(integration.expires_at);
                                    const now = new Date();
                                    const isGoogle = integration.provider === 'google';
                                    const isMicrosoft = integration.provider === 'microsoft';

                                    // --- REFRESH TOKEN LOGIC ---
                                    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
                                        console.log(`🔄 Refreshing ${integration.provider} Token...`);
                                        let refreshUrl = '';
                                        let bodyParams: any = {};

                                        if (isGoogle) {
                                            refreshUrl = 'https://oauth2.googleapis.com/token';
                                            bodyParams = {
                                                client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
                                                client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
                                                refresh_token: integration.refresh_token,
                                                grant_type: 'refresh_token',
                                            };
                                        } else if (isMicrosoft) {
                                            refreshUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
                                            bodyParams = {
                                                client_id: Deno.env.get('MICROSOFT_CLIENT_ID')!,
                                                client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
                                                refresh_token: integration.refresh_token,
                                                grant_type: 'refresh_token',
                                            };
                                        }

                                        const refreshResponse = await fetch(refreshUrl, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                            body: new URLSearchParams(bodyParams),
                                        });

                                        const refreshData = await refreshResponse.json();
                                        if (refreshData.error) throw new Error(refreshData.error_description || refreshData.error);

                                        accessToken = refreshData.access_token;
                                        const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

                                        await supabase.from('user_integrations').update({
                                            access_token: accessToken,
                                            expires_at: newExpiresAt,
                                            updated_at: new Date().toISOString()
                                        }).eq('id', integration.id);
                                    }

                                    // --- EXECUTE ACTIONS ---
                                    const headers = {
                                        'Authorization': `Bearer ${accessToken}`,
                                        'Content-Type': 'application/json'
                                    };

                                    if (isGoogle) {
                                        const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

                                        if (args.action === 'list') {
                                            const q = args.query || 'is:inbox';
                                            const listRes = await fetch(`${GMAIL_API}/messages?q=${encodeURIComponent(q)}&maxResults=${args.limit || 5}`, { headers });
                                            const listData = await listRes.json();

                                            if (listData.messages) {
                                                for (const msg of listData.messages) {
                                                    const detailRes = await fetch(`${GMAIL_API}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers });
                                                    const detailData = await detailRes.json();
                                                    const subject = detailData.payload.headers.find((h: any) => h.name === 'Subject')?.value || '(Sem Assunto)';
                                                    const from = detailData.payload.headers.find((h: any) => h.name === 'From')?.value || 'Desconhecido';
                                                    const date = detailData.payload.headers.find((h: any) => h.name === 'Date')?.value || '';
                                                    results.push(`[GMAIL] ID: ${msg.id} | ${date} | De: ${from} | ${subject}`);
                                                }
                                            }
                                        } else if (args.action === 'read') {
                                            // Only try to read if ID looks like Gmail ID (hex string) or if provider is specifically google/all
                                            // Simple check: Gmail IDs are usually hex. Microsoft IDs are very long base64-like.
                                            // But better to just try if provider matches.
                                            const msgRes = await fetch(`${GMAIL_API}/messages/${args.email_id}?format=full`, { headers });
                                            if (msgRes.ok) {
                                                const msgData = await msgRes.json();
                                                const snippet = msgData.snippet;
                                                let body = snippet; // Fallback
                                                // ... (Body decoding logic same as before) ...
                                                const decode = (str: string) => { try { return atob(str.replace(/-/g, '+').replace(/_/g, '/')); } catch (e) { return "(Erro decode)"; } };
                                                if (msgData.payload.body?.data) body = decode(msgData.payload.body.data);
                                                else if (msgData.payload.parts) {
                                                    const textPart = msgData.payload.parts.find((p: any) => p.mimeType === 'text/plain');
                                                    if (textPart?.body?.data) body = decode(textPart.body.data);
                                                }

                                                const subject = msgData.payload.headers.find((h: any) => h.name === 'Subject')?.value;
                                                const from = msgData.payload.headers.find((h: any) => h.name === 'From')?.value;
                                                results.push(`[GMAIL] De: ${from}\nAssunto: ${subject}\nCorpo: ${body}`);
                                            }
                                        } else if (args.action === 'send' || args.action === 'reply') {
                                            const messageParts = [
                                                `To: ${args.to}`,
                                                `Subject: ${args.subject}`,
                                                `Content-Type: text/plain; charset="UTF-8"`,
                                                `MIME-Version: 1.0`,
                                                ``,
                                                args.body
                                            ];
                                            const rawMessage = messageParts.join('\n');
                                            const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

                                            const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
                                                method: 'POST', headers, body: JSON.stringify({ raw: encodedMessage })
                                            });
                                            if (sendRes.ok) results.push(`[GMAIL] Enviado com sucesso.`);
                                            else results.push(`[GMAIL] Erro ao enviar: ${(await sendRes.json()).error.message}`);
                                        } else if (args.action === 'move_to_trash') {
                                            await fetch(`${GMAIL_API}/messages/${args.email_id}/trash`, { method: 'POST', headers });
                                            results.push(`[GMAIL] Movido para lixeira.`);
                                        }

                                    } else if (isMicrosoft) {
                                        const GRAPH_API = 'https://graph.microsoft.com/v1.0/me';

                                        if (args.action === 'list') {
                                            const listRes = await fetch(`${GRAPH_API}/messages?$top=${args.limit || 5}&$select=id,subject,from,receivedDateTime,bodyPreview&$orderby=receivedDateTime desc`, { headers });
                                            const listData = await listRes.json();
                                            if (listData.value) {
                                                for (const msg of listData.value) {
                                                    results.push(`[OUTLOOK] ID: ${msg.id} | ${msg.receivedDateTime} | De: ${msg.from.emailAddress.name} <${msg.from.emailAddress.address}> | ${msg.subject}`);
                                                }
                                            }
                                        } else if (args.action === 'read') {
                                            const msgRes = await fetch(`${GRAPH_API}/messages/${args.email_id}?$select=subject,from,toRecipients,receivedDateTime,body`, { headers });
                                            if (msgRes.ok) {
                                                const msgData = await msgRes.json();
                                                // Microsoft body is HTML by default, but we can get text content or just show it.
                                                // Let's try to strip HTML tags for simplicity or just return content.
                                                const body = msgData.body.content.replace(/<[^>]*>?/gm, ''); // Simple strip
                                                results.push(`[OUTLOOK] De: ${msgData.from.emailAddress.name}\nAssunto: ${msgData.subject}\nCorpo: ${body}`);
                                            }
                                        } else if (args.action === 'send' || args.action === 'reply') {
                                            const sendBody = {
                                                message: {
                                                    subject: args.subject,
                                                    body: { contentType: "Text", content: args.body },
                                                    toRecipients: [{ emailAddress: { address: args.to } }]
                                                },
                                                saveToSentItems: "true"
                                            };
                                            const sendRes = await fetch(`${GRAPH_API}/sendMail`, {
                                                method: 'POST', headers, body: JSON.stringify(sendBody)
                                            });
                                            if (sendRes.ok) results.push(`[OUTLOOK] Enviado com sucesso.`);
                                            else results.push(`[OUTLOOK] Erro ao enviar: ${await sendRes.text()}`);
                                        } else if (args.action === 'move_to_trash') {
                                            // Move to Deleted Items. Need to know folder ID? 
                                            // Graph API has 'move' endpoint.
                                            // We can try to guess 'deleteditems' or just skip for now if too complex.
                                            // Actually, standard folder names usually work?
                                            // Let's try to find 'deleteditems' folder id first? No, too many calls.
                                            // Alternative: DELETE method on message resource moves to Deleted Items?
                                            // "Deleting a message moves it to the Deleted Items folder by default." -> YES!
                                            // So just DELETE request.
                                            const delRes = await fetch(`${GRAPH_API}/messages/${args.email_id}`, { method: 'DELETE', headers });
                                            if (delRes.ok) results.push(`[OUTLOOK] Movido para lixeira.`);
                                            else results.push(`[OUTLOOK] Erro ao apagar: ${await delRes.text()}`);
                                        }
                                    }

                                } catch (err: any) {
                                    console.error(`Error processing ${integration.provider}:`, err);
                                    results.push(`[${integration.provider.toUpperCase()}] Erro: ${err.message}`);
                                }
                            }

                            toolOutput = results.length > 0 ? results.join('\n\n') : "Nenhum resultado encontrado.";
                        }
                    }

                    // --- MANAGE USERS (ADMIN ONLY) ---
                    else if (functionName === 'manage_users') {
                        if (!userSettings?.is_admin) {
                            throw new Error("⛔ ACESSO NEGADO: Apenas administradores podem usar esta ferramenta.");
                        }

                        console.log('🛡️ ADMIN ACTION:', args);

                        if (args.action === 'list') {
                            const { data: users, error } = await supabase
                                .from('user_settings')
                                .select('user_id, preferred_name, ai_model, is_admin');

                            if (error) throw error;

                            const userList = users.map((u: any) =>
                                `- ${u.preferred_name || 'Sem Nome'} (ID: ${u.user_id}) [Model: ${u.ai_model}] ${u.is_admin ? '🛡️ ADMIN' : ''}`
                            ).join('\n');

                            toolOutput = `👥 Lista de Usuários:\n${userList}`;
                        }
                        else if (args.action === 'update_model') {
                            if (!args.target_user_id || !args.model) throw new Error("target_user_id e model são obrigatórios.");

                            const { error } = await supabase
                                .from('user_settings')
                                .update({ ai_model: args.model })
                                .eq('user_id', args.target_user_id);

                            if (error) throw error;
                            toolOutput = `✅ Modelo do usuário ${args.target_user_id} atualizado para ${args.model}.`;
                        }
                        else if (args.action === 'delete') {
                            if (!args.target_user_id) throw new Error("target_user_id é obrigatório.");

                            // Delete from auth.users? No, we can't do that easily from here without service role key with special perms.
                            // But we can delete from user_settings and data tables.
                            // Actually, let's just delete user_settings for now as a soft delete/reset.
                            // Or better: just warn that we can't fully delete auth user.

                            const { error } = await supabase
                                .from('user_settings')
                                .delete()
                                .eq('user_id', args.target_user_id);

                            if (error) throw error;
                            toolOutput = `⚠️ Configurações do usuário ${args.target_user_id} apagadas. (A conta Auth ainda existe).`;
                        }
                    }

                    // --- MANAGE CALENDAR ---
                    else if (functionName === 'manage_calendar') {
                        console.log('📅 Managing Calendar:', args);
                        const targetProvider = args.provider || 'all';
                        const providersToFetch = targetProvider === 'all' ? ['google', 'microsoft'] : [targetProvider];

                        const { data: integrations } = await supabase
                            .from('user_integrations')
                            .select('*')
                            .eq('user_id', userId)
                            .in('provider', providersToFetch);

                        if (!integrations || integrations.length === 0) {
                            toolOutput = "Nenhuma conta de calendário conectada. Por favor, conecte Google ou Outlook nas configurações.";
                        } else {
                            const results = [];

                            for (const integration of integrations) {
                                try {
                                    let accessToken = integration.access_token;
                                    const expiresAt = new Date(integration.expires_at);
                                    const now = new Date();
                                    const isGoogle = integration.provider === 'google';
                                    const isMicrosoft = integration.provider === 'microsoft';

                                    // --- REFRESH TOKEN LOGIC ---
                                    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
                                        console.log(`🔄 Refreshing ${integration.provider} Token...`);
                                        let refreshUrl = '';
                                        let bodyParams: any = {};

                                        if (isGoogle) {
                                            refreshUrl = 'https://oauth2.googleapis.com/token';
                                            bodyParams = {
                                                client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
                                                client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
                                                refresh_token: integration.refresh_token,
                                                grant_type: 'refresh_token',
                                            };
                                        } else if (isMicrosoft) {
                                            refreshUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
                                            bodyParams = {
                                                client_id: Deno.env.get('MICROSOFT_CLIENT_ID')!,
                                                client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
                                                refresh_token: integration.refresh_token,
                                                grant_type: 'refresh_token',
                                            };
                                        }

                                        const refreshResponse = await fetch(refreshUrl, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                            body: new URLSearchParams(bodyParams),
                                        });

                                        const refreshData = await refreshResponse.json();
                                        if (refreshData.error) throw new Error(refreshData.error_description || refreshData.error);

                                        accessToken = refreshData.access_token;
                                        const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

                                        await supabase.from('user_integrations').update({
                                            access_token: accessToken,
                                            expires_at: newExpiresAt,
                                            updated_at: new Date().toISOString()
                                        }).eq('id', integration.id);
                                    }

                                    const headers = {
                                        'Authorization': `Bearer ${accessToken}`,
                                        'Content-Type': 'application/json'
                                    };

                                    // --- EXECUTE ACTIONS ---
                                    if (args.action === 'list_events') {
                                        const timeMin = args.start_date || new Date().toISOString();
                                        const timeMax = args.end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Default 7 days

                                        if (isGoogle) {
                                            const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
                                            const res = await fetch(url, { headers });
                                            const data = await res.json();
                                            if (data.items) {
                                                results.push(...data.items.map((e: any) => {
                                                    const start = e.start.dateTime ? new Date(e.start.dateTime).toLocaleString('pt-BR') : `${e.start.date} (Dia todo)`;
                                                    return `[GOOGLE] ${start} - ${e.summary} (ID: ${e.id})`;
                                                }));
                                            }
                                        } else if (isMicrosoft) {
                                            const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${timeMin}&endDateTime=${timeMax}&$top=20&$select=id,subject,start,end,isAllDay`;
                                            const res = await fetch(url, { headers });
                                            const data = await res.json();
                                            if (data.value) {
                                                results.push(...data.value.map((e: any) => {
                                                    const start = e.isAllDay ? `${e.start.dateTime.split('T')[0]} (Dia todo)` : new Date(e.start.dateTime).toLocaleString('pt-BR');
                                                    return `[OUTLOOK] ${start} - ${e.subject} (ID: ${e.id})`;
                                                }));
                                            }
                                        }
                                    }
                                    else if (args.action === 'create_event') {
                                        // Create in the first available provider if not specified, or all?
                                        // Usually user wants one calendar. Let's default to Google if available, else Microsoft.
                                        // Or if provider specified.
                                        // If 'all' (default), let's pick Google first.

                                        // Logic: If we are iterating and provider is 'all', we might duplicate.
                                        // Let's control this: Only create ONCE.
                                        // But we are inside a loop.
                                        // Let's assume if provider is NOT specified, we prefer Google.
                                        // If we are in Microsoft loop and Google was already processed (and successful?), skip?
                                        // Simpler: Just try to create in the current integration.

                                        const startTime = args.start_time;
                                        let endTime = args.end_time;
                                        if (!endTime && startTime) {
                                            const d = new Date(startTime);
                                            d.setHours(d.getHours() + 1);
                                            endTime = d.toISOString();
                                        }

                                        if (isGoogle) {
                                            const event = {
                                                summary: args.title,
                                                description: args.description,
                                                start: args.all_day ? { date: startTime.split('T')[0] } : { dateTime: startTime },
                                                end: args.all_day ? { date: endTime.split('T')[0] } : { dateTime: endTime },
                                                location: args.location
                                            };
                                            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                                                method: 'POST', headers, body: JSON.stringify(event)
                                            });
                                            const data = await res.json();
                                            if (data.id) results.push(`[GOOGLE] Evento criado: "${args.title}" em ${new Date(startTime).toLocaleString('pt-BR')}`);
                                            else results.push(`[GOOGLE] Erro ao criar: ${JSON.stringify(data)}`);
                                        }
                                        else if (isMicrosoft) {
                                            const event = {
                                                subject: args.title,
                                                body: { contentType: 'Text', content: args.description || '' },
                                                start: { dateTime: startTime, timeZone: 'America/Sao_Paulo' },
                                                end: { dateTime: endTime, timeZone: 'America/Sao_Paulo' },
                                                location: { displayName: args.location },
                                                isAllDay: args.all_day
                                            };
                                            const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
                                                method: 'POST', headers, body: JSON.stringify(event)
                                            });
                                            const data = await res.json();
                                            if (data.id) results.push(`[OUTLOOK] Evento criado: "${args.title}" em ${new Date(startTime).toLocaleString('pt-BR')}`);
                                            else results.push(`[OUTLOOK] Erro ao criar: ${JSON.stringify(data)}`);
                                        }
                                    }
                                    else if (args.action === 'delete_event') {
                                        let eventIdToDelete = args.event_id;

                                        // SMART LOGIC: If no ID, try to find by title
                                        if (!eventIdToDelete && args.title) {
                                            if (isGoogle) {
                                                const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(args.title)}&timeMin=${new Date().toISOString()}&maxResults=5`;
                                                const searchRes = await fetch(searchUrl, { headers });
                                                const searchData = await searchRes.json();
                                                const candidates = searchData.items || [];

                                                if (candidates.length === 0) {
                                                    results.push(`[GOOGLE] Não encontrei nenhum evento futuro com o título "${args.title}".`);
                                                } else if (candidates.length > 1) {
                                                    const options = candidates.map((e: any) => `- ${e.summary} (${new Date(e.start.dateTime || e.start.date).toLocaleString('pt-BR')}) [ID: ${e.id}]`).join('\n');
                                                    results.push(`[GOOGLE] Encontrei múltiplos eventos. Qual deles apagar?\n${options}`);
                                                } else {
                                                    eventIdToDelete = candidates[0].id;
                                                }
                                            } else if (isMicrosoft) {
                                                const searchUrl = `https://graph.microsoft.com/v1.0/me/events?$filter=contains(subject,'${args.title}') and start/dateTime ge '${new Date().toISOString()}'&$top=5`;
                                                const searchRes = await fetch(searchUrl, { headers });
                                                const searchData = await searchRes.json();
                                                const candidates = searchData.value || [];

                                                if (candidates.length === 0) {
                                                    results.push(`[OUTLOOK] Não encontrei nenhum evento futuro com o título "${args.title}".`);
                                                } else if (candidates.length > 1) {
                                                    const options = candidates.map((e: any) => `- ${e.subject} (${new Date(e.start.dateTime).toLocaleString('pt-BR')}) [ID: ${e.id}]`).join('\n');
                                                    results.push(`[OUTLOOK] Encontrei múltiplos eventos. Qual deles apagar?\n${options}`);
                                                } else {
                                                    eventIdToDelete = candidates[0].id;
                                                }
                                            }
                                        }

                                        if (!eventIdToDelete && !args.title) {
                                            results.push("Erro: ID do evento ou Título necessário para deletar.");
                                        } else if (eventIdToDelete) {
                                            if (isGoogle) {
                                                const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventIdToDelete}`, { method: 'DELETE', headers });
                                                if (res.ok) results.push(`[GOOGLE] Evento apagado com sucesso.`);
                                                else results.push(`[GOOGLE] Erro ao apagar: ${(await res.json()).error?.message}`);
                                            } else if (isMicrosoft) {
                                                const res = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventIdToDelete}`, { method: 'DELETE', headers });
                                                if (res.ok) results.push(`[OUTLOOK] Evento apagado com sucesso.`);
                                                else results.push(`[OUTLOOK] Erro ao apagar: ${await res.text()}`);
                                            }
                                        }
                                    }

                                } catch (err: any) {
                                    console.error(`Error processing Calendar ${integration.provider}:`, err);
                                    results.push(`[${integration.provider.toUpperCase()}] Erro: ${err.message}`);
                                }
                            }

                            toolOutput = results.length > 0 ? results.join('\n') : "Nenhum evento encontrado ou ação realizada.";
                        }
                    }

                    // --- SEARCH CONTACTS ---
                    else if (functionName === 'search_contacts') {
                        const { data: contacts } = await supabase
                            .from('messages')
                            .select('sender_name, sender_number, created_at')
                            .eq('user_id', userId) // 🔒 SECURITY: Isolate by user
                            .or(`sender_name.ilike.%${args.query}%,sender_number.ilike.%${args.query}%`) // Search Name OR Number
                            .order('created_at', { ascending: false })
                            .limit(50); // Increased limit to find valid numbers among LIDs

                        if (!contacts || contacts.length === 0) {
                            toolOutput = `Nenhum contato encontrado com o nome "${args.query}". Tente buscar por parte do nome.`;
                        } else {
                            // Group by number to avoid duplicates
                            const uniqueContacts = new Map();
                            contacts.forEach((c: any) => {
                                if (!uniqueContacts.has(c.sender_number)) {
                                    uniqueContacts.set(c.sender_number, {
                                        name: c.sender_name,
                                        number: c.sender_number,
                                        last_seen: c.created_at
                                    });
                                }
                            });

                            // Sort: Prioritize numbers starting with 55 and length 12-13 (BR Mobile)
                            const sortedContacts = Array.from(uniqueContacts.values()).sort((a: any, b: any) => {
                                const isAValid = a.number.startsWith('55') && a.number.length >= 12 && a.number.length <= 13;
                                const isBValid = b.number.startsWith('55') && b.number.length >= 12 && b.number.length <= 13;
                                if (isAValid && !isBValid) return -1;
                                if (!isAValid && isBValid) return 1;
                                return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime(); // Fallback to recency
                            });

                            const list = sortedContacts.map((c: any) => {
                                const isValid = c.number.startsWith('55') && c.number.length >= 12 && c.number.length <= 13;
                                const tag = isValid ? '[📱 CELULAR]' : '[❓ OUTRO/ID]';
                                return `- ${c.name} (${c.number}) ${tag} [Visto em: ${new Date(c.last_seen).toLocaleDateString('pt-BR')}]`;
                            }).join('\n');

                            toolOutput = `Contatos encontrados para "${args.query}":\n${list}\n\nPREFIRA NÚMEROS MARCADOS COMO [📱 CELULAR]. Evite [❓ OUTRO/ID] se possível.`;
                        }
                    }

                    // --- QUERY DATA ---
                    else if (functionName === 'query_data') {
                        const { data: coll } = await supabase.from('collections').select('id').eq('user_id', userId).eq('name', args.collection_name).maybeSingle();

                        if (!coll) {
                            toolOutput = `Pasta "${args.collection_name}" não encontrada.`;
                        } else {
                            if (args.start_date) {
                                // Precisamos filtrar por metadata->>date.
                            }

                            // NOVA LÓGICA DE FILTRO DE DATA (Híbrida)
                            // Se args.start_date/end_date forem passados, filtramos no banco pelo created_at (performance)
                            // E TAMBÉM filtramos por metadata->>date se existir.

                            // Como não dá pra fazer OR complexo fácil aqui, vamos fazer o seguinte:
                            // Buscar tudo (com limite razoável) e filtrar no código.
                            const { data: allItems } = await supabase
                                .from('collection_items')
                                .select('*')
                                .eq('collection_id', coll.id)
                                .order('created_at', { ascending: false })
                                .limit(500); // Limite de segurança

                            let items = allItems || [];

                            if (args.start_date) {
                                items = items.filter(i => {
                                    const itemDate = i.metadata?.date || i.created_at;
                                    return itemDate >= args.start_date;
                                });
                            }
                            if (args.end_date) {
                                items = items.filter(i => {
                                    const itemDate = i.metadata?.date || i.created_at;
                                    return itemDate <= args.end_date;
                                });
                            }

                            if (args.filter_key && args.filter_value) {
                                items = items.filter(i => i.metadata?.[args.filter_key] === args.filter_value);
                            }

                            // A query original foi substituída pela lógica in-memory acima.
                            // const { data: items } = await query;

                            if (!items || items.length === 0) {
                                toolOutput = `Nenhum dado encontrado com esses filtros em "${args.collection_name}".`;
                            } else {
                                if (args.operation === 'sum' && args.field) {
                                    const total = items.reduce((acc: number, item: any) => acc + (Number(item.metadata?.[args.field]) || 0), 0);

                                    // Generate list for context (fallback for unstructured data)
                                    const list = items.map((i: any) => `- ${i.content || ''} (Meta: ${JSON.stringify(i.metadata || {})})`).join('\n');

                                    toolOutput = `Total (via metadata '${args.field}'): ${total}.\n\nItens considerados:\n${list}\n\n(Se o total for 0, verifique os itens acima para somar manualmente)`;
                                } else if (args.operation === 'count') {
                                    toolOutput = `Total de itens: ${items.length} `;
                                } else if (args.operation === 'average' && args.field) {
                                    const total = items.reduce((acc: number, item: any) => acc + (Number(item.metadata?.[args.field]) || 0), 0);
                                    const list = items.map((i: any) => `- ${i.content || ''} (Meta: ${JSON.stringify(i.metadata || {})})`).join('\n');
                                    toolOutput = `Média (via metadata '${args.field}'): ${(total / items.length).toFixed(2)}.\n\nItens considerados:\n${list}`;
                                } else {
                                    // List
                                    const list = items.map((i: any) => {
                                        const meta = i.metadata ? JSON.stringify(i.metadata) : '';
                                        return `- ${i.content || ''} ${meta} `;
                                    }).join('\n');
                                    toolOutput = `Resultado: \n${list} `;
                                }
                            }
                        }
                    }


                    // --- MANAGE REMINDERS ---
                    else if (functionName === 'manage_reminders') {
                        if (args.action === 'create') {
                            const finalDueAt = calculateDueAt(args, brasiliaTime, overrideDueAt);

                            // VALIDAÇÃO FINAL
                            if (finalDueAt) {
                                const checkDate = new Date(finalDueAt);
                                const nowCheck = new Date();
                                const diffMinutes = (checkDate.getTime() - nowCheck.getTime()) / (1000 * 60);

                                console.log(`🔍 DATE CHECK: Due = ${finalDueAt}, Diff = ${diffMinutes.toFixed(1)} min`);

                                if (diffMinutes < -5) {
                                    toolOutput = `ERRO: A data calculada(${finalDueAt}) está no passado.Por favor, seja mais específico(ex: "amanhã às 10h").`;
                                    console.error('❌ REJECTED: Date in past');
                                } else {
                                    // SUCESSO - Inserir no banco
                                    const reminderData: any = {
                                        user_id: userId,
                                        title: args.title,
                                        due_at: finalDueAt,
                                        recurrence_type: args.recurrence_type || 'once',
                                        is_completed: false
                                    };

                                    if (args.recurrence_type && args.recurrence_type !== 'once') {
                                        if (args.recurrence_type === 'custom') {
                                            reminderData.recurrence_interval = args.recurrence_interval;
                                            reminderData.recurrence_unit = args.recurrence_unit;
                                        }
                                        if (args.recurrence_type === 'weekly' && args.weekdays) {
                                            reminderData.weekdays = args.weekdays;
                                        }
                                        if (args.recurrence_count) {
                                            reminderData.recurrence_count = args.recurrence_count;
                                        }
                                    }

                                    const { error } = await supabase.from('reminders').insert(reminderData);
                                    if (error) throw error;

                                    let confirmMsg = `Lembrete "${args.title}" agendado para ${finalDueAt} `;
                                    if (args.recurrence_type !== 'once') confirmMsg += ` (Recorrente: ${args.recurrence_type})`;
                                    toolOutput = confirmMsg;
                                }
                            } else {
                                toolOutput = "Erro: Não foi possível calcular a data do lembrete. Tente novamente.";
                            }

                        } else if (args.action === 'list') {
                            const { data } = await supabase.from('reminders').select('*').eq('user_id', userId).eq('is_completed', false).order('due_at');
                            toolOutput = `Lembretes pendentes: ${data?.map((r: any) => `[ID: ${r.id}] ${r.title} (${r.due_at})`).join(', ') || "Nenhum"} `;
                        } else if (args.action === 'complete') {
                            if (args.id) {
                                await supabase.from('reminders').update({ is_completed: true }).eq('id', args.id).eq('user_id', userId);
                                toolOutput = `Lembrete marcado como concluído (ID: ${args.id}).`;
                            } else {
                                const search = args.search_title || args.title;
                                // 1. Try to find PENDING reminders first
                                const { data: pending } = await supabase
                                    .from('reminders')
                                    .select('id, title, due_at')
                                    .eq('user_id', userId)
                                    .eq('is_completed', false)
                                    .ilike('title', `%${search}%`);

                                if (pending && pending.length === 1) {
                                    // Perfect match
                                    await supabase.from('reminders').update({ is_completed: true }).eq('id', pending[0].id);
                                    toolOutput = `Lembrete "${pending[0].title}" marcado como concluído.`;
                                } else if (pending && pending.length > 1) {
                                    // Ambiguous
                                    const options = pending.map((r: any) => `- ${r.title} (${new Date(r.due_at).toLocaleString('pt-BR')}) [ID: ${r.id}]`).join('\n');
                                    toolOutput = `Encontrei múltiplos lembretes pendentes com esse nome. Qual deles você quer concluir?\n${options}\n\nPor favor, repita o comando usando o ID ou o nome mais específico.`;
                                } else {
                                    // No pending found, check completed?
                                    const { data: completed } = await supabase
                                        .from('reminders')
                                        .select('id, title')
                                        .eq('user_id', userId)
                                        .eq('is_completed', true)
                                        .ilike('title', `%${search}%`)
                                        .limit(1);

                                    if (completed && completed.length > 0) {
                                        toolOutput = `O lembrete "${completed[0].title}" já estava concluído.`;
                                    } else {
                                        toolOutput = `Não encontrei nenhum lembrete chamado "${search}".`;
                                    }
                                }
                            }
                        } else if (args.action === 'update') {
                            // SMART LOGIC: Find reminder to update
                            let reminder = null;

                            if (args.id) {
                                const { data } = await supabase.from('reminders').select('*').eq('id', args.id).eq('user_id', userId).single();
                                reminder = data;
                            } else {
                                const search = args.title;
                                // Prioritize PENDING
                                const { data: pending } = await supabase.from('reminders').select('*').eq('user_id', userId).eq('is_completed', false).ilike('title', `%${search}%`).limit(5);

                                if (pending && pending.length === 1) {
                                    reminder = pending[0];
                                } else if (pending && pending.length > 1) {
                                    const options = pending.map((r: any) => `- ${r.title} (${new Date(r.due_at).toLocaleString('pt-BR')}) [ID: ${r.id}]`).join('\n');
                                    toolOutput = `Encontrei múltiplos lembretes pendentes. Qual deles alterar?\n${options}`;
                                } else {
                                    // Try completed
                                    const { data: anyRem } = await supabase.from('reminders').select('*').eq('user_id', userId).ilike('title', `%${search}%`).limit(1);
                                    reminder = anyRem?.[0];
                                }
                            }

                            if (!reminder && !toolOutput) {
                                toolOutput = `Erro: Lembrete não encontrado para atualização.`;
                            } else if (reminder) {
                                const updateData: any = {};
                                if (args.title) updateData.title = args.title;

                                // Recalculate time if provided
                                if (args.time_config || args.relative_time || overrideDueAt) {
                                    const newDueAt = calculateDueAt(args, brasiliaTime, overrideDueAt);
                                    if (newDueAt) updateData.due_at = newDueAt;
                                }

                                if (args.recurrence_type) updateData.recurrence_type = args.recurrence_type;
                                if (args.recurrence_interval) updateData.recurrence_interval = args.recurrence_interval;
                                if (args.recurrence_unit) updateData.recurrence_unit = args.recurrence_unit;
                                if (args.weekdays) updateData.weekdays = args.weekdays;
                                if (args.recurrence_count) updateData.recurrence_count = args.recurrence_count;

                                const { error } = await supabase.from('reminders').update(updateData).eq('id', reminder.id);
                                if (error) throw error;
                                toolOutput = `Lembrete atualizado com sucesso.`;
                            }
                        } else if (args.action === 'delete') {
                            // SMART LOGIC: Find reminder to delete
                            let reminderToDelete = null;

                            if (args.id) {
                                reminderToDelete = { id: args.id };
                            } else {
                                const search = args.search_title || args.title;
                                // Prioritize PENDING
                                const { data: pending } = await supabase.from('reminders').select('id, title, due_at').eq('user_id', userId).eq('is_completed', false).ilike('title', `%${search}%`).limit(5);

                                if (pending && pending.length === 1) {
                                    reminderToDelete = pending[0];
                                } else if (pending && pending.length > 1) {
                                    const options = pending.map((r: any) => `- ${r.title} (${new Date(r.due_at).toLocaleString('pt-BR')}) [ID: ${r.id}]`).join('\n');
                                    toolOutput = `Encontrei múltiplos lembretes pendentes. Qual deles apagar?\n${options}`;
                                } else {
                                    // Try completed
                                    const { data: anyRem } = await supabase.from('reminders').select('id, title').eq('user_id', userId).ilike('title', `%${search}%`).limit(1);
                                    reminderToDelete = anyRem?.[0];
                                }
                            }

                            if (!reminderToDelete && !toolOutput) {
                                toolOutput = `Erro: Lembrete não encontrado para apagar.`;
                            } else if (reminderToDelete) {
                                await supabase.from('reminders').delete().eq('id', reminderToDelete.id).eq('user_id', userId);
                                toolOutput = `Lembrete apagado (ID: ${reminderToDelete.id}).`;
                            }
                        }
                    }


                    // --- MANAGE TASKS (TO-DO) ---
                    else if (functionName === 'manage_tasks') {
                        if (args.action === 'create') {
                            const finalDueAt = calculateDueAt(args, brasiliaTime, null);

                            const { error } = await supabase.from('tasks').insert({
                                user_id: userId,
                                title: args.title,
                                description: args.description || null,
                                priority: args.priority || 'medium',
                                status: args.status || 'todo',
                                tags: args.tags || [],
                                due_date: finalDueAt // Now supports dates!
                            });
                            if (error) throw error;

                            const dateMsg = finalDueAt ? ` para ${new Date(finalDueAt).toLocaleDateString('pt-BR')}` : '';
                            toolOutput = `Tarefa "${args.title}" adicionada à lista${dateMsg}.`;
                        } else if (args.action === 'list') {
                            let query = supabase.from('tasks').select('*').eq('user_id', userId);

                            if (args.filter_status) {
                                query = query.eq('status', args.filter_status);
                            } else {
                                // Default: hide done/archived unless asking for them
                                query = query.neq('status', 'done').neq('status', 'archived');
                            }

                            const { data: tasks } = await query.order('created_at', { ascending: false });

                            if (!tasks || tasks.length === 0) {
                                toolOutput = "Nenhuma tarefa encontrada.";
                            } else {
                                let filteredTasks = tasks;

                                // Date Filtering (In-memory for flexibility)
                                if (args.filter_date === 'today') {
                                    const todayStr = brasiliaTime.toISOString().split('T')[0];
                                    filteredTasks = tasks.filter((t: any) => {
                                        if (!t.due_date) return false;
                                        const tDate = t.due_date.split('T')[0];
                                        // Include today OR overdue (if not done)
                                        return tDate === todayStr || (tDate < todayStr && t.status !== 'done');
                                    });
                                } else if (args.filter_date === 'tomorrow') {
                                    const tomorrow = new Date(brasiliaTime);
                                    tomorrow.setDate(tomorrow.getDate() + 1);
                                    const tmrStr = tomorrow.toISOString().split('T')[0];
                                    filteredTasks = tasks.filter((t: any) => t.due_date && t.due_date.startsWith(tmrStr));
                                }

                                if (filteredTasks.length === 0) {
                                    toolOutput = `Nenhuma tarefa encontrada para "${args.filter_date || 'filtro atual'}".`;
                                } else {
                                    toolOutput = `Suas Tarefas:\n${filteredTasks.map((t: any) => {
                                        const dateInfo = t.due_date ? ` [📅 ${new Date(t.due_date).toLocaleDateString('pt-BR')}]` : '';
                                        return `- [${t.status.toUpperCase()}] ${t.title} (${t.priority})${dateInfo}`;
                                    }).join('\n')}`;
                                }
                            }
                        } else if (args.action === 'update' || args.action === 'complete' || args.action === 'delete') {
                            // First find the task
                            let query = supabase.from('tasks').select('id, title, status').eq('user_id', userId);

                            // FILTER LOGIC:
                            // If completing or deleting, prioritize NOT DONE tasks.
                            if (args.action === 'complete' || args.action === 'delete') {
                                // We can't easily do "order by status" to prioritize 'todo' over 'done' in one query without complex SQL.
                                // So we'll fetch matches and filter in code, or try two queries.
                                // Let's try fetching matches (limit 5) and picking the best one.
                            }

                            if (args.search_title) query = query.ilike('title', `%${args.search_title}%`);

                            // Fetch a few candidates to make a smart decision
                            const { data: candidates } = await query.limit(5);

                            let task = null;

                            if (candidates && candidates.length > 0) {
                                // 1. Try to find an exact match that is NOT done (for complete/delete)
                                if (args.action === 'complete') {
                                    task = candidates.find((t: any) => t.status !== 'done' && t.status !== 'archived');
                                }
                                // 2. If no pending task found, or action is update, just take the first one (or maybe the most recent?)
                                // Ideally we should sort by created_at desc in the query to get most recent.
                                if (!task) task = candidates[0];
                            }

                            if (!task) {
                                toolOutput = `Erro: Tarefa "${args.search_title}" não encontrada.`;
                            } else {
                                // Check if we are completing an already completed task
                                if (args.action === 'complete' && task.status === 'done') {
                                    toolOutput = `A tarefa "${task.title}" já estava concluída!`;
                                } else {
                                    if (args.action === 'delete') {
                                        await supabase.from('tasks').delete().eq('id', task.id);
                                        toolOutput = `Tarefa "${task.title}" apagada.`;
                                    } else if (args.action === 'complete') {
                                        await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', task.id);
                                        toolOutput = `Tarefa "${task.title}" marcada como concluída! 🎉`;
                                    } else { // update
                                        const updateData: any = {};
                                        if (args.title) updateData.title = args.title;
                                        if (args.description) updateData.description = args.description;
                                        if (args.priority) updateData.priority = args.priority;
                                        if (args.status) updateData.status = args.status;
                                        if (args.tags) updateData.tags = args.tags;

                                        // Update due_date if provided
                                        if (args.due_date || args.time_config || args.relative_time) {
                                            const newDueAt = calculateDueAt(args, brasiliaTime, null);
                                            if (newDueAt) updateData.due_date = newDueAt;
                                        }

                                        await supabase.from('tasks').update(updateData).eq('id', task.id);
                                        toolOutput = `Tarefa "${task.title}" atualizada.`;
                                    }
                                }
                            }
                        }
                    }

                    // --- SAVE MEMORY (VECTOR) ---
                    else if (functionName === 'save_memory') {
                        console.log(`🧠 Saving memory: "${args.content}"`);

                        // 1. Generate Embedding
                        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${openaiKey}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                model: 'text-embedding-3-small',
                                input: args.content,
                            }),
                        });

                        const embeddingData = await embeddingResponse.json();
                        const embedding = embeddingData.data?.[0]?.embedding;

                        if (!embedding) {
                            console.error('❌ OpenAI Embedding Error:', JSON.stringify(embeddingData));
                            toolOutput = `Erro ao gerar vetor: ${JSON.stringify(embeddingData)}`;
                        } else {
                            // 2. Save to DB
                            const { error } = await supabase.from('memories').insert({
                                user_id: userId,
                                content: args.content,
                                embedding: embedding,
                                metadata: { category: args.category || 'general' }
                            });

                            if (error) throw error;
                            toolOutput = "Memória salva com sucesso! 🧠";
                        }
                    }

                    // --- RECALL MEMORY (RAG) ---
                    else if (functionName === 'recall_memory') {
                        console.log(`🧠 Recalling memory for: "${args.query}"`);

                        // 1. Generate Embedding for the query
                        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${openaiKey}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                model: 'text-embedding-3-small',
                                input: args.query,
                            }),
                        });

                        const embeddingData = await embeddingResponse.json();
                        const queryEmbedding = embeddingData.data?.[0]?.embedding;

                        if (!queryEmbedding) {
                            toolOutput = "Erro ao gerar vetor de busca.";
                        } else {
                            // 2. Call RPC to match memories
                            const { data: memories, error: matchError } = await supabase.rpc('match_memories', {
                                query_embedding: queryEmbedding,
                                match_threshold: 0.5, // Similaridade mínima (0 a 1)
                                match_count: args.match_count || 5,
                                p_user_id: userId
                            });

                            if (matchError) {
                                console.error('❌ Match Error:', matchError);
                                toolOutput = "Erro ao buscar memórias.";
                            } else if (!memories || memories.length === 0) {
                                toolOutput = "Nenhuma memória relevante encontrada.";
                            } else {
                                const memoryText = memories.map((m: any) => `- ${m.content} (Similaridade: ${(m.similarity * 100).toFixed(0)}%)`).join('\n');
                                toolOutput = `Memórias Encontradas:\n${memoryText}`;
                            }
                        }
                    }

                    // --- SEND WHATSAPP MESSAGE ---
                    else if (functionName === 'send_whatsapp_message') {
                        // 🛑 PRIVACY CHECK: OUTGOING ALLOWED?
                        if (userSettings?.privacy_allow_outgoing === false) {
                            console.warn(`🛑 BLOCKED OUTGOING MESSAGE: User disabled outgoing messages.`);
                            throw new Error(`⛔ Ação Bloqueada: Você configurou sua privacidade para NÃO permitir que a IA envie mensagens para outras pessoas.`);
                        }

                        console.log(`📤 Sending WhatsApp message to ${args.number}`);

                        // Sanitize number (remove non-digits)
                        const cleanNumber = args.number.replace(/\D/g, '');
                        // FORMATTING FIX: Ensure @s.whatsapp.net suffix
                        const targetNumber = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;

                        const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
                        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

                        // Better: Fetch the active instance for this user.
                        const { data: instances } = await supabase.from('whatsapp_instances').select('instance_name').eq('user_id', userId).eq('status', 'connected').limit(1);
                        const instanceName = instances?.[0]?.instance_name || 'user_personal'; // Fallback

                        console.log(`📤 Sending WhatsApp message to ${targetNumber} via ${instanceName}`);

                        let sendRes;
                        if (args.media_url) {
                            // SEND MEDIA
                            console.log(`📎 Sending Media: ${args.media_url}`);
                            sendRes = await fetch(`${evolutionApiUrl}/message/sendMedia/${instanceName}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'apikey': evolutionApiKey
                                },
                                body: JSON.stringify({
                                    number: targetNumber,
                                    options: { delay: 1200, presence: 'composing' },
                                    mediaMessage: {
                                        mediatype: args.media_type || 'image',
                                        media: args.media_url,
                                        caption: args.message || ''
                                    }
                                })
                            });
                        } else {
                            // SEND TEXT
                            sendRes = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'apikey': evolutionApiKey
                                },
                                body: JSON.stringify({
                                    number: targetNumber,
                                    options: { delay: 1200, presence: 'composing' },
                                    text: args.message
                                })
                            });
                        }

                        const respText = await sendRes.text();

                        if (!sendRes.ok) {
                            console.error('❌ Failed to send outgoing message:', respText);
                            await supabase.from('debug_logs').insert({
                                function_name: 'process-message',
                                level: 'error',
                                message: 'Failed to send WhatsApp message',
                                meta: { error: respText, number: targetNumber, instance: instanceName }
                            });
                            toolOutput = `Erro ao enviar mensagem: ${respText}`;
                        } else {
                            console.log('✅ Outgoing message sent!');
                            await supabase.from('debug_logs').insert({
                                function_name: 'process-message',
                                level: 'info',
                                message: 'Outgoing WhatsApp message sent',
                                meta: { number: targetNumber, instance: instanceName, hasMedia: !!args.media_url }
                            });
                            toolOutput = `Mensagem enviada com sucesso para ${args.number}.`;
                        }
                    }

                    // --- QUERY MESSAGES (HISTORY) ---
                    else if (functionName === 'query_messages') {
                        console.log(`🔎 Querying messages history...`);
                        let query = supabase.from('messages')
                            .select('sender_name, sender_number, group_name, content, message_timestamp, is_from_me, is_group, status, media_url, media_type')
                            .eq('user_id', userId) // 🔒 SECURITY: Isolate by user
                            .order('message_timestamp', { ascending: false })
                            .limit(args.limit || 20);

                        if (args.sender_number) query = query.eq('sender_number', args.sender_number);
                        if (args.sender_name) query = query.ilike('sender_name', `%${args.sender_name}%`);
                        if (args.group_name) query = query.ilike('group_name', `%${args.group_name}%`);

                        // Unread Filter
                        if (args.only_unread) {
                            query = query.eq('is_from_me', false).neq('status', 'read');
                        }

                        // Time filter (Default increased to 30 days to find older contacts)
                        const days = args.days_ago || 30;
                        const dateLimit = new Date();
                        dateLimit.setDate(dateLimit.getDate() - days);
                        query = query.gte('message_timestamp', dateLimit.toISOString());

                        const { data: msgs, error } = await query;

                        if (error) {
                            toolOutput = `Erro ao buscar mensagens: ${error.message}`;
                        } else if (!msgs || msgs.length === 0) {
                            toolOutput = "Nenhuma mensagem encontrada com esses critérios.";
                        } else {
                            // Format for AI
                            toolOutput = msgs.reverse().map((m: any) => {
                                const dir = m.is_from_me
                                    ? `Eu (Dono) -> ${m.sender_number}`
                                    : `${m.sender_name || 'Desconhecido'} (${m.sender_number})`;
                                const context = m.is_group ? `[Grupo: ${m.group_name || 'Desconhecido'}]` : '[Privado]';
                                const status = m.status ? `[Status: ${m.status}]` : '[Status: Pendente]';
                                const time = new Date(m.message_timestamp).toLocaleString('pt-BR');
                                const mediaInfo = m.media_url ? ` [Mídia: ${m.media_type} | URL: ${m.media_url}]` : '';
                                return `[${time}] ${context} ${dir} ${status}: ${m.content}${mediaInfo}`;
                            }).join('\n');
                        }
                    }

                    // --- UPDATE USER SETTINGS ---
                    else if (functionName === 'update_user_settings') {
                        const { preferred_name, daily_briefing_enabled, daily_briefing_time, daily_briefing_prompt, ai_name } = args;
                        const updates: any = {};

                        if (preferred_name) updates.preferred_name = preferred_name;
                        if (daily_briefing_enabled !== undefined) updates.daily_briefing_enabled = daily_briefing_enabled;
                        if (daily_briefing_time) updates.daily_briefing_time = daily_briefing_time;
                        if (args.daily_briefing_prompt !== undefined) updates.daily_briefing_prompt = args.daily_briefing_prompt;
                        if (args.ai_name !== undefined) updates.ai_name = args.ai_name;

                        if (Object.keys(updates).length > 0) {
                            const { error } = await supabase
                                .from('user_settings')
                                .update(updates)
                                .eq('user_id', userId);

                            if (error) {
                                console.error('Error updating settings:', error);
                                toolOutput = `Erro ao atualizar configurações: ${error.message}`;
                            } else {
                                const updatedFields = Object.keys(updates).join(', ');
                                toolOutput = `Configurações atualizadas com sucesso: ${updatedFields}.`;
                            }
                        } else {
                            toolOutput = "Nenhuma alteração solicitada.";
                        }
                    }
                } catch (error: any) {
                    console.error(`Error executing ${functionName}: `, error);
                    toolOutput = `Erro ao executar ferramenta: ${error.message} `;
                }

                // Add tool result to history
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: toolOutput
                });
            }
        }

        // --- 🧠 MEMORY LAYER: SAVE AI RESPONSE ---
        if (finalResponse) {
            await supabase.from('messages').insert({
                user_id: userId,
                role: 'assistant',
                content: finalResponse,
                // Metadata for Context
                is_from_me: true, // AI speaking on behalf of user/system
                is_group: is_group, // Same context as the incoming message
                sender_name: aiName,
                sender_number: userPhoneNumber, // Use user's number as the "sender" identity for AI
                message_timestamp: new Date().toISOString()
            });
            console.log('💾 AI Response saved to history.');
        }

        return new Response(JSON.stringify({
            success: true,
            response: finalResponse
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error: any) {
        console.error('Error processing message:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});
