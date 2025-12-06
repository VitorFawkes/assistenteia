import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
        });
    }

    try {
        const { input } = await req.json();
        const apiKey = Deno.env.get('OPENAI_API_KEY');

        if (!apiKey) {
            throw new Error('Missing OPENAI_API_KEY');
        }

        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'text-embedding-3-small',
                input: input,
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`OpenAI API Error: ${err}`);
        }

        const data = await response.json();
        const embedding = data.data[0].embedding;

        return new Response(JSON.stringify({ embedding }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});
