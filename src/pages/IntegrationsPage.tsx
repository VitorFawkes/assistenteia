import { useEffect, useState } from 'react';
import { Calendar, Check, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';

interface Integration {
    provider: 'google' | 'microsoft';
    created_at: string;
}

export default function IntegrationsPage() {
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchIntegrations();

        // Check for success param in URL
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true') {
            // Clear param
            window.history.replaceState({}, '', window.location.pathname);
            fetchIntegrations();
        }
    }, []);

    const fetchIntegrations = async () => {
        try {
            const { data, error } = await supabase
                .from('user_integrations')
                .select('provider, created_at');

            if (error) throw error;
            setIntegrations(data || []);
        } catch (err: any) {
            console.error('Error fetching integrations:', err);
            setError('Erro ao carregar integrações.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnect = (provider: 'google' | 'microsoft') => {
        const functionUrl = `https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/auth-${provider}/login`;

        // Get current user ID to pass as state
        supabase.auth.getUser().then(({ data }) => {
            if (data.user) {
                // Redirect to the Edge Function login endpoint
                // We pass the user ID as state so the callback knows who it is
                window.location.href = `${functionUrl}?login=true&state=${data.user.id}`;
            }
        });
    };

    const isConnected = (provider: 'google' | 'microsoft') => {
        return integrations.some(i => i.provider === provider);
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-2">Integrações</h1>
            <p className="text-gray-400 mb-8">Conecte seus calendários para permitir que a IA gerencie sua agenda.</p>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 flex items-center gap-3">
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Google Calendar */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 flex flex-col items-center text-center hover:bg-gray-800 transition-colors">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-lg">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar" className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Google Calendar</h3>
                    <p className="text-gray-400 text-sm mb-6">
                        Conecte sua conta do Gmail para ler e criar eventos na sua agenda pessoal.
                    </p>

                    {isLoading ? (
                        <Loader2 className="animate-spin text-gray-500" />
                    ) : isConnected('google') ? (
                        <div className="flex items-center gap-2 text-green-400 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                            <Check size={18} />
                            <span className="font-medium">Conectado</span>
                        </div>
                    ) : (
                        <Button onClick={() => handleConnect('google')} className="w-full bg-blue-600 hover:bg-blue-500">
                            Conectar Google
                        </Button>
                    )}
                </div>

                {/* Microsoft Outlook */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 flex flex-col items-center text-center hover:bg-gray-800 transition-colors">
                    <div className="w-16 h-16 bg-[#0078D4] rounded-full flex items-center justify-center mb-4 shadow-lg">
                        <Calendar className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Microsoft Outlook</h3>
                    <p className="text-gray-400 text-sm mb-6">
                        Conecte sua conta corporativa ou pessoal da Microsoft para gerenciar reuniões de trabalho.
                    </p>

                    {isLoading ? (
                        <Loader2 className="animate-spin text-gray-500" />
                    ) : isConnected('microsoft') ? (
                        <div className="flex items-center gap-2 text-green-400 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                            <Check size={18} />
                            <span className="font-medium">Conectado</span>
                        </div>
                    ) : (
                        <Button onClick={() => handleConnect('microsoft')} className="w-full bg-blue-600 hover:bg-blue-500">
                            Conectar Outlook
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
