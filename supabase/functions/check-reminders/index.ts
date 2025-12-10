import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// This function checks for overdue reminders and sends notifications via WhatsApp
// Should be triggered every minute via cron job or webhook

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
        });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

        // CRON SECRET AUTHENTICATION
        const CRON_SECRET = "CRON_SECRET_a1b2c3d4e5f6g7h8i9j0";
        const authHeader = req.headers.get('Authorization');
        const cronHeader = req.headers.get('x-cron-secret');

        const isServiceRole = authHeader?.includes(supabaseKey);
        const isCronAuthenticated = cronHeader === CRON_SECRET;

        if (!isCronAuthenticated && !isServiceRole) {
            console.error('⛔ Unauthorized access attempt to check-reminders');
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        console.log(`🔔 Checking for overdue reminders... Server Time: ${new Date().toISOString()}`);

        // Get all non-completed reminders that are due
        const { data: overdueReminders, error } = await supabase
            .from('reminders')
            .select('*')
            .eq('is_completed', false)
            .lte('due_at', new Date().toISOString())
            .order('due_at');

        if (error) {
            console.error('Error fetching reminders:', error);
            throw error;
        }

        console.log(`Found ${overdueReminders?.length || 0} overdue reminders`);

        // Log to debug_logs table for visibility
        await supabase.from('debug_logs').insert({
            function_name: 'check-reminders',
            level: 'info',
            message: `Checking reminders run. Found ${overdueReminders?.length || 0} overdue.`,
            meta: {
                server_time: new Date().toISOString(),
                overdue_count: overdueReminders?.length || 0
            }
        });

        let notificationsSent = 0;
        let remindersProcessed = 0;

        for (const reminder of overdueReminders || []) {
            try {
                console.log(`Processing reminder ${reminder.id}: Due ${reminder.due_at}`);

                await supabase.from('debug_logs').insert({
                    function_name: 'check-reminders',
                    level: 'info',
                    message: `Processing reminder: ${reminder.title}`,
                    meta: {
                        reminder_id: reminder.id,
                        due_at: reminder.due_at,
                        server_time: new Date().toISOString()
                    }
                });
                // Fetch instance info manually
                const { data: instanceData } = await supabase
                    .from('whatsapp_instances')
                    .select('instance_name, status')
                    .eq('user_id', reminder.user_id)
                    .maybeSingle();

                const instanceName = instanceData?.instance_name;
                const instanceStatus = instanceData?.status;

                let whatsappSent = false;
                let failureReason = '';

                // Check connection status
                if (!evolutionApiUrl || !evolutionApiKey) {
                    failureReason = 'Configuração de API ausente';
                } else if (!instanceName) {
                    failureReason = 'Instância não encontrada';
                }
                // REMOVED STRICT CHECK: instanceStatus !== 'connected'
                // We will try to send anyway. If it fails, the API will tell us.
                // This prevents issues where DB status is stale but WhatsApp is actually working.

                // Send WhatsApp notification ONLY if instance is connected
                if (!failureReason) {
                    const message = `🔔 *Lembrete:* ${reminder.title}`;

                    // Fetch user phone number manually
                    const { data: userData } = await supabase
                        .from('users')
                        .select('phone_number')
                        .eq('id', reminder.user_id)
                        .single();

                    const phoneNumber = userData?.phone_number;

                    if (phoneNumber) {
                        console.log(`Sending to ${phoneNumber} via ${instanceName}...`);
                        const response = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': evolutionApiKey,
                            },
                            body: JSON.stringify({
                                number: phoneNumber.replace(/\D/g, ''),
                                text: message,
                            }),
                        });

                        if (!response.ok) {
                            const errText = await response.text();
                            console.error(`❌ Failed to send WhatsApp: ${response.status} - ${errText}`);
                            failureReason = `Erro API: ${response.status}`;
                        } else {
                            console.log(`✅ Sent reminder "${reminder.title}" to ${phoneNumber}`);
                            notificationsSent++;
                            whatsappSent = true;
                        }
                    } else {
                        console.warn(`⚠️ No phone number for user ${reminder.user_id}, cannot send WhatsApp.`);
                        failureReason = 'Sem telefone cadastrado';
                    }
                } else {
                    console.log(`⚠️ Skipping WhatsApp for reminder ${reminder.id}: ${failureReason}`);
                }

                // ALWAYS insert into chat history (so it appears in the App)
                // If WhatsApp failed, append the reason to the message
                let chatContent = `🔔 Lembrete: ${reminder.title}`;
                if (!whatsappSent && failureReason) {
                    chatContent += `\n⚠️ (Não enviado no WhatsApp: ${failureReason})`;
                }

                await supabase.from('messages').insert({
                    user_id: reminder.user_id,
                    role: 'assistant',
                    content: chatContent
                });

                // Update reminder based on recurrence type (Same logic as before)
                if (reminder.recurrence_type === 'once') {
                    await supabase
                        .from('reminders')
                        .update({ is_completed: true, last_reminded_at: new Date().toISOString() })
                        .eq('id', reminder.id);
                } else {
                    const timesReminded = (reminder.times_reminded || 0) + 1;

                    if (reminder.recurrence_count && timesReminded >= reminder.recurrence_count) {
                        await supabase
                            .from('reminders')
                            .update({
                                is_completed: true,
                                last_reminded_at: new Date().toISOString(),
                                times_reminded: timesReminded
                            })
                            .eq('id', reminder.id);
                    } else {
                        const currentDue = new Date(reminder.due_at);
                        let nextDue: Date;

                        if (reminder.recurrence_type === 'daily') {
                            nextDue = new Date(currentDue);
                            nextDue.setDate(nextDue.getDate() + 1);
                        } else if (reminder.recurrence_type === 'weekly') {
                            nextDue = new Date(currentDue);
                            nextDue.setDate(nextDue.getDate() + 7);
                        } else if (reminder.recurrence_type === 'custom') {
                            nextDue = new Date(currentDue);
                            const interval = reminder.recurrence_interval || 1;
                            switch (reminder.recurrence_unit) {
                                case 'minutes': nextDue.setMinutes(nextDue.getMinutes() + interval); break;
                                case 'hours': nextDue.setHours(nextDue.getHours() + interval); break;
                                case 'days': nextDue.setDate(nextDue.getDate() + interval); break;
                                case 'weeks': nextDue.setDate(nextDue.getDate() + (interval * 7)); break;
                                default: nextDue.setDate(nextDue.getDate() + 1);
                            }
                        } else {
                            nextDue = new Date(currentDue);
                            nextDue.setDate(nextDue.getDate() + 1);
                        }

                        await supabase
                            .from('reminders')
                            .update({
                                due_at: nextDue.toISOString(),
                                last_reminded_at: new Date().toISOString(),
                                times_reminded: timesReminded
                            })
                            .eq('id', reminder.id);
                    }
                }

                remindersProcessed++;

            } catch (error) {
                console.error(`Error processing reminder ${reminder.id}:`, error);
            }
        }

        console.log(`✅ Check complete: ${notificationsSent} notifications sent, ${remindersProcessed} reminders processed`);

        return new Response(
            JSON.stringify({
                success: true,
                checked: overdueReminders?.length || 0,
                notificationsSent,
                remindersProcessed
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            }
        );

    } catch (error: any) {
        console.error('CRITICAL Error in check-reminders:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message,
                stack: error.stack
            }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            }
        );
    }
});
