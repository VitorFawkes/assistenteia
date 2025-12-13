import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Auth Check
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Missing Authorization header');

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) throw new Error('Unauthorized');

        const userId = user.id;
        const { action, ...payload } = await req.json().catch(() => ({})); // Handle GET with no body? No, we'll use query params or assume list if GET?
        // Actually, let's stick to POST for RPC-style or handle methods.
        // Let's use a unified POST entry point for simplicity with 'action' param, 
        // OR handle GET/POST/DELETE RESTfully.
        // Given the plan, let's use RESTful-ish but maybe POST for everything is easier for "proxy" logic?
        // Let's try to be RESTful where possible but 'action' in body is easier for complex args.
        // Let's support:
        // GET / -> List events (from query params)
        // POST { action: 'create' } -> Create
        // POST { action: 'delete' } -> Delete (or DELETE method)

        // Let's just use the body 'action' pattern for consistency with other functions.

        // If GET, assume list
        let requestAction = action;
        if (req.method === 'GET') requestAction = 'list';

        // 2. Fetch Integrations
        const { data: integrations } = await supabase
            .from('user_integrations')
            .select('*')
            .eq('user_id', userId)
            .in('provider', ['google', 'microsoft']);

        if (!integrations || integrations.length === 0) {
            return new Response(JSON.stringify({ events: [], error: 'No calendar integrations found' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const results: any[] = [];

        // 3. Process each integration
        for (const integration of integrations) {
            try {
                let accessToken = integration.access_token;
                const expiresAt = new Date(integration.expires_at);
                const now = new Date();
                const isGoogle = integration.provider === 'google';
                const isMicrosoft = integration.provider === 'microsoft';

                // --- REFRESH TOKEN LOGIC ---
                if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
                    console.log(`🔄 Refreshing ${integration.provider} Token...`);
                    let refreshUrl = '';
                    let bodyParams: any = {};

                    if (isGoogle) {
                        refreshUrl = 'https://oauth2.googleapis.com/token';
                        bodyParams = {
                            client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
                            client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
                            refresh_token: integration.refresh_token,
                            grant_type: 'refresh_token',
                        };
                    } else if (isMicrosoft) {
                        refreshUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
                        bodyParams = {
                            client_id: Deno.env.get('MICROSOFT_CLIENT_ID')!,
                            client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET')!,
                            refresh_token: integration.refresh_token,
                            grant_type: 'refresh_token',
                        };
                    }

                    const refreshResponse = await fetch(refreshUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams(bodyParams),
                    });

                    const refreshData = await refreshResponse.json();
                    if (refreshData.error) {
                        console.error(`Error refreshing ${integration.provider}:`, refreshData);
                        continue; // Skip this integration if refresh fails
                    }

                    accessToken = refreshData.access_token;
                    const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

                    await supabase.from('user_integrations').update({
                        access_token: accessToken,
                        expires_at: newExpiresAt,
                        updated_at: new Date().toISOString()
                    }).eq('id', integration.id);
                }

                const headers = {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                };

                // --- EXECUTE ACTION ---
                if (requestAction === 'list') {
                    // Default range: Today to +30 days if not specified
                    const timeMin = payload.start || new Date().toISOString();
                    const timeMax = payload.end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

                    if (isGoogle) {
                        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
                        const res = await fetch(url, { headers });
                        const data = await res.json();

                        if (data.items) {
                            results.push(...data.items.map((e: any) => ({
                                id: e.id,
                                title: e.summary || '(Sem título)',
                                start: e.start.dateTime || e.start.date, // dateTime for timed, date for all-day
                                end: e.end.dateTime || e.end.date,
                                allDay: !e.start.dateTime,
                                provider: 'google',
                                link: e.htmlLink,
                                location: e.location,
                                description: e.description
                            })));
                        }
                    } else if (isMicrosoft) {
                        const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${timeMin}&endDateTime=${timeMax}&$top=50&$select=id,subject,start,end,location,webLink,bodyPreview,isAllDay`;
                        const res = await fetch(url, { headers });
                        const data = await res.json();

                        if (data.value) {
                            results.push(...data.value.map((e: any) => ({
                                id: e.id,
                                title: e.subject || '(Sem título)',
                                start: e.start.dateTime, // Microsoft always returns dateTime + timeZone
                                end: e.end.dateTime,
                                allDay: e.isAllDay,
                                provider: 'microsoft',
                                link: e.webLink,
                                location: e.location.displayName,
                                description: e.bodyPreview
                            })));
                        }
                    }
                }
                else if (requestAction === 'create') {
                    // Only create in ONE provider (the one specified or default to first found)
                    // If payload.provider is set, check match.
                    if (payload.provider && payload.provider !== integration.provider) continue;

                    if (isGoogle) {
                        const event = {
                            summary: payload.title,
                            description: payload.description,
                            start: payload.allDay ? { date: payload.start.split('T')[0] } : { dateTime: payload.start },
                            end: payload.allDay ? { date: payload.end.split('T')[0] } : { dateTime: payload.end },
                            location: payload.location
                        };
                        const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                            method: 'POST', headers, body: JSON.stringify(event)
                        });
                        const data = await res.json();
                        results.push({ provider: 'google', status: 'created', data });
                        break; // Stop after creating in one provider
                    } else if (isMicrosoft) {
                        const event = {
                            subject: payload.title,
                            body: { contentType: 'Text', content: payload.description || '' },
                            start: { dateTime: payload.start, timeZone: 'America/Sao_Paulo' }, // Default TZ?
                            end: { dateTime: payload.end, timeZone: 'America/Sao_Paulo' },
                            location: { displayName: payload.location },
                            isAllDay: payload.allDay
                        };
                        const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
                            method: 'POST', headers, body: JSON.stringify(event)
                        });
                        const data = await res.json();
                        results.push({ provider: 'microsoft', status: 'created', data });
                        break;
                    }
                }
                else if (requestAction === 'delete') {
                    // Need provider and ID
                    if (payload.provider !== integration.provider) continue;

                    if (isGoogle) {
                        await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${payload.id}`, {
                            method: 'DELETE', headers
                        });
                        results.push({ provider: 'google', status: 'deleted', id: payload.id });
                    } else if (isMicrosoft) {
                        await fetch(`https://graph.microsoft.com/v1.0/me/events/${payload.id}`, {
                            method: 'DELETE', headers
                        });
                        results.push({ provider: 'microsoft', status: 'deleted', id: payload.id });
                    }
                }

            } catch (err) {
                console.error(`Error processing ${integration.provider}:`, err);
            }
        }

        return new Response(JSON.stringify({ success: true, data: results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
