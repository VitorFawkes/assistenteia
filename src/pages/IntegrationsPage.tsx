import { useEffect, useState } from 'react';
import { Calendar, Check, AlertCircle, Loader2, Smartphone, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';

interface Integration {
    provider: 'google' | 'microsoft';
    created_at: string;
}

interface WhatsAppInstance {
    status: 'connecting' | 'connected' | 'disconnected';
    qr_code?: string;
}

export default function IntegrationsPage() {
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [whatsapp, setWhatsapp] = useState<WhatsAppInstance | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isWhatsappLoading, setIsWhatsappLoading] = useState(false);

    const [qrTimer, setQrTimer] = useState(40);
    const [showRefresh, setShowRefresh] = useState(false);

    useEffect(() => {
        fetchIntegrations();
        fetchWhatsappStatus();

        // Check for success param in URL
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'true') {
            window.history.replaceState({}, '', window.location.pathname);
            fetchIntegrations();
        }

        // Poll WhatsApp status if connecting
        const interval = setInterval(() => {
            if (whatsapp?.status === 'connecting') {
                fetchWhatsappStatus();
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [whatsapp?.status]);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (whatsapp?.status === 'connecting' && whatsapp.qr_code && !showRefresh) {
            setQrTimer(40);
            timer = setInterval(() => {
                setQrTimer((prev) => {
                    if (prev <= 1) {
                        setShowRefresh(true);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            setQrTimer(40);
            setShowRefresh(false);
        }
        return () => clearInterval(timer);
    }, [whatsapp?.status, whatsapp?.qr_code, showRefresh]); // Reset when status/QR changes or refresh is triggered

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

    const fetchWhatsappStatus = async () => {
        try {
            const { data } = await supabase
                .from('whatsapp_instances')
                .select('status, qr_code')
                .maybeSingle();

            if (data) {
                setWhatsapp(data as WhatsAppInstance);
            } else {
                setWhatsapp(null);
            }
        } catch (err) {
            console.error('Error fetching WhatsApp status:', err);
        }
    };

    const handleConnectCalendar = (provider: 'google' | 'microsoft') => {
        const functionUrl = `https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/auth-${provider}/login`;
        supabase.auth.getUser().then(({ data }) => {
            if (data.user) {
                window.location.href = `${functionUrl}?login=true&state=${data.user.id}`;
            }
        });
    };

    const handleConnectWhatsapp = async () => {
        setIsWhatsappLoading(true);
        setError(null);
        setShowRefresh(false); // Reset refresh state
        setQrTimer(40); // Reset timer
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await fetch('https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/whatsapp-manager', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ action: 'create_instance' })
            });

            const result = await response.json();
            if (!result.success) throw new Error(result.error);

            fetchWhatsappStatus();
        } catch (err: any) {
            setError(err.message || 'Erro ao conectar WhatsApp');
        } finally {
            setIsWhatsappLoading(false);
        }
    };

    const handleDisconnectWhatsapp = async () => {
        if (!confirm('Tem certeza que deseja desconectar o WhatsApp?')) return;

        setIsWhatsappLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            await fetch('https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/whatsapp-manager', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ action: 'delete_instance' })
            });

            setWhatsapp(null);
        } catch (err: any) {
            setError('Erro ao desconectar.');
        } finally {
            setIsWhatsappLoading(false);
        }
    };

    const isConnected = (provider: 'google' | 'microsoft') => {
        return integrations.some(i => i.provider === provider);
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-white mb-2">Integrações</h1>
            <p className="text-gray-400 mb-8">Conecte seus serviços para potencializar sua assistente.</p>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 flex items-center gap-3">
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* WhatsApp Card */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 flex flex-col items-center text-center hover:bg-gray-800 transition-colors md:col-span-2">
                    <div className="w-16 h-16 bg-[#25D366] rounded-full flex items-center justify-center mb-4 shadow-lg">
                        <Smartphone className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">WhatsApp</h3>
                    <p className="text-gray-400 text-sm mb-6 max-w-md">
                        Conecte seu WhatsApp para conversar com a assistente diretamente pelo app de mensagens.
                    </p>

                    {isWhatsappLoading ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="animate-spin text-gray-500 w-8 h-8" />
                            <p className="text-sm text-gray-400">Gerando QR Code...</p>
                        </div>
                    ) : whatsapp?.status === 'connected' ? (
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex items-center gap-2 text-green-400 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                                <Check size={18} />
                                <span className="font-medium">Conectado</span>
                            </div>
                            <Button variant="ghost" onClick={handleDisconnectWhatsapp} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                                <Trash2 size={16} className="mr-2" /> Desconectar
                            </Button>
                        </div>
                    ) : whatsapp?.status === 'connecting' && whatsapp.qr_code ? (
                        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in relative">
                            <div className={`bg-white p-2 rounded-lg transition-all duration-300 ${showRefresh ? 'blur-sm opacity-50' : ''}`}>
                                <img
                                    src={whatsapp.qr_code.startsWith('data:image') ? whatsapp.qr_code : `data:image/png;base64,${whatsapp.qr_code}`}
                                    alt="QR Code"
                                    className="w-48 h-48"
                                />
                            </div>

                            {showRefresh && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Button onClick={handleConnectWhatsapp} className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg">
                                        Atualizar QR Code
                                    </Button>
                                </div>
                            )}

                            {!showRefresh && (
                                <p className="text-sm text-gray-300">
                                    Atualiza em {qrTimer}s
                                </p>
                            )}
                            <p className="text-sm text-gray-400">Escaneie o QR Code com seu WhatsApp</p>
                        </div>
                    ) : (
                        <Button onClick={handleConnectWhatsapp} className="bg-[#25D366] hover:bg-[#20bd5a] text-white px-8">
                            Conectar WhatsApp
                        </Button>
                    )}
                </div>

                {/* Google Calendar */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 flex flex-col items-center text-center hover:bg-gray-800 transition-colors">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-lg">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" alt="Google Calendar" className="w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">Google Calendar</h3>
                    <p className="text-gray-400 text-sm mb-6">
                        Conecte sua conta do Gmail para ler e criar eventos.
                    </p>

                    {isLoading ? (
                        <Loader2 className="animate-spin text-gray-500" />
                    ) : isConnected('google') ? (
                        <div className="flex items-center gap-2 text-green-400 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                            <Check size={18} />
                            <span className="font-medium">Conectado</span>
                        </div>
                    ) : (
                        <Button onClick={() => handleConnectCalendar('google')} className="w-full bg-blue-600 hover:bg-blue-500">
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
                        Conecte sua conta corporativa ou pessoal da Microsoft.
                    </p>

                    {isLoading ? (
                        <Loader2 className="animate-spin text-gray-500" />
                    ) : isConnected('microsoft') ? (
                        <div className="flex items-center gap-2 text-green-400 bg-green-500/10 px-4 py-2 rounded-full border border-green-500/20">
                            <Check size={18} />
                            <span className="font-medium">Conectado</span>
                        </div>
                    ) : (
                        <Button onClick={() => handleConnectCalendar('microsoft')} className="w-full bg-blue-600 hover:bg-blue-500">
                            Conectar Outlook
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
