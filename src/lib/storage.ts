import { supabase } from './supabase';

export async function uploadFileToStorage(
    file: File,
    userId: string
): Promise<{ url: string; error: null } | { url: null; error: string }> {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;

        const { data, error } = await supabase.storage
            .from('chat-media')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false,
            });

        if (error) {
            console.error('Upload error:', error);
            return { url: null, error: error.message };
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('chat-media')
            .getPublicUrl(data.path);

        return { url: urlData.publicUrl, error: null };
    } catch (error) {
        console.error('Upload exception:', error);
        return { url: null, error: 'Failed to upload file' };
    }
}

export async function processMessage(
    content: string,
    userId: string,
    mediaUrl?: string,
    mediaType?: 'image' | 'audio' | 'document'
): Promise<{ success: boolean; response?: string; error?: string; action?: string }> {
    try {
        const { data, error } = await supabase.functions.invoke('process-message', {
            body: {
                content,
                mediaUrl,
                mediaType,
                userId,
            },
        });

        if (error) {
            console.error('Edge function error:', error);
            return { success: false, error: error.message };
        }

        return data;
    } catch (error) {
        console.error('Process message exception:', error);
        return { success: false, error: 'Failed to process message' };
    }
}
