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
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY'); // Global Key

        if (!evolutionApiUrl || !evolutionApiKey) {
            throw new Error('Evolution API configuration missing');
        }

        const instanceName = reqInstanceName || user.id; // Use provided name or default to user.id
        const instanceType = type || 'assistant'; // Default to assistant

        // --- SHARED HELPER: Configure Instance ---
        const configureInstance = async (targetName: string) => {
            try {
                console.log(`Configuring instance ${targetName}...`);
                const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

                // 2. Set Webhook (Clean payload, NO MERGE)
                // Evolution API v2 /webhook/set expects flat camelCase body
                const webhookPayload = {
                    enabled: true,
                    url: webhookUrl,
                    webhookByEvents: true,
                    webhookBase64: true,
                    events: [
                        "QRCODE_UPDATED",
                        "MESSAGES_UPSERT",
                        "MESSAGES_UPDATE",
                        "MESSAGES_DELETE",
                        "CONNECTION_UPDATE"
                    ]
                };

                console.log('Setting Webhook with payload:', JSON.stringify(webhookPayload));

                const webhookResponse = await fetch(`${evolutionApiUrl}/webhook/set/${targetName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
                    body: JSON.stringify(webhookPayload)
                });

                if (!webhookResponse.ok) {
                    const errorText = await webhookResponse.text();
                    console.error(`❌ Failed to set webhook: ${webhookResponse.status} - ${errorText}`);
                } else {
                    const responseData = await webhookResponse.json();
                    console.log('✅ Webhook set response:', JSON.stringify(responseData));
                }

                // 3. Set Settings
                await fetch(`${evolutionApiUrl}/settings/set/${targetName}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
                    body: JSON.stringify({
                        reject_call: true,
                        msg_call: "Não aceito chamadas de voz/vídeo. Por favor, envie uma mensagem de texto ou áudio.",
                        always_online: false
                    })
                });
                console.log('✅ Instance settings configured successfully');
            } catch (configError) {
                console.error('⚠️ Error configuring instance:', configError);
            }
        };
        // -----------------------------------------

        if (action === 'create_instance') {
            console.log(`Creating/Checking instance for user ${user.id}...`);

            // 1. Check Evolution API status first
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
                console.warn('Failed to check Evolution status:', err);
            }

            console.log(`Evolution State: ${evolutionState}, Exists: ${instanceExists}`);

            // 2. Handle Scenarios
            if (instanceExists && evolutionState === 'open') {
                // Already Connected -> Ensure Config & Return
                await configureInstance(instanceName);

                await supabase.from('whatsapp_instances').upsert({
                    user_id: user.id,
                    instance_name: instanceName,
                    status: 'connected',
                    qr_code: null,
                    type: instanceType,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

                return new Response(JSON.stringify({ success: true, status: 'connected' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Scenario B: Exists but Disconnected -> DELETE and RECREATE
            // This ensures we don't get stuck in a zombie state (e.g. 'connecting' forever without QR)
            if (instanceExists && evolutionState !== 'open') {
                console.log(`Instance ${instanceName} exists but is ${evolutionState}. Deleting to start fresh...`);
                try {
                    await fetch(`${evolutionApiUrl}/instance/logout/${instanceName}`, {
                        method: 'DELETE',
                        headers: { 'apikey': evolutionApiKey }
                    });
                } catch (e) { /* ignore */ }

                try {
                    await fetch(`${evolutionApiUrl}/instance/delete/${instanceName}`, {
                        method: 'DELETE',
                        headers: { 'apikey': evolutionApiKey }
                    });
                } catch (e) {
                    console.warn('Failed to delete instance (might already be gone):', e);
                }

                // Wait a bit for Evolution to clean up
                await new Promise(resolve => setTimeout(resolve, 2000));
                instanceExists = false;
            }

            if (!instanceExists) {
                // Create new instance
                console.log(`Creating new instance for ${instanceName}...`);
                const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook`;

                // Evolution API v2 /instance/create expects nested webhook object with base64/byEvents
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
                            byEvents: true, // Correct key for create
                            base64: true,   // Correct key for create
                            events: [
                                "QRCODE_UPDATED",
                                "MESSAGES_UPSERT",
                                "MESSAGES_UPDATE",
                                "MESSAGES_DELETE",
                                "CONNECTION_UPDATE"
                            ]
                        }
                    })
                });

                if (!createResponse.ok) {
                    const errText = await createResponse.text();
                    throw new Error(`Failed to create instance: ${errText}`);
                }

                // FORCE CONFIGURATION IMMEDIATELY AFTER CREATION
                console.log('Force configuring instance after creation...');
                await configureInstance(instanceName);
            }

            // Always configure before fetching QR (Redundant but safe)
            await configureInstance(instanceName);

            // Fetch QR Code OR Pairing Code
            console.log(`Fetching connection data for ${instanceName}...`);
            let qrCode: string | undefined;
            let pairingCode: string | undefined;
            let attempts = 0;
            const maxAttempts = 5;

            // Check if we want Pairing Code (Phone Number provided)
            const { phoneNumber } = await req.json().catch(() => ({}));

            if (phoneNumber) {
                console.log(`Generating Pairing Code for ${phoneNumber}...`);
                try {
                    const pairResponse = await fetch(`${evolutionApiUrl}/instance/connect/${instanceName}?number=${phoneNumber}`, {
                        method: 'GET',
                        headers: { 'apikey': evolutionApiKey }
                    });

                    if (pairResponse.ok) {
                        const pairData = await pairResponse.json();
                        pairingCode = pairData.code || pairData.pairingCode;
                        console.log('Got Pairing Code:', pairingCode);
                    } else {
                        const errText = await pairResponse.text();
                        console.error('Failed to get pairing code:', errText);
                        throw new Error(`Failed to get pairing code: ${errText}`);
                    }
                } catch (e) {
                    console.error('Error fetching pairing code:', e);
                    throw e;
                }
            } else {
                // QR Code Flow
                while (!qrCode && attempts < maxAttempts) {
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
                    } catch (e) {
                        console.warn(`Attempt ${attempts} to fetch QR failed:`, e);
                    }

                    if (!qrCode) {
                        console.log(`QR Code not ready yet, waiting... (${attempts}/${maxAttempts})`);
                        await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5s
                    }
                }

                if (!qrCode) {
                    throw new Error('Failed to generate QR Code after multiple attempts. Please try again.');
                }
            }

            // Upsert Connecting
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
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'get_status') {
            console.log(`Checking status for ${instanceName}...`);

            // 1. Check Evolution API status
            let statusData: any = null;
            let evolutionError = null;

            try {
                const statusResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
                    method: 'GET',
                    headers: { 'apikey': evolutionApiKey }
                });

                if (statusResponse.status === 404) {
                    console.log('Instance not found in Evolution (404)');
                    // Instance doesn't exist in Evolution
                    await supabase
                        .from('whatsapp_instances')
                        .update({ status: 'disconnected', qr_code: null })
                        .eq('user_id', user.id);

                    return new Response(JSON.stringify({ success: true, status: 'disconnected' }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                if (!statusResponse.ok) {
                    throw new Error(`Evolution API error: ${statusResponse.status}`);
                }

                statusData = await statusResponse.json();
                console.log('Evolution Status Response:', JSON.stringify(statusData));

            } catch (err) {
                console.error('Error fetching Evolution status:', err);
                evolutionError = err;
            }

            // If we couldn't get status from Evolution, return current DB status or error
            if (!statusData) {
                return new Response(JSON.stringify({ success: false, error: 'Failed to fetch status from Evolution' }), {
                    status: 500, // Keep 500 so frontend knows it failed
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const state = statusData.instance?.state || statusData.state || 'disconnected';
            const isConnected = state === 'open';

            console.log(`🔍 Status check for ${instanceName}: ${state} (Connected: ${isConnected})`);

            // 2. Check Current DB Status
            const { data: currentDb } = await supabase
                .from('whatsapp_instances')
                .select('status')
                .eq('user_id', user.id)
                .maybeSingle();

            // 3. AGGRESSIVE ENFORCEMENT: Check Webhook Config on EVERY status check
            // The user requires webhookBase64 to be ALWAYS enabled.
            if (isConnected) {
                try {
                    const webhookCheck = await fetch(`${evolutionApiUrl}/webhook/find/${instanceName}`, {
                        method: 'GET',
                        headers: { 'apikey': evolutionApiKey }
                    });

                    let needsConfig = false;
                    if (webhookCheck.ok) {
                        const webhookData = await webhookCheck.json();
                        const currentWebhook = webhookData.webhook || {};

                        // Check if base64 is enabled (handle both casing styles just in case)
                        const isBase64Enabled = currentWebhook.webhookBase64 === true || currentWebhook.webhook_base64 === true;

                        if (!isBase64Enabled) {
                            console.warn('⚠️ Webhook Base64 is DISABLED! Enforcing configuration now...');
                            needsConfig = true;
                        } else {
                            console.log('✅ Webhook Base64 is confirmed enabled.');
                        }
                    } else {
                        console.warn('⚠️ Failed to check webhook config. Enforcing just in case...');
                        needsConfig = true;
                    }

                    if (needsConfig || currentDb?.status !== 'connected') {
                        console.log('🚀 Applying configuration (Enforcement or New Connection)...');
                        await configureInstance(instanceName);
                    }
                } catch (e) {
                    console.error('Error checking webhook config:', e);
                }
            }

            // 4. Update DB
            // Only update if state changed or if we need to clear QR code
            // If Evolution says 'connecting' or 'close', we might want to keep 'connecting' in DB if we just started
            // But if it says 'open', we definitely want 'connected'

            let newStatus = 'disconnected';
            if (isConnected) newStatus = 'connected';
            else if (state === 'connecting') newStatus = 'connecting';

            // If Evolution is 'close' but we are 'connecting', maybe we timed out? 
            // For now, let's trust Evolution. If it says close, it's disconnected.

            await supabase
                .from('whatsapp_instances')
                .update({
                    status: newStatus,
                    qr_code: isConnected ? null : (newStatus === 'connecting' ? currentDb?.qr_code : null)
                })
                .eq('user_id', user.id);

            return new Response(JSON.stringify({ success: true, status: newStatus }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'logout_instance') {
            try {
                await fetch(`${evolutionApiUrl}/instance/logout/${instanceName}`, {
                    method: 'DELETE',
                    headers: { 'apikey': evolutionApiKey }
                });
            } catch (error) {
                console.warn('Logout failed:', error);
            }

            // Update DB to disconnected
            await supabase
                .from('whatsapp_instances')
                .update({ status: 'disconnected', qr_code: null })
                .eq('user_id', user.id);

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'delete_instance') {
            // Try to logout first, but don't fail if it errors (e.g. already disconnected)
            try {
                await fetch(`${evolutionApiUrl}/instance/logout/${instanceName}`, {
                    method: 'DELETE',
                    headers: { 'apikey': evolutionApiKey }
                });
            } catch (logoutError) {
                console.warn('Logout failed (ignoring):', logoutError);
            }

            // Always try to delete from Evolution registry
            try {
                await fetch(`${evolutionApiUrl}/instance/delete/${instanceName}`, {
                    method: 'DELETE',
                    headers: { 'apikey': evolutionApiKey }
                });
            } catch (deleteError) {
                console.warn('Delete from Evolution failed (ignoring):', deleteError);
            }

            // Always delete from our DB
            await supabase.from('whatsapp_instances').delete().eq('user_id', user.id);

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
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
