import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        // 1. Verify if the requester is an Admin
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Unauthorized');

        const { data: settings } = await supabaseClient
            .from('user_settings')
            .select('is_admin')
            .eq('user_id', user.id)
            .single();

        if (!settings?.is_admin) {
            throw new Error('Forbidden: Admin access required');
        }

        // 2. Initialize Service Role Client for privileged actions
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { action, payload } = await req.json();

        if (action === 'create_user') {
            const { email, password, preferred_name } = payload;

            const { data, error } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { preferred_name }
            });

            if (error) throw error;

            // Create initial settings
            await supabaseAdmin.from('user_settings').insert({
                user_id: data.user.id,
                preferred_name: preferred_name || email.split('@')[0],
                ai_model: 'gpt-4o',
                is_active: true
            });

            return new Response(JSON.stringify({ user: data.user }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (action === 'delete_user') {
            const { user_id } = payload;

            // Prevent self-deletion
            if (user_id === user.id) throw new Error('Cannot delete yourself');

            const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
            if (error) throw error;

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        throw new Error('Invalid action');

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
