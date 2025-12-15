import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import WhatsAppConnection from './WhatsAppConnection';
import Button from './ui/Button';
import { User, Smartphone, CheckCircle2, ArrowRight, Bot } from 'lucide-react';

export default function OnboardingModal() {
    const { user } = useAuth();
    const [isVisible, setIsVisible] = useState(false);
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [isLoading, setIsLoading] = useState(true);

    // Form State
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (user) {
            checkSetupStatus();
        }
    }, [user]);

    const checkSetupStatus = async () => {
        try {
            if (!user) return;

            // 1. Check User Settings (Phone)
            const { data: settingsData } = await supabase
                .from('user_settings')
                .select('phone_number, preferred_name')
                .eq('user_id', user.id)
                .maybeSingle();

            const settings = settingsData as any;

            // 2. Check WhatsApp Connection
            const { data: instance } = await supabase
                .from('whatsapp_instances')
                .select('status')
                .eq('user_id', user.id)
                .eq('type', 'user_personal')
                .maybeSingle();

            const hasPhone = !!settings?.phone_number;
            const isConnected = instance?.status === 'connected';

            if (settings?.preferred_name) setName(settings.preferred_name);
            if (settings?.phone_number) setPhone(settings.phone_number.replace('+55', ''));

            if (!hasPhone) {
                setStep(1);
                setIsVisible(true);
            } else if (!isConnected) {
                setStep(2);
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        } catch (error) {
            console.error('Error checking setup:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!phone || !user) return;

        setIsSaving(true);
        try {
            const cleanPhone = phone.replace(/\D/g, '');
            const formattedPhone = cleanPhone.startsWith('55') ? `+${cleanPhone}` : `+55${cleanPhone}`;

            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    preferred_name: name,
                    phone_number: formattedPhone,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) throw error;
            setStep(2);
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('Erro ao salvar perfil. Tente novamente.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleFinish = () => {
        setIsVisible(false);
        window.location.reload(); // Reload to refresh context/state if needed
    };

    if (!isVisible || isLoading) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">

                {/* Header */}
                <div className="bg-gray-800/50 p-6 text-center border-b border-gray-800">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
                        <Bot size={32} className="text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">
                        {step === 1 && 'Bem-vindo!'}
                        {step === 2 && 'Conectar WhatsApp'}
                        {step === 3 && 'Tudo Pronto!'}
                    </h2>
                    <p className="text-gray-400 text-sm">
                        {step === 1 && 'Vamos configurar seu assistente pessoal.'}
                        {step === 2 && 'Escaneie o QR Code para ativar a IA.'}
                        {step === 3 && 'Seu assistente está ativo e pronto para usar.'}
                    </p>
                </div>

                {/* Content */}
                <div className="p-6">
                    {/* Progress Steps */}
                    <div className="flex items-center justify-center gap-2 mb-8">
                        <div className={`h-1.5 rounded-full transition-all duration-300 ${step >= 1 ? 'w-8 bg-blue-500' : 'w-2 bg-gray-700'}`} />
                        <div className={`h-1.5 rounded-full transition-all duration-300 ${step >= 2 ? 'w-8 bg-blue-500' : 'w-2 bg-gray-700'}`} />
                        <div className={`h-1.5 rounded-full transition-all duration-300 ${step >= 3 ? 'w-8 bg-blue-500' : 'w-2 bg-gray-700'}`} />
                    </div>

                    {step === 1 && (
                        <form onSubmit={handleSaveProfile} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Seu Nome</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Como devo te chamar?"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1.5">Seu WhatsApp <span className="text-red-400">*</span></label>
                                <div className="relative">
                                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="11 999999999"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        required
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-2">Necessário para identificar suas mensagens.</p>
                            </div>

                            <Button
                                type="submit"
                                className="w-full justify-center py-3 mt-4 bg-blue-600 hover:bg-blue-500"
                                isLoading={isSaving}
                                icon={ArrowRight}
                            >
                                Continuar
                            </Button>
                        </form>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                                <WhatsAppConnection
                                    userId={user!.id}
                                    onConnected={() => setStep(3)}
                                />
                            </div>
                            <p className="text-xs text-center text-gray-500">
                                Abra o WhatsApp no seu celular {'>'} Menu {'>'} Aparelhos conectados {'>'} Conectar aparelho
                            </p>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="text-center space-y-6 py-4">
                            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto animate-bounce">
                                <CheckCircle2 size={40} className="text-green-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-white">Configuração Concluída!</h3>
                                <p className="text-gray-400">
                                    Agora você pode conversar com sua IA diretamente pelo WhatsApp ou por aqui.
                                </p>
                            </div>
                            <Button
                                onClick={handleFinish}
                                className="w-full justify-center py-3 bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900/20"
                            >
                                Começar a Usar
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
