import { useEffect, useState } from 'react';
import { Calendar, Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';
import WhatsAppConnection from '../components/WhatsAppConnection';

interface Integration {
    provider: 'google' | 'microsoft';
    created_at: string;
}

export default function IntegrationsPage() {
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        console.log('IntegrationsPage mounted');
        fetchIntegrations();

        // Get User ID
        supabase.auth.getUser().then(({ data }) => {
            console.log('User ID fetched:', data.user?.id);
            if (data.user) setUserId(data.user.id);
        }).catch(err => console.error('Error fetching user:', err));

        // Check for success param in URL
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true') {
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
            setIntegrations((data as unknown as Integration[]) || []);
        } catch (err: any) {
            console.error('Error fetching integrations:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleConnectCalendar = (provider: 'google' | 'microsoft') => {
        const functionUrl = `https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/auth-${provider}/login`;
        supabase.auth.getUser().then(({ data }) => {
            if (data.user) {
                const state = btoa(JSON.stringify({
                    userId: data.user.id,
                    redirectTo: window.location.href
                }));
                window.location.href = `${functionUrl}?login=true&state=${state}`;
            }
        });
    };

    const isConnected = (provider: 'google' | 'microsoft') => {
        return integrations.some(i => i.provider === provider);
    };

    return (
        <div className="p-6 max-w-4xl mx-auto pb-32">
            <h1 className="text-3xl font-bold text-ela-text mb-2">Integrações</h1>
            <p className="text-ela-sub mb-8">Conecte seus serviços para potencializar sua assistente.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* WhatsApp Connection (New Component) */}
                <div className="md:col-span-2">
                    {userId ? (
                        <WhatsAppConnection userId={userId} />
                    ) : (
                        <div className="bg-white border border-ela-border rounded-2xl p-6 flex items-center justify-center shadow-sm">
                            <Loader2 className="animate-spin text-ela-pink" />
                        </div>
                    )}
                </div>

                {/* Google Calendar */}
                <div className="bg-white border border-ela-border rounded-2xl p-6 flex flex-col items-center text-center hover:bg-gray-50 transition-colors shadow-sm">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-md border border-gray-100">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar" className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-semibold text-ela-text mb-2">Google Calendar</h3>
                    <p className="text-ela-sub text-sm mb-6">
                        Conecte sua conta do Gmail para ler e criar eventos.
                    </p>

                    {isLoading ? (
                        <Loader2 className="animate-spin text-ela-pink" />
                    ) : isConnected('google') ? (
                        <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-full border border-green-200">
                            <Check size={18} />
                            <span className="font-medium">Conectado</span>
                        </div>
                    ) : (
                        <Button onClick={() => handleConnectCalendar('google')} className="w-full bg-ela-pink hover:bg-pink-600 text-white shadow-lg shadow-pink-900/20">
                            Conectar Google
                        </Button>
                    )}
                </div>

                {/* Microsoft Outlook */}
                <div className="bg-white border border-ela-border rounded-2xl p-6 flex flex-col items-center text-center hover:bg-gray-50 transition-colors shadow-sm">
                    <div className="w-16 h-16 bg-[#0078D4] rounded-full flex items-center justify-center mb-4 shadow-md">
                        <Calendar className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-ela-text mb-2">Microsoft Outlook</h3>
                    <p className="text-ela-sub text-sm mb-6">
                        Conecte sua conta corporativa ou pessoal da Microsoft.
                    </p>

                    {isLoading ? (
                        <Loader2 className="animate-spin text-ela-pink" />
                    ) : isConnected('microsoft') ? (
                        <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-full border border-green-200">
                            <Check size={18} />
                            <span className="font-medium">Conectado</span>
                        </div>
                    ) : (
                        <Button onClick={() => handleConnectCalendar('microsoft')} className="w-full bg-ela-pink hover:bg-pink-600 text-white shadow-lg shadow-pink-900/20">
                            Conectar Outlook
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
