import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, CheckCircle, Smartphone } from 'lucide-react';
import Button from './ui/Button';

interface WhatsAppConnectionProps {
    userId: string;
    onConnected?: () => void;
}

export default function WhatsAppConnection({ userId, onConnected }: WhatsAppConnectionProps) {
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [instanceName, setInstanceName] = useState<string | null>(null);
    const [method, setMethod] = useState<'qr' | 'phone'>('qr');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [pairingCode, setPairingCode] = useState<string | null>(null);

    const checkInstanceStatus = async () => {
        try {
            const { data } = await supabase
                .from('whatsapp_instances')
                .select('*')
                .eq('user_id', userId)
                .eq('type', 'user_personal')
                .maybeSingle();

            if (data) {
                setStatus(data.status);
                setQrCode(data.qr_code);
                setPairingCode((data as any).pairing_code as string | null);
                setInstanceName(data.instance_name);
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
    };

    const syncWithEvolution = async () => {
        try {
            console.log('Syncing status with Evolution...');
            const { error } = await supabase.functions.invoke('whatsapp-manager', {
                body: {
                    action: 'get_status',
                    instanceName: `user_${userId}`,
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

    useEffect(() => {
        // Initial check and sync
        checkInstanceStatus();
        syncWithEvolution();

        // Polling for status updates (Backup for Webhook)
        // We poll the BACKEND to force a check against Evolution
        let pollInterval: any;
        if (status === 'connecting') {
            pollInterval = setInterval(() => {
                syncWithEvolution();
            }, 3000);
        }

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
                        setStatus(newData.status);
                        setQrCode(newData.qr_code);
                        setPairingCode(newData.pairing_code);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [userId, status]);

    const handleConnect = async () => {
        if (method === 'phone' && !phoneNumber) {
            alert('Por favor, digite seu número de WhatsApp.');
            return;
        }

        setIsLoading(true);
        try {
            // 1. Create or Get Instance in DB
            // We use a deterministic name: user_{userId}
            const targetInstanceName = `user_${userId}`;

            // Check session first
            const { data: { session } } = await supabase.auth.getSession();
            console.log('Current Session:', session ? 'Valid' : 'Null', 'User:', session?.user?.id);

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
                    instanceName: targetInstanceName,
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
                }
            }

            setInstanceName(targetInstanceName);

        } catch (error) {
            console.error('Error connecting:', error);
            alert('Erro ao iniciar conexão. Tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('Tem certeza que deseja desconectar?')) return;
        setIsLoading(true);
        try {
            const { error } = await supabase.functions.invoke('whatsapp-manager', {
                body: {
                    action: 'delete_instance',
                    instanceName: instanceName
                }
            });

            if (error) throw error;

            setStatus('disconnected');
            setQrCode(null);
            setPairingCode(null);
        } catch (error) {
            console.error('Error disconnecting:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white border border-ela-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-green-50 rounded-xl">
                    <Smartphone className="w-6 h-6 text-green-500" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-ela-text">Conectar WhatsApp Pessoal</h3>
                    <p className="text-sm text-ela-sub">
                        Conecte seu próprio número para a IA ler suas mensagens e grupos.
                    </p>
                </div>
            </div>

            <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-xl border border-gray-100 border-dashed">

                {isLoading ? (
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-ela-pink" />
                        <p className="text-ela-sub">Processando...</p>
                    </div>
                ) : status === 'connected' ? (
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-8 h-8 text-green-500" />
                        </div>
                        <div className="text-center">
                            <p className="text-ela-text font-medium">Conectado com Sucesso!</p>
                            <p className="text-sm text-ela-sub">Instância: {instanceName}</p>
                        </div>
                        <Button
                            variant="danger"
                            onClick={handleDisconnect}
                            className="mt-2"
                        >
                            Desconectar
                        </Button>
                    </div>
                ) : status === 'connecting' ? (
                    <div className="flex flex-col items-center gap-4 w-full">
                        {pairingCode ? (
                            <div className="text-center w-full">
                                <p className="text-ela-sub mb-4">Digite este código no seu WhatsApp:</p>
                                <div className="flex justify-center gap-2 mb-6">
                                    {pairingCode.split('').map((char, i) => (
                                        <div key={i} className="w-10 h-12 flex items-center justify-center bg-white border border-ela-border rounded text-xl font-mono text-ela-text shadow-sm">
                                            {char}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-ela-sub mb-4">
                                    Abra o WhatsApp {'>'} Aparelhos Conectados {'>'} Conectar Aparelho {'>'} Conectar com número de telefone
                                </p>
                            </div>
                        ) : qrCode ? (
                            <div className="flex flex-col items-center gap-4">
                                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                    {qrCode.length > 200 || qrCode.startsWith('data:') ? (
                                        <img
                                            src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                                            alt="QR Code WhatsApp"
                                            className="w-[200px] h-[200px]"
                                        />
                                    ) : (
                                        <QRCodeSVG value={qrCode} size={200} />
                                    )}
                                </div>
                                <p className="text-ela-sub text-sm text-center max-w-xs">
                                    Abra o WhatsApp no seu celular, vá em <strong className="text-ela-text">Aparelhos Conectados {'>'} Conectar Aparelho</strong> e escaneie o código.
                                </p>
                            </div>
                        ) : (
                            <p className="text-ela-sub">Aguardando conexão...</p>
                        )}

                        <Button
                            variant="secondary"
                            onClick={() => setStatus('disconnected')}
                            className="mt-2"
                        >
                            Cancelar
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                        <div className="flex bg-gray-100 p-1 rounded-lg w-full mb-2">
                            <button
                                onClick={() => setMethod('qr')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${method === 'qr' ? 'bg-white text-ela-text shadow-sm' : 'text-ela-sub hover:text-ela-text'
                                    }`}
                            >
                                QR Code
                            </button>
                            <button
                                onClick={() => setMethod('phone')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${method === 'phone' ? 'bg-white text-ela-text shadow-sm' : 'text-ela-sub hover:text-ela-text'
                                    }`}
                            >
                                Número de Telefone
                            </button>
                        </div>

                        {method === 'phone' && (
                            <div className="w-full">
                                <label className="block text-xs text-ela-sub mb-1 ml-1">Seu número com DDD (ex: 5511999999999)</label>
                                <input
                                    type="text"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    placeholder="5511999999999"
                                    className="w-full bg-white border border-ela-border rounded-lg px-4 py-2 text-ela-text focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                />
                            </div>
                        )}

                        <Button
                            onClick={handleConnect}
                            className="bg-green-500 hover:bg-green-600 text-white w-full shadow-lg shadow-green-900/20"
                        >
                            {method === 'phone' ? 'Gerar Código de Pareamento' : 'Gerar QR Code'}
                        </Button>
                    </div>
                )}

            </div>
        </div>
    );
}
