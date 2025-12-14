import { useState, useEffect } from 'react';
import { Save, User, Phone, Mail, Loader2, Check, AlertCircle, Bot } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';
import WhatsAppConnection from '../components/WhatsAppConnection';

export default function SettingsPage() {
    // Force redeploy - Settings Page Refactor
    const [preferredName, setPreferredName] = useState('');
    const [phone, setPhone] = useState('');

    const [privacyReadScope, setPrivacyReadScope] = useState<'all' | 'private_only' | 'groups_only'>('all');
    const [privacyAllowOutgoing, setPrivacyAllowOutgoing] = useState(true);
    const [customPrompt, setCustomPrompt] = useState('');
    const [aiModel, setAiModel] = useState('gpt-4o');

    // Storage Settings
    const [storageDownloadImages, setStorageDownloadImages] = useState(true);
    const [storageDownloadVideos, setStorageDownloadVideos] = useState(true);
    const [storageDownloadAudio, setStorageDownloadAudio] = useState(true);
    const [storageDownloadDocuments, setStorageDownloadDocuments] = useState(true);
    const [storageTrackStatus, setStorageTrackStatus] = useState(true);

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
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                const settings = data as any;
                setPreferredName(settings.preferred_name || '');
                // Strip +55 for display
                const rawPhone = settings.phone_number || '';
                setPhone(rawPhone.startsWith('+55') ? rawPhone.slice(3) : rawPhone);
                setPrivacyReadScope(settings.privacy_read_scope || 'all');
                setPrivacyAllowOutgoing(settings.privacy_allow_outgoing !== false);
                setCustomPrompt(settings.custom_system_prompt || '');
                setCustomPrompt(settings.custom_system_prompt || '');
                setAiModel(settings.ai_model || 'gpt-4o');

                // Storage Settings
                setStorageDownloadImages(settings.storage_download_images !== false);
                setStorageDownloadVideos(settings.storage_download_videos !== false);
                setStorageDownloadAudio(settings.storage_download_audio !== false);
                setStorageDownloadDocuments(settings.storage_download_documents !== false);
                setStorageTrackStatus(settings.storage_track_status !== false);
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
                    user_id: userId,
                    preferred_name: preferredName,
                    // Ensure +55 is added
                    phone_number: phone.startsWith('+55') ? phone : `+55${phone.replace(/\D/g, '')}`,
                    privacy_read_scope: privacyReadScope,
                    privacy_allow_outgoing: privacyAllowOutgoing,
                    custom_system_prompt: customPrompt,
                    ai_model: aiModel,
                    // Storage Settings
                    storage_download_images: storageDownloadImages,
                    storage_download_videos: storageDownloadVideos,
                    storage_download_audio: storageDownloadAudio,
                    storage_download_documents: storageDownloadDocuments,
                    storage_track_status: storageTrackStatus,
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
                                placeholder="11 99999-9999"
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all outline-none"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                OBRIGATÓRIO: Digite apenas o DDD e o número (ex: 11999999999). O código do país (+55) será adicionado automaticamente.
                            </p>
                        </div>
                    </div>

                    <div className="h-px bg-gray-700/50" />

                    {/* Behavior Rules Section */}
                    <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-8 space-y-8">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-500/10 rounded-xl">
                                <Bot className="w-6 h-6 text-indigo-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-white">Regras de Comportamento</h2>
                                <p className="text-gray-400">Defina exatamente como a IA deve agir, ler e responder.</p>
                            </div>
                        </div>

                        <div className="h-px bg-gray-700/50" />

                        {/* 1. Read Scope (O que ela lê?) */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                1. O que a IA pode ler?
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <button
                                    onClick={() => setPrivacyReadScope('all')}
                                    className={`p-4 rounded-xl border text-left transition-all ${privacyReadScope === 'all'
                                        ? 'bg-indigo-500/10 border-indigo-500/50 text-white ring-1 ring-indigo-500/50'
                                        : 'bg-gray-900/50 border-gray-700 text-gray-400 hover:bg-gray-800'
                                        }`}
                                >
                                    <div className="font-bold mb-1">Tudo (Padrão)</div>
                                    <div className="text-xs opacity-80 leading-relaxed">
                                        Lê mensagens privadas e de grupos.
                                    </div>
                                </button>
                                <button
                                    onClick={() => setPrivacyReadScope('private_only')}
                                    className={`p-4 rounded-xl border text-left transition-all ${privacyReadScope === 'private_only'
                                        ? 'bg-indigo-500/10 border-indigo-500/50 text-white ring-1 ring-indigo-500/50'
                                        : 'bg-gray-900/50 border-gray-700 text-gray-400 hover:bg-gray-800'
                                        }`}
                                >
                                    <div className="font-bold mb-1">Apenas Privado</div>
                                    <div className="text-xs opacity-80 leading-relaxed">
                                        Ignora grupos. Foca apenas em conversas 1x1.
                                    </div>
                                </button>
                                <button
                                    onClick={() => setPrivacyReadScope('groups_only')}
                                    className={`p-4 rounded-xl border text-left transition-all ${privacyReadScope === 'groups_only'
                                        ? 'bg-indigo-500/10 border-indigo-500/50 text-white ring-1 ring-indigo-500/50'
                                        : 'bg-gray-900/50 border-gray-700 text-gray-400 hover:bg-gray-800'
                                        }`}
                                >
                                    <div className="font-bold mb-1">Apenas Grupos</div>
                                    <div className="text-xs opacity-80 leading-relaxed">
                                        Ignora mensagens privadas. Foca apenas em grupos.
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div className="h-px bg-gray-700/50" />

                        {/* 3. Outgoing Permission (Ela pode iniciar?) */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                2. Permissões de Envio
                            </h3>
                            <div className="flex items-center justify-between bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                                <div>
                                    <div className="font-medium text-white">Permitir enviar mensagens para outros?</div>
                                    <div className="text-sm text-gray-400 mt-1">
                                        Se ligado, você pode pedir: <i>"Mande uma mensagem para o João..."</i> e ela enviará.
                                        <br />
                                        Se desligado, ela recusará esse tipo de pedido por segurança.
                                    </div>
                                </div>
                                <button
                                    onClick={() => setPrivacyAllowOutgoing(!privacyAllowOutgoing)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${privacyAllowOutgoing ? 'bg-green-500' : 'bg-gray-600'
                                        }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${privacyAllowOutgoing ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                </button>
                            </div>
                        </div>

                        <div className="h-px bg-gray-700/50" />

                        {/* 4. Data & Storage (Omniscient Database) */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                3. Dados e Armazenamento
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Download Media Toggles */}
                                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 space-y-4">
                                    <div className="font-medium text-white mb-2">Baixar Mídia Automaticamente</div>

                                    {[
                                        { label: 'Imagens', state: storageDownloadImages, setter: setStorageDownloadImages },
                                        { label: 'Vídeos', state: storageDownloadVideos, setter: setStorageDownloadVideos },
                                        { label: 'Áudios', state: storageDownloadAudio, setter: setStorageDownloadAudio },
                                        { label: 'Documentos', state: storageDownloadDocuments, setter: setStorageDownloadDocuments },
                                    ].map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between">
                                            <span className="text-sm text-gray-400">{item.label}</span>
                                            <button
                                                onClick={() => item.setter(!item.state)}
                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${item.state ? 'bg-blue-500' : 'bg-gray-600'}`}
                                            >
                                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${item.state ? 'translate-x-5' : 'translate-x-1'}`} />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Status Tracking Toggle */}
                                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700 space-y-4">
                                    <div className="font-medium text-white mb-2">Rastreamento</div>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm text-white">Rastrear Status (Lido/Entregue)</div>
                                            <div className="text-xs text-gray-500 mt-1">Saber se a mensagem chegou.</div>
                                        </div>
                                        <button
                                            onClick={() => setStorageTrackStatus(!storageTrackStatus)}
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${storageTrackStatus ? 'bg-blue-500' : 'bg-gray-600'}`}
                                        >
                                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${storageTrackStatus ? 'translate-x-5' : 'translate-x-1'}`} />
                                        </button>
                                    </div>
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
        </div>
    );
}
