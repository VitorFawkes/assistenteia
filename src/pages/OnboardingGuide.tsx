import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import WhatsAppConnection from '../components/WhatsAppConnection';
import Button from '../components/ui/Button';
import { Bot, CheckCircle2, ArrowRight, Sparkles, MessageSquare, Zap } from 'lucide-react';

export default function OnboardingGuide() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');

    useEffect(() => {
        if (user) {
            // Pre-fill name if available
            supabase.from('user_settings').select('preferred_name').eq('user_id', user.id).single()
                .then(({ data }) => {
                    if (data?.preferred_name) setName(data.preferred_name);
                });
        }
    }, [user]);

    const handleFinish = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from('user_settings')
                .update({ onboarding_completed: true } as any)
                .eq('user_id', user.id);

            if (error) throw error;
            navigate('/');
        } catch (error) {
            console.error('Error finishing onboarding:', error);
            alert('Erro ao finalizar. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
            <div className="max-w-2xl w-full space-y-8">

                {/* Progress Indicators */}
                <div className="flex justify-center gap-3 mb-8">
                    {[1, 2, 3].map((s) => (
                        <div
                            key={s}
                            className={`h-2 rounded-full transition-all duration-500 ${step >= s ? 'w-12 bg-blue-500' : 'w-4 bg-gray-700'}`}
                        />
                    ))}
                </div>

                {/* Step 1: Welcome & Intro */}
                {step === 1 && (
                    <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-500/20 mb-6">
                            <Bot size={48} className="text-white" />
                        </div>

                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                            Olá, {name || 'Visitante'}!
                        </h1>

                        <p className="text-xl text-gray-400 max-w-lg mx-auto leading-relaxed">
                            Eu sou sua nova Inteligência Artificial Pessoal.
                            Estou aqui para organizar sua vida, lembrar de tudo e executar tarefas por você.
                        </p>

                        <div className="grid md:grid-cols-3 gap-4 mt-8 text-left">
                            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                                <Sparkles className="text-yellow-400 mb-3" size={24} />
                                <h3 className="font-bold mb-1">Super Inteligente</h3>
                                <p className="text-sm text-gray-400">Entendo contexto, datas e nuances da sua rotina.</p>
                            </div>
                            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                                <MessageSquare className="text-green-400 mb-3" size={24} />
                                <h3 className="font-bold mb-1">WhatsApp</h3>
                                <p className="text-sm text-gray-400">Converse comigo direto pelo seu app de mensagens favorito.</p>
                            </div>
                            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                                <Zap className="text-blue-400 mb-3" size={24} />
                                <h3 className="font-bold mb-1">Proativo</h3>
                                <p className="text-sm text-gray-400">Não só obedeço, mas sugiro melhorias para o seu dia.</p>
                            </div>
                        </div>

                        <Button
                            onClick={() => setStep(2)}
                            className="w-full md:w-auto px-8 py-4 text-lg bg-blue-600 hover:bg-blue-500 mt-8"
                            icon={ArrowRight}
                        >
                            Vamos Começar
                        </Button>
                    </div>
                )}

                {/* Step 2: WhatsApp Connection */}
                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold mb-2">Conecte seu WhatsApp</h2>
                            <p className="text-gray-400">
                                Para eu funcionar 100%, preciso que você escaneie o QR Code abaixo.
                                Isso permite que eu te mande lembretes e responda suas mensagens.
                            </p>
                        </div>

                        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl max-w-md mx-auto">
                            {user && (
                                <WhatsAppConnection
                                    userId={user.id}
                                    onConnected={() => setStep(3)}
                                />
                            )}
                        </div>

                        <div className="text-center">
                            <button
                                onClick={() => setStep(3)}
                                className="text-gray-500 hover:text-gray-300 text-sm underline mt-4"
                            >
                                Pular por enquanto (Configurar depois)
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 3: Completion */}
                {step === 3 && (
                    <div className="text-center space-y-8 animate-in fade-in zoom-in duration-500">
                        <div className="w-32 h-32 bg-green-500/10 rounded-full flex items-center justify-center mx-auto animate-bounce">
                            <CheckCircle2 size={64} className="text-green-500" />
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-4xl font-bold text-white">Tudo Pronto!</h2>
                            <p className="text-xl text-gray-400 max-w-md mx-auto">
                                Seu assistente está configurado e pronto para trabalhar.
                            </p>
                        </div>

                        <div className="bg-gray-800/50 p-6 rounded-xl border border-gray-700 max-w-md mx-auto text-left space-y-3">
                            <p className="font-medium text-gray-300">Tente pedir algo como:</p>
                            <ul className="space-y-2 text-gray-400 text-sm">
                                <li className="flex items-center gap-2">
                                    <span className="text-blue-500">"</span>
                                    Me lembre de beber água a cada 2 horas
                                    <span className="text-blue-500">"</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-blue-500">"</span>
                                    Crie uma lista de compras para o churrasco
                                    <span className="text-blue-500">"</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <span className="text-blue-500">"</span>
                                    Resuma minhas tarefas de hoje
                                    <span className="text-blue-500">"</span>
                                </li>
                            </ul>
                        </div>

                        <Button
                            onClick={handleFinish}
                            isLoading={loading}
                            className="w-full md:w-auto px-12 py-4 text-lg bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900/20"
                        >
                            Entrar no Sistema
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
