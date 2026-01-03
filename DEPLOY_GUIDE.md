# 🚀 GUIA DE DEPLOY - EDGE FUNCTIONS

## 📋 **ANTES DE COMEÇAR**

### ⚠️ **PASSO CRÍTICO: Configurar Evolution API**

No **Easypanel**, edite as variáveis de ambiente da Evolution API:

**Mude esta linha:**
```env
LANGUAGE=en
```

**Para:**
```env
LANGUAGE=pt
```

**Depois:** Clique em "Save" e **Reinicie** o container da Evolution API.

---

## 📄 **ARQUIVO 1: process-message**

### **Acesse:**
https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions/process-message

### **Passos:**
1. Clique em **"Edit function"** ou **"Deploy new version"**
2. **APAGUE TODO** o conteúdo atual
3. **COPIE E COLE** o código abaixo:

```typescript
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

        // ESTRATÉGIA: Usar transcrição da Evolution (se disponível), senão tentar Whisper como fallback
        console.log('📝 Initial content received:', processedText || 'EMPTY');

        // Tools/Functions disponíveis para o GPT-5.1
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
        const brasiliaTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        const isoBrasilia = brasiliaTime.toISOString().replace('Z', '-03:00');

        const DEFAULT_SYSTEM_PROMPT = `Você é o assistente pessoal do  Vitor.
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
        let aiModel = 'gpt-5.1-preview'; // Default model
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

        // --- AUDIO TRANSCRIPTION (WHISPER FALLBACK) ---
        // Só usa Whisper se Evolution não enviou transcrição
        if (mediaType === 'audio' && mediaUrl) {
            // Verifica se já tem algum texto útil da Evolution
            const hasEvolutionText = processedText &&
                !processedText.includes('[Áudio') &&
                !processedText.includes('processando') &&
                processedText.length > 3;

            if (hasEvolutionText) {
                console.log('✅ Using Evolution API transcription (PT-BR):', processedText);
                console.log('⏭️ Skipping Whisper - already have transcription from Evolution');
            } else {
                console.log('⚠️ No useful text from Evolution - attempting Whisper fallback...');
                console.log('📝 Initial text was:', processedText || 'EMPTY');

                try {
                    console.log('📥 Downloading audio from URL:', mediaUrl);
                    const audioResponse = await fetch(mediaUrl);

                    if (!audioResponse.ok) {
                        console.error(`❌ Failed to fetch audio: ${audioResponse.status}`);
                        processedText = 'Não foi possível processar o áudio. Por favor, envie novamente ou digite sua mensagem.';
                    } else {
                        const audioBlob = await audioResponse.blob();
                        console.log(`✅ Audio downloaded: ${audioBlob.size} bytes`);

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
                        } else {
                            console.error('❌ Whisper Error:', transData);
                            // Se é erro de formato inválido (arquivo criptografado), mensagem amigável
                            if (transData.error?.message?.includes('Invalid file format')) {
                                console.error('🔒 File is encrypted - cannot transcribe. Evolution should handle this.');
                                processedText = 'O áudio está criptografado. Configure a Evolution API com OPENAI_ENABLED=true e LANGUAGE=pt para transcrição automática.';
                            } else {
                                processedText = 'Não foi possível transcrever o áudio. Por favor, tente novamente ou digite sua mensagem.';
                            }
                        }
                    }
                } catch (error) {
                    console.error('❌ Error processing audio:', error);
                    processedText = 'Erro ao processar áudio. Por favor, envie novamente ou digite sua mensagem.';
                }
            }
        }

        if (mediaUrl && mediaType !== 'audio') {
            messages.push({
                role: 'system',
                content: `User attached a file/media. URL: ${mediaUrl} (Type: ${mediaType})`
            });
        }

        console.log('📝 FINAL TEXT SENT TO AI:', processedText);

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
```

4. Clique em **"Deploy"** ou **"Save"**
5. Aguarde deploy completar (~30 segundos)

---

## 📄 **ARQUIVO 2: whatsapp-webhook**

### **Acesse:**
https://supabase.com/dashboard/project/bvjfiismidgzmdmrotee/functions/whatsapp-webhook

### **Passos:**
1. Clique em **"Edit function"** ou **"Deploy new version"**
2. **APAGUE TODO** o conteúdo atual
3. **COPIE E COLE** o código abaixo:

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const body = await req.json();
        console.log('WhatsApp webhook received:', JSON.stringify(body));

        // Evolution API envia eventos diferentes, precisamos filtrar mensagens
        const event = body.event;

        if (event === 'messages.upsert') {
            const data = body.data;
            const message = data;

            // Ignorar mensagens enviadas pela própria assistente
            if (message.key?.fromMe) {
                return new Response(JSON.stringify({ success: true, ignored: 'fromMe' }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            const phoneNumber = message.key?.remoteJid?.replace('@s.whatsapp.net', '');

            // Extrair texto
            let messageText = message.message?.conversation ||
                message.message?.extendedTextMessage?.text ||
                message.message?.imageMessage?.caption ||
                '';

            // Extrair mídia
            let mediaUrl = null;
            let mediaType = null;
            let mediaBase64 = null;

            // Tenta encontrar base64 no payload (para compatibilidade)
            if (message.base64) {
                mediaBase64 = message.base64;
            }

            if (message.message?.imageMessage) {
                mediaType = 'image';
                mediaUrl = message.message.imageMessage.url;
            } else if (message.message?.audioMessage) {
                // BUSCA POR TRANSCRIÇÃO DA EVOLUTION (agora configurada para PT-BR)
                console.log('🎙️ Audio message received');

                const transcribedText = data.speechToText ||
                    body.speechToText ||
                    data.message?.speechToText ||
                    message.message?.audioMessage?.speechToText;

                mediaType = 'audio';
                mediaUrl = message.message.audioMessage.url;

                if (transcribedText) {
                    // Evolution API enviou transcrição (deve estar em PT agora!)
                    console.log('✅ Evolution speechToText found:', transcribedText);
                    messageText = transcribedText;
                } else {
                    // Sem transcrição da Evolution - Whisper vai tentar no backend
                    console.warn('⚠️ No speechToText from Evolution - Whisper will attempt fallback');
                    messageText = '[Áudio sem transcrição - tentando Whisper...]';
                }

                console.log('📤 Sending to backend:', { hasEvolutionText: !!transcribedText, mediaUrl: !!mediaUrl });
            } else if (message.message?.documentMessage) {
                mediaType = 'document';
                mediaUrl = message.message.documentMessage.url;
                if (!messageText) messageText = message.message.documentMessage.fileName || 'Documento';
            }

            // Não precisa mais definir texto padrão para áudio - já foi tratado acima

            if (!phoneNumber || (!messageText && !mediaUrl && !mediaBase64)) {
                return new Response(JSON.stringify({ success: false, error: 'Invalid message' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // Buscar usuário pelo número de telefone
            const { data: user } = await supabase
                .from('users')
                .select('id')
                .eq('phone_number', phoneNumber)
                .maybeSingle();

            if (!user) {
                console.log(`User not found for phone: ${phoneNumber}`);
                return new Response(JSON.stringify({ success: false, error: 'User not found' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // Salvar mensagem do usuário
            await supabase.from('messages').insert({
                user_id: user.id,
                role: 'user',
                content: messageText + (mediaType ? ` [${mediaType}]` : ''),
            });

            // Processar com IA
            const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                    content: messageText,
                    userId: user.id,
                    mediaUrl,
                    mediaType,
                    // mediaBase64 não é mais necessário - áudio já vem transcrito
                }),
            });

            const processResult = await processResponse.json();

            if (processResult.success && processResult.response) {
                // Salvar resposta da IA
                await supabase.from('messages').insert({
                    user_id: user.id,
                    role: 'assistant',
                    content: processResult.response,
                });

                // Enviar resposta via WhatsApp
                const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
                const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
                const evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE');

                if (evolutionApiUrl && evolutionApiKey && evolutionInstance) {
                    try {
                        await fetch(`${evolutionApiUrl}/message/sendText/${evolutionInstance}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': evolutionApiKey,
                            },
                            body: JSON.stringify({
                                number: phoneNumber,
                                text: processResult.response,
                            }),
                        });
                    } catch (error) {
                        console.error('Error sending WhatsApp response:', error);
                    }
                }
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ success: true, ignored: event }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Webhook error:', error);
        return new Response(
            JSON.stringify({ success: false, error: (error as Error).message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});
```

4. Clique em **"Deploy"** ou **"Save"**
5. Aguarde deploy completar (~30 segundos)

---

## ✅ **Checklist Final**

Depois de fazer os 2 deploys:

- [ ] Deploy de `process-message` concluído
- [ ] Deploy de `whatsapp-webhook` concluído
- [ ] Evolution API com `LANGUAGE=pt` e reiniciada
- [ ] Pronto para testar!

---

## 🧪 **Como Testar**

Envie áudio via WhatsApp (~5 segundos):
*"Me lembra de comprar leite amanhã às dez horas"*

**Esperado:**
- Receber resposta em português
- Lembrete criado corretamente

---

**Depois de fazer o deploy, me avise para eu te ajudar a monitorar os logs!** 🚀
