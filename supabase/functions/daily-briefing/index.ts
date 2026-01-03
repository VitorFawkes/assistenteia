import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
    try {
        const { action } = await req.json().catch(() => ({}));

        // 1. Identify Target Users
        let usersToProcess = [];

        if (action === 'test_now') {
            // Manual Test: Get the user from the Auth Header
            const authHeader = req.headers.get('Authorization');
            if (!authHeader) throw new Error('Missing Authorization header for test');

            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error } = await supabase.auth.getUser(token);

            if (error || !user) throw new Error('Invalid user token');

            // Fetch settings for this user
            const { data: settings } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (settings) usersToProcess.push(settings);

        } else {
            // Cron Job: Find users who want a briefing NOW
            // Get current time in Brasilia (UTC-3)
            const now = new Date();
            const brasiliaTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
            const currentHour = brasiliaTime.getUTCHours();
            const currentMinute = brasiliaTime.getUTCMinutes();

            // We check for users whose scheduled time is within the last hour window
            // Ideally, this runs every hour.
            // Simple logic: matches the hour.

            const { data: settingsList } = await supabase
                .from('user_settings')
                .select('*')
                .eq('daily_briefing_enabled', true);

            if (settingsList) {
                usersToProcess = settingsList.filter(s => {
                    if (!s.daily_briefing_time) return false;
                    const [h] = s.daily_briefing_time.split(':').map(Number);
                    return h === currentHour;
                });
            }
        }

        console.log(`Processing ${usersToProcess.length} users for Daily Briefing...`);

        // 2. Process Each User
        const results = [];

        for (const userSettings of usersToProcess) {
            try {
                const userId = userSettings.user_id;
                const userName = userSettings.preferred_name || 'Usuário';

                // A. Fetch Data
                // Tasks (Todo)
                const { data: tasks } = await supabase
                    .from('tasks')
                    .select('title, priority')
                    .eq('user_id', userId)
                    .eq('status', 'todo');

                // Reminders (Due Today or Overdue)
                const todayStr = new Date().toISOString().split('T')[0];
                const { data: reminders } = await supabase
                    .from('reminders')
                    .select('title, due_date')
                    .eq('user_id', userId)
                    .eq('status', 'pending')
                    .lte('due_date', todayStr + 'T23:59:59');

                // B. Generate Briefing with OpenAI
                const prompt = `
           Você é o assistente pessoal do ${userName}.
           Hoje é ${new Date().toLocaleDateString('pt-BR')}.
           
           Gere um "Resumo Matinal" (Daily Briefing) para o usuário enviar no WhatsApp.
           
           DADOS DO USUÁRIO:
           - Tarefas Pendentes: ${JSON.stringify(tasks || [])}
           - Lembretes para Hoje: ${JSON.stringify(reminders || [])}
           
           PREFERÊNCIAS DO USUÁRIO:
           "${userSettings.daily_briefing_prompt || 'Seja breve e motivador.'}"
           
           INSTRUÇÕES:
           - Comece com uma saudação calorosa.
           - Resuma os principais pontos.
           - Se não houver nada, diga que o dia está livre e sugira relaxar ou adiantar algo.
           - Use emojis.
           - Formate para WhatsApp (*negrito*, quebras de linha).
           - NÃO invente compromissos. Use apenas os dados acima.
           `;

                const completion = await fetch("https://api.openai.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: "gpt-5.1-preview",
                        messages: [{ role: "system", content: prompt }],
                    }),
                });

                const aiResponse = await completion.json();
                const briefingText = aiResponse.choices[0].message.content;

                // C. Send via WhatsApp (Evolution API)
                // We need the instance name and token. Assuming 'vitor_main' for now or fetching from DB if we had multi-tenancy fully set up for outgoing.
                // For now, we use the env vars as per previous tools.

                const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
                const EVOLUTION_API_TOKEN = Deno.env.get("EVOLUTION_API_TOKEN");
                const INSTANCE_NAME = "vitor_main"; // Hardcoded for MVP, should be dynamic

                // Get user phone
                const { data: userData } = await supabase.auth.admin.getUserById(userId);
                // Or check user_settings if we added phone there (we did in previous tasks)
                const userPhone = userSettings.phone_number;

                if (!userPhone) {
                    console.log(`Skipping user ${userId}: No phone number`);
                    continue;
                }

                if (EVOLUTION_API_URL && EVOLUTION_API_TOKEN) {
                    await fetch(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': EVOLUTION_API_TOKEN
                        },
                        body: JSON.stringify({
                            number: userPhone,
                            text: briefingText
                        })
                    });
                    results.push({ userId, status: 'sent' });
                } else {
                    results.push({ userId, status: 'skipped_no_api' });
                }

            } catch (err) {
                console.error(`Error processing user ${userSettings.user_id}:`, err);
                results.push({ userId: userSettings.user_id, status: 'error', error: err.message });
            }
        }

        return new Response(JSON.stringify({ success: true, results }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
