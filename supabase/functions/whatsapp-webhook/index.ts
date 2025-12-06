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

            // Melhorar extração do número de telefone para suportar LID e JidAlt
            let phoneNumber = message.key?.remoteJid;

            if (message.key?.remoteJidAlt && message.key.remoteJidAlt.includes('@s.whatsapp.net')) {
                phoneNumber = message.key.remoteJidAlt;
            }

            phoneNumber = phoneNumber?.replace('@s.whatsapp.net', '').replace('@lid', '');

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

            // Verificar duplicidade (idempotência)
            const { data: existingMessage } = await supabase
                .from('messages')
                .select('id')
                .eq('user_id', user.id)
                .eq('content', messageText + (mediaType ? ` [${mediaType}]` : ''))
                .eq('role', 'user')
                .gt('created_at', new Date(Date.now() - 10000).toISOString()) // 10 segundos atrás
                .maybeSingle();

            if (existingMessage) {
                console.log('Duplicate message detected, ignoring:', messageText);
                return new Response(JSON.stringify({ success: true, ignored: 'duplicate' }), {
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
