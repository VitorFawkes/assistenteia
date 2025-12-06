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
        const evolutionInstance = Deno.env.get('EVOLUTION_INSTANCE');

        // CRON SECRET AUTHENTICATION
        // Since we don't have the Service Role Key in the code, we use a custom secret
        // to authenticate the cron job securely.
        const CRON_SECRET = "CRON_SECRET_a1b2c3d4e5f6g7h8i9j0";
        const authHeader = req.headers.get('Authorization');
        const cronHeader = req.headers.get('x-cron-secret');

        // Allow if Authorization is valid (Service Role) OR if Cron Secret matches
        const isServiceRole = authHeader?.includes(supabaseKey); // This might not work if key is hidden, but usually we rely on the custom secret for Cron
        const isCronAuthenticated = cronHeader === CRON_SECRET;

        if (!isCronAuthenticated && !isServiceRole) {
            // Fallback: Check if it's a browser request (OPTIONS handled above)
            // But for safety, we reject unauthorized requests
            console.error('⛔ Unauthorized access attempt to check-reminders');
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        console.log('🔔 Checking for overdue reminders...');

        // Get all non-completed reminders that are due
        const { data: overdueReminders, error } = await supabase
            .from('reminders')
            .select('*, users(phone_number)')
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
                const phoneNumber = reminder.users?.phone_number;

                if (!phoneNumber) {
                    console.error(`No phone number for reminder ${reminder.id}`);
                    continue;
                }

                // Send WhatsApp notification
                if (evolutionApiUrl && evolutionApiKey && evolutionInstance) {
                    const message = `🔔 *Lembrete:* ${reminder.title}`;

                    await fetch(`${evolutionApiUrl}/message/sendText/${evolutionInstance}`, {
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

                    console.log(`✅ Sent reminder "${reminder.title}" to ${phoneNumber}`);
                    notificationsSent++;
                }

                // ALWAYS insert into chat history (so it appears in the App)
                await supabase.from('messages').insert({
                    user_id: reminder.user_id,
                    role: 'assistant',
                    content: `🔔 Lembrete: ${reminder.title}`
                });

                // Update reminder based on recurrence type
                if (reminder.recurrence_type === 'once') {
                    // Mark as completed
                    await supabase
                        .from('reminders')
                        .update({ is_completed: true, last_reminded_at: new Date().toISOString() })
                        .eq('id', reminder.id);

                    console.log(`✓ Completed one-time reminder: ${reminder.title}`);
                } else {
                    // Handle recurring reminder
                    const timesReminded = (reminder.times_reminded || 0) + 1;

                    // Check if reached recurrence limit
                    if (reminder.recurrence_count && timesReminded >= reminder.recurrence_count) {
                        await supabase
                            .from('reminders')
                            .update({
                                is_completed: true,
                                last_reminded_at: new Date().toISOString(),
                                times_reminded: timesReminded
                            })
                            .eq('id', reminder.id);

                        console.log(`✓ Completed recurring reminder (reached count): ${reminder.title}`);
                    } else {
                        // Calculate next occurrence
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
                                case 'minutes':
                                    nextDue.setMinutes(nextDue.getMinutes() + interval);
                                    break;
                                case 'hours':
                                    nextDue.setHours(nextDue.getHours() + interval);
                                    break;
                                case 'days':
                                    nextDue.setDate(nextDue.getDate() + interval);
                                    break;
                                case 'weeks':
                                    nextDue.setDate(nextDue.getDate() + (interval * 7));
                                    break;
                                default:
                                    nextDue.setDate(nextDue.getDate() + 1);
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

                        console.log(`↻ Rescheduled recurring reminder "${reminder.title}" to ${nextDue.toISOString()}`);
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

    } catch (error) {
        console.error('Error in check-reminders:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
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
