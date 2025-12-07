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

        console.log('🔔 Checking for overdue reminders...');

        // Get all non-completed reminders that are due
        // JOIN with whatsapp_instances to get the instance name for each user
        const { data: overdueReminders, error } = await supabase
            .from('reminders')
            .select(`
                *,
                users (id),
                whatsapp_instances (instance_name, status)
            `)
            .eq('is_completed', false)
            .lte('due_at', new Date().toISOString())
            .order('due_at');

        if (error) {
            console.error('Error fetching reminders:', error);
            throw error;
        }

        console.log(`Found ${overdueReminders?.length || 0} overdue reminders`);

        let notificationsSent = 0;
        let remindersProcessed = 0;

        for (const reminder of overdueReminders || []) {
            try {
                const instanceName = reminder.whatsapp_instances?.instance_name;
                const instanceStatus = reminder.whatsapp_instances?.status;

                // Send WhatsApp notification ONLY if instance is connected
                if (evolutionApiUrl && evolutionApiKey && instanceName && instanceStatus === 'connected') {
                    const message = `🔔 *Lembrete:* ${reminder.title}`;

                    // We need the destination number. 
                    // In a perfect world, we'd store the user's phone number in the 'users' table or 'whatsapp_instances'.
                    // For now, we assume the instance is connected to the user's phone, so we can send to "myself" or we need the user's number.
                    // WAIT: Evolution API sends to a number. We need the user's phone number.
                    // The previous code used `users(phone_number)`. Let's check if we still have it.
                    // The `users` table in Supabase Auth usually doesn't expose phone easily unless we have a public `users` table copy.
                    // My previous analysis showed a `users` table in public schema with `phone_number`.

                    // Let's fetch the phone number from the public users table if not in the join
                    const { data: userData } = await supabase
                        .from('users')
                        .select('phone_number')
                        .eq('id', reminder.user_id)
                        .single();

                    const phoneNumber = userData?.phone_number;

                    if (phoneNumber) {
                        await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
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
                        console.log(`✅ Sent reminder "${reminder.title}" to ${phoneNumber} via instance ${instanceName}`);
                        notificationsSent++;
                    } else {
                        console.warn(`⚠️ No phone number for user ${reminder.user_id}, cannot send WhatsApp.`);
                    }
                } else {
                    console.log(`⚠️ Skipping WhatsApp for reminder ${reminder.id}: Instance not connected or missing.`);
                }

                // ALWAYS insert into chat history (so it appears in the App)
                await supabase.from('messages').insert({
                    user_id: reminder.user_id,
                    role: 'assistant',
                    content: `🔔 Lembrete: ${reminder.title}`
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
