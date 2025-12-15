import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Shield, Trash2, BookOpen, User, Search, Save, X, Plus, Brain, Smartphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UserSettings {
    user_id: string;
    preferred_name: string;
    ai_model: string;
    is_admin: boolean;
    ai_name: string;
    phone_number: string;
    created_at: string;
}

interface UserRule {
    id: string;
    key: string;
    value: string;
}

export function AdminPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<UserSettings[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<UserSettings[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserSettings | null>(null);
    const [userRules, setUserRules] = useState<UserRule[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'profile' | 'rules'>('profile');

    // Edit States
    const [editForm, setEditForm] = useState<Partial<UserSettings>>({});
    const [isEditing, setIsEditing] = useState(false);

    // New Rule State
    const [newRuleKey, setNewRuleKey] = useState('');
    const [newRuleValue, setNewRuleValue] = useState('');
    const [isAddingRule, setIsAddingRule] = useState(false);

    useEffect(() => {
        checkAdmin();
    }, [user]);

    useEffect(() => {
        if (searchQuery.trim() === '') {
            setFilteredUsers(users);
        } else {
            const query = searchQuery.toLowerCase();
            setFilteredUsers(users.filter(u =>
                (u.preferred_name?.toLowerCase() || '').includes(query) ||
                (u.user_id?.toLowerCase() || '').includes(query) ||
                (u.phone_number?.toLowerCase() || '').includes(query)
            ));
        }
    }, [searchQuery, users]);

    const checkAdmin = async () => {
        if (!user) return;
        // Fallback for immediate access
        if (user.email === 'vitorgambetti@gmail.com') {
            fetchUsers();
            setLoading(false);
            return;
        }

        const { data } = await supabase
            .from('user_settings')
            .select('is_admin')
            .eq('user_id', user.id)
            .single();

        if ((data as any)?.is_admin) {
            fetchUsers();
        } else {
            navigate('/');
        }
        setLoading(false);
    };

    const fetchUsers = async () => {
        const { data } = await supabase
            .from('user_settings')
            .select('*')
            .order('created_at', { ascending: false });

        if (data) {
            setUsers(data as any);
            setFilteredUsers(data as any);
        }
    };

    const fetchRules = async (userId: string) => {
        const { data } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', userId);
        if (data) setUserRules(data as any);
    };

    const handleSelectUser = (u: UserSettings) => {
        setSelectedUser(u);
        setEditForm(u);
        setIsEditing(false);
        setActiveTab('profile');
        fetchRules(u.user_id);
    };

    const handleSaveProfile = async () => {
        if (!selectedUser) return;

        const { error } = await supabase
            .from('user_settings')
            .update(editForm)
            .eq('user_id', selectedUser.user_id);

        if (!error) {
            setUsers(users.map(u => u.user_id === selectedUser.user_id ? { ...u, ...editForm } : u));
            setSelectedUser({ ...selectedUser, ...editForm });
            setIsEditing(false);
            alert('Perfil atualizado com sucesso!');
        } else {
            alert('Erro ao atualizar perfil.');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('ATENÇÃO: Isso apagará TODAS as configurações e memórias deste usuário. Continuar?')) return;

        const { error } = await supabase
            .from('user_settings')
            .delete()
            .eq('user_id', userId);

        if (!error) {
            setUsers(users.filter(u => u.user_id !== userId));
            if (selectedUser?.user_id === userId) setSelectedUser(null);
        } else {
            alert('Erro ao deletar usuário.');
        }
    };

    const handleAddRule = async () => {
        if (!selectedUser || !newRuleKey || !newRuleValue) return;

        const { data, error } = await supabase
            .from('user_preferences')
            .insert({
                user_id: selectedUser.user_id,
                key: newRuleKey,
                value: newRuleValue
            })
            .select()
            .single();

        if (!error && data) {
            setUserRules([...userRules, data as any]);
            setNewRuleKey('');
            setNewRuleValue('');
            setIsAddingRule(false);
        } else {
            alert('Erro ao adicionar regra.');
        }
    };

    const handleDeleteRule = async (ruleId: string) => {
        if (!confirm('Apagar esta regra?')) return;

        const { error } = await supabase
            .from('user_preferences')
            .delete()
            .eq('id', ruleId);

        if (!error) {
            setUserRules(userRules.filter(r => r.id !== ruleId));
        }
    };

    // Stats
    const totalUsers = users.length;
    const totalAdmins = users.filter(u => u.is_admin).length;
    const gpt5Users = users.filter(u => u.ai_model?.includes('5.1')).length;

    if (loading) return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-900 text-white pb-20">
            {/* Header */}
            <div className="bg-gray-800/50 backdrop-blur-xl border-b border-gray-700 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Shield className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                Admin Dashboard
                            </h1>
                            <p className="text-xs text-gray-400">Gerenciamento do Sistema</p>
                        </div>
                    </div>

                    {/* Stats Pills */}
                    <div className="hidden md:flex gap-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full border border-gray-700">
                            <User size={14} className="text-gray-400" />
                            <span className="text-sm font-medium">{totalUsers} Usuários</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full border border-gray-700">
                            <Shield size={14} className="text-purple-400" />
                            <span className="text-sm font-medium">{totalAdmins} Admins</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full border border-gray-700">
                            <Brain size={14} className="text-green-400" />
                            <span className="text-sm font-medium">{gpt5Users} GPT-5.1</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-4 grid gap-6 lg:grid-cols-12 h-[calc(100vh-100px)]">

                {/* Left Column: User List */}
                <div className="lg:col-span-4 flex flex-col bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden backdrop-blur-sm">
                    <div className="p-4 border-b border-gray-700 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar usuários..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredUsers.map(u => (
                            <button
                                key={u.user_id}
                                onClick={() => handleSelectUser(u)}
                                className={clsx(
                                    "w-full text-left p-3 rounded-xl transition-all border",
                                    selectedUser?.user_id === u.user_id
                                        ? "bg-blue-600/10 border-blue-500/50 shadow-lg shadow-blue-900/20"
                                        : "bg-transparent border-transparent hover:bg-gray-700/50 text-gray-400 hover:text-white"
                                )}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={clsx("font-semibold", selectedUser?.user_id === u.user_id ? "text-blue-400" : "text-gray-200")}>
                                        {u.preferred_name || 'Sem Nome'}
                                    </span>
                                    {u.is_admin && <Shield size={14} className="text-purple-400" />}
                                </div>
                                <div className="text-xs text-gray-500 truncate mb-2 font-mono opacity-60">{u.user_id}</div>
                                <div className="flex items-center gap-2">
                                    <span className={clsx(
                                        "text-[10px] px-2 py-0.5 rounded-full border",
                                        u.ai_model?.includes('5.1')
                                            ? "bg-green-500/10 text-green-400 border-green-500/20"
                                            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                    )}>
                                        {u.ai_model || 'gpt-4o'}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Column: Details */}
                <div className="lg:col-span-8 flex flex-col bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden backdrop-blur-sm relative">
                    {selectedUser ? (
                        <>
                            {/* User Header */}
                            <div className="p-6 border-b border-gray-700 flex justify-between items-start bg-gray-800/80">
                                <div>
                                    <h2 className="text-2xl font-bold text-white mb-1">{selectedUser.preferred_name}</h2>
                                    <div className="flex items-center gap-3 text-sm text-gray-400">
                                        <span className="font-mono bg-gray-900 px-2 py-0.5 rounded text-xs">{selectedUser.user_id}</span>
                                        <span>•</span>
                                        <span>Criado em {selectedUser.created_at ? format(new Date(selectedUser.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {isEditing ? (
                                        <>
                                            <button
                                                onClick={() => setIsEditing(false)}
                                                className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 transition-colors"
                                            >
                                                <X size={20} />
                                            </button>
                                            <button
                                                onClick={handleSaveProfile}
                                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                                            >
                                                <Save size={18} />
                                                Salvar
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                                        >
                                            Editar Perfil
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-gray-700 px-6">
                                <button
                                    onClick={() => setActiveTab('profile')}
                                    className={clsx(
                                        "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                                        activeTab === 'profile'
                                            ? "border-blue-500 text-blue-400"
                                            : "border-transparent text-gray-400 hover:text-white"
                                    )}
                                >
                                    Perfil & Configurações
                                </button>
                                <button
                                    onClick={() => setActiveTab('rules')}
                                    className={clsx(
                                        "px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
                                        activeTab === 'rules'
                                            ? "border-purple-500 text-purple-400"
                                            : "border-transparent text-gray-400 hover:text-white"
                                    )}
                                >
                                    Memórias & Regras
                                    <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full text-xs">{userRules.length}</span>
                                </button>
                            </div>

                            {/* Content Area */}
                            <div className="flex-1 overflow-y-auto p-6">
                                {activeTab === 'profile' && (
                                    <div className="space-y-6 max-w-2xl">
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-400">Nome Preferido</label>
                                                <input
                                                    type="text"
                                                    disabled={!isEditing}
                                                    value={editForm.preferred_name || ''}
                                                    onChange={e => setEditForm({ ...editForm, preferred_name: e.target.value })}
                                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-400">Nome da IA</label>
                                                <input
                                                    type="text"
                                                    disabled={!isEditing}
                                                    value={editForm.ai_name || ''}
                                                    onChange={e => setEditForm({ ...editForm, ai_name: e.target.value })}
                                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-400">Telefone (WhatsApp)</label>
                                                <div className="relative">
                                                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                    <input
                                                        type="text"
                                                        disabled={!isEditing}
                                                        value={editForm.phone_number || ''}
                                                        onChange={e => setEditForm({ ...editForm, phone_number: e.target.value })}
                                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-10 pr-3 py-3 focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-400">Modelo de IA</label>
                                                <div className="relative">
                                                    <Brain className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                    <select
                                                        disabled={!isEditing}
                                                        value={editForm.ai_model || 'gpt-4o'}
                                                        onChange={e => setEditForm({ ...editForm, ai_model: e.target.value })}
                                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl pl-10 pr-3 py-3 focus:border-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                                                    >
                                                        <option value="gpt-4o">GPT-4o</option>
                                                        <option value="gpt-5.1-preview">GPT 5.1 Preview</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-gray-700">
                                            <label className="flex items-center gap-3 p-4 bg-gray-900/50 rounded-xl border border-gray-700 cursor-pointer hover:bg-gray-900 transition-colors">
                                                <input
                                                    type="checkbox"
                                                    disabled={!isEditing}
                                                    checked={editForm.is_admin || false}
                                                    onChange={e => setEditForm({ ...editForm, is_admin: e.target.checked })}
                                                    className="w-5 h-5 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-800"
                                                />
                                                <div>
                                                    <span className="font-medium text-white block">Acesso de Administrador</span>
                                                    <span className="text-sm text-gray-400">Permite acesso total a este painel e configurações globais.</span>
                                                </div>
                                            </label>
                                        </div>

                                        <div className="pt-6">
                                            <button
                                                onClick={() => handleDeleteUser(selectedUser.user_id)}
                                                className="w-full p-4 border border-red-500/30 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Trash2 size={18} />
                                                Deletar Usuário Permanentemente
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'rules' && (
                                    <div className="space-y-4">
                                        {/* Add Rule */}
                                        <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                                            {!isAddingRule ? (
                                                <button
                                                    onClick={() => setIsAddingRule(true)}
                                                    className="flex items-center gap-2 text-blue-400 hover:text-blue-300 font-medium"
                                                >
                                                    <Plus size={18} />
                                                    Adicionar Nova Regra/Memória
                                                </button>
                                            ) : (
                                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                                    <input
                                                        type="text"
                                                        placeholder="Chave (ex: time_futebol, aniversario)"
                                                        value={newRuleKey}
                                                        onChange={e => setNewRuleKey(e.target.value)}
                                                        className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2 text-sm focus:border-blue-500 outline-none"
                                                    />
                                                    <textarea
                                                        placeholder="Valor (ex: Corinthians, 25/12/1990)"
                                                        value={newRuleValue}
                                                        onChange={e => setNewRuleValue(e.target.value)}
                                                        className="w-full bg-gray-800 border border-gray-600 rounded-lg p-2 text-sm focus:border-blue-500 outline-none h-20 resize-none"
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => setIsAddingRule(false)}
                                                            className="px-3 py-1.5 text-sm text-gray-400 hover:text-white"
                                                        >
                                                            Cancelar
                                                        </button>
                                                        <button
                                                            onClick={handleAddRule}
                                                            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500"
                                                        >
                                                            Salvar Regra
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Rules List */}
                                        <div className="space-y-2">
                                            {userRules.length === 0 ? (
                                                <div className="text-center py-12 text-gray-500">
                                                    <BookOpen size={32} className="mx-auto mb-3 opacity-20" />
                                                    <p>Nenhuma memória registrada.</p>
                                                </div>
                                            ) : (
                                                userRules.map(rule => (
                                                    <div key={rule.id} className="group flex items-start justify-between p-4 bg-gray-900/30 border border-gray-700/50 rounded-xl hover:border-gray-600 transition-colors">
                                                        <div>
                                                            <span className="text-xs font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded mb-1 inline-block">
                                                                {rule.key}
                                                            </span>
                                                            <p className="text-gray-300 text-sm whitespace-pre-wrap">{rule.value}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteRule(rule.id)}
                                                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                                <User size={40} className="opacity-20" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-400">Nenhum usuário selecionado</h3>
                            <p className="text-sm opacity-60">Selecione um usuário na lista para ver detalhes</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
