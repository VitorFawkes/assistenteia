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
    const path = url.pathname.split('/').pop(); // 'login' or 'callback'

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const REDIRECT_URI = `${url.origin}/auth-google/callback`;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return new Response(JSON.stringify({ error: 'Google credentials not configured' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // --- LOGIN: Redirect to Google ---
    if (path === 'login' || url.searchParams.has('login')) {
        const scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/gmail.modify'
        ].join(' ');

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;

        return new Response(null, {
            status: 302,
            headers: { ...corsHeaders, Location: authUrl },
        });
    }

    // --- CALLBACK: Exchange code for token ---
    if (path === 'callback' || url.searchParams.has('code')) {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
            return new Response(`Error from Google: ${error}`, { status: 400 });
        }

        if (!code) {
            return new Response('Missing code parameter', { status: 400 });
        }

        try {
            // Exchange code for tokens
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: GOOGLE_CLIENT_ID,
                    client_secret: GOOGLE_CLIENT_SECRET,
                    redirect_uri: REDIRECT_URI,
                    grant_type: 'authorization_code',
                }),
            });

            const tokens = await tokenResponse.json();

            if (tokens.error) {
                throw new Error(tokens.error_description || tokens.error);
            }

            // Get User Info to identify the user (or use state param if we passed it)
            // Ideally we should pass the user_id in the 'state' param during login.
            // For now, let's assume we can get the user from the Supabase session if we were calling from the frontend,
            // BUT this is a callback from Google, so we don't have the user's session headers directly unless we pass it in state.

            // BETTER APPROACH: The frontend calls 'login' and gets the URL. The frontend redirects. 
            // The callback comes back to the frontend? Or to the backend?
            // If backend: We need to know WHICH user this is.
            // Standard way: Pass `state={userId}` in the auth URL.

            // Let's check if we have state
            // Decode state
            const state = url.searchParams.get('state');
            if (!state) return new Response('Missing state', { status: 400 });

            let userId, redirectTo;
            try {
                const decoded = JSON.parse(atob(state));
                userId = decoded.userId;
                redirectTo = decoded.redirectTo;
            } catch (e) {
                // Fallback for old state format (just userId)
                userId = state;
                redirectTo = 'https://bvjfiismidgzmdmrotee.supabase.co/integrations?success=true';
            }

            // Save to Supabase
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseKey);

            const { error: dbError } = await supabase
                .from('user_integrations')
                .upsert({
                    user_id: userId,
                    provider: 'google',
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token, // Google only sends this on first consent!
                    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, provider' });

            if (dbError) throw dbError;

            // Redirect back to the app
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
