import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
    const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
    const REDIRECT_URI = `${url.origin}/auth-microsoft/callback`;

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
        return new Response(JSON.stringify({ error: 'Microsoft credentials not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // --- LOGIN ---
    if (path === 'login' || url.searchParams.has('login')) {
        const scopes = [
            'Calendars.ReadWrite',
            'User.Read',
            'Mail.ReadWrite',
            'Mail.Send',
            'offline_access'
        ].join(' ');

        const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${MICROSOFT_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_mode=query&scope=${encodeURIComponent(scopes)}&state=${url.searchParams.get('state') || ''}`;

        return new Response(null, {
            status: 302,
            headers: { ...corsHeaders, Location: authUrl },
        });
    }

    // --- CALLBACK ---
    if (path === 'callback' || url.searchParams.has('code')) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const state = url.searchParams.get('state');

        if (error) return new Response(`Error from Microsoft: ${error}`, { status: 400 });
        if (!code) return new Response('Missing code', { status: 400 });
        if (!state) return new Response('Missing state (user_id)', { status: 400 });

        try {
            const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: MICROSOFT_CLIENT_ID,
                    scope: 'Calendars.ReadWrite User.Read Mail.ReadWrite Mail.Send offline_access',
                    code,
                    redirect_uri: REDIRECT_URI,
                    grant_type: 'authorization_code',
                    client_secret: MICROSOFT_CLIENT_SECRET,
                }),
            });

            const tokens = await tokenResponse.json();
            if (tokens.error) throw new Error(tokens.error_description || tokens.error);

            // Decode state
            let userId, redirectTo;
            try {
                const decoded = JSON.parse(atob(state));
                userId = decoded.userId;
                redirectTo = decoded.redirectTo;
            } catch (e) {
                userId = state;
                redirectTo = 'https://bvjfiismidgzmdmrotee.supabase.co/integrations?success=true';
            }

            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseKey);

            const { error: dbError } = await supabase
                .from('user_integrations')
                .upsert({
                    user_id: userId,
                    provider: 'microsoft',
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, provider' });

            if (dbError) throw dbError;

            const redirectUrl = new URL(redirectTo);
            redirectUrl.searchParams.set('success', 'true');

            return new Response(null, {
                status: 302,
                headers: { Location: redirectUrl.toString() }
            });

        } catch (err: any) {
            return new Response(`Error: ${err.message}`, { status: 500 });
        }
    }

    return new Response('Not Found', { status: 404 });
});
