import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (_req: Request) => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
        const evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE');

        // Buscar lembretes que precisam ser notificados
        const now = new Date().toISOString();

        const { data: reminders, error } = await supabase
            .from('reminders')
            .select('id, user_id, title, description, due_at')
            .lte('due_at', now)
            .eq('notified', false)
            .eq('is_completed', false)
            .limit(50);

        if (error) {
            console.error('Error fetching reminders:', error);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (!reminders || reminders.length === 0) {
            return new Response(JSON.stringify({ message: 'No reminders to notify', count: 0 }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let notifiedCount = 0;

        for (const reminder of reminders) {
            try {
                // Mensagem simples, sem markdown ou emojis
                const messageContent = `Lembrete: ${reminder.title}${reminder.description ? '\n' + reminder.description : ''}`;

                // Enviar mensagem no app
                await supabase.from('messages').insert({
                    user_id: reminder.user_id,
                    role: 'assistant',
                    content: messageContent,
                });

                // Enviar via WhatsApp se configurado
                if (evolutionApiUrl && evolutionApiKey && evolutionInstance) {
                    // Buscar número do usuário
                    const { data: userData } = await supabase
                        .from('users')
                        .select('phone_number')
                        .eq('id', reminder.user_id)
                        .maybeSingle();

                    if (userData?.phone_number) {
                        try {
                            const whatsappResponse = await fetch(`${evolutionApiUrl}/message/sendText/${evolutionInstance}`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'apikey': evolutionApiKey,
                                },
                                body: JSON.stringify({
                                    number: userData.phone_number,
                                    text: messageContent,
                                }),
                            });

                            const whatsappResult = await whatsappResponse.json();
                            console.log(`WhatsApp sent to ${userData.phone_number}:`, whatsappResult);
                        } catch (whatsappError) {
                            console.error('WhatsApp error:', whatsappError);
                        }
                    } else {
                        console.log(`No phone number for user ${reminder.user_id}`);
                    }
                }

                // Marcar como notificado
                await supabase
                    .from('reminders')
                    .update({
                        notified: true,
                        notification_sent_at: new Date().toISOString(),
                    })
                    .eq('id', reminder.id);

                notifiedCount++;
            } catch (reminderError) {
                console.error(`Error notifying reminder ${reminder.id}:`, reminderError);
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: `Notified ${notifiedCount} reminders`,
                count: notifiedCount,
            }),
            {
                headers: { 'Content-Type': 'application/json' },
            }
        );
    } catch (error) {
        console.error('Cron job error:', error);
        return new Response(
            JSON.stringify({ success: false, error: (error as Error).message }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
});
