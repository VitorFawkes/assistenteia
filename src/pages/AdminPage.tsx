import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Shield, Trash2, BookOpen, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface UserSettings {
    user_id: string;
    preferred_name: string;
    ai_model: string;
    is_admin: boolean;
    ai_name: string;
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
    const [selectedUser, setSelectedUser] = useState<UserSettings | null>(null);
    const [userRules, setUserRules] = useState<UserRule[]>([]);

    useEffect(() => {
        checkAdmin();
    }, [user]);

    const checkAdmin = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('user_settings')
            .select('is_admin')
            .eq('user_id', user.id)
            .single();

        // Cast data to any to avoid TS error if types are not updated
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

        if (data) setUsers(data as any);
    };

    const fetchRules = async (userId: string) => {
        const { data } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', userId);
        if (data) setUserRules(data as any);
    };

    const handleUpdateModel = async (userId: string, newModel: string) => {
        const { error } = await supabase
            .from('user_settings')
            .update({ ai_model: newModel })
            .eq('user_id', userId);

        if (!error) {
            setUsers(users.map(u => u.user_id === userId ? { ...u, ai_model: newModel } : u));
            alert('Modelo atualizado!');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('Tem certeza? Isso apagará as configurações do usuário.')) return;

        const { error } = await supabase
            .from('user_settings')
            .delete()
            .eq('user_id', userId);

        if (!error) {
            setUsers(users.filter(u => u.user_id !== userId));
            if (selectedUser?.user_id === userId) setSelectedUser(null);
        }
    };

    const handleSelectUser = (u: UserSettings) => {
        setSelectedUser(u);
        fetchRules(u.user_id);
    };

    if (loading) return <div className="p-8 text-center">Carregando...</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <div className="bg-white shadow-sm border-b px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
                <Shield className="w-6 h-6 text-purple-600" />
                <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>
            </div>

            <div className="max-w-4xl mx-auto p-4 grid gap-6 md:grid-cols-3">

                {/* User List */}
                <div className="md:col-span-1 bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b font-medium text-gray-600">Usuários ({users.length})</div>
                    <div className="divide-y max-h-[70vh] overflow-y-auto">
                        {users.map(u => (
                            <div
                                key={u.user_id}
                                onClick={() => handleSelectUser(u)}
                                className={`p-4 cursor-pointer hover:bg-purple-50 transition-colors ${selectedUser?.user_id === u.user_id ? 'bg-purple-50 border-l-4 border-purple-600' : ''}`}
                            >
                                <div className="font-semibold text-gray-800 flex items-center gap-2">
                                    {u.preferred_name || 'Sem Nome'}
                                    {u.is_admin && <Shield className="w-3 h-3 text-purple-600" />}
                                </div>
                                <div className="text-xs text-gray-500 truncate">{u.user_id}</div>
                                <div className="mt-2 flex items-center gap-2 text-xs">
                                    <span className={`px-2 py-0.5 rounded-full ${u.ai_model.includes('5.1') ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {u.ai_model}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* User Details */}
                <div className="md:col-span-2 space-y-6">
                    {selectedUser ? (
                        <>
                            {/* Actions Card */}
                            <div className="bg-white rounded-xl shadow-sm border p-6">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-800">{selectedUser.preferred_name}</h2>
                                        <p className="text-sm text-gray-500">{selectedUser.user_id}</p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteUser(selectedUser.user_id)}
                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Deletar Usuário"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="grid gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Modelo de IA</label>
                                        <div className="flex gap-2">
                                            <select
                                                value={selectedUser.ai_model}
                                                onChange={(e) => handleUpdateModel(selectedUser.user_id, e.target.value)}
                                                className="flex-1 p-2 border rounded-lg bg-white"
                                            >
                                                <option value="gpt-4o">GPT-4o</option>
                                                <option value="gpt-5.1-preview">GPT 5.1 Preview</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Rules Card */}
                            <div className="bg-white rounded-xl shadow-sm border p-6">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <BookOpen className="w-5 h-5 text-blue-600" />
                                    Regras Aprendidas ({userRules.length})
                                </h3>
                                {userRules.length === 0 ? (
                                    <p className="text-gray-400 italic">Nenhuma regra aprendida ainda.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {userRules.map(rule => (
                                            <div key={rule.id} className="p-3 bg-gray-50 rounded-lg border text-sm">
                                                <span className="font-bold text-gray-700 block mb-1">{rule.key}</span>
                                                <span className="text-gray-600">{rule.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 p-12 border-2 border-dashed rounded-xl">
                            <User className="w-12 h-12 mb-4 opacity-20" />
                            <p>Selecione um usuário para gerenciar</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
