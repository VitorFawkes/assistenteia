import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface ProcessMessageRequest {
    content?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'audio' | 'document';
    userId: string;
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
        const { content, mediaUrl, mediaType, userId }: ProcessMessageRequest = await req.json();

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

        // Nota: Áudios já vêm transcritos pela Evolution API quando speechToText=true
        // Não precisamos mais fazer transcrição manual aqui

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
                            action: { type: 'string', enum: ['create', 'list'], description: 'Ação a realizar' },
                            name: { type: 'string', description: 'Nome da coleção (para create)' },
                            description: { type: 'string', description: 'Descrição (para create)' },
                            icon: { type: 'string', description: 'Emoji (para create)' }
                        },
                        required: ['action']
                    }
                }
            },
            {
                type: 'function',
                function: {
                    name: 'manage_items',
                    description: 'Gerencia itens em uma coleção (adicionar, atualizar, deletar)',
                    parameters: {
                        type: 'object',
                        properties: {
                            action: { type: 'string', enum: ['add', 'update', 'delete'], description: 'Ação' },
                            collection_name: { type: 'string', description: 'Nome da coleção alvo' },
                            content: { type: 'string', description: 'Conteúdo do item (para add/update)' },
                            media_url: { type: 'string', description: 'URL da mídia/arquivo (se houver)' },
                            metadata: { type: 'object', description: 'Dados estruturados (para add/update)' },
                            // Critérios para encontrar item para update/delete
                            search_content: { type: 'string', description: 'Texto para buscar item a alterar/deletar' },
                            search_metadata_key: { type: 'string', description: 'Chave do metadata para busca (ex: category)' },
                            search_metadata_value: { type: 'string', description: 'Valor do metadata para busca (ex: transporte)' }
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
                            start_date: { type: 'string', description: 'Data inicial (ISO)' },
                            end_date: { type: 'string', description: 'Data final (ISO)' },
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
            }
        ];

        // Load custom system prompt from database (if exists)
        // Calculate current time in Brasilia (UTC-3)
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const brasiliaTime = new Date(utc - (3 * 3600000));
        const isoBrasilia = brasiliaTime.toISOString().replace('Z', '-03:00');

        const DEFAULT_SYSTEM_PROMPT = `Você é o assistente pessoal do Vitor.
Data e Hora atual (Brasília): ${isoBrasilia}

IDIOMA: Você DEVE SEMPRE responder em PORTUGUÊS (pt-BR).

REGRAS DE DATA/HORA:
- O horário acima JÁ É o horário local (-03:00).
- Ao criar lembretes (due_at), use SEMPRE o formato ISO 8601 preservando o offset -03:00.
- Exemplo: Se agora é 18:30 e o usuário pede "daqui 1 minuto", o due_at deve ser "2024-XX-XXT18:31:00-03:00".
- NÃO converta para UTC (Z). Mantenha -03:00.

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
- manage_reminders: criar/listar/completar lembretes

Exemplos:
"Cria pasta Viagem" -> manage_collections {action: "create", name: "Viagem"}
"Gastei 50 no Uber" -> manage_items {action: "add", collection_name: "Viagem", content: "Uber", metadata: {amount: 50, category: "transporte"}}
"Quanto gastei com transporte na viagem?" -> query_data {collection_name: "Viagem", operation: "sum", field: "amount", filter_key: "category", filter_value: "transporte"}
"Quanto gastei semana passada?" -> query_data {collection_name: "Viagem", operation: "sum", field: "amount", start_date: "...", end_date: "..."}
"Muda o gasto do Uber para 60" -> manage_items {action: "update", collection_name: "Viagem", search_content: "Uber", metadata: {amount: 60}}
"Já fiz a reunião" -> manage_reminders {action: "complete", search_title: "reunião"}

IMPORTANTE - QUANDO EXECUTAR vs QUANDO PERGUNTAR:

**EXECUTE IMEDIATAMENTE** quando tiver as informações essenciais:
- Tempo específico ("daqui a 1 minuto", "às 15h", "amanhã") + assunto = CRIE o lembrete!
- Valor + descrição ("50 no Uber", "gastei 100 com comida") = ANOTE!
- Nome claro ("cria pasta Viagem") = CRIE!

**SÓ PERGUNTE** quando informação CRÍTICA estiver faltando:
- "algumas vezes" SEM número/horários específicos → PERGUNTE: "Quantas vezes e em quais horários?"
- "esse gasto" SEM especificar qual → PERGUNTE: "Qual gasto?"
- "cria uma pasta" SEM nome → PERGUNTE: "Qual nome?"

**Ao CONFIRMAR ações**:
- Seja detalhado e natural: "Blz, daqui 1 minuto às 16:31 eu te lembro sobre reunião de vendas com time de Trips"
- Sem códigos ou markdown
- Use emojis ocasionalmente 😊

**REGRA SIMPLES**: Se você sabe O QUE fazer e QUANDO/QUANTO → FAÇA e confirme. Se algo essencial está vago → PERGUNTE.`;

        let systemPrompt = DEFAULT_SYSTEM_PROMPT;
        let aiModel = 'gpt-4o'; // Default model
        let userSettings: any = null;

        // Try to load user's custom prompt and model
        try {
            const { data } = await supabase
                .from('user_settings')
                .select('custom_system_prompt, ai_model')
                .eq('user_id', userId)
                .maybeSingle();

            userSettings = data;

            if (userSettings?.custom_system_prompt) {
                systemPrompt = userSettings.custom_system_prompt;
            }

            if (userSettings?.ai_model) {
                aiModel = userSettings.ai_model;
            }
        } catch (error) {
            console.error('Error loading user settings:', error);
        }

        // DEBUG: Log qual modelo e prompt estão sendo usados
        console.log('🤖 AI Model:', aiModel);
        console.log('📝 System Prompt (primeiras 100 chars):', systemPrompt.substring(0, 100) + '...');
        console.log('✅ Custom settings loaded:', !!userSettings);


        const messages: any[] = [];

        // --- AUDIO TRANSCRIPTION (WHISPER) ---
        // Se for áudio, forçamos a transcrição via OpenAI para garantir PT-BR
        if (mediaType === 'audio' && mediaUrl) {
            try {
                console.log('🎙️ Transcribing audio with Whisper (PT-BR)...');
                const audioBlob = await fetch(mediaUrl).then(r => r.blob());
                const formData = new FormData();
                formData.append('file', audioBlob, 'audio.ogg');
                formData.append('model', 'whisper-1');
                formData.append('language', 'pt'); // FORCE PORTUGUESE

                const transResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openaiKey}`,
                    },
                    body: formData,
                });

                const transData = await transResponse.json();
                if (transData.text) {
                    console.log('✅ Whisper Transcription:', transData.text);
                    processedText = transData.text; // Substitui o texto original
                } else {
                    console.error('❌ Whisper Error:', transData);
                }
            } catch (error) {
                console.error('❌ Error processing audio:', error);
            }
        }

        // Se houver mídia (que não seja áudio já processado), adiciona contexto explícito
        if (mediaUrl && mediaType !== 'audio') {
            messages.push({
                role: 'system',
                content: `User attached a file/media. URL: ${mediaUrl} (Type: ${mediaType})`
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
            const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiKey}`,
                },
                body: JSON.stringify({
                    model: aiModel,
                    messages: [{ role: 'system', content: systemPrompt }, ...messages],
                    tools,
                    tool_choice: 'auto',
                }),
            });

            const gptData = await gptResponse.json();

            if (!gptData.choices?.[0]) {
                console.error('GPT Error:', gptData);
                throw new Error('Erro na comunicação com a AI');
            }

            const message = gptData.choices[0].message;

            // Add assistant's message to history
            messages.push(message);

            // If no tool calls, this is the final answer
            if (!message.tool_calls || message.tool_calls.length === 0) {
                finalResponse = message.content;
                break;
            }

            // Execute tool calls
            for (const toolCall of message.tool_calls) {
                const functionName = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);
                let toolOutput = "";

                try {
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
                            toolOutput = `Pastas existentes: ${data?.map((c: any) => c.name).join(', ') || 'Nenhuma'}`;
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
                                await supabase.from('collection_items').insert({
                                    collection_id: newColl.id,
                                    type: args.type || 'text',
                                    content: args.content || null,
                                    media_url: args.media_url || mediaUrl || null,
                                    metadata: args.metadata || null,
                                });
                                toolOutput = `Pasta "${args.collection_name}" criada automaticamente e item adicionado com sucesso.`;
                            }
                        } else {
                            if (args.action === 'add') {
                                await supabase.from('collection_items').insert({
                                    collection_id: coll.id,
                                    type: args.type || 'text',
                                    content: args.content || null,
                                    media_url: args.media_url || mediaUrl || null,
                                    metadata: args.metadata || null,
                                });
                                toolOutput = `Item adicionado na pasta "${args.collection_name}".`;
                            }
                            else if (args.action === 'update' || args.action === 'delete') {
                                // Lógica de busca para encontrar o item
                                let query = supabase.from('collection_items').select('id, content, metadata').eq('collection_id', coll.id);

                                if (args.search_content) query = query.ilike('content', `%${args.search_content}%`);
                                if (args.search_metadata_key && args.search_metadata_value) {
                                    query = query.eq(`metadata->>${args.search_metadata_key}`, args.search_metadata_value);
                                }

                                const { data: items } = await query.limit(1);
                                const targetItem = items?.[0];

                                if (!targetItem) {
                                    toolOutput = `Erro: Não encontrei o item para ${args.action === 'delete' ? 'apagar' : 'alterar'}.`;
                                } else {
                                    if (args.action === 'delete') {
                                        await supabase.from('collection_items').delete().eq('id', targetItem.id);
                                        toolOutput = `Item apagado da pasta "${args.collection_name}".`;
                                    } else {
                                        await supabase.from('collection_items').update({
                                            content: args.content || targetItem.content,
                                            metadata: args.metadata ? { ...targetItem.metadata, ...args.metadata } : targetItem.metadata
                                        }).eq('id', targetItem.id);
                                        toolOutput = `Item atualizado na pasta "${args.collection_name}".`;
                                    }
                                }
                            }
                        }
                    }

                    // --- QUERY DATA ---
                    else if (functionName === 'query_data') {
                        const { data: coll } = await supabase.from('collections').select('id').eq('user_id', userId).eq('name', args.collection_name).maybeSingle();

                        if (!coll) {
                            toolOutput = `Pasta "${args.collection_name}" não encontrada.`;
                        } else {
                            let query = supabase.from('collection_items').select('*').eq('collection_id', coll.id);

                            if (args.start_date) query = query.gte('created_at', args.start_date);
                            if (args.end_date) query = query.lte('created_at', args.end_date);
                            if (args.filter_key && args.filter_value) {
                                // Filtro JSONB
                                query = query.eq(`metadata->>${args.filter_key}`, args.filter_value);
                            }

                            const { data: items } = await query;

                            if (!items || items.length === 0) {
                                toolOutput = `Nenhum dado encontrado com esses filtros em "${args.collection_name}".`;
                            } else {
                                if (args.operation === 'sum' && args.field) {
                                    const total = items.reduce((acc, item) => acc + (Number(item.metadata?.[args.field]) || 0), 0);
                                    toolOutput = `Total: ${total}`;
                                } else if (args.operation === 'count') {
                                    toolOutput = `Total de itens: ${items.length}`;
                                } else if (args.operation === 'average' && args.field) {
                                    const total = items.reduce((acc, item) => acc + (Number(item.metadata?.[args.field]) || 0), 0);
                                    toolOutput = `Média: ${(total / items.length).toFixed(2)}`;
                                } else {
                                    // List
                                    const list = items.map(i => {
                                        const meta = i.metadata ? JSON.stringify(i.metadata) : '';
                                        return `- ${i.content || ''} ${meta}`;
                                    }).join('\n');
                                    toolOutput = `Resultado:\n${list}`;
                                }
                            }
                        }
                    }

                    // --- MANAGE REMINDERS ---
                    else if (functionName === 'manage_reminders') {
                        if (args.action === 'create') {
                            await supabase.from('reminders').insert({
                                user_id: userId,
                                title: args.title,
                                due_at: args.due_at
                            });
                            toolOutput = `Lembrete "${args.title}" criado para ${args.due_at}.`;
                        } else if (args.action === 'list') {
                            const { data } = await supabase.from('reminders').select('*').eq('user_id', userId).eq('is_completed', false).order('due_at');
                            toolOutput = `Lembretes pendentes: ${data?.map(r => `${r.title} (${r.due_at})`).join(', ') || "Nenhum"}`;
                        } else if (args.action === 'complete') {
                            const { data } = await supabase.from('reminders').select('id').eq('user_id', userId).ilike('title', `%${args.search_title}%`).limit(1).maybeSingle();
                            if (data) {
                                await supabase.from('reminders').update({ is_completed: true }).eq('id', data.id);
                                toolOutput = "Lembrete marcado como concluído.";
                            } else {
                                toolOutput = "Lembrete não encontrado.";
                            }
                        }
                    }

                } catch (error) {
                    console.error(`Error executing ${functionName}:`, error);
                    toolOutput = `Erro ao executar ferramenta: ${error.message}`;
                }

                // Add tool result to history
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: toolOutput
                });
            }
        }

        return new Response(JSON.stringify({ success: true, response: finalResponse }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (error) {
        console.error('Error processing message:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});
