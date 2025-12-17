import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Shield, Trash2, BookOpen, User, Search, Save, X, Plus, Brain, Smartphone, ArrowLeft, Power, Activity, FileText } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { clsx } from 'clsx';

interface UserSettings {
    user_id: string;
    preferred_name: string;
    ai_model: string;
    is_admin: boolean;
    is_active: boolean;
    ai_name: string;
    phone_number: string;
    created_at: string;
    // Feature Flags
    daily_briefing_enabled: boolean;
    storage_download_images: boolean;
    storage_download_videos: boolean;
    storage_download_audio: boolean;
    storage_download_documents: boolean;
    privacy_allow_outgoing: boolean;
    // Prompts
    custom_system_prompt: string;
    daily_briefing_prompt: string;
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
    const [activeTab, setActiveTab] = useState<'profile' | 'features' | 'prompts' | 'rules'>('profile');

    // Edit States
    const [editForm, setEditForm] = useState<Partial<UserSettings>>({});
    const [isEditing, setIsEditing] = useState(false);

    // New Rule State
    const [newRuleKey, setNewRuleKey] = useState('');
    const [newRuleValue, setNewRuleValue] = useState('');
    const [isAddingRule, setIsAddingRule] = useState(false);

    // Create User State
    const [isCreatingUser, setIsCreatingUser] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserName, setNewUserName] = useState('');

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
            alert('Configurações atualizadas com sucesso!');
        } else {
            alert('Erro ao atualizar configurações.');
        }
    };

    const handleCreateUser = async () => {
        if (!newUserEmail || !newUserPassword || !newUserName) {
            alert('Preencha todos os campos');
            return;
        }

        try {
            const { error } = await supabase.functions.invoke('admin-actions', {
                body: {
                    action: 'create_user',
                    payload: {
                        email: newUserEmail,
                        password: newUserPassword,
                        preferred_name: newUserName
                    }
                }
            });

            if (error) throw error;

            alert('Usuário criado com sucesso!');
            setIsCreatingUser(false);
            setNewUserEmail('');
            setNewUserPassword('');
            setNewUserName('');
            fetchUsers(); // Refresh list
        } catch (error: any) {
            console.error(error);
            alert('Erro ao criar usuário: ' + error.message);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('ATENÇÃO: Isso apagará PERMANENTEMENTE o usuário do Auth e do Banco de Dados. Continuar?')) return;

        try {
            const { error } = await supabase.functions.invoke('admin-actions', {
                body: {
                    action: 'delete_user',
                    payload: { user_id: userId }
                }
            });

            if (error) throw error;

            setUsers(users.filter(u => u.user_id !== userId));
            if (selectedUser?.user_id === userId) setSelectedUser(null);
            alert('Usuário deletado com sucesso.');
        } catch (error: any) {
            console.error(error);
            alert('Erro ao deletar usuário: ' + error.message);
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
    const activeUsers = users.filter(u => u.is_active !== false).length;

    if (loading) return (
        <div className="min-h-screen bg-ela-bg flex items-center justify-center text-ela-text">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ela-pink"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-ela-bg text-ela-text pb-20">
            {/* Header */}
            <div className="bg-white border-b border-ela-border sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-ela-pink/10 rounded-lg">
                            <Shield className="w-6 h-6 text-ela-pink" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
                                Admin Dashboard
                            </h1>
                            <p className="text-xs text-ela-sub">Gerenciamento Total</p>
                        </div>
                    </div>

                    {/* Stats Pills */}
                    <div className="flex gap-4 overflow-x-auto pb-2 md:pb-0 no-scrollbar mask-fade-right">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-200 whitespace-nowrap">
                            <User size={14} className="text-gray-400" />
                            <span className="text-sm font-medium text-ela-text">{totalUsers} Usuários</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-200 whitespace-nowrap">
                            <Activity size={14} className="text-green-500" />
                            <span className="text-sm font-medium text-ela-text">{activeUsers} Ativos</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border border-gray-200 whitespace-nowrap">
                            <Shield size={14} className="text-purple-500" />
                            <span className="text-sm font-medium text-ela-text">{totalAdmins} Admins</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-4 grid gap-6 lg:grid-cols-12 h-[calc(100vh-100px)]">

                {/* Left Column: User List */}
                <div className={clsx(
                    "lg:col-span-4 flex flex-col bg-white rounded-2xl border border-ela-border overflow-hidden shadow-sm transition-all",
                    selectedUser ? "hidden lg:flex" : "flex",
                    "lg:flex"
                )}>
                    <div className="p-4 border-b border-ela-border space-y-3">
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-white border border-ela-border rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none transition-all"
                                />
                            </div>
                            <button
                                onClick={() => setIsCreatingUser(true)}
                                className="p-2 bg-ela-pink hover:bg-pink-600 rounded-xl text-white transition-colors shadow-lg shadow-pink-900/20"
                                title="Criar Usuário"
                            >
                                <Plus size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredUsers.map(u => (
                            <button
                                key={u.user_id}
                                onClick={() => handleSelectUser(u)}
                                className={clsx(
                                    "w-full text-left p-3 rounded-xl transition-all border group",
                                    selectedUser?.user_id === u.user_id
                                        ? "bg-ela-pink/10 border-ela-pink/50 shadow-lg shadow-pink-900/10"
                                        : "bg-transparent border-transparent hover:bg-gray-50 text-ela-sub hover:text-ela-text"
                                )}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={clsx("font-semibold", selectedUser?.user_id === u.user_id ? "text-ela-pink" : "text-ela-text")}>
                                        {u.preferred_name || 'Sem Nome'}
                                    </span>
                                    <div className="flex gap-1">
                                        {u.is_active === false && <Power size={14} className="text-red-400" />}
                                        {u.is_admin && <Shield size={14} className="text-purple-500" />}
                                    </div>
                                </div>
                                <div className="text-xs text-ela-sub truncate mb-2 font-mono opacity-60">{u.user_id}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Column: Details */}
                <div className={clsx(
                    "lg:col-span-8 flex flex-col bg-white rounded-2xl border border-ela-border overflow-hidden shadow-sm relative transition-all",
                    selectedUser ? "flex" : "hidden lg:flex"
                )}>
                    {selectedUser ? (
                        <>
                            {/* User Header */}
                            <div className="p-6 border-b border-ela-border flex justify-between items-start bg-gray-50">
                                <div className="flex items-start gap-3">
                                    <button
                                        onClick={() => setSelectedUser(null)}
                                        className="lg:hidden p-1 -ml-2 mr-1 text-gray-400 hover:text-ela-text"
                                    >
                                        <ArrowLeft size={24} />
                                    </button>

                                    <div>
                                        <h2 className="text-2xl font-bold text-ela-text mb-1 flex items-center gap-2">
                                            {selectedUser.preferred_name}
                                            {selectedUser.is_active === false && (
                                                <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full border border-red-200">
                                                    INATIVO
                                                </span>
                                            )}
                                        </h2>
                                        <div className="flex items-center gap-3 text-sm text-ela-sub">
                                            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs hidden sm:inline border border-gray-200">{selectedUser.user_id}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {isEditing ? (
                                        <>
                                            <button
                                                onClick={() => setIsEditing(false)}
                                                className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
                                            >
                                                <X size={20} />
                                            </button>
                                            <button
                                                onClick={handleSaveProfile}
                                                className="px-4 py-2 bg-ela-pink hover:bg-pink-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg shadow-pink-900/20"
                                            >
                                                <Save size={18} />
                                                <span className="hidden sm:inline">Salvar</span>
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-ela-text rounded-lg font-medium transition-colors border border-gray-200"
                                        >
                                            <span className="hidden sm:inline">Editar</span>
                                            <span className="sm:hidden">Editar</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-ela-border px-6 overflow-x-auto">
                                {[
                                    { id: 'profile', label: 'Perfil', icon: User },
                                    { id: 'features', label: 'Funcionalidades', icon: Power },
                                    { id: 'prompts', label: 'Cérebro & Prompts', icon: Brain },
                                    { id: 'rules', label: 'Memórias', icon: BookOpen },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={clsx(
                                            "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2",
                                            activeTab === tab.id
                                                ? "border-ela-pink text-ela-pink"
                                                : "border-transparent text-ela-sub hover:text-ela-text"
                                        )}
                                    >
                                        <tab.icon size={16} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Content Area */}
                            <div className="flex-1 overflow-y-auto p-6">
                                {activeTab === 'profile' && (
                                    <div className="space-y-6 max-w-2xl">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-ela-sub">Nome Preferido</label>
                                                <input
                                                    type="text"
                                                    disabled={!isEditing}
                                                    value={editForm.preferred_name || ''}
                                                    onChange={e => setEditForm({ ...editForm, preferred_name: e.target.value })}
                                                    className="w-full bg-white border border-ela-border rounded-xl p-3 focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none disabled:opacity-50 text-ela-text"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-ela-sub">Nome da IA</label>
                                                <input
                                                    type="text"
                                                    disabled={!isEditing}
                                                    value={editForm.ai_name || ''}
                                                    onChange={e => setEditForm({ ...editForm, ai_name: e.target.value })}
                                                    className="w-full bg-white border border-ela-border rounded-xl p-3 focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none disabled:opacity-50 text-ela-text"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-ela-sub">Telefone (WhatsApp)</label>
                                                <div className="relative">
                                                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                                    <input
                                                        type="text"
                                                        disabled={!isEditing}
                                                        value={editForm.phone_number || ''}
                                                        onChange={e => setEditForm({ ...editForm, phone_number: e.target.value })}
                                                        className="w-full bg-white border border-ela-border rounded-xl pl-10 pr-3 py-3 focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none disabled:opacity-50 text-ela-text"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-ela-sub">Modelo de IA</label>
                                                <div className="relative">
                                                    <Brain className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                                    <select
                                                        disabled={!isEditing}
                                                        value={editForm.ai_model || 'gpt-4o'}
                                                        onChange={e => setEditForm({ ...editForm, ai_model: e.target.value })}
                                                        className="w-full bg-white border border-ela-border rounded-xl pl-10 pr-3 py-3 focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none disabled:opacity-50 appearance-none text-ela-text"
                                                    >
                                                        <option value="gpt-4o">GPT-4o</option>
                                                        <option value="gpt-5.1-preview">GPT 5.1 Preview</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-ela-border space-y-4">
                                            <h3 className="text-sm font-bold text-ela-sub uppercase tracking-wider">Controle de Acesso</h3>

                                            <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
                                                <div>
                                                    <span className="font-medium text-ela-text block">Status da Conta</span>
                                                    <span className="text-sm text-ela-sub">
                                                        {editForm.is_active !== false ? 'Ativo - Usuário pode acessar' : 'Inativo - Acesso bloqueado'}
                                                    </span>
                                                </div>
                                                <div className={clsx("w-12 h-6 rounded-full p-1 transition-colors", editForm.is_active !== false ? "bg-green-500" : "bg-gray-300")}>
                                                    <div className={clsx("w-4 h-4 bg-white rounded-full shadow-sm transition-transform", editForm.is_active !== false ? "translate-x-6" : "translate-x-0")} />
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    className="hidden"
                                                    disabled={!isEditing}
                                                    checked={editForm.is_active !== false}
                                                    onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })}
                                                />
                                            </label>

                                            <label className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
                                                <div>
                                                    <span className="font-medium text-ela-text block">Acesso de Administrador</span>
                                                    <span className="text-sm text-ela-sub">Permite acesso total a este painel.</span>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    disabled={!isEditing}
                                                    checked={editForm.is_admin || false}
                                                    onChange={e => setEditForm({ ...editForm, is_admin: e.target.checked })}
                                                    className="w-5 h-5 rounded border-gray-300 text-ela-pink focus:ring-ela-pink"
                                                />
                                            </label>
                                        </div>

                                        <div className="pt-6">
                                            <button
                                                onClick={() => handleDeleteUser(selectedUser.user_id)}
                                                className="w-full p-4 border border-red-200 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Trash2 size={18} />
                                                Deletar Usuário Permanentemente
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'features' && (
                                    <div className="space-y-6 max-w-2xl">
                                        <div className="space-y-4">
                                            <h3 className="text-sm font-bold text-ela-sub uppercase tracking-wider">Privacidade & Armazenamento</h3>

                                            {[
                                                { key: 'privacy_allow_outgoing', label: 'Permitir Mensagens Ativas', desc: 'IA pode iniciar conversas no WhatsApp' },
                                                { key: 'daily_briefing_enabled', label: 'Resumo Diário', desc: 'Envia briefing matinal automático' },
                                                { key: 'storage_download_images', label: 'Download de Imagens', desc: 'Salva imagens recebidas no Storage' },
                                                { key: 'storage_download_audio', label: 'Download de Áudio', desc: 'Salva áudios recebidos no Storage' },
                                                { key: 'storage_download_documents', label: 'Download de Documentos', desc: 'Salva PDFs e docs no Storage' },
                                            ].map(feature => (
                                                <label key={feature.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
                                                    <div>
                                                        <span className="font-medium text-ela-text block">{feature.label}</span>
                                                        <span className="text-sm text-ela-sub">{feature.desc}</span>
                                                    </div>
                                                    <div className={clsx("w-12 h-6 rounded-full p-1 transition-colors", (editForm as any)[feature.key] ? "bg-ela-pink" : "bg-gray-300")}>
                                                        <div className={clsx("w-4 h-4 bg-white rounded-full shadow-sm transition-transform", (editForm as any)[feature.key] ? "translate-x-6" : "translate-x-0")} />
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        className="hidden"
                                                        disabled={!isEditing}
                                                        checked={(editForm as any)[feature.key] || false}
                                                        onChange={e => setEditForm({ ...editForm, [feature.key]: e.target.checked })}
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'prompts' && (
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-ela-sub flex items-center gap-2">
                                                <Brain size={16} />
                                                Prompt do Sistema (Personalidade)
                                            </label>
                                            <textarea
                                                disabled={!isEditing}
                                                value={editForm.custom_system_prompt || ''}
                                                onChange={e => setEditForm({ ...editForm, custom_system_prompt: e.target.value })}
                                                className="w-full h-64 bg-white border border-ela-border rounded-xl p-4 font-mono text-sm focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none disabled:opacity-50 resize-none text-ela-text"
                                                placeholder="Instruções base para a IA..."
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-ela-sub flex items-center gap-2">
                                                <FileText size={16} />
                                                Prompt do Resumo Diário
                                            </label>
                                            <textarea
                                                disabled={!isEditing}
                                                value={editForm.daily_briefing_prompt || ''}
                                                onChange={e => setEditForm({ ...editForm, daily_briefing_prompt: e.target.value })}
                                                className="w-full h-32 bg-white border border-ela-border rounded-xl p-4 font-mono text-sm focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none disabled:opacity-50 resize-none text-ela-text"
                                                placeholder="Como o resumo deve ser gerado..."
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'rules' && (
                                    <div className="space-y-4">
                                        {/* Add Rule */}
                                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                            {!isAddingRule ? (
                                                <button
                                                    onClick={() => setIsAddingRule(true)}
                                                    className="flex items-center gap-2 text-ela-pink hover:text-pink-600 font-medium"
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
                                                        className="w-full bg-white border border-ela-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none text-ela-text"
                                                    />
                                                    <textarea
                                                        placeholder="Valor (ex: Corinthians, 25/12/1990)"
                                                        value={newRuleValue}
                                                        onChange={e => setNewRuleValue(e.target.value)}
                                                        className="w-full bg-white border border-ela-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none h-20 resize-none text-ela-text"
                                                    />
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => setIsAddingRule(false)}
                                                            className="px-3 py-1.5 text-sm text-ela-sub hover:text-ela-text"
                                                        >
                                                            Cancelar
                                                        </button>
                                                        <button
                                                            onClick={handleAddRule}
                                                            className="px-3 py-1.5 text-sm bg-ela-pink text-white rounded-lg hover:bg-pink-600"
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
                                                <div className="text-center py-12 text-ela-sub">
                                                    <BookOpen size={32} className="mx-auto mb-3 opacity-20" />
                                                    <p>Nenhuma memória registrada.</p>
                                                </div>
                                            ) : (
                                                userRules.map(rule => (
                                                    <div key={rule.id} className="group flex items-start justify-between p-4 bg-gray-50 border border-gray-100 rounded-xl hover:border-gray-200 transition-colors">
                                                        <div>
                                                            <span className="text-xs font-mono text-ela-pink bg-pink-50 px-2 py-0.5 rounded mb-1 inline-block">
                                                                {rule.key}
                                                            </span>
                                                            <p className="text-ela-text text-sm whitespace-pre-wrap">{rule.value}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleDeleteRule(rule.id)}
                                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
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
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-ela-sub">
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
                                <User size={40} className="opacity-20" />
                            </div>
                            <h3 className="text-lg font-medium text-ela-text">Nenhum usuário selecionado</h3>
                            <p className="text-sm opacity-60">Selecione um usuário na lista para ver detalhes</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Create User Modal */}
            {isCreatingUser && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white border border-ela-border rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95">
                        <h2 className="text-xl font-bold text-ela-text mb-4">Criar Novo Usuário</h2>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-ela-sub">Nome</label>
                                <input
                                    type="text"
                                    value={newUserName}
                                    onChange={e => setNewUserName(e.target.value)}
                                    className="w-full bg-white border border-ela-border rounded-xl p-3 focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none text-ela-text"
                                    placeholder="Ex: João Silva"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-ela-sub">Email</label>
                                <input
                                    type="email"
                                    value={newUserEmail}
                                    onChange={e => setNewUserEmail(e.target.value)}
                                    className="w-full bg-white border border-ela-border rounded-xl p-3 focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none text-ela-text"
                                    placeholder="email@exemplo.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-ela-sub">Senha</label>
                                <input
                                    type="password"
                                    value={newUserPassword}
                                    onChange={e => setNewUserPassword(e.target.value)}
                                    className="w-full bg-white border border-ela-border rounded-xl p-3 focus:ring-2 focus:ring-ela-pink focus:border-transparent outline-none text-ela-text"
                                    placeholder="Mínimo 6 caracteres"
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={() => setIsCreatingUser(false)}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-ela-text rounded-xl font-medium transition-colors border border-gray-200"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateUser}
                                    className="flex-1 py-3 bg-ela-pink hover:bg-pink-600 text-white rounded-xl font-medium transition-colors shadow-lg shadow-pink-900/20"
                                >
                                    Criar Conta
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
