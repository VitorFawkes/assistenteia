import { useEffect, useState } from 'react';

import { Brain, Sparkles, Search, Trash2, Plus, BookOpen, Settings, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

import { supabase } from '../lib/supabase';

interface MemoryVector {
    id: string;
    content: string;
    created_at: string | null;
    similarity?: number;
}

interface UserRule {
    id: string;
    key: string;
    value: string;
    created_at: string | null;
}

export default function BrainPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'memories' | 'rules' | 'settings'>('memories');

    // Mobile detection with matchMedia API (more reliable than innerWidth)
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia('(max-width: 767px)').matches;
        }
        return false;
    });

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 767px)');
        const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);

        // Set initial value
        setIsMobile(mediaQuery.matches);

        // Listen for changes
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Memories State
    const [memories, setMemories] = useState<MemoryVector[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    // Rules State
    const [rules, setRules] = useState<UserRule[]>([]);
    const [newRuleKey, setNewRuleKey] = useState('');
    const [newRuleValue, setNewRuleValue] = useState('');
    const [isSavingRule, setIsSavingRule] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    // Settings State
    const [settings, setSettings] = useState<{ custom_system_prompt: string; ai_model: string } | null>(null);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    useEffect(() => {
        if (user) {
            if (activeTab === 'memories') {
                fetchMemories();
            } else if (activeTab === 'rules') {
                fetchRules();
            } else if (activeTab === 'settings') {
                fetchSettings();
            }
        }
    }, [user, activeTab]);

    // --- MEMORIES LOGIC ---
    const fetchMemories = async () => {
        if (!user) return;
        setIsSearching(true);
        try {
            let query = supabase
                .from('memories')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (searchQuery.trim()) {
                // Using ilike for simple text search on content
                query = query.ilike('content', `%${searchQuery}%`);
            }

            const { data, error } = await query.limit(50);

            if (error) throw error;
            setMemories(data || []);
        } catch (error) {
            console.error('Error fetching memories:', error);
        } finally {
            setIsSearching(false);
        }
    };

    const deleteMemory = async (id: string) => {
        if (!confirm('Esquecer esta memória?')) return;
        try {
            const { error } = await supabase.from('memories').delete().eq('id', id);
            if (error) throw error;
            setMemories(memories.filter(m => m.id !== id));
        } catch (error) {
            console.error('Error deleting memory:', error);
        }
    };

    // --- RULES LOGIC ---
    const fetchRules = async () => {
        if (!user) return;
        console.log('Fetching rules for user:', user.id);
        const { data, error } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching rules:', error);
        } else {
            console.log('Rules fetched:', data);
        }

        // Map data to match interface
        const formattedRules = (data || []).map((r: any) => ({
            ...r,
            value: typeof r.value === 'string' ? r.value : JSON.stringify(r.value)
        }));

        setRules(formattedRules);
    };

    const addRule = async () => {
        if (!user || !newRuleKey || !newRuleValue) return;
        setIsSavingRule(true);
        try {
            const { error } = await supabase.from('user_preferences').insert({
                user_id: user.id,
                key: newRuleKey,
                value: newRuleValue
            });
            if (error) throw error;
            setNewRuleKey('');
            setNewRuleValue('');
            fetchRules();
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Error adding rule:', error);
        } finally {
            setIsSavingRule(false);
        }
    };

    const deleteRule = async (id: string) => {
        if (!confirm('Apagar esta regra?')) return;
        try {
            await supabase.from('user_preferences').delete().eq('id', id);
            setRules(rules.filter(r => r.id !== id));
        } catch (error) {
            console.error('Error deleting rule:', error);
        }
    };

    // --- SETTINGS LOGIC ---
    const fetchSettings = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) console.error('Error fetching settings:', error);

        if (data) {
            setSettings({
                custom_system_prompt: data.custom_system_prompt || '',
                ai_model: data.ai_model || 'gpt-4o'
            });
        } else {
            // Default settings if none exist
            setSettings({
                custom_system_prompt: '',
                ai_model: 'gpt-4o'
            });
        }
    };

    const saveSettings = async () => {
        if (!user || !settings) return;
        setIsSavingSettings(true);
        try {
            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    custom_system_prompt: settings.custom_system_prompt,
                    ai_model: settings.ai_model
                });

            if (error) throw error;
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('Erro ao salvar configurações. Verifique se a tabela user_settings existe.');
        } finally {
            setIsSavingSettings(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-900 overflow-hidden">
            {/* Mobile Tab Navigation - Only rendered on mobile */}
            {isMobile && (
                <div className="bg-gray-800 border-b border-gray-700 p-3 shrink-0 flex flex-col">
                    <div className="flex items-center gap-2 mb-3 px-1">
                        <Brain className="text-purple-500" size={24} />
                        <h2 className="text-lg font-bold text-white">Cérebro</h2>
                    </div>
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                        <button
                            onClick={() => setActiveTab('memories')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0 ${activeTab === 'memories'
                                ? 'bg-purple-600 text-white shadow-lg'
                                : 'bg-gray-700 text-gray-400 hover:text-white'
                                }`}
                        >
                            <Sparkles size={16} />
                            Memórias
                        </button>
                        <button
                            onClick={() => setActiveTab('rules')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0 ${activeTab === 'rules'
                                ? 'bg-purple-600 text-white shadow-lg'
                                : 'bg-gray-700 text-gray-400 hover:text-white'
                                }`}
                        >
                            <BookOpen size={16} />
                            Regras
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0 ${activeTab === 'settings'
                                ? 'bg-purple-600 text-white shadow-lg'
                                : 'bg-gray-700 text-gray-400 hover:text-white'
                                }`}
                        >
                            <Settings size={16} />
                            Config
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-1 min-h-0">
                {/* Desktop Sidebar - Only rendered on desktop */}
                {!isMobile && (
                    <div className="w-64 bg-gray-800 border-r border-gray-700 p-4 flex flex-col gap-2 shrink-0">
                        <div className="mb-6 px-2">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Brain className="text-purple-500" />
                                Cérebro
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">Gerencie a inteligência da IA</p>
                        </div>

                        <Button
                            variant={activeTab === 'memories' ? 'primary' : 'ghost'}
                            onClick={() => setActiveTab('memories')}
                            className={`w-full justify-start ${activeTab === 'memories' ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20' : ''}`}
                            icon={Sparkles}
                        >
                            Memórias (RAG)
                        </Button>

                        <Button
                            variant={activeTab === 'rules' ? 'primary' : 'ghost'}
                            onClick={() => setActiveTab('rules')}
                            className={`w-full justify-start ${activeTab === 'rules' ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20' : ''}`}
                            icon={BookOpen}
                        >
                            Regras & Prefs
                        </Button>

                        <Button
                            variant={activeTab === 'settings' ? 'primary' : 'ghost'}
                            onClick={() => setActiveTab('settings')}
                            className={`w-full justify-start ${activeTab === 'settings' ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20' : ''}`}
                            icon={Settings}
                        >
                            Configurações Avançadas
                        </Button>
                    </div>
                )}

                {/* Content Area */}
                <div className="flex-1 overflow-auto p-4 md:p-6">
                    {activeTab === 'memories' && (
                        <div className="max-w-4xl mx-auto">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-white">Memórias de Longo Prazo</h2>
                                    <p className="text-gray-400">O que a IA aprendeu sobre você e lembrou.</p>
                                </div>
                                <div className="relative w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Buscar memórias..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>
                            </div>

                            {isSearching ? (
                                <div className="text-center py-20 text-gray-500">Carregando memórias...</div>
                            ) : memories.length > 0 ? (
                                <div className="grid gap-4">
                                    {memories.map(mem => (
                                        <Card key={mem.id} className="p-4 flex justify-between items-start group" hover>
                                            <div>
                                                <p className="text-gray-200 text-lg">{mem.content}</p>
                                                <p className="text-xs text-gray-500 mt-2">
                                                    Aprendido em {mem.created_at ? format(new Date(mem.created_at), "d 'de' MMMM, HH:mm", { locale: ptBR }) : 'Data desconhecida'}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => deleteMemory(mem.id)}
                                                className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                                title="Esquecer"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-2xl">
                                    <Sparkles size={48} className="mx-auto text-gray-700 mb-4" />
                                    <p className="text-gray-500">Nenhuma memória encontrada.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'rules' && (
                        <div className="max-w-4xl mx-auto">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-white">Regras & Preferências</h2>
                                    <p className="text-gray-400">Defina comportamentos fixos para a IA.</p>
                                </div>
                                <Button
                                    onClick={fetchRules}
                                    variant="ghost"
                                    className="text-gray-400 hover:text-white"
                                    title="Atualizar lista"
                                >
                                    <Sparkles size={18} />
                                </Button>
                            </div>

                            <Card className="p-4 mb-8 bg-gray-800/50 border-purple-500/20">
                                <h3 className="text-lg font-medium text-white mb-4">Adicionar Nova Regra</h3>
                                <div className="flex flex-col md:flex-row gap-3">
                                    <input
                                        type="text"
                                        placeholder="Tópico (ex: Tom de voz)"
                                        value={newRuleKey}
                                        onChange={(e) => setNewRuleKey(e.target.value)}
                                        className="w-full md:w-1/3 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Regra (ex: Sempre seja formal)"
                                        value={newRuleValue}
                                        onChange={(e) => setNewRuleValue(e.target.value)}
                                        className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                    <Button
                                        onClick={addRule}
                                        isLoading={isSavingRule}
                                        disabled={!newRuleKey || !newRuleValue}
                                        icon={Plus}
                                        className="bg-purple-600 hover:bg-purple-500 w-full md:w-auto"
                                    >
                                        Adicionar
                                    </Button>
                                </div>
                            </Card>

                            <div className="grid gap-4">
                                {rules.map(rule => (
                                    <Card key={rule.id} className="p-4 flex justify-between items-center group">
                                        <div className="flex items-center gap-4">
                                            <div className="px-3 py-1 rounded-full bg-purple-500/10 text-purple-400 text-sm font-medium border border-purple-500/20">
                                                {rule.key}
                                            </div>
                                            <p className="text-gray-200">{rule.value}</p>
                                        </div>
                                        <button
                                            onClick={() => deleteRule(rule.id)}
                                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                            title="Remover regra"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </Card>
                                ))}
                                {rules.length === 0 && (
                                    <div className="text-center py-20 border-2 border-dashed border-gray-800 rounded-2xl">
                                        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <BookOpen size={32} className="text-gray-600" />
                                        </div>
                                        <h3 className="text-xl font-medium text-white mb-2">Nenhuma regra definida</h3>
                                        <p className="text-gray-400 max-w-sm mx-auto">
                                            Adicione regras para personalizar o comportamento da sua IA.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && settings && (
                        <div className="max-w-4xl mx-auto">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-white">Configurações Avançadas</h2>
                                    <p className="text-gray-400">Controle total sobre o modelo e o prompt do sistema.</p>
                                </div>
                                <Button
                                    onClick={saveSettings}
                                    isLoading={isSavingSettings}
                                    className="bg-green-600 hover:bg-green-500"
                                    icon={CheckCircle2}
                                >
                                    Salvar Alterações
                                </Button>
                            </div>

                            <div className="space-y-6">
                                <Card className="p-6">
                                    <h3 className="text-lg font-medium text-white mb-4">Modelo de Inteligência Artificial</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {[
                                            { id: 'gpt-4o', name: 'GPT-4o (Recomendado)', desc: 'O modelo mais inteligente e rápido.' },
                                            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', desc: 'Versão anterior de alta capacidade.' },
                                            { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', desc: 'Mais rápido e econômico, menos inteligente.' },
                                            { id: 'gpt-5.1-preview', name: 'GPT 5.1 (Preview)', desc: 'Acesso antecipado (Experimental).' }
                                        ].map(model => (
                                            <div
                                                key={model.id}
                                                onClick={() => setSettings({ ...settings, ai_model: model.id })}
                                                className={`cursor-pointer p-4 rounded-xl border transition-all ${settings.ai_model === model.id
                                                    ? 'bg-purple-600/20 border-purple-500 ring-1 ring-purple-500'
                                                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className={`font-medium ${settings.ai_model === model.id ? 'text-purple-400' : 'text-white'}`}>
                                                        {model.name}
                                                    </span>
                                                    {settings.ai_model === model.id && <CheckCircle2 size={18} className="text-purple-500" />}
                                                </div>
                                                <p className="text-xs text-gray-400">{model.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                        <p className="text-xs text-blue-300 flex items-center gap-2">
                                            <Sparkles size={14} />
                                            O modelo selecionado será usado para todas as novas conversas.
                                        </p>
                                    </div>
                                </Card>

                                <Card className="p-6">
                                    <h3 className="text-lg font-medium text-white mb-2">System Prompt (Prompt Mestre)</h3>
                                    <p className="text-sm text-gray-400 mb-4">
                                        Este é o "cérebro" da IA. Cuidado ao editar. Se deixar em branco, o sistema usará o prompt padrão otimizado.
                                        Use <code>{'{{CURRENT_DATETIME}}'}</code> para injetar a hora atual.
                                    </p>
                                    <textarea
                                        value={settings.custom_system_prompt}
                                        onChange={(e) => setSettings({ ...settings, custom_system_prompt: e.target.value })}
                                        className="w-full h-96 bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm text-gray-300 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 leading-relaxed"
                                        placeholder="Cole aqui o prompt do sistema..."
                                    />
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Success Toast */}
            {
                showSuccess && (
                    <div className="fixed bottom-6 right-6 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in-up z-50">
                        <CheckCircle2 size={18} />
                        <span>Salvo com sucesso!</span>
                    </div>
                )
            }
        </div >
    );
}
