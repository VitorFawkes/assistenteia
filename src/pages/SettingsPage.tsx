import { useState, useEffect } from 'react';
import { Save, User, Phone, Mail, Loader2, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';
import WhatsAppConnection from '../components/WhatsAppConnection';

export default function SettingsPage() {
    // Force redeploy - Settings Page Refactor
    const [preferredName, setPreferredName] = useState('');
    const [phone, setPhone] = useState('');
    const [botMode, setBotMode] = useState<'always_reply' | 'mention_only'>('always_reply');
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [userId, setUserId] = useState<string>('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setUserId(user.id);
            setEmail(user.email || '');

            const { data, error } = await supabase
                .from('user_settings')
                .select('preferred_name, phone_number, bot_mode')
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                const settings = data as any;
                setPreferredName(settings.preferred_name || '');
                setPhone(settings.phone_number || '');
                setBotMode(settings.bot_mode || 'always_reply');
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');

            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    preferred_name: preferredName,
                    phone_number: phone,
                    bot_mode: botMode,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) throw error;

            setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Erro ao salvar perfil.' });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full bg-gray-900">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-900 p-4 md:p-6 pb-28 md:pb-6 overflow-auto">
            <div className="max-w-2xl mx-auto w-full space-y-8">

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Meu Perfil</h1>
                        <p className="text-gray-400">Gerencie suas informações pessoais e de contato.</p>
                    </div>
                </div>

                {message && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                        {message.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
                        {message.text}
                    </div>
                )}

                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-8 space-y-8">

                    {/* Email (Read Only) */}
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-blue-500/10 rounded-xl mt-1">
                            <Mail className="w-6 h-6 text-blue-400" />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Email (Conta)
                            </label>
                            <input
                                type="text"
                                value={email}
                                disabled
                                className="w-full bg-gray-900/50 border border-gray-700 rounded-xl p-3 text-gray-500 cursor-not-allowed"
                            />
                        </div>
                    </div>

                    <div className="h-px bg-gray-700/50" />

                    {/* Preferred Name */}
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-purple-500/10 rounded-xl mt-1">
                            <User className="w-6 h-6 text-purple-400" />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-white mb-2">
                                Como devo te chamar?
                            </label>
                            <input
                                type="text"
                                value={preferredName}
                                onChange={(e) => setPreferredName(e.target.value)}
                                placeholder="Ex: Chefe, Vitor, Mestre..."
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                A IA usará este nome para se referir a você nas conversas.
                            </p>
                        </div>
                    </div>

                    <div className="h-px bg-gray-700/50" />

                    {/* Phone */}
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-green-500/10 rounded-xl mt-1">
                            <Phone className="w-6 h-6 text-green-400" />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-white mb-2">
                                Telefone / WhatsApp
                            </label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="+55 11 99999-9999"
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all outline-none"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                OBRIGATÓRIO: Use o formato internacional (ex: +5511999999999). É assim que o Bot te identifica.
                            </p>
                        </div>
                    </div>

                    <div className="h-px bg-gray-700/50" />

                    {/* Bot Mode */}
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-yellow-500/10 rounded-xl mt-1">
                            <AlertCircle className="w-6 h-6 text-yellow-400" />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-white mb-2">
                                Modo de Resposta do Bot
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button
                                    onClick={() => setBotMode('always_reply')}
                                    className={`p-4 rounded-xl border text-left transition-all ${botMode === 'always_reply'
                                        ? 'bg-yellow-500/10 border-yellow-500/50 text-white'
                                        : 'bg-gray-900/50 border-gray-700 text-gray-400 hover:bg-gray-800'
                                        }`}
                                >
                                    <div className="font-semibold mb-1">Sempre Responder</div>
                                    <div className="text-xs opacity-80">O bot responde a todas as mensagens enviadas para ele.</div>
                                </button>

                                <button
                                    onClick={() => setBotMode('mention_only')}
                                    className={`p-4 rounded-xl border text-left transition-all ${botMode === 'mention_only'
                                        ? 'bg-yellow-500/10 border-yellow-500/50 text-white'
                                        : 'bg-gray-900/50 border-gray-700 text-gray-400 hover:bg-gray-800'
                                        }`}
                                >
                                    <div className="font-semibold mb-1">Modo Passivo</div>
                                    <div className="text-xs opacity-80">O bot só responde se você pedir (ex: "Bot, ..."). Economiza tokens.</div>
                                </button>
                            </div>
                        </div>
                    </div>

                </div>

                {/* WhatsApp Connection (New) */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-white">Conexão WhatsApp</h2>
                    {userId && <WhatsAppConnection userId={userId} />}
                </div>

                {/* Integrations Section */}
                <div>
                    <h2 className="text-2xl font-bold text-white mb-4">Outras Integrações</h2>
                    <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-8 space-y-6">

                        {/* Google Integration */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-white rounded-xl">
                                    <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Google</h3>
                                    <p className="text-sm text-gray-400">Gmail, Calendar</p>
                                </div>
                            </div>
                            <Button
                                onClick={() => window.location.href = 'https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/auth-google/login'}
                                className="bg-gray-700 hover:bg-gray-600 text-white"
                            >
                                Conectar
                            </Button>
                        </div>

                        <div className="h-px bg-gray-700/50" />

                        {/* Microsoft Integration */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[#00a4ef]/10 rounded-xl">
                                    <svg className="w-6 h-6 text-[#00a4ef]" viewBox="0 0 23 23" fill="currentColor">
                                        <path d="M0 0h11v11H0zM12 0h11v11H12zM0 12h11v11H0zM12 12h11v11H12z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Outlook / Microsoft</h3>
                                    <p className="text-sm text-gray-400">Email, Calendar</p>
                                </div>
                            </div>
                            <Button
                                onClick={() => window.location.href = 'https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/auth-microsoft/login'}
                                className="bg-gray-700 hover:bg-gray-600 text-white"
                            >
                                Conectar
                            </Button>
                        </div>

                    </div>
                </div>

                <div className="flex justify-end">
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        isLoading={isSaving}
                        icon={Save}
                        className="w-full bg-blue-600 hover:bg-blue-500"
                    >
                        Salvar Perfil
                    </Button>
                </div>
            </div>
        </div>
    );
}
