import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Brain, Trash2, Search, Clock, Plus, Check, Eye } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import EmptyState from '../components/EmptyState';

export function BrainPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'memories' | 'rules' | 'monitors'>('memories');
    const [memories, setMemories] = useState<any[]>([]);
    const [rules, setRules] = useState<any[]>([]);
    const [monitors, setMonitors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [newRuleKey, setNewRuleKey] = useState('');
    const [newRuleValue, setNewRuleValue] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [isSavingRule, setIsSavingRule] = useState(false);

    useEffect(() => {
        fetchData();
    }, [user]);

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const [memoriesRes, rulesRes, monitorsRes] = await Promise.all([
                supabase.from('memories').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('user_preferences').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('monitors' as any).select('*').eq('user_id', user.id).order('created_at', { ascending: false })
            ]);

            if (memoriesRes.data) setMemories(memoriesRes.data);
            if (rulesRes.data) setRules(rulesRes.data);
            if (monitorsRes.data) setMonitors(monitorsRes.data);
        } catch (error) {
            console.error('Error fetching brain data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMemory = async (id: string) => {
        if (!confirm('Tem certeza que deseja apagar esta memória?')) return;
        try {
            const { error } = await supabase.from('memories').delete().eq('id', id);
            if (error) throw error;
            setMemories(memories.filter(m => m.id !== id));
        } catch (error) {
            console.error('Error deleting memory:', error);
        }
    };

    const handleDeleteRule = async (id: string) => {
        if (!confirm('Tem certeza que deseja apagar esta regra?')) return;
        try {
            const { error } = await supabase.from('user_preferences').delete().eq('id', id);
            if (error) throw error;
            setRules(rules.filter(r => r.id !== id));
        } catch (error) {
            console.error('Error deleting rule:', error);
        }
    };

    const handleAddRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newRuleKey.trim() || !newRuleValue.trim()) return;
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
            fetchData();
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Error adding rule:', error);
        } finally {
            setIsSavingRule(false);
        }
    };

    const handleDeleteMonitor = async (id: string) => {
        if (!confirm('Apagar este monitor?')) return;
        try {
            const { error } = await supabase.from('monitors' as any).delete().eq('id', id);
            if (error) throw error;
            setMonitors(monitors.filter(m => m.id !== id));
        } catch (error) {
            console.error('Error deleting monitor:', error);
        }
    };

    const filteredMemories = memories.filter(mem =>
        mem.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-ela-bg overflow-hidden pb-20 md:pb-0">
            {/* Header */}
            <div className="flex-none p-6 border-b border-ela-border bg-white">
                <div className="flex items-center gap-3 mb-2">
                    <Brain className="w-8 h-8 text-ela-pink" />
                    <h1 className="text-2xl font-bold text-ela-text">Cérebro da IA</h1>
                </div>
                <p className="text-ela-sub">
                    Gerencie o que a IA sabe sobre você, suas regras e o que ela está monitorando.
                </p>
            </div>

            {/* Tabs */}
            <div className="flex-none px-6 border-b border-ela-border bg-white">
                <div className="flex space-x-6">
                    <button
                        onClick={() => setActiveTab('memories')}
                        className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'memories'
                            ? 'border-ela-pink text-ela-pink'
                            : 'border-transparent text-ela-sub hover:text-ela-text'
                            }`}
                    >
                        Memórias
                    </button>
                    <button
                        onClick={() => setActiveTab('rules')}
                        className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'rules'
                            ? 'border-ela-pink text-ela-pink'
                            : 'border-transparent text-ela-sub hover:text-ela-text'
                            }`}
                    >
                        Regras & Aprendizado
                    </button>
                    <button
                        onClick={() => setActiveTab('monitors')}
                        className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'monitors'
                            ? 'border-ela-pink text-ela-pink'
                            : 'border-transparent text-ela-sub hover:text-ela-text'
                            }`}
                    >
                        Monitores 🕵️
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ela-pink"></div>
                    </div>
                ) : (
                    <div className="space-y-6 max-w-4xl mx-auto">
                        {/* Monitors Tab Content */}
                        {activeTab === 'monitors' && (
                            <div className="space-y-4">
                                {monitors.length === 0 ? (
                                    <EmptyState
                                        icon={Eye}
                                        title="Nenhum monitor ativo"
                                        description="Posso ficar de olho em palavras-chave nos seus grupos e te avisar quando algo importante for mencionado."
                                        exampleCommand="Me avise quando falarem 'urgente' no grupo da Família"
                                    />
                                ) : (
                                    <div className="grid gap-4">
                                        {monitors.map(monitor => (
                                            <div key={monitor.id} className="bg-white p-4 rounded-xl border border-ela-border flex justify-between items-center group hover:border-ela-pink/50 transition-colors shadow-sm">
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <h3 className="font-semibold text-ela-text text-lg">"{monitor.keyword}"</h3>
                                                        <span className={`text-xs px-2 py-0.5 rounded-full ${monitor.chat_name ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-green-50 text-green-600 border border-green-100'}`}>
                                                            {monitor.chat_name ? `Em: ${monitor.chat_name}` : 'Todos os Chats'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-ela-sub">
                                                        <span className="flex items-center gap-1">
                                                            <Clock size={14} />
                                                            {monitor.frequency === 'once' ? 'Avisar 1 vez' : monitor.frequency === 'always' ? 'Sempre avisar' : 'Perguntar se para'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteMonitor(monitor.id)}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Parar de monitorar"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Rules Tab Content */}
                        {activeTab === 'rules' && (
                            <div className="space-y-6">
                                {/* Add Rule Form */}
                                <div className="bg-white p-6 rounded-xl border border-ela-border shadow-sm">
                                    <h3 className="text-lg font-semibold text-ela-text mb-4 flex items-center gap-2">
                                        <Plus size={20} className="text-ela-pink" />
                                        Adicionar Nova Regra
                                    </h3>
                                    <form onSubmit={handleAddRule} className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-ela-sub mb-1">Nome da Regra</label>
                                            <input
                                                type="text"
                                                value={newRuleKey}
                                                onChange={(e) => setNewRuleKey(e.target.value)}
                                                placeholder="Ex: Preferência de Horário"
                                                className="w-full bg-white border border-ela-border rounded-xl px-4 py-2 text-ela-text focus:ring-2 focus:ring-ela-pink focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-ela-sub mb-1">Descrição / Instrução</label>
                                            <textarea
                                                value={newRuleValue}
                                                onChange={(e) => setNewRuleValue(e.target.value)}
                                                placeholder="Ex: Sempre me lembre das reuniões 15 minutos antes."
                                                rows={3}
                                                className="w-full bg-white border border-ela-border rounded-xl px-4 py-2 text-ela-text focus:ring-2 focus:ring-ela-pink focus:border-transparent"
                                            />
                                        </div>
                                        <div className="flex justify-end items-center gap-4">
                                            {showSuccess && (
                                                <span className="text-green-600 text-sm flex items-center gap-1">
                                                    <Check size={16} /> Salvo com sucesso!
                                                </span>
                                            )}
                                            <button
                                                type="submit"
                                                disabled={isSavingRule || !newRuleKey.trim() || !newRuleValue.trim()}
                                                className="bg-ela-pink hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 shadow-md"
                                            >
                                                {isSavingRule ? 'Salvando...' : 'Salvar Regra'}
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* Rules List */}
                                <div className="space-y-4">
                                    {rules.length === 0 ? (
                                        <EmptyState
                                            icon={Brain}
                                            title="Sem regras definidas"
                                            description="As regras me ajudam a entender suas preferências. Você pode criar regras aqui ou pedir direto no chat."
                                            exampleCommand="Crie uma regra: Sempre me chame de Senhor"
                                        />
                                    ) : (
                                        rules.map(rule => (
                                            <div key={rule.id} className="bg-white p-4 rounded-xl border border-ela-border group hover:border-ela-pink/50 transition-colors shadow-sm">
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-semibold text-ela-text text-lg">{rule.key}</h4>
                                                    <button
                                                        onClick={() => handleDeleteRule(rule.id)}
                                                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                                <p className="text-ela-sub whitespace-pre-wrap">{typeof rule.value === 'string' ? rule.value : JSON.stringify(rule.value)}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Memories Tab Content */}
                        {activeTab === 'memories' && (
                            <div className="space-y-6">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Buscar nas memórias..."
                                        className="w-full bg-white border border-ela-border rounded-xl pl-10 pr-4 py-3 text-ela-text focus:ring-2 focus:ring-ela-pink focus:border-transparent placeholder-gray-400 shadow-sm"
                                    />
                                </div>

                                <div className="space-y-4">
                                    {filteredMemories.length === 0 ? (
                                        <EmptyState
                                            icon={Brain}
                                            title="Nenhuma memória encontrada"
                                            description="Eu guardo automaticamente informações importantes que você me conta. Tente me ensinar algo novo."
                                            exampleCommand="Lembre-se que o código do portão é 1234"
                                        />
                                    ) : (
                                        filteredMemories.map(memory => (
                                            <div key={memory.id} className="bg-white p-4 rounded-xl border border-ela-border group hover:border-ela-pink/50 transition-colors shadow-sm">
                                                <div className="flex justify-between items-start gap-4">
                                                    <p className="text-ela-text flex-1">{memory.content}</p>
                                                    <button
                                                        onClick={() => handleDeleteMemory(memory.id)}
                                                        className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors shrink-0"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                                <div className="mt-2 flex items-center gap-2 text-xs text-ela-sub">
                                                    <Clock size={12} />
                                                    {new Date(memory.created_at).toLocaleDateString('pt-BR', {
                                                        day: '2-digit',
                                                        month: 'long',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showSuccess && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2 animate-fade-in-up z-50">
                    <Check size={20} />
                    <span>Salvo com sucesso!</span>
                </div>
            )}
        </div>
    );
}
