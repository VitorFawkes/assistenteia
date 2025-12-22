import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to upload media
async function uploadMediaToStorage(base64: string, mimeType: string, folder: string, fileName: string) {
    try {
        // Convert Base64 to Uint8Array
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const filePath = `${folder}/${fileName}`;
        const { data, error } = await supabase.storage
            .from('whatsapp-media')
            .upload(filePath, bytes, {
                contentType: mimeType,
                upsert: true
            });

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage
            .from('whatsapp-media')
            .getPublicUrl(filePath);

        return {
            path: filePath,
            publicUrl: publicUrlData.publicUrl,
            size: bytes.length
        };
    } catch (error) {
        console.error('❌ Upload failed:', error);
        return null;
    }
}

// Helper to fetch group info
async function fetchGroupInfo(instanceName: string, groupJid: string) {
    try {
        const res = await fetch(`${evolutionApiUrl}/group/findGroupInfos/${instanceName}?groupJid=${groupJid}`, {
            method: 'GET',
            headers: { 'apikey': evolutionApiKey }
        });
        if (res.ok) {
            const data = await res.json();
            return data.subject || null; // 'subject' is usually the group name
        }
    } catch (e) {
        console.error('Error fetching group info:', e);
    }
    return null;
}

Deno.serve(async (req: Request) => {
    try {
        const body = await req.json();
        const { event, instance, data } = body;

        // --- CATCH-ALL DEBUG LOGGING ---
        // Log every event to debug_logs for observability
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        await supabase.from('debug_logs').insert({
            function_name: 'whatsapp-webhook',
            level: 'debug',
            message: `Event: ${event}`,
            meta: { event, instance, data_summary: Array.isArray(data) ? `${data.length} items` : 'object' }
        });
        // -------------------------------

        console.log(`📩 Webhook received: ${event} from instance ${instance}`);

        // 0. HANDLE CONNECTION UPDATES
        if (event === 'CONNECTION_UPDATE') {
            const { state } = data;
            console.log(`🔌 Connection Update for ${instance}: ${state}`);

            let newStatus = 'disconnected';
            if (state === 'open') newStatus = 'connected';
            else if (state === 'connecting') newStatus = 'connecting';

            await supabase
                .from('whatsapp_instances')
                .update({
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq('instance_name', instance);

            return new Response(JSON.stringify({ success: true, status: newStatus }), { headers: { 'Content-Type': 'application/json' } });
        }

        // 1. FILTER: Only process messages.upsert, messages.update OR chats.update
        if (event !== 'messages.upsert' && event !== 'messages.update' && event !== 'chats.update') {
            return new Response(JSON.stringify({ ignored: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        const message = data;
        if (!message) {
            return new Response(JSON.stringify({ error: 'No message data' }), { headers: { 'Content-Type': 'application/json' } });
        }

        // LOG INCOMING
        await supabase.from('debug_logs').insert({
            function_name: 'whatsapp-webhook',
            level: 'info',
            message: 'Webhook received',
            meta: {
                event,
                instance,
                key: message.key || (Array.isArray(message) ? 'batch_update' : 'unknown'),
                remoteJid: message.key?.remoteJid,
                fromMe: message.key?.fromMe
            }
        });

        // 1.5 FETCH INSTANCE DATA (Early)
        const { data: instanceData } = await supabase
            .from('whatsapp_instances')
            .select('user_id, type, settings')
            .eq('instance_name', instance)
            .single();

        if (!instanceData) {
            console.error(`❌ Instance ${instance} not found in DB`);
            return new Response(JSON.stringify({ error: 'Instance not found' }), { status: 404 });
        }

        // --- HANDLE STATUS UPDATES ---
        if (event === 'messages.update') {
            // Fetch settings to check if tracking is enabled
            if (instanceData?.user_id) {
                const { data: settings } = await supabase
                    .from('user_settings')
                    .select('storage_track_status')
                    .eq('user_id', instanceData.user_id)
                    .single();

                if (settings?.storage_track_status === false) {
                    console.log('🚫 Status tracking disabled by user preference.');
                    return new Response(JSON.stringify({ ignored: 'tracking_disabled' }), { headers: { 'Content-Type': 'application/json' } });
                }
            }

            const updates = Array.isArray(data) ? data : [data];
            for (const update of updates) {
                // Log to DB for inspection
                await supabase.from('debug_logs').insert({
                    function_name: 'whatsapp-webhook',
                    level: 'info',
                    message: 'Processing Status Update',
                    meta: { update }
                });

                // Handle Evolution API flat format
                let waMessageId = update.key?.id;
                let statusRaw = update.update?.status;

                // Fallback for flat structure (seen in logs)
                if (!waMessageId && update.keyId) {
                    waMessageId = update.keyId;
                    statusRaw = update.status;
                }

                if (!waMessageId || !statusRaw) {
                    continue;
                }

                let newStatus = null;

                // Map numeric statuses (Baileys)
                if (typeof statusRaw === 'number') {
                    const statusMap: Record<number, string> = {
                        2: 'sent',
                        3: 'delivered',
                        4: 'read',
                        5: 'read' // Played
                    };
                    newStatus = statusMap[statusRaw];
                }
                // Map string statuses (Evolution)
                else if (typeof statusRaw === 'string') {
                    const s = statusRaw.toUpperCase();
                    if (s.includes('SENT') || s.includes('SERVER_ACK')) newStatus = 'sent';
                    else if (s.includes('DELIVERY')) newStatus = 'delivered';
                    else if (s.includes('READ') || s.includes('PLAYED')) newStatus = 'read';
                }

                if (newStatus) {
                    console.log(`📨 Status Update: Msg ${waMessageId} -> ${newStatus}`);
                    await supabase
                        .from('messages')
                        .update({ status: newStatus })
                        .eq('wa_message_id', waMessageId);
                }
            }
            return new Response(JSON.stringify({ success: true, type: 'status_update' }), { headers: { 'Content-Type': 'application/json' } });
        }



        // 2. CHECK INSTANCE TYPE & EXTRACT JID
        // For upsert, message is an object with key
        if (!message.key) {
            // If we are here and it's not status update, it might be an issue, or maybe we just return
            // But we already filtered events.

            // FIX: Handle chats.update which is an array and has no key
            if (event === 'chats.update') {
                console.log('ℹ️ Chats Update received. Ignoring as it contains no message content.');
                return new Response(JSON.stringify({ ignored: 'chats_update' }), { headers: { 'Content-Type': 'application/json' } });
            }

            // If it's upsert, it MUST have key.
            if (event === 'messages.upsert') {
                return new Response(JSON.stringify({ error: 'No message key' }), { headers: { 'Content-Type': 'application/json' } });
            }
            // If it's update, we already handled it and returned.
        }

        const { remoteJid } = message.key;

        const instanceType = instanceData.type || 'assistant'; // Default to assistant
        console.log(`🤖 Instance Type: ${instanceType}`);

        let userData = null;
        let userSettings: any = null;
        let skipAIResponse = false;

        // =================================================================================
        // PATH A: ASSISTANT BOT (Legacy / Shared Bot)
        // Logic: Identify user by their phone number sending the message.
        // =================================================================================
        if (instanceType === 'assistant') {
            // ... (existing assistant logic) ...
            // Extract phone number from JID (remove @s.whatsapp.net)
            const senderPhone = remoteJid.split('@')[0];
            const formattedPhone = '+' + senderPhone;

            console.log(`🔍 [Assistant Mode] Looking up user for phone: ${formattedPhone}`);

            const { data: foundUser, error: userError } = await supabase
                .from('user_settings')
                .select('user_id, bot_mode, ai_name')
                .or(`phone_number.eq.${formattedPhone},phone_number.eq.${senderPhone}`)
                .maybeSingle();

            if (!foundUser || userError) {
                console.log(`❌ User not found for phone ${formattedPhone}. Ignoring.`);
                return new Response(JSON.stringify({ ignored: 'user_not_found' }), { headers: { 'Content-Type': 'application/json' } });
            }
            userData = foundUser;

            // 3. CHECK BOT MODE (PASSIVE VS ACTIVE)
            let shouldProcess = true;
            if (userData.bot_mode === 'mention_only') {
                const msgText = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').toLowerCase();
                const triggers = ['bot', 'assistente', 'ajuda', 'help'];
                const isTriggered = triggers.some(t => msgText.startsWith(t));

                if (!isTriggered) {
                    console.log('💤 Passive Mode: Message did not trigger bot. Ignoring.');
                    shouldProcess = false;
                }
            }

            if (!shouldProcess) {
                return new Response(JSON.stringify({ ignored: 'passive_mode' }), { headers: { 'Content-Type': 'application/json' } });
            }
        }
        // =================================================================================
        // PATH B: USER PERSONAL INSTANCE (New / Multi-Tenant)
        // Logic: The User IS the Instance Owner.
        // =================================================================================
        else if (instanceType === 'user_personal') {
            userData = { user_id: instanceData.user_id }; // The user is the instance owner
            const { fromMe } = message.key;

            console.log(`👤 [Personal Mode] Processing for User ID: ${userData.user_id}`);

            // 1. Fetch User Settings (Phone + Bot Mode)
            const { data: settings } = await supabase
                .from('user_settings')
                .select('phone_number, bot_mode, privacy_read_scope, storage_download_images, storage_download_videos, storage_download_audio, storage_download_documents, storage_track_status, ai_name')
                .eq('user_id', userData.user_id)
                .single();

            userSettings = settings;

            if (!userSettings?.phone_number) {
                console.warn('⚠️ User phone number not found. Cannot verify Note to Self.');
                return new Response(JSON.stringify({ ignored: 'no_phone_number' }), { headers: { 'Content-Type': 'application/json' } });
            }

            // Normalize numbers
            const userPhone = userSettings.phone_number.replace(/\D/g, '');
            const targetPhone = remoteJid.split('@')[0].replace(/\D/g, '');
            const privacyReadScope = userSettings.privacy_read_scope || 'all';

            // LOGIC MATRIX
            const isNoteToSelf = fromMe && targetPhone === userPhone;

            // --- PRIVACY SCOPE CHECK ---
            const isGroup = remoteJid.includes('@g.us');

            if (privacyReadScope === 'none' && !isNoteToSelf) {
                console.log('🛑 Privacy Setting: Ignoring message (Scope: none / Note to Self Only)');
                return new Response(JSON.stringify({ ignored: 'privacy_scope_filtered' }), { headers: { 'Content-Type': 'application/json' } });
            }
            if (privacyReadScope === 'private_only' && isGroup) {
                console.log('🛑 Privacy Setting: Ignoring GROUP message (Scope: private_only)');
                return new Response(JSON.stringify({ ignored: 'privacy_scope_filtered' }), { headers: { 'Content-Type': 'application/json' } });
            }
            if (privacyReadScope === 'groups_only' && !isGroup && !isNoteToSelf) {
                // Allow Note to Self even in groups_only mode? Usually yes, as it's a command interface.
                console.log('🛑 Privacy Setting: Ignoring PRIVATE message (Scope: groups_only)');
                return new Response(JSON.stringify({ ignored: 'privacy_scope_filtered' }), { headers: { 'Content-Type': 'application/json' } });
            }

            if (isNoteToSelf) {
                console.log('🧠 Note to Self detected. AI WILL reply.');
            } else {
                console.log(`🤐 Not a Note to Self (Target: ${targetPhone}). Saving but NOT replying.`);
                skipAIResponse = true;
            }
        }
        console.log(`✅ User identified: ${userData.user_id}`);
        console.log('✅ Processing Message');

        // 3. EXTRACT CONTENT & MEDIA
        const msgContent = message.message;
        if (!msgContent) return new Response(JSON.stringify({ ignored: 'no_content' }));

        // --- HANDLE REACTIONS ---
        if (msgContent.reactionMessage) {
            const reaction = msgContent.reactionMessage;
            const targetId = reaction.key.id;
            const reactorPhone = reaction.key.participant ? reaction.key.participant.split('@')[0] : remoteJid.split('@')[0];
            const emoji = reaction.text;

            console.log(`❤️ Reaction detected: ${emoji} on msg ${targetId} by ${reactorPhone}`);

            // Find original message
            const { data: originalMsg } = await supabase
                .from('messages')
                .select('id')
                .eq('wa_message_id', targetId)
                .maybeSingle();

            if (originalMsg) {
                await supabase.from('message_reactions').upsert({
                    message_id: originalMsg.id,
                    reactor_phone: reactorPhone,
                    reaction: emoji
                }, { onConflict: 'message_id, reactor_phone' });
                console.log('✅ Reaction saved to DB');
            } else {
                console.warn('⚠️ Original message for reaction not found in DB');
            }
            return new Response(JSON.stringify({ success: true, type: 'reaction' }));
        }

        // --- HANDLE EDITS ---
        if (msgContent.protocolMessage && (msgContent.protocolMessage.type === 14 || msgContent.protocolMessage.type === 'EDIT_MESSAGE')) {
            const protocol = msgContent.protocolMessage;
            const targetId = protocol.key.id;
            const editedContent = protocol.editedMessage?.conversation || protocol.editedMessage?.extendedTextMessage?.text;

            if (editedContent) {
                console.log(`✏️ Edit detected on msg ${targetId}: "${editedContent}"`);

                // Find original message
                const { data: originalMsg } = await supabase
                    .from('messages')
                    .select('id, content, original_content')
                    .eq('wa_message_id', targetId)
                    .maybeSingle();

                if (originalMsg) {
                    await supabase.from('messages').update({
                        content: editedContent,
                        is_edited: true,
                        original_content: originalMsg.original_content || originalMsg.content // Keep the very first content
                    }).eq('id', originalMsg.id);
                    console.log('✅ Message updated in DB');
                } else {
                    console.warn('⚠️ Original message for edit not found in DB');
                }
            }
            return new Response(JSON.stringify({ success: true, type: 'edit' }));
        }

        let content = '';
        let mediaType = null;
        let mediaBase64 = null;
        let mimeType = null;
        let fileName = null;

        // Text
        content = msgContent.conversation || msgContent.extendedTextMessage?.text || '';

        // Media Handling Strategy
        const mediaMessage = msgContent.imageMessage || msgContent.videoMessage || msgContent.documentMessage || msgContent.audioMessage || msgContent.stickerMessage;

        // Extract critical metadata early for decision making
        const { fromMe } = message.key;

        // Check User Preferences & Logic
        let shouldDownload = true;

        // 1. User Settings Overrides (Global Disable)
        if (msgContent.imageMessage && userSettings?.storage_download_images === false) shouldDownload = false;
        if (msgContent.videoMessage && userSettings?.storage_download_videos === false) shouldDownload = false;
        if (msgContent.audioMessage && userSettings?.storage_download_audio === false) shouldDownload = false;
        if (msgContent.documentMessage && userSettings?.storage_download_documents === false) shouldDownload = false;

        // 2. NEW RULE: Restrict External Media (except Audio)
        // If message is NOT from me (External/Group) AND it is NOT an audio, DO NOT DOWNLOAD.
        if (!fromMe && !msgContent.audioMessage) {
            shouldDownload = false;
            console.log('🚫 External media (non-audio) skipped to save storage/bandwidth.');
        }

        if (mediaMessage) {
            if (msgContent.imageMessage) { mediaType = 'image'; mimeType = msgContent.imageMessage.mimetype; content = msgContent.imageMessage.caption || ''; }
            else if (msgContent.videoMessage) { mediaType = 'video'; mimeType = msgContent.videoMessage.mimetype; content = msgContent.videoMessage.caption || ''; }
            else if (msgContent.documentMessage) { mediaType = 'document'; mimeType = msgContent.documentMessage.mimetype; fileName = msgContent.documentMessage.fileName; content = msgContent.documentMessage.caption || ''; }
            else if (msgContent.audioMessage) { mediaType = 'audio'; mimeType = msgContent.audioMessage.mimetype; }
            else if (msgContent.stickerMessage) { mediaType = 'sticker'; mimeType = msgContent.stickerMessage.mimetype; }

            console.log(`📎 Media detected: ${mediaType} (${mimeType}). Download allowed: ${shouldDownload}. FromMe: ${fromMe}`);

            // 1. Get Base64 (Only if allowed)
            if (shouldDownload) {
                if (message.base64) {
                    mediaBase64 = message.base64;
                    console.log('✅ Base64 found in payload');
                } else {
                    console.log('⚠️ Base64 MISSING. Fetching from Evolution...');
                    try {
                        const fetchResponse = await fetch(`${evolutionApiUrl}/chat/getBase64FromMediaMessage/${instance}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
                            body: JSON.stringify({ message: message, convertToMp4: false })
                        });

                        if (fetchResponse.ok) {
                            const fetchData = await fetchResponse.json();
                            if (fetchData.base64) {
                                mediaBase64 = fetchData.base64;
                                console.log('✅ Base64 fetched from Evolution');
                            }
                        } else {
                            console.error(`❌ Evolution fetch failed: ${fetchResponse.status}`);
                        }
                    } catch (e) {
                        console.error('❌ Exception fetching base64:', e);
                    }
                }
            } else {
                console.log('🚫 Media download skipped by user preference.');
            }
        }

        // 4. UPLOAD TO STORAGE & PREPARE PAYLOAD
        let finalMediaUrl = null;
        let storagePath = null;
        let fileSize = 0;

        if (mediaType && mediaBase64) {
            // Generate Filename
            const ext = mimeType?.split('/')[1]?.split(';')[0] || 'bin';
            const uniqueId = crypto.randomUUID();
            const safeFileName = fileName || `${mediaType}_${uniqueId}.${ext}`;
            const folder = `${userData.user_id}/${mediaType}s`; // Organize by user and type

            console.log(`📤 Uploading ${mediaType} to Storage...`);
            const uploadResult = await uploadMediaToStorage(mediaBase64, mimeType || 'application/octet-stream', folder, safeFileName);

            if (uploadResult) {
                console.log('✅ Upload success:', uploadResult.publicUrl);
                finalMediaUrl = uploadResult.publicUrl;
                storagePath = uploadResult.path;
                fileSize = uploadResult.size;
            } else {
                console.error('❌ Upload failed. Media will not be saved.');
            }
        } else if (mediaType && !mediaBase64) {
            console.warn('⚠️ Media detected but no Base64 available. Skipping upload.');
        }

        // 5. CALL PROCESS-MESSAGE
        // We already have userData.user_id from step 2.

        console.log(`🚀 Forwarding to process-message. Content: "${content}", Media: ${mediaType}`);

        // 4.5 INSERT MESSAGE INTO DATABASE (ENCRYPTED)
        // Extract Metadata
        const { id: waMessageId, participant } = message.key;
        const pushName = message.pushName || (fromMe ? 'Me' : 'Unknown');
        const isGroup = remoteJid.includes('@g.us');
        const senderNumber = isGroup ? (participant ? participant.split('@')[0] : 'Unknown') : remoteJid.split('@')[0];
        const messageTimestamp = message.messageTimestamp ? new Date(Number(message.messageTimestamp) * 1000).toISOString() : new Date().toISOString();

        // Fetch Group Name if needed
        let groupName = null;
        if (isGroup) {
            groupName = await fetchGroupInfo(instance, remoteJid);
            console.log(`👥 Group Name Fetched: ${groupName}`);
        }

        // Extract Quoted Context
        const contextInfo = message.message?.extendedTextMessage?.contextInfo || message.message?.imageMessage?.contextInfo || message.message?.audioMessage?.contextInfo || message.message?.videoMessage?.contextInfo;
        const quotedMessageId = contextInfo?.stanzaId || null;
        // Try to get quoted text from various message types
        const quotedMessage = contextInfo?.quotedMessage;
        const quotedContent = quotedMessage?.conversation || quotedMessage?.extendedTextMessage?.text || (quotedMessage?.imageMessage ? '[Imagem]' : null) || (quotedMessage?.audioMessage ? '[Áudio]' : null) || (quotedMessage?.videoMessage ? '[Vídeo]' : null) || null;

        const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
        if (!encryptionKey) {
            console.error('❌ CRITICAL: ENCRYPTION_KEY not set. Message will be saved UNENCRYPTED (Fallback).');
        }

        let insertedMessageId = null;

        if (encryptionKey) {
            const { data: rpcData, error: rpcError } = await supabase.rpc('insert_message_encrypted', {
                p_user_id: userData.user_id,
                p_role: 'user',
                p_content: content || (mediaType ? `[${mediaType.toUpperCase()}]` : null),
                p_encryption_key: encryptionKey,
                p_media_url: finalMediaUrl || null,
                p_media_type: mediaType || null,
                p_sender_number: senderNumber,
                p_sender_name: pushName,
                p_group_name: groupName,
                p_is_group: isGroup,
                p_is_from_me: fromMe,
                p_wa_message_id: waMessageId,
                p_message_timestamp: messageTimestamp,
                p_quoted_message_id: quotedMessageId,
                p_quoted_content: quotedContent,
                p_file_path: storagePath,
                p_file_name: fileName,
                p_mime_type: mimeType,

                p_file_size: fileSize
            });

            if (rpcError) {
                console.error('❌ Error saving ENCRYPTED message:', rpcError);
                // Fallback to normal insert? No, fail safe.
                await supabase.from('debug_logs').insert({
                    function_name: 'whatsapp-webhook',
                    level: 'error',
                    message: 'Failed to save encrypted message',
                    meta: { error: rpcError }
                });
            } else {
                insertedMessageId = rpcData;
                console.log('🔒 User message saved ENCRYPTED:', insertedMessageId);
            }
        } else {
            // Fallback: DO NOT Insert Unencrypted
            console.error('❌ CRITICAL: ENCRYPTION_KEY missing. Message NOT saved to database to prevent data leak.');
        }

        // Call Edge Function
        const { data: processData, error: invokeError } = await supabase.functions.invoke('process-message', {
            body: {
                content,
                mediaUrl: finalMediaUrl,
                mediaType,
                userId: userData.user_id,
                messageId: message.key.id,
                // Context for Authority
                is_owner: fromMe,
                sender_name: pushName,
                sender_number: senderNumber,
                is_group: isGroup
            }
        });

        if (invokeError) {
            console.error('❌ Error invoking process-message:', invokeError);
            await supabase.from('debug_logs').insert({
                function_name: 'whatsapp-webhook',
                level: 'error',
                message: 'Error invoking process-message',
                meta: { error: invokeError }
            });
        } else {
            console.log('✅ process-message invoked successfully:', processData);
            await supabase.from('debug_logs').insert({
                function_name: 'whatsapp-webhook',
                level: 'info',
                message: 'process-message invoked successfully',
                meta: { response: processData }
            });
        }

        // Handle AI Response (if any)
        if (!skipAIResponse && processData && processData.response) {
            console.log('🤖 AI Response:', processData.response);

            // RE-FETCH SETTINGS: The AI might have updated its name during process-message.
            // We need the latest name for the prefix.
            if (userData?.user_id) {
                const { data: latestSettings } = await supabase
                    .from('user_settings')
                    .select('ai_name')
                    .eq('user_id', userData.user_id)
                    .single();

                if (latestSettings?.ai_name) {
                    userData.ai_name = latestSettings.ai_name;
                }
            }

            // Send response back via Evolution API
            const sendResponse = await fetch(`${evolutionApiUrl}/message/sendText/${instance}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': evolutionApiKey
                },
                body: JSON.stringify({
                    number: remoteJid,
                    options: { delay: 1200 },
                    text: (userData?.ai_name ? `${userData.ai_name}: ` : '') + processData.response
                })
            });

            const responseText = await sendResponse.text();

            if (!sendResponse.ok) {
                console.error('❌ Failed to send WhatsApp response:', responseText);
                await supabase.from('debug_logs').insert({
                    function_name: 'whatsapp-webhook',
                    level: 'error',
                    message: 'Failed to send WhatsApp response',
                    meta: { error: responseText, statusCode: sendResponse.status }
                });
            } else {
                console.log('✅ Response sent to WhatsApp!');
                await supabase.from('debug_logs').insert({
                    function_name: 'whatsapp-webhook',
                    level: 'info',
                    message: 'Response sent to WhatsApp',
                    meta: { response: responseText, statusCode: sendResponse.status }
                });


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
