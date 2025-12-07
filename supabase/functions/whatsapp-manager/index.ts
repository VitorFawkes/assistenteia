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

        const { action } = await req.json();
        const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY'); // Global Key

        if (!evolutionApiUrl || !evolutionApiKey) {
            throw new Error('Evolution API configuration missing');
        }

        const instanceName = user.id; // Instance Name IS the User ID

        if (action === 'create_instance') {
            console.log(`Creating instance for user ${user.id}...`);

            // 1. Check if instance already exists in DB
            const { data: existing } = await supabase
                .from('whatsapp_instances')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (existing && existing.status === 'connected') {
                return new Response(JSON.stringify({ success: true, status: 'connected', instance: existing }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // 2. Call Evolution API to create instance
            // Endpoint: /instance/create
            const createResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': evolutionApiKey
                },
                body: JSON.stringify({
                    instanceName: instanceName,
                    token: instanceName, // Token can be the same as name for simplicity or generated
                    qrcode: true,
                    integration: "WHATSAPP-BAILEYS"
                })
            });

            const createData = await createResponse.json();
            console.log('Evolution Create Response:', createData);

            // Evolution returns the QR code in the response usually, or we need to fetch it
            // If instance already exists in Evolution but not connected, we might need to fetch QR

            let qrCode = createData.qrcode?.base64;

            if (!qrCode && createData.instance?.status !== 'open') {
                // Try fetching QR specifically if not returned
                const qrResponse = await fetch(`${evolutionApiUrl}/instance/connect/${instanceName}`, {
                    method: 'GET',
                    headers: { 'apikey': evolutionApiKey }
                });
                const qrData = await qrResponse.json();
                qrCode = qrData.base64 || qrData.qrcode;
            }

            // 3. Upsert into DB
            const { error: upsertError } = await supabase
                .from('whatsapp_instances')
                .upsert({
                    user_id: user.id,
                    instance_name: instanceName,
                    status: 'connecting',
                    qr_code: qrCode,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (upsertError) throw upsertError;

            return new Response(JSON.stringify({ success: true, qr_code: qrCode }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'get_status') {
            // 1. Check Evolution API status
            const statusResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
                method: 'GET',
                headers: { 'apikey': evolutionApiKey }
            });

            if (statusResponse.status === 404) {
                return new Response(JSON.stringify({ success: true, status: 'disconnected' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            const statusData = await statusResponse.json();
            // Evolution returns { instance: { state: 'open' } } or similar
            const state = statusData.instance?.state || 'disconnected';

            const isConnected = state === 'open';

            // Update DB
            await supabase
                .from('whatsapp_instances')
                .update({
                    status: isConnected ? 'connected' : 'disconnected',
                    qr_code: isConnected ? null : undefined // Clear QR if connected
                })
                .eq('user_id', user.id);

            return new Response(JSON.stringify({ success: true, status: isConnected ? 'connected' : 'disconnected' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'delete_instance') {
            await fetch(`${evolutionApiUrl}/instance/logout/${instanceName}`, {
                method: 'DELETE',
                headers: { 'apikey': evolutionApiKey }
            });

            // Also delete from Evolution registry to be clean
            await fetch(`${evolutionApiUrl}/instance/delete/${instanceName}`, {
                method: 'DELETE',
                headers: { 'apikey': evolutionApiKey }
            });

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
