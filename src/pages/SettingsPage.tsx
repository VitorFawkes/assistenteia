import { useState, useEffect } from 'react';
import { Save, User, Loader2, Check, AlertCircle, Bot, Brain, Info, Sun, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';
import WhatsAppConnection from '../components/WhatsAppConnection';

export default function SettingsPage() {
    const [userId, setUserId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Form State
    const [preferredName, setPreferredName] = useState('');
    const [aiName, setAiName] = useState('');
    const [phone, setPhone] = useState('');

    const [privacyReadScope, setPrivacyReadScope] = useState<'all' | 'private_only' | 'groups_only' | 'none'>('all');
    const [privacyAllowOutgoing, setPrivacyAllowOutgoing] = useState(true);
    const [customPrompt, setCustomPrompt] = useState('');
    // const [aiModel, setAiModel] = useState('gpt-5.1-preview'); // Default & Enforced (Removed unused state)

    // Daily Briefing State
    const [dailyBriefingEnabled, setDailyBriefingEnabled] = useState(true);
    const [dailyBriefingTime, setDailyBriefingTime] = useState('08:00');
    const [dailyBriefingPrompt, setDailyBriefingPrompt] = useState('');

    // Storage Settings
    const [storageDownloadImages, setStorageDownloadImages] = useState(true);
    const [storageDownloadVideos, setStorageDownloadVideos] = useState(true);
    const [storageDownloadAudio, setStorageDownloadAudio] = useState(true);
    const [storageDownloadDocuments, setStorageDownloadDocuments] = useState(true);
    const [storageTrackStatus, setStorageTrackStatus] = useState(true);

    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setUserId(user.id);
            const adminStatus = user.email === 'vitorgambetti@gmail.com';
            setIsAdmin(adminStatus);

            // Load User Settings
            const { data, error } = await supabase
                .from('user_settings')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                const settings = data as any;
                setPreferredName(settings.preferred_name || '');
                setAiName(settings.ai_name || '');
                // Strip +55 for display
                const rawPhone = settings.phone_number || '';
                setPhone(rawPhone.startsWith('+55') ? rawPhone.slice(3) : rawPhone);
                setPrivacyReadScope(settings.privacy_read_scope || 'all');
                setPrivacyAllowOutgoing(settings.privacy_allow_outgoing !== false);
                // setCustomPrompt(settings.custom_system_prompt || ''); // Non-admins don't see/edit prompt
                // setAiModel('gpt-5.1-preview'); // State removed, enforced server-side

                // Daily Briefing
                setDailyBriefingEnabled(settings.daily_briefing_enabled !== false);
                setDailyBriefingTime(settings.daily_briefing_time || '08:00');
                setDailyBriefingPrompt(settings.daily_briefing_prompt || '');

                // Storage Settings
                setStorageDownloadImages(settings.storage_download_images !== false);
                setStorageDownloadVideos(settings.storage_download_videos !== false);
                setStorageDownloadAudio(settings.storage_download_audio !== false);
                setStorageDownloadDocuments(settings.storage_download_documents !== false);
                setStorageTrackStatus(settings.storage_track_status !== false);
            }

            // Load System Prompt (Admin Only - from Registry)
            if (adminStatus) {
                const { data: promptData } = await (supabase as any)
                    .from('prompts')
                    .select('content')
                    .eq('key', 'system_core')
                    .maybeSingle();

                if (promptData) {
                    setCustomPrompt(promptData.content);
                }
            } else {
                setCustomPrompt(''); // Non-admins don't see/edit prompt
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

            // 1. Save User Settings
            // Format phone: if empty or just +55, send null. Otherwise ensure +55 prefix.
            const cleanPhone = phone.replace(/\D/g, '');
            const formattedPhone = cleanPhone ? (cleanPhone.startsWith('55') ? `+${cleanPhone}` : `+55${cleanPhone}`) : null;

            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    preferred_name: preferredName,
                    ai_name: aiName,
                    phone_number: formattedPhone,
                    privacy_read_scope: privacyReadScope,
                    privacy_allow_outgoing: privacyAllowOutgoing,
                    // Non-admins don't save custom_system_prompt anymore
                    // Admins save to Registry, so we don't need to save here either, 
                    // BUT we might want to clear it or keep it as legacy. 
                    // Let's just ignore it here for simplicity.

                    ai_model: 'gpt-5.1-preview', // Always enforce 5.1 on save

                    // Daily Briefing
                    daily_briefing_enabled: dailyBriefingEnabled,
                    daily_briefing_time: dailyBriefingTime,
                    daily_briefing_prompt: dailyBriefingPrompt,

                    // Storage Settings
                    storage_download_images: storageDownloadImages,
                    storage_download_videos: storageDownloadVideos,
                    storage_download_audio: storageDownloadAudio,
                    storage_download_documents: storageDownloadDocuments,
                    storage_track_status: storageTrackStatus,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) throw error;

            // 2. Save System Prompt to Registry (Admin Only)
            if (isAdmin) {
                const { error: promptError } = await (supabase as any)
                    .from('prompts')
                    .upsert({
                        key: 'system_core',
                        content: customPrompt,
                        visibility: 'execution',
                        is_active: true,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'key' });

                if (promptError) throw promptError;
            }

            setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error: any) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Erro ao salvar configurações.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleTestReminders = async () => {
        try {
            setMessage({ type: 'success', text: 'Verificando lembretes...' });
            const { data, error } = await supabase.functions.invoke('check-reminders');
            if (error) throw error;
            console.log('Check reminders result:', data);
            setMessage({ type: 'success', text: `Verificação concluída! ${data.notificationsSent} enviados.` });
        } catch (error) {
            console.error('Error testing reminders:', error);
            setMessage({ type: 'error', text: 'Erro ao verificar lembretes.' });
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full bg-ela-bg">
                <Loader2 className="w-8 h-8 animate-spin text-ela-pink" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-ela-bg p-4 md:p-6 pb-32 md:pb-6 overflow-auto">
            <div className="max-w-3xl mx-auto w-full space-y-8">

                {/* Header & Main Save */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-ela-text mb-2">Configurações da IA</h1>
                        <p className="text-ela-sub">Personalize como sua assistente interage e armazena dados.</p>
                    </div>
                    <div className="flex gap-3">
                        <Button
                            variant="secondary"
                            onClick={handleTestReminders}
                            icon={Bot}
                            className="bg-white hover:bg-gray-50 text-ela-sub border border-ela-border shadow-sm"
                        >
                            Testar Lembretes
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            isLoading={isSaving}
                            icon={Save}
                            className="bg-ela-pink hover:bg-pink-600 shadow-lg shadow-pink-900/20 text-white"
                        >
                            Salvar Alterações
                        </Button>
                    </div>
                </div>

                {message && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'
                        }`}>
                        {message.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
                        {message.text}
                    </div>
                )}

                {/* SECTION 1: PERFIL & CONTATO */}
                <div className="bg-white border border-ela-border rounded-2xl p-6 md:p-8 space-y-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <User className="w-6 h-6 text-ela-pink" />
                        <h2 className="text-xl font-bold text-ela-text">Seu Perfil</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Preferred Name */}
                        <div>
                            <label className="block text-sm font-medium text-ela-sub mb-2">
                                Como devo te chamar?
                            </label>
                            <input
                                type="text"
                                value={preferredName}
                                onChange={(e) => setPreferredName(e.target.value)}
                                placeholder="Ex: Chefe, Vitor..."
                                className="w-full bg-white border border-ela-border rounded-xl p-3 text-ela-text focus:ring-2 focus:ring-ela-pink focus:border-transparent transition-all outline-none placeholder:text-ela-sub/50"
                            />
                        </div>

                        {/* AI Name */}
                        <div>
                            <label className="block text-sm font-medium text-ela-sub mb-2">
                                Nome da IA
                            </label>
                            <input
                                type="text"
                                value={aiName}
                                onChange={(e) => setAiName(e.target.value)}
                                placeholder="Ex: Jarvis, Sexta-feira..."
                                className="w-full bg-white border border-ela-border rounded-xl p-3 text-ela-text focus:ring-2 focus:ring-ela-pink focus:border-transparent transition-all outline-none placeholder:text-ela-sub/50"
                            />
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="block text-sm font-medium text-ela-sub mb-2">
                                Seu WhatsApp (com DDD)
                            </label>
                            <div className="relative">
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="11 999999999"
                                    className="w-full bg-white border border-ela-border rounded-xl p-3 pl-12 text-ela-text focus:ring-2 focus:ring-ela-pink focus:border-transparent transition-all outline-none placeholder:text-ela-sub/50"
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium pointer-events-none">
                                    +55
                                </div>
                            </div>
                            <p className="text-xs text-ela-sub mt-2">
                                Usado para identificar quando <b>você</b> fala com a IA ("Note to Self").
                            </p>
                        </div>
                    </div>
                </div>

                {/* SECTION 2: PRIVACIDADE & COMPORTAMENTO */}
                <div className="bg-white border border-ela-border rounded-2xl p-6 md:p-8 space-y-8 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <Bot className="w-6 h-6 text-indigo-500" />
                        <h2 className="text-xl font-bold text-ela-text">Privacidade da IA</h2>
                    </div>

                    {/* Read Scope */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-ela-sub uppercase tracking-wider">
                            O que a IA pode ler?
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            {[
                                { id: 'all', label: 'Tudo', desc: 'Lê grupos e privados.' },
                                { id: 'private_only', label: 'Só Privado', desc: 'Ignora grupos.' },
                                { id: 'groups_only', label: 'Só Grupos', desc: 'Ignora privados.' },
                                { id: 'none', label: 'Nenhuma', desc: 'Lê apenas você (Note to Self).' },
                            ].map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => setPrivacyReadScope(opt.id as any)}
                                    className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${privacyReadScope === opt.id
                                        ? 'bg-ela-pink/5 border-ela-pink/20 text-ela-pink shadow-sm'
                                        : 'bg-white border-ela-border text-ela-sub hover:bg-gray-50 hover:border-gray-300'
                                        }`}
                                >
                                    <div className={`font-bold mb-1 ${privacyReadScope === opt.id ? 'text-ela-pink' : 'text-ela-text'}`}>
                                        {opt.label}
                                    </div>
                                    <div className="text-xs opacity-70 leading-relaxed">
                                        {opt.desc}
                                    </div>
                                    {privacyReadScope === opt.id && (
                                        <div className="absolute top-2 right-2 w-2 h-2 bg-ela-pink rounded-full shadow-sm" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* Outgoing Permission */}
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="font-medium text-ela-text">Permitir envio para terceiros?</div>
                            <div className="text-sm text-ela-sub mt-1 max-w-md">
                                Se ativado, você pode pedir para a IA enviar mensagens para outras pessoas.
                            </div>
                        </div>
                        <button
                            onClick={() => setPrivacyAllowOutgoing(!privacyAllowOutgoing)}
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ela-pink/50 ${privacyAllowOutgoing ? 'bg-green-500' : 'bg-gray-200'
                                }`}
                        >
                            <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${privacyAllowOutgoing ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>
                </div>



                {/* SECTION 3: ARMAZENAMENTO (COFRE) */}
                <div className="bg-white border border-ela-border rounded-2xl p-6 md:p-8 space-y-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-2">
                        <Save className="w-6 h-6 text-blue-500" />
                        <div>
                            <h2 className="text-xl font-bold text-ela-text">Cofre Pessoal</h2>
                            <p className="text-sm text-ela-sub">
                                O que devo salvar quando <b>você</b> me envia arquivos?
                            </p>
                        </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
                        <p className="text-xs text-blue-700 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                <b>Nota:</b> Para economizar espaço, mídias de terceiros (Grupos/Outros) <b>nunca</b> são baixadas, exceto áudios (para transcrição). Estas opções abaixo controlam apenas o seu "Note to Self".
                            </span>
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[
                            { label: 'Minhas Imagens', state: storageDownloadImages, setter: setStorageDownloadImages },
                            { label: 'Meus Vídeos', state: storageDownloadVideos, setter: setStorageDownloadVideos },
                            { label: 'Meus Áudios', state: storageDownloadAudio, setter: setStorageDownloadAudio },
                            { label: 'Meus Documentos', state: storageDownloadDocuments, setter: setStorageDownloadDocuments },
                        ].map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-gray-50/50 p-4 rounded-xl border border-ela-border">
                                <span className="text-sm text-ela-text font-medium">{item.label}</span>
                                <button
                                    onClick={() => item.setter(!item.state)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.state ? 'bg-ela-pink' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.state ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* SECTION 4: CONEXÕES */}
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold text-ela-text">Canais de Comunicação</h2>

                    {/* WhatsApp */}
                    <div className="relative">
                        <div className="absolute -top-3 left-4 bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full border border-green-200 shadow-sm z-10 uppercase tracking-wide">
                            Recomendado
                        </div>
                        {userId && <WhatsAppConnection userId={userId} />}
                    </div>

                    {/* External Services */}
                    <div className="space-y-6">
                        {/* AI Brain (Full Width) */}
                        <div className="bg-white border border-ela-border rounded-2xl overflow-hidden shadow-sm">
                            <div className="p-6 border-b border-ela-border">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-purple-50 rounded-lg">
                                        <Brain className="w-5 h-5 text-purple-500" />
                                    </div>
                                    <h2 className="text-lg font-semibold text-ela-text">Cérebro da IA</h2>
                                </div>
                                <p className="text-sm text-ela-sub">
                                    Personalize como a inteligência artificial pensa e se comporta.
                                </p>
                            </div>

                            <div className="p-6 space-y-8">
                                {/* AI Model - HIDDEN & ENFORCED */}
                                <div className="hidden">
                                    <label className="block text-sm font-medium text-ela-sub mb-3">
                                        Modelo de Inteligência
                                    </label>
                                    <div className="p-4 border border-ela-border rounded-xl bg-gray-50/50 flex items-center gap-3">
                                        <div className="w-2.5 h-2.5 bg-purple-500 rounded-full shadow-sm" />
                                        <span className="text-ela-text font-medium">GPT 5.1 (Enforced)</span>
                                    </div>
                                </div>

                                {/* System Prompt - ADMIN ONLY */}
                                {isAdmin ? (
                                    <div>
                                        <label className="block text-sm font-medium text-ela-sub mb-3 flex items-center gap-2">
                                            Personalidade (System Prompt)
                                            <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Admin Only</span>
                                        </label>
                                        <div className="relative group">
                                            <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-400 to-blue-400 rounded-xl opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
                                            <textarea
                                                value={customPrompt}
                                                onChange={(e) => setCustomPrompt(e.target.value)}
                                                rows={12}
                                                className="relative w-full px-5 py-4 rounded-xl border border-ela-border bg-white text-ela-text focus:ring-2 focus:ring-ela-pink focus:border-transparent transition-all resize-none font-mono text-sm leading-relaxed shadow-sm"
                                                placeholder="Ex: Você é um assistente especialista em finanças..."
                                            />
                                            <div className="absolute bottom-4 right-4 text-xs text-gray-400 font-mono bg-white px-2 py-1 rounded-md border border-gray-200">
                                                {customPrompt.length} chars
                                            </div>
                                        </div>
                                        <p className="mt-3 text-xs text-ela-sub flex items-center gap-1.5 flex-wrap">
                                            <Info className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                            <span>
                                                Use <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 border border-gray-200">{'{{preferred_name}}'}</code> para seu nome e <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600 border border-gray-200">{'{{CURRENT_DATETIME}}'}</code> para a hora atual.
                                            </span>
                                        </p>
                                    </div>
                                ) : (
                                    <div className="p-4 bg-gray-50/50 border border-ela-border rounded-xl flex items-center gap-3 text-ela-sub">
                                        <Info className="w-5 h-5 text-gray-400" />
                                        <span className="text-sm">
                                            O comportamento da IA é gerenciado pelo administrador do sistema.
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bottom Grid: Daily Briefing & Integrations */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* Daily Briefing Column */}
                            <div className={`bg-white border transition-all duration-300 rounded-2xl overflow-hidden shadow-sm ${dailyBriefingEnabled ? 'border-ela-pink/30 shadow-ela-pink/5' : 'border-ela-border'}`}>
                                <div className="p-6 border-b border-ela-border flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg transition-colors ${dailyBriefingEnabled ? 'bg-yellow-50 text-yellow-600' : 'bg-gray-50 text-gray-400'}`}>
                                            <Sun size={20} />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-semibold text-ela-text">Resumo Diário</h2>
                                            <p className="text-xs text-ela-sub">Briefing matinal no WhatsApp</p>
                                        </div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={dailyBriefingEnabled}
                                            onChange={(e) => setDailyBriefingEnabled(e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-ela-pink shadow-inner"></div>
                                    </label>
                                </div>

                                {dailyBriefingEnabled && (
                                    <div className="p-6 space-y-5 animate-in fade-in slide-in-from-top-4 duration-300">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-ela-sub mb-1.5 uppercase tracking-wider">
                                                    Horário
                                                </label>
                                                <input
                                                    type="time"
                                                    value={dailyBriefingTime}
                                                    onChange={(e) => setDailyBriefingTime(e.target.value)}
                                                    className="w-full bg-white border border-ela-border rounded-lg px-3 py-2 text-ela-text focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none transition-all text-center font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-ela-sub mb-1.5 uppercase tracking-wider">
                                                    Teste
                                                </label>
                                                <Button
                                                    variant="secondary"
                                                    className="w-full justify-center bg-gray-50/50 hover:bg-gray-100 border-ela-border text-ela-text"
                                                    size="sm"
                                                    onClick={async () => {
                                                        if (!confirm('Enviar resumo agora para o seu WhatsApp?')) return;
                                                        try {
                                                            const { data: { session } } = await supabase.auth.getSession();
                                                            if (!session) return;

                                                            const res = await fetch('https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/daily-briefing', {
                                                                method: 'POST',
                                                                headers: {
                                                                    'Authorization': `Bearer ${session.access_token}`,
                                                                    'Content-Type': 'application/json'
                                                                },
                                                                body: JSON.stringify({ action: 'test_now' })
                                                            });

                                                            if (res.ok) alert('Resumo enviado! Verifique seu WhatsApp.');
                                                            else alert('Erro ao enviar resumo.');
                                                        } catch (e) {
                                                            console.error(e);
                                                            alert('Erro ao conectar com servidor.');
                                                        }
                                                    }}
                                                >
                                                    <Send size={14} className="mr-2" />
                                                    Enviar
                                                </Button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-medium text-ela-sub mb-1.5 uppercase tracking-wider">
                                                Instruções
                                            </label>
                                            <textarea
                                                value={dailyBriefingPrompt}
                                                onChange={(e) => setDailyBriefingPrompt(e.target.value)}
                                                placeholder="Ex: Seja engraçado, foque em finanças..."
                                                className="w-full h-24 bg-white border border-ela-border rounded-lg px-3 py-2 text-sm text-ela-text focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none transition-all resize-none placeholder:text-ela-sub/50"
                                            />
                                        </div>
                                    </div>
                                )}
                                {!dailyBriefingEnabled && (
                                    <div className="p-8 text-center text-ela-sub text-sm italic">
                                        Ative para receber um resumo diário das suas tarefas e agenda.
                                    </div>
                                )}
                            </div>

                            {/* Integrations Column - HIDDEN PER USER REQUEST */}
                            {false && (
                                <div className="space-y-4">
                                    {/* Google */}
                                    <div className="group bg-white border border-ela-border hover:border-ela-pink/30 rounded-2xl p-5 flex items-center justify-between transition-all hover:bg-gray-50/50 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 right-0 bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-bl-lg font-bold uppercase tracking-wide">
                                            Opcional
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100 group-hover:scale-110 transition-transform duration-300">
                                                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-ela-text text-lg">Google</h3>
                                                <p className="text-xs text-ela-sub">Agenda, Email & Drive</p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={() => window.location.href = 'https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/auth-google/login'}
                                            className="bg-white hover:bg-gray-50 text-ela-text border border-ela-border hover:border-gray-300 transition-all duration-300"
                                            size="sm"
                                        >
                                            Conectar
                                        </Button>
                                    </div>

                                    {/* Microsoft */}
                                    <div className="group bg-white border border-ela-border hover:border-ela-pink/30 rounded-2xl p-5 flex items-center justify-between transition-all hover:bg-gray-50/50 shadow-sm relative overflow-hidden">
                                        <div className="absolute top-0 right-0 bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-bl-lg font-bold uppercase tracking-wide">
                                            Opcional
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="p-3 bg-[#00a4ef]/10 rounded-xl group-hover:scale-110 transition-transform duration-300">
                                                <svg className="w-6 h-6 text-[#00a4ef]" viewBox="0 0 23 23" fill="currentColor">
                                                    <path d="M0 0h11v11H0zM12 0h11v11H12zM0 12h11v11H0zM12 12h11v11H12z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-ela-text text-lg">Outlook</h3>
                                                <p className="text-xs text-ela-sub">Agenda & Email</p>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={() => window.location.href = 'https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/auth-microsoft/login'}
                                            className="bg-white hover:bg-[#00a4ef] hover:text-white text-ela-text border border-ela-border hover:border-[#00a4ef] transition-all duration-300"
                                            size="sm"
                                        >
                                            Conectar
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-8">
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        isLoading={isSaving}
                        icon={Save}
                        className="w-full md:w-auto bg-ela-pink hover:bg-pink-600 px-8 py-3 text-lg shadow-xl shadow-pink-900/20 transition-all hover:scale-105 active:scale-95 text-white"
                    >
                        Salvar Tudo
                    </Button>
                </div>
            </div>
        </div>
    );
}

