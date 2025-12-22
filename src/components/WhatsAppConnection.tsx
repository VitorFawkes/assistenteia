import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, CheckCircle, Smartphone, Trash2 } from 'lucide-react';
import Button from './ui/Button';

interface WhatsAppConnectionProps {
    userId: string;
    onConnected?: () => void;
    prefilledPhone?: string;
}

export default function WhatsAppConnection({ userId, onConnected, prefilledPhone }: WhatsAppConnectionProps) {
    const [showSuccess, setShowSuccess] = useState(false);
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'cleaning'>('disconnected');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [pairingCode, setPairingCode] = useState<string | null>(null);
    const [instanceName, setInstanceName] = useState(`user-${userId.slice(0, 8)}`);
    const [isLoading, setIsLoading] = useState(false);
    const [method, setMethod] = useState<'qr' | 'phone'>('qr');
    const [phoneNumber, setPhoneNumber] = useState(prefilledPhone || '');

    const checkInstanceStatus = async () => {
        try {
            const { data } = await supabase
                .from('whatsapp_instances')
                .select('*')
                .eq('user_id', userId)
                .eq('type', 'user_personal')
                .maybeSingle();

            if (data) {
                // If transitioning to connected for the first time in this session, show success
                if (status !== 'connected' && data.status === 'connected') {
                    setShowSuccess(true);
                    setTimeout(() => setShowSuccess(false), 5000);
                }
                setStatus(data.status as any);
                setQrCode(data.qr_code);
                setPairingCode((data as any).pairing_code as string | null);
                if (data.instance_name) setInstanceName(data.instance_name);
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
    };

    const syncWithEvolution = async () => {
        try {
            console.log('Syncing status with Evolution for:', instanceName);
            const { error } = await supabase.functions.invoke('whatsapp-manager', {
                body: {
                    action: 'get_status',
                    instanceName: instanceName,
                    type: 'user_personal'
                }
            });

            if (error) console.error('Sync failed:', error);

            // Always fetch latest DB state after sync attempt
            checkInstanceStatus();
        } catch (e) {
            console.error('Sync error:', e);
        }
    };

    useEffect(() => {
        if (status === 'connected' && onConnected) {
            onConnected();
        }
    }, [status, onConnected]);

    // useEffect para inicialização (só roda uma vez por userId)
    useEffect(() => {
        checkInstanceStatus();
        syncWithEvolution();

        // Real-time subscription for status updates
        const channel = supabase
            .channel('whatsapp_status_changes')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'whatsapp_instances',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    console.log('Real-time update:', payload);
                    const newData = payload.new as any;
                    if (newData.type === 'user_personal') {
                        // Check for transition to connected
                        if (status !== 'connected' && newData.status === 'connected') {
                            setShowSuccess(true);
                            setTimeout(() => setShowSuccess(false), 5000);
                        }
                        setStatus(newData.status);
                        setQrCode(newData.qr_code);
                        setPairingCode(newData.pairing_code);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, status]); // Added status to dependency to correctly detect transition

    // useEffect separado para polling (apenas quando status é 'connecting')
    useEffect(() => {
        let pollInterval: any;
        if (status === 'connecting') {
            pollInterval = setInterval(() => {
                syncWithEvolution();
            }, 3000);
        }

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [status]);

    const handleConnect = async () => {
        if (method === 'phone' && !phoneNumber) {
            alert('Por favor, digite seu número de WhatsApp.');
            return;
        }

        setIsLoading(true);
        setStatus('cleaning'); // Show cleaning state immediately

        try {
            // Check session first
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                alert('Sessão expirada. Por favor, faça login novamente.');
                return;
            }

            // Clean phone number if using phone method
            const formattedPhone = method === 'phone'
                ? phoneNumber.replace(/\D/g, '')
                : undefined;

            const { data, error } = await supabase.functions.invoke('whatsapp-manager', {
                body: {
                    action: 'create_instance',
                    userId: userId,
                    instanceName: instanceName,
                    type: 'user_personal',
                    phoneNumber: formattedPhone
                }
            });

            if (error) throw error;

            if (data) {
                if (data.pairing_code) {
                    setPairingCode(data.pairing_code);
                    setStatus('connecting');
                } else if (data.qr_code) {
                    setQrCode(data.qr_code);
                    setStatus('connecting');
                } else if (data.status === 'connected') {
                    setStatus('connected');
                    setShowSuccess(true);
                }
            }

        } catch (error) {
            console.error('Error connecting:', error);
            alert('Erro ao iniciar conexão. Tente novamente.');
            setStatus('disconnected');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisconnect = async () => {
        // Evitar double-click
        if (isLoading) return;
        if (!confirm('Tem certeza que deseja desconectar?')) return;

        setIsLoading(true);
        setStatus('cleaning'); // Show cleaning state

        try {
            console.log('🗑️ Iniciando desconexão da instância:', instanceName);

            const { error } = await supabase.functions.invoke('whatsapp-manager', {
                body: {
                    action: 'delete_instance',
                    instanceName: instanceName
                }
            });

            if (error) {
                console.error('❌ Erro na Edge Function:', error);
                throw error;
            }

            console.log('✅ Desconexão bem sucedida');
            setStatus('disconnected');
            setQrCode(null);
            setPairingCode(null);
        } catch (error) {
            console.error('Error disconnecting:', error);
            alert('Erro ao desconectar. Tente novamente.');
            setStatus('connected'); // Revert on error
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white border border-ela-border rounded-2xl p-6 shadow-sm relative overflow-hidden">
            {showSuccess && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50">
                    <div className="absolute inset-0 bg-green-500/10 animate-pulse"></div>
                </div>
            )}

            <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className={`p-3 rounded-xl transition-colors duration-500 ${status === 'connected' ? 'bg-green-100' : 'bg-green-50'}`}>
                    <Smartphone className={`w-6 h-6 transition-colors duration-500 ${status === 'connected' ? 'text-green-600' : 'text-green-500'}`} />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-ela-text">Conectar WhatsApp Pessoal</h3>
                    <p className="text-sm text-ela-sub">
                        Conecte seu próprio número para a IA ler suas mensagens e grupos.
                    </p>
                </div>
            </div>

            <div className={`flex flex-col items-center justify-center p-6 bg-gray-50/50 rounded-xl border border-dashed min-h-[300px] transition-all duration-500 ${status === 'connected' ? 'border-green-200 bg-green-50/30' : 'border-ela-border'
                }`}>

                {isLoading || status === 'cleaning' ? (
                    <div className="flex flex-col items-center gap-3 animate-in fade-in duration-300">
                        <Loader2 className="w-8 h-8 animate-spin text-ela-pink" />
                        <p className="text-ela-sub font-medium">
                            {status === 'cleaning' ? 'Limpando sessão antiga...' : 'Processando...'}
                        </p>
                        <p className="text-xs text-ela-sub/70">Isso pode levar alguns segundos.</p>
                    </div>
                ) : status === 'connected' ? (
                    <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-500">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center border-4 border-green-50 shadow-sm relative">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                            {showSuccess && (
                                <div className="absolute inset-0 rounded-full animate-ping bg-green-400/20"></div>
                            )}
                        </div>
                        <div className="text-center">
                            <h4 className="text-xl font-bold text-green-700 mb-1">Conectado!</h4>
                            <p className="text-ela-sub">Sua IA agora está ativa no WhatsApp.</p>
                            <p className="text-xs text-ela-sub/70 mt-1 font-mono bg-white/50 px-2 py-1 rounded inline-block">ID: {instanceName}</p>
                        </div>
                        <Button
                            variant="danger"
                            onClick={handleDisconnect}
                            isLoading={isLoading}
                            disabled={isLoading}
                            className="mt-4 flex items-center gap-2"
                        >
                            <Trash2 className="w-4 h-4" />
                            Desconectar
                        </Button>
                    </div>
                ) : status === 'connecting' ? (
                    <div className="flex flex-col items-center gap-4 w-full animate-in slide-in-from-bottom-4 duration-300">
                        {pairingCode ? (
                            <div className="text-center w-full">
                                <p className="text-ela-sub mb-4 font-medium">Digite este código no seu WhatsApp:</p>
                                <div className="flex justify-center gap-2 mb-6">
                                    {pairingCode.split('').map((char, i) => (
                                        <div key={i} className="w-12 h-14 flex items-center justify-center bg-white border-2 border-ela-pink/20 rounded-xl text-2xl font-bold font-mono text-ela-text shadow-sm animate-in zoom-in duration-300" style={{ animationDelay: `${i * 50}ms` }}>
                                            {char}
                                        </div>
                                    ))}
                                </div>
                                <div className="bg-blue-50 p-4 rounded-lg text-left text-sm text-blue-800 border border-blue-100 max-w-sm mx-auto">
                                    <p className="font-semibold mb-1">Como conectar:</p>
                                    <ol className="list-decimal list-inside space-y-1 opacity-90">
                                        <li>Abra o WhatsApp no celular</li>
                                        <li>Vá em <strong>Configurações</strong> {'>'} <strong>Aparelhos Conectados</strong></li>
                                        <li>Toque em <strong>Conectar Aparelho</strong></li>
                                        <li>Escolha <strong>Conectar com número de telefone</strong></li>
                                    </ol>
                                </div>
                            </div>
                        ) : qrCode ? (
                            <div className="flex flex-col items-center gap-6">
                                <div className="relative group">
                                    <div className="absolute -inset-1 bg-gradient-to-r from-ela-pink to-purple-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                                    <div className="relative bg-white p-4 rounded-2xl border border-ela-border shadow-sm">
                                        {qrCode.length > 200 || qrCode.startsWith('data:') ? (
                                            <img
                                                src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                                                alt="QR Code WhatsApp"
                                                className="w-[220px] h-[220px]"
                                            />
                                        ) : (
                                            <QRCodeSVG value={qrCode} size={220} />
                                        )}

                                        {/* Scan Line Animation */}
                                        <div className="absolute inset-x-4 top-4 h-0.5 bg-ela-pink/50 shadow-[0_0_8px_rgba(236,72,153,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                                    </div>
                                </div>
                                <div className="text-center space-y-2">
                                    <p className="text-ela-text font-medium">Escaneie o QR Code</p>
                                    <p className="text-ela-sub text-sm max-w-xs mx-auto">
                                        Abra o WhatsApp {'>'} Configurações {'>'} Aparelhos Conectados {'>'} Conectar Aparelho
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="w-8 h-8 animate-spin text-ela-sub" />
                                <p className="text-ela-sub">Aguardando conexão...</p>
                            </div>
                        )}

                        <Button
                            variant="secondary"
                            onClick={handleDisconnect}
                            isLoading={isLoading}
                            disabled={isLoading}
                            className="mt-2"
                        >
                            Cancelar
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4 w-full max-w-sm animate-in fade-in duration-300">
                        <div className="flex bg-gray-100/50 p-1 rounded-xl w-full mb-2 border border-ela-border">
                            <button
                                onClick={() => setMethod('qr')}
                                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${method === 'qr' ? 'bg-white text-ela-text shadow-sm' : 'text-ela-sub hover:text-ela-text'
                                    }`}
                            >
                                QR Code
                            </button>
                            <button
                                onClick={() => setMethod('phone')}
                                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${method === 'phone' ? 'bg-white text-ela-text shadow-sm' : 'text-ela-sub hover:text-ela-text'
                                    }`}
                            >
                                Número de Telefone
                            </button>
                        </div>

                        {method === 'phone' && (
                            <div className="w-full animate-in slide-in-from-top-2 duration-200">
                                <label className="block text-xs text-ela-sub mb-1 ml-1">Seu número com DDD (ex: 5511999999999)</label>
                                <input
                                    type="text"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    placeholder="5511999999999"
                                    className="w-full bg-white border border-ela-border rounded-xl px-4 py-2 text-ela-text focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none shadow-sm transition-all"
                                />
                            </div>
                        )}

                        <Button
                            onClick={handleConnect}
                            className="bg-green-500 hover:bg-green-600 text-white w-full shadow-lg shadow-green-900/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            {method === 'phone' ? 'Gerar Código de Pareamento' : 'Gerar QR Code'}
                        </Button>
                    </div>
                )}

            </div>

            <style>{`
                @keyframes scan {
                    0%, 100% { top: 1rem; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    50% { top: calc(100% - 1rem); }
                }
            `}</style>
        </div>
    );
}
