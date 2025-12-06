import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface ProcessMessageRequest {
    content?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'audio' | 'document';
    userId: string;
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            },
        });
    }

    try {
        const { content, mediaUrl, mediaType, userId }: ProcessMessageRequest = await req.json();

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openaiKey) {
            return new Response(
                JSON.stringify({ success: false, error: 'OpenAI API key not configured' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        let processedText = content || '';

        // Process audio if present
        if (mediaUrl && mediaType === 'audio') {
            const audioResponse = await fetch(mediaUrl);
            const audioBlob = await audioResponse.blob();

            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.webm');
            formData.append('model', 'whisper-1');

            const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKey}` },
                body: formData,
            });

            const whisperData = await whisperResponse.json();
            processedText = whisperData.text || '';
        }

        // Simple GPT-4o call with tools
        const messages: any[] = mediaUrl && mediaType === 'image'
            ? [{
                role: 'user', content: [
                    { type: 'text', text: processedText || 'Analise esta imagem' },
                    { type: 'image_url', image_url: { url: mediaUrl } }
                ]
            }]
            : [{ role: 'user', content: processedText }];

        const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: 'Você é um assistente pessoal prestativo' },
                    ...messages
                ],
            }),
        });

        const gptData = await gptResponse.json();
        const aiResponse = gptData.choices?.[0]?.message?.content || 'Desculpe, não consegui processar.';

        return new Response(JSON.stringify({ success: true, response: aiResponse }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
});
