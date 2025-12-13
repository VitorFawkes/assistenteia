import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

Deno.serve(async (req: Request) => {
    try {
        const { email } = await req.json();
        if (!email) throw new Error('Email is required');

        console.log(`Searching for user with email: ${email}`);

        // 1. Find User ID
        // We can query auth.users using admin client? No, auth.admin.listUsers() is better or direct query if we have access.
        // Service Role has access to auth schema usually? Not directly via client.from('auth.users').
        // But we can use auth.admin.listUsers() to find by email.

        const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
        if (userError) throw userError;

        const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (!user) {
            return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
        }

        const userId = user.id;
        const instanceName = `user_${userId}`;
        console.log(`Found User ID: ${userId}, Instance: ${instanceName}`);

        // 2. Delete from DB
        const { error: dbError } = await supabase
            .from('whatsapp_instances')
            .delete()
            .eq('user_id', userId);

        if (dbError) console.error('DB Delete Error:', dbError);
        else console.log('Deleted from DB');

        // 3. Delete from Evolution API
        // Logout
        await fetch(`${evolutionApiUrl}/instance/logout/${instanceName}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey }
        });

        // Delete
        const deleteResponse = await fetch(`${evolutionApiUrl}/instance/delete/${instanceName}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey }
        });

        const deleteResult = await deleteResponse.text();
        console.log('Evolution Delete Result:', deleteResult);

        return new Response(JSON.stringify({
            success: true,
            userId,
            instanceName,
            evolutionResult: deleteResult
        }), { headers: { 'Content-Type': 'application/json' } });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
});
