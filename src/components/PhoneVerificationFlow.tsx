import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, CheckCircle, Smartphone, ArrowRight, Copy } from 'lucide-react';
import Button from './ui/Button';

interface PhoneVerificationFlowProps {
    userId: string;
    onVerified: () => void;
}

export default function PhoneVerificationFlow({ userId, onVerified }: PhoneVerificationFlowProps) {
    const [step, setStep] = useState<'input' | 'code' | 'verified'>('input');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Generate random 6-digit code
    const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

    // Fetch initial state
    useEffect(() => {
        const checkStatus = async () => {
            const { data: rawData } = await supabase
                .from('user_settings')
                .select('phone_number, phone_verification_code, phone_verified_at')
                .eq('user_id', userId)
                .single();

            const data = rawData as any;

            if (data?.phone_verified_at) {
                setStep('verified');
                onVerified();
            } else if (data?.phone_verification_code) {
                // If we have a code but no verification, we are in 'code' step
                // But we need to strip the 55 to show in input if we want to be consistent
                // Or just show it as is.
                // Let's strip 55 for display if it starts with 55
                let phone = data.phone_number || '';
                if (phone.startsWith('55')) phone = phone.substring(2);

                setPhoneNumber(phone);
                setVerificationCode(data.phone_verification_code);
                setStep('code');
            } else if (data?.phone_number) {
                let phone = data.phone_number || '';
                if (phone.startsWith('55')) phone = phone.substring(2);
                setPhoneNumber(phone);
            }
        };
        checkStatus();
    }, [userId, onVerified]);

    // Poll for verification
    useEffect(() => {
        if (step !== 'code') return;

        const interval = setInterval(async () => {
            const { data: rawData } = await supabase
                .from('user_settings')
                .select('phone_verified_at')
                .eq('user_id', userId)
                .single();

            const data = rawData as any;

            if (data?.phone_verified_at) {
                setStep('verified');
                clearInterval(interval);
                setTimeout(onVerified, 2000); // Wait a bit to show success
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [step, userId, onVerified]);

    const handleGenerateCode = async () => {
        if (!phoneNumber || phoneNumber.length < 10) {
            setError('Por favor, digite um número válido (DDD + Número).');
            return;
        }
        setError(null);
        setIsLoading(true);

        try {
            const code = generateCode();
            const cleanPhone = phoneNumber.replace(/\D/g, '');
            // Implicit +55
            const finalPhone = `55${cleanPhone}`;

            const { error: updateError } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: userId,
                    phone_number: finalPhone, // Save with 55
                    phone_verification_code: code,
                    // phone_verified_at: null // Reset if regenerating?
                }, { onConflict: 'user_id' });

            if (updateError) throw updateError;

            setVerificationCode(code);
            setStep('code');
        } catch (err: any) {
            console.error('Error generating code:', err);
            setError('Erro ao salvar número. Tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };

    const copyCode = () => {
        navigator.clipboard.writeText(verificationCode);
        // Could show toast
    };

    if (step === 'verified') {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-green-50 rounded-2xl border border-green-100 animate-in fade-in zoom-in duration-500">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 shadow-sm">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-green-800 mb-2">Conta Vinculada!</h3>
                <p className="text-green-600 text-center">Você já pode conversar com sua IA.</p>
            </div>
        );
    }

    return (
        <div className="bg-white border border-ela-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-blue-50 rounded-xl">
                    <Smartphone className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-ela-text">Vincular WhatsApp</h3>
                    <p className="text-sm text-ela-sub">Passo 1: Confirme seu número para falar com a IA.</p>
                </div>
            </div>

            {step === 'input' ? (
                <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                    <div>
                        <label className="block text-sm font-medium text-ela-text mb-1">Seu Número de WhatsApp</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-lg pointer-events-none">
                                +55
                            </span>
                            <input
                                type="text"
                                value={phoneNumber}
                                onChange={(e) => {
                                    // Allow only numbers
                                    const val = e.target.value.replace(/\D/g, '');
                                    setPhoneNumber(val);
                                }}
                                placeholder="11 99999-9999"
                                className="w-full bg-gray-50 border border-ela-border rounded-xl pl-14 pr-4 py-3 text-lg outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                        </div>
                        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
                    </div>
                    <Button
                        onClick={handleGenerateCode}
                        isLoading={isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        Continuar <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            ) : (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                    <div className="text-center">
                        <p className="text-ela-sub mb-4">Envie o código abaixo para o número da IA no WhatsApp:</p>
                        <div
                            onClick={copyCode}
                            className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-xl p-4 flex items-center justify-center gap-3 cursor-pointer hover:bg-gray-200 transition-colors group"
                        >
                            <span className="text-3xl font-mono font-bold text-ela-text tracking-widest">{verificationCode}</span>
                            <Copy className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Clique para copiar</p>
                    </div>

                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                        <p className="text-sm text-blue-600 font-medium animate-pulse">Aguardando você enviar o código...</p>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <button
                            onClick={() => setStep('input')}
                            className="text-sm text-gray-400 hover:text-gray-600 w-full text-center"
                        >
                            Alterar número
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
