import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, CheckCircle, Smartphone } from 'lucide-react';
import Button from './ui/Button';

interface WhatsAppConnectionProps {
    userId: string;
}

export default function WhatsAppConnection({ userId }: WhatsAppConnectionProps) {
    const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [instanceName, setInstanceName] = useState<string | null>(null);

    useEffect(() => {
        checkInstanceStatus();

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
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId]);

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
                setInstanceName(data.instance_name);
            }
        } catch (error) {
            console.error('Error checking status:', error);
        }
    };

    const handleConnect = async () => {
        setIsLoading(true);
        try {
            // 1. Create or Get Instance in DB
            // We use a deterministic name: user_{userId}
            const targetInstanceName = `user_${userId}`;

            // Call Edge Function to Init Instance (via Evolution API)
            // We'll create a new function 'manage-whatsapp' to handle this safely
            // For now, let's assume we call a function or use the existing whatsapp-manager if adaptable.
            // Let's use 'whatsapp-manager' but we need to update it first.
            // Wait, we don't have 'whatsapp-manager' in the file list provided earlier?
            // Ah, we do: whatsapp-manager/index.ts.

            // Check session first
            const { data: { session } } = await supabase.auth.getSession();
            console.log('Current Session:', session ? 'Valid' : 'Null', 'User:', session?.user?.id);

            if (!session) {
                alert('Sessão expirada. Por favor, faça login novamente.');
                return;
            }

            const { error } = await supabase.functions.invoke('whatsapp-manager', {
                body: {
                    action: 'create_instance',
                    userId: userId,
                    instanceName: targetInstanceName,
                    type: 'user_personal'
                }
            });

            if (error) throw error;

            setInstanceName(targetInstanceName);
            // Status will update via Realtime

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
        } catch (error) {
            console.error('Error disconnecting:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-green-500/10 rounded-xl">
                    <Smartphone className="w-6 h-6 text-green-400" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-white">Conectar WhatsApp Pessoal</h3>
                    <p className="text-sm text-gray-400">
                        Conecte seu próprio número para a IA ler suas mensagens e grupos.
                    </p>
                </div>
            </div>

            <div className="flex flex-col items-center justify-center p-6 bg-gray-900/50 rounded-xl border border-gray-700 border-dashed">

                {isLoading ? (
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        <p className="text-gray-400">Processando...</p>
                    </div>
                ) : status === 'connected' ? (
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-8 h-8 text-green-500" />
                        </div>
                        <div className="text-center">
                            <p className="text-white font-medium">Conectado com Sucesso!</p>
                            <p className="text-sm text-gray-500">Instância: {instanceName}</p>
                        </div>
                        <Button
                            variant="danger"
                            onClick={handleDisconnect}
                            className="mt-2"
                        >
                            Desconectar
                        </Button>
                    </div>
                ) : status === 'connecting' && qrCode ? (
                    <div className="flex flex-col items-center gap-4">
                        <div className="bg-white p-4 rounded-xl">
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
                        <p className="text-gray-400 text-sm text-center max-w-xs">
                            Abra o WhatsApp no seu celular, vá em <strong>Aparelhos Conectados {'>'} Conectar Aparelho</strong> e escaneie o código.
                        </p>
                        <Button
                            variant="secondary"
                            onClick={() => setStatus('disconnected')} // Cancel
                            className="mt-2"
                        >
                            Cancelar
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4">
                        <p className="text-gray-400 text-center">
                            Nenhum WhatsApp conectado.
                        </p>
                        <Button
                            onClick={handleConnect}
                            className="bg-green-600 hover:bg-green-500 text-white"
                        >
                            Gerar QR Code
                        </Button>
                    </div>
                )}

            </div>
        </div>
    );
}
