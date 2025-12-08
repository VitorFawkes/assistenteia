import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);

Deno.serve(async (req: Request) => {
    try {
        const body = await req.json();
        const { instance, data, event } = body;

        // 1. FILTER: Only process messages.upsert
        if (event !== 'messages.upsert') {
            return new Response(JSON.stringify({ ignored: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        const message = data;
        if (!message || !message.key) {
            return new Response(JSON.stringify({ error: 'No message data' }), { headers: { 'Content-Type': 'application/json' } });
        }

        // LOG INCOMING
        await supabase.from('debug_logs').insert({
            function_name: 'whatsapp-webhook',
            level: 'info',
            message: 'Webhook received',
            meta: { event, instance, key: message.key }
        });

        // 2. FILTER: "Note to Self" ONLY
        // The user explicitly wants this.
        const { fromMe, remoteJid } = message.key;

        // Fetch owner JID to be sure
        let ownerJid = null;
        const { data: instanceData } = await supabase
            .from('whatsapp_instances')
            .select('owner_jid')
            .eq('instance_name', instance)
            .maybeSingle();

        if (instanceData) ownerJid = instanceData.owner_jid;

        // SIMPLIFIED LOGIC: Accept if it's from me (Note to Self) OR from the Owner Number.
        // This covers both scenarios without overcomplicating.

        const isAuthorized = fromMe || (ownerJid && remoteJid === ownerJid);

        if (!isAuthorized) {
            console.log('Ignored: Not authorized. FromMe: ' + fromMe + ', Remote: ' + remoteJid + ', Owner: ' + ownerJid);
            return new Response(JSON.stringify({ ignored: 'not_authorized' }), { headers: { 'Content-Type': 'application/json' } });
        }

        console.log('✅ Processing Message');

        // 3. EXTRACT CONTENT & MEDIA
        const msgContent = message.message;
        if (!msgContent) return new Response(JSON.stringify({ ignored: 'no_content' }));

        let content = '';
        let mediaType = null;
        let mediaBase64 = null;

        // Text
        content = msgContent.conversation || msgContent.extendedTextMessage?.text || '';

        // Audio
        if (msgContent.audioMessage) {
            mediaType = 'audio';
            console.log('🎤 Audio message detected');

            // Strategy: Check payload -> Fallback to Fetch
            if (message.base64) {
                mediaBase64 = message.base64;
                console.log('✅ Base64 found in payload');
            } else {
                console.log('⚠️ Base64 MISSING in payload. Fetching from Evolution...');

                // Call Evolution to get Base64
                // Endpoint: /chat/getBase64FromMediaMessage/{instance}
                // Body: { message: { ... } }
                try {
                    const fetchResponse = await fetch(`${evolutionApiUrl}/chat/getBase64FromMediaMessage/${instance}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': evolutionApiKey
                        },
                        body: JSON.stringify({
                            message: message,
                            convertToMp4: false
                        })
                    });

                    if (fetchResponse.ok) {
                        const fetchData = await fetchResponse.json();
                        if (fetchData.base64) {
                            mediaBase64 = fetchData.base64;
                            console.log('✅ Base64 fetched successfully from Evolution');
                        } else {
                            console.error('❌ Evolution returned no base64');
                        }
                    } else {
                        console.error(`❌ Failed to fetch base64: ${fetchResponse.status}`);
                        const errText = await fetchResponse.text();
                        console.error('Error details:', errText);
                    }
                } catch (e) {
                    console.error('❌ Exception fetching base64:', e);
                }
            }
        }
        // Image (Optional, but good to have)
        else if (msgContent.imageMessage) {
            mediaType = 'image';
            content = msgContent.imageMessage.caption || '';
            // Same logic for image base64 if needed, but focusing on audio for now
        }

        // 4. PREPARE PAYLOAD FOR PROCESS-MESSAGE
        let finalMediaUrl = null;
        if (mediaType === 'audio' && mediaBase64) {
            // Construct Data URI
            // Audio messages are usually ogg/opus
            finalMediaUrl = `data:audio/ogg;base64,${mediaBase64}`;
        }

        // 5. CALL PROCESS-MESSAGE
        // We need the User ID.
        // We already fetched instanceData, but we need user_id.
        const { data: userData } = await supabase
            .from('whatsapp_instances')
            .select('user_id')
            .eq('instance_name', instance)
            .single();

        if (!userData) {
            console.error('❌ Instance not linked to user');
            return new Response(JSON.stringify({ error: 'Instance not linked' }), { status: 500 });
        }

        console.log(`🚀 Forwarding to process-message. Content: "${content}", Media: ${mediaType}`);

        // 4.5 INSERT MESSAGE INTO DATABASE (Fix for visibility)
        // We must save the user's message so it appears in the chat history
        const { data: insertedMessage, error: insertError } = await supabase.from('messages').insert({
            user_id: userData.user_id,
            role: 'user',
            content: content || (mediaType ? `[${mediaType.toUpperCase()}]` : null),
            media_url: finalMediaUrl || null, // Prefer Data URI if available
            media_type: mediaType || null
        }).select('id').single();

        if (insertError) {
            console.error('❌ Error saving user message to DB:', insertError);
            // We continue even if save fails, to ensure AI still replies? 
            // Or we stop? Let's log and continue, but it's a critical failure for UI visibility.
            await supabase.from('debug_logs').insert({
                function_name: 'whatsapp-webhook',
                level: 'error',
                message: 'Failed to save user message',
                meta: { error: insertError }
            });
        } else {
            console.log('✅ User message saved to DB:', insertedMessage?.id);
        }

        await supabase.from('debug_logs').insert({
            function_name: 'whatsapp-webhook',
            level: 'info',
            message: 'Forwarding to process-message',
            meta: { content, mediaType, userId: userData.user_id, messageId: insertedMessage?.id }
        });

        // Call the Edge Function
        const { data: processData, error: processError } = await supabase.functions.invoke('process-message', {
            body: {
                content: content,
                mediaUrl: finalMediaUrl,
                mediaType: mediaType,
                userId: userData.user_id,
                messageId: insertedMessage?.id
            }
        });

        if (processError) {
            console.error('❌ Error invoking process-message:', processError);
            throw processError;
        }

        if (processData && processData.response) {
            console.log('🤖 AI Response:', processData.response);

            // Send response back via Evolution API
            const sendResponse = await fetch(`${evolutionApiUrl}/message/sendText/${instance}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': evolutionApiKey
                },
                body: JSON.stringify({
                    number: remoteJid,
                    text: processData.response,
                    delay: 1200,
                    linkPreview: true
                })
            });

            if (!sendResponse.ok) {
                console.error('❌ Failed to send WhatsApp response:', await sendResponse.text());
            } else {
                console.log('✅ Response sent to WhatsApp');
            }
        }

        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error: any) {
        console.error('CRITICAL WEBHOOK ERROR:', error);
        await supabase.from('debug_logs').insert({
            function_name: 'whatsapp-webhook',
            level: 'error',
            message: 'Critical Error',
            meta: { error: error.message }
        });
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});
