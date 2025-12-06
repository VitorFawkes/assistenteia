import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const openaiKey = Deno.env.get('OPENAI_API_KEY')!;

        // 1. Fetch all items with collection info
        const { data: items, error: fetchError } = await supabase
            .from('collection_items')
            .select(`
        id, 
        content, 
        metadata, 
        created_at, 
        collections (
            user_id, 
            name
        )
      `);

        if (fetchError) throw fetchError;

        let processed = 0;
        let errors = 0;

        console.log(`Found ${items?.length} items to process.`);

        for (const item of items || []) {
            // Skip if no content
            if (!item.content) continue;

            // Construct rich text for embedding
            // e.g. "Folder: Viagem. Content: Hotel booked. Meta: { price: 100 }"
            const collectionName = item.collections?.name || 'General';
            const textToEmbed = `Pasta: ${collectionName}. Conteúdo: ${item.content}. Detalhes: ${JSON.stringify(item.metadata || {})}`;

            try {
                // Generate Embedding
                const response = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openaiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'text-embedding-3-small',
                        input: textToEmbed,
                    }),
                });

                if (!response.ok) {
                    console.error('OpenAI Error:', await response.text());
                    errors++;
                    continue;
                }

                const data = await response.json();
                const embedding = data.data?.[0]?.embedding;

                if (embedding) {
                    // Insert into memory_vectors
                    const { error: insertError } = await supabase.from('memory_vectors').insert({
                        user_id: item.collections?.user_id,
                        content: item.content, // Keep original content clean
                        metadata: {
                            original_id: item.id,
                            collection_name: collectionName,
                            source: 'migration',
                            ...item.metadata
                        },
                        embedding: embedding,
                        created_at: item.created_at
                    });

                    if (insertError) {
                        console.error('Insert Error:', insertError);
                        errors++;
                    } else {
                        processed++;
                    }
                }
            } catch (e) {
                console.error('Error processing item', item.id, e);
                errors++;
            }
        }

        return new Response(JSON.stringify({ success: true, processed, errors }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
