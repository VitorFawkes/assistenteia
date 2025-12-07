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

        // 1. IDENTIFY INSTANCE / USER
        // Evolution sends 'instance' in the payload
        const instanceName = body.instance;
        if (!instanceName) {
            console.log('Ignored: No instance name in payload');
            return new Response(JSON.stringify({ ignored: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        // Find user by instance name (which is the user_id)
        const { data: instanceData } = await supabase
            .from('whatsapp_instances')
            .select('user_id')
            .eq('instance_name', instanceName)
            .maybeSingle();

        if (!instanceData) {
            console.error(`Unknown instance: ${instanceName}`);
            return new Response(JSON.stringify({ error: 'Unknown instance' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        const userId = instanceData.user_id;
        console.log(`✅ Message for User ID: ${userId}`);

        const event = body.event;

        if (event === 'messages.upsert') {
            const data = body.data;
            const message = data;

            // Ignorar mensagens enviadas pela própria assistente (fromMe)
            if (message.key?.fromMe) {
                return new Response(JSON.stringify({ success: true, ignored: 'fromMe' }), {
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // Extrair texto
            let messageText = message.message?.conversation ||
                message.message?.extendedTextMessage?.text ||
                message.message?.imageMessage?.caption ||
                '';

            // Extrair mídia
            let mediaUrl = null;
            let mediaType = null;

            if (message.message?.imageMessage) {
                mediaType = 'image';
                mediaUrl = message.message.imageMessage.url;
            } else if (message.message?.audioMessage) {
                console.log('🎙️ Audio message received');
                const transcribedText = data.speechToText ||
                    body.speechToText ||
                    data.message?.speechToText ||
                    message.message?.audioMessage?.speechToText;

                mediaType = 'audio';
                mediaUrl = message.message.audioMessage.url;

                if (transcribedText) {
                    console.log('✅ Evolution speechToText found:', transcribedText);
                    messageText = transcribedText;
                } else {
                    console.warn('⚠️ No speechToText from Evolution - Whisper will attempt fallback');
                    messageText = '[Áudio sem transcrição - tentando Whisper...]';
                }
            } else if (message.message?.documentMessage) {
                mediaType = 'document';
                mediaUrl = message.message.documentMessage.url;
                if (!messageText) messageText = message.message.documentMessage.fileName || 'Documento';
            }

            if (!messageText && !mediaUrl) {
                return new Response(JSON.stringify({ success: false, error: 'Empty message' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            // Verificar duplicidade (idempotência)
            const { data: existingMessage } = await supabase
                .from('messages')
                .select('id')
                .eq('user_id', userId)
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
                user_id: userId,
                role: 'user',
                content: messageText + (mediaType ? ` [${mediaType}]` : ''),
                media_url: mediaUrl,
                media_type: mediaType
            });

            // Processar com IA
            // Passamos o userId para o process-message saber quem é
            const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({
                    content: messageText,
                    userId: userId,
                    mediaUrl,
                    mediaType,
                }),
            });

            const processResult = await processResponse.json();

            if (processResult.success && processResult.response) {
                // Salvar resposta da IA
                await supabase.from('messages').insert({
                    user_id: userId,
                    role: 'assistant',
                    content: processResult.response,
                });

                // Enviar resposta via WhatsApp USANDO A INSTÂNCIA DO USUÁRIO
                const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
                const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

                // O número de destino é quem enviou a mensagem (remoteJid)
                const remoteJid = message.key?.remoteJid;

                if (evolutionApiUrl && evolutionApiKey && remoteJid) {
                    try {
                        await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': evolutionApiKey,
                            },
                            body: JSON.stringify({
                                number: remoteJid.replace(/\D/g, ''), // Limpa o número
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
