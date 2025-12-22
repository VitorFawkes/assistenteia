import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get User from Auth Header
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Missing Authorization header');

        const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        if (authError || !user) throw new Error('Unauthorized');

        const { action, instanceName: reqInstanceName, type } = await req.json();
        const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

        if (!evolutionApiUrl || !evolutionApiKey) {
            throw new Error('Evolution API configuration missing');
        }

        const instanceName = reqInstanceName || user.id;
        const instanceType = type || 'assistant';

        // --- HELPER: Delete Instance with Verification ---
        const deleteInstance = async (targetName: string) => {
            console.log(`🗑️ [HELPER] Starting robust deletion for ${targetName}...`);

            // 1. Logout
            try {
                await fetch(`${evolutionApiUrl}/instance/logout/${targetName}`, {
                    method: 'DELETE',
                    headers: { 'apikey': evolutionApiKey }
                });
            } catch (e) { /* ignore */ }

            // 2. Delete
            try {
                await fetch(`${evolutionApiUrl}/instance/delete/${targetName}`, {
                    method: 'DELETE',
                    headers: { 'apikey': evolutionApiKey }
                });
            } catch (e) { /* ignore */ }

            // 3. Verify Deletion (Poll until 404)
            let deleted = false;
            for (let i = 0; i < 5; i++) {
                try {
                    const check = await fetch(`${evolutionApiUrl}/instance/connectionState/${targetName}`, {
                        method: 'GET',
                        headers: { 'apikey': evolutionApiKey }
                    });
                    if (check.status === 404) {
                        deleted = true;
                        break;
                    }
                    console.log(`⏳ [HELPER] Instance still exists, waiting... (${i + 1}/5)`);
                    await new Promise(r => setTimeout(r, 1000));
                } catch (e) {
                    // Network error might mean it's gone or server down, assume gone for now to proceed
                    console.warn('⚠️ [HELPER] Error checking status during delete:', e);
                }
            }

            if (!deleted) {
                console.warn(`⚠️ [HELPER] Instance ${targetName} might still exist after deletion attempts.`);
            } else {
                console.log(`✅ [HELPER] Instance ${targetName} confirmed deleted.`);
            }

            return deleted;
        };

        // --- HELPER: Configure Instance ---
        const configureInstance = async (targetName: string) => {
            try {
                console.log(`⚙️ [HELPER] Configuring instance ${targetName}...`);
                const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

                const webhookPayload = {
                    enabled: true,
                    url: webhookUrl,
                    webhookByEvents: false,
                    webhookBase64: true,
                    events: [
                        "QRCODE_UPDATED",
                        "MESSAGES_UPSERT",
                        "MESSAGES_UPDATE",
                        "MESSAGES_DELETE",
                        "CONNECTION_UPDATE"
                    ]
                };

                // Set Webhook
                const webhookResponse = await fetch(`${evolutionApiUrl}/webhook/set/${targetName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
                    body: JSON.stringify(webhookPayload)
                });

                if (!webhookResponse.ok) {
                    console.error(`❌ [HELPER] Failed to set webhook: ${await webhookResponse.text()}`);
                }

                // Set Settings
                await fetch(`${evolutionApiUrl}/settings/set/${targetName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
                    body: JSON.stringify({
                        reject_call: true,
                        msg_call: "Não aceito chamadas de voz/vídeo. Por favor, envie uma mensagem de texto ou áudio.",
                        always_online: false
                    })
                });
                console.log('✅ [HELPER] Instance configured successfully');
            } catch (configError) {
                console.error('⚠️ [HELPER] Error configuring instance:', configError);
            }
        };

        // --- ACTION: CREATE INSTANCE ---
        if (action === 'create_instance') {
            console.log(`🚀 [CREATE] Starting creation for ${instanceName}...`);

            // 1. Check current status
            let evolutionState = 'disconnected';
            let instanceExists = false;

            try {
                const statusResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
                    method: 'GET',
                    headers: { 'apikey': evolutionApiKey }
                });
                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    evolutionState = statusData.instance?.state || 'disconnected';
                    instanceExists = true;
                }
            } catch (err) {
                console.warn('⚠️ [CREATE] Failed to check status:', err);
            }

            console.log(`📊 [CREATE] Current State: ${evolutionState}, Exists: ${instanceExists}`);

            // 2. CLEAN SLATE POLICY
            // If it exists and is NOT 'open' (connected), DESTROY IT.
            // If it exists and IS 'open', we reuse it (but re-configure).
            if (instanceExists && evolutionState !== 'open') {
                console.log(`🧹 [CREATE] Instance exists but is ${evolutionState}. Performing CLEAN SLATE deletion...`);
                await deleteInstance(instanceName);
                instanceExists = false;
            }

            // 3. Create if doesn't exist (or was just deleted)
            if (!instanceExists) {
                console.log(`✨ [CREATE] Creating new instance ${instanceName}...`);
                const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

                const createResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
                    body: JSON.stringify({
                        instanceName: instanceName,
                        token: instanceName,
                        qrcode: true,
                        integration: "WHATSAPP-BAILEYS",
                        webhook: {
                            enabled: true,
                            url: webhookUrl,
                            byEvents: false,
                            base64: true,
                            events: [
                                "QRCODE_UPDATED",
                                "MESSAGES_UPSERT",
                                "MESSAGES_UPDATE",
                                "MESSAGES_DELETE",
                                "CONNECTION_UPDATE",
                                "CHATS_UPDATE"
                            ]
                        }
                    })
                });

                if (!createResponse.ok) {
                    throw new Error(`Failed to create instance: ${await createResponse.text()}`);
                }
            }

            // 4. Force Configuration (Double Check)
            await configureInstance(instanceName);

            // 5. Fetch Connection Data (QR or Code)
            console.log(`📡 [CREATE] Fetching connection data...`);
            let qrCode: string | undefined;
            let pairingCode: string | undefined;

            const { phoneNumber } = await req.json().catch(() => ({}));

            if (phoneNumber) {
                // Pairing Code Flow
                const pairResponse = await fetch(`${evolutionApiUrl}/instance/connect/${instanceName}?number=${phoneNumber}`, {
                    method: 'GET',
                    headers: { 'apikey': evolutionApiKey }
                });
                if (pairResponse.ok) {
                    const pairData = await pairResponse.json();
                    pairingCode = pairData.code || pairData.pairingCode;
                } else {
                    throw new Error(`Failed to get pairing code: ${await pairResponse.text()}`);
                }
            } else {
                // QR Code Flow
                let attempts = 0;
                while (!qrCode && attempts < 5) {
                    attempts++;
                    try {
                        const qrResponse = await fetch(`${evolutionApiUrl}/instance/connect/${instanceName}`, {
                            method: 'GET',
                            headers: { 'apikey': evolutionApiKey }
                        });
                        if (qrResponse.ok) {
                            const qrData = await qrResponse.json();
                            qrCode = qrData.base64 || qrData.qrcode;
                        }
                    } catch (e) { /* ignore */ }

                    if (!qrCode) await new Promise(r => setTimeout(r, 1500));
                }
                if (!qrCode) throw new Error('Failed to generate QR Code.');
            }

            // 6. Update DB
            await supabase.from('whatsapp_instances').upsert({
                user_id: user.id,
                instance_name: instanceName,
                status: 'connecting',
                qr_code: qrCode || null,
                pairing_code: pairingCode || null,
                type: instanceType,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

            return new Response(JSON.stringify({
                success: true,
                qr_code: qrCode,
                pairing_code: pairingCode
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // --- ACTION: DELETE INSTANCE ---
        if (action === 'delete_instance') {
            console.log(`🗑️ [DELETE] Request for user ${user.id}...`);

            // Get real instance name from DB
            const { data: dbInstance } = await supabase
                .from('whatsapp_instances')
                .select('instance_name')
                .eq('user_id', user.id)
                .maybeSingle();

            const targetInstanceName = dbInstance?.instance_name || instanceName;

            // Perform Robust Deletion
            await deleteInstance(targetInstanceName);

            // Clean DB
            const { error: dbError } = await supabase
                .from('whatsapp_instances')
                .delete()
                .eq('user_id', user.id);

            if (dbError) throw dbError;

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: GET STATUS ---
        if (action === 'get_status') {
            // Check Evolution
            let statusData: any = null;
            try {
                const statusResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
                    method: 'GET',
                    headers: { 'apikey': evolutionApiKey }
                });
                if (statusResponse.status === 404) {
                    // Not found in Evolution -> Disconnected in DB
                    await supabase.from('whatsapp_instances').update({ status: 'disconnected', qr_code: null }).eq('user_id', user.id);
                    return new Response(JSON.stringify({ success: true, status: 'disconnected' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                statusData = await statusResponse.json();
            } catch (e) {
                console.error('Error fetching status:', e);
                return new Response(JSON.stringify({ success: false, error: 'Failed to fetch status' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            const state = statusData.instance?.state || statusData.state || 'disconnected';
            const isConnected = state === 'open';

            // Enforce Webhook if Connected
            if (isConnected) {
                // We can do a lightweight check or just re-configure periodically.
                // For now, let's rely on the robust create_instance to have set it up correctly.
                // But if we want to be super safe, we can check here.
            }

            // Update DB
            let newStatus = isConnected ? 'connected' : (state === 'connecting' ? 'connecting' : 'disconnected');
            await supabase.from('whatsapp_instances').update({
                status: newStatus,
                qr_code: isConnected ? null : undefined // Keep QR if connecting
            }).eq('user_id', user.id);

            return new Response(JSON.stringify({ success: true, status: newStatus }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        throw new Error('Invalid action');

    } catch (error: any) {
        console.error('Error in whatsapp-manager:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
