import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'sonner';

// Initialize Supabase client (Singleton pattern for this hook)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface RealtimeOptions {
    table: string;
    event?: EventType;
    filter?: string;
    schema?: string;
}

/**
 * Hook to subscribe to Supabase Realtime changes
 * @param options Configuration for the subscription
 * @param callback Function to execute when an event occurs
 */
export function useRealtimeSubscription(
    options: RealtimeOptions,
    callback: (payload: any) => void
) {
    useEffect(() => {
        const { table, event = '*', filter, schema = 'public' } = options;

        const channelName = `public:${table}:${event}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes' as any, // Cast to any to avoid overload mismatch
                {
                    event,
                    schema,
                    table,
                    filter,
                },
                (payload: any) => { // Explicitly type payload as any
                    // console.log(`🔄 Realtime update on ${table}:`, payload);
                    callback(payload);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [options.table, options.event, options.filter, options.schema]); // Re-subscribe if options change
}

/**
 * Helper to show toast notifications for AI actions
 */
export const notifyAIAction = (message: string) => {
    toast.success(message, {
        style: {
            background: '#FDF2F8', // Rose-50
            border: '1px solid #FECDD3', // Rose-200
            color: '#BE123C', // Rose-700
        },
        icon: '🤖',
        duration: 4000
    });
};
