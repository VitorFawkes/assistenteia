import { useState, useEffect } from 'react';
import { X, Save, DollarSign, Tag, Layers, Calendar, Lock, Link, User, CheckCircle, FileText } from 'lucide-react';
import Button from '../ui/Button';

interface EditItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (id: string, updates: any) => Promise<void>;
    item: any;
}

type ItemType = 'expense' | 'credential' | 'task' | 'note';

export default function EditItemModal({ isOpen, onClose, onSave, item }: EditItemModalProps) {
    const [type, setType] = useState<ItemType>('note');
    const [content, setContent] = useState('');

    // Expense Fields
    const [amount, setAmount] = useState('');

    // Credential Fields
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [url, setUrl] = useState('');

    // Task Fields
    const [status, setStatus] = useState('todo');
    const [dueDate, setDueDate] = useState('');

    // Common Fields
    const [category, setCategory] = useState('');
    const [section, setSection] = useState('');
    const [date, setDate] = useState('');

    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (item) {
            setType(item.metadata?.type || (item.metadata?.amount ? 'expense' : 'note'));
            setContent(item.content || '');

            // Expense
            setAmount(item.metadata?.amount || item.metadata?.value || '');

            // Credential
            setUsername(item.metadata?.username || '');
            setPassword(item.metadata?.password || '');
            setUrl(item.metadata?.url || '');

            // Task
            setStatus(item.metadata?.status || 'todo');
            setDueDate(item.metadata?.due_date || '');

            // Common
            setCategory(item.metadata?.category || '');
            setSection(item.metadata?.section || item.metadata?.subcategory || '');

            // Date
            const itemDate = item.metadata?.date || item.created_at;
            if (itemDate) {
                try {
                    setDate(new Date(itemDate).toISOString().split('T')[0]);
                } catch (e) {
                    setDate('');
                }
            }
        }
    }, [item]);

    if (!isOpen || !item) return null;

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const updates: any = {
                content,
                metadata: {
                    ...item.metadata,
                    type,
                    category,
                    section,
                    date: date ? new Date(date).toISOString() : null
                }
            };

            // Add type-specific fields
            if (type === 'expense') {
                updates.metadata.amount = amount ? parseFloat(amount.toString().replace(',', '.')) : null;
            } else {
                updates.metadata.amount = null; // Clear if changing type
            }

            if (type === 'credential') {
                updates.metadata.username = username;
                updates.metadata.password = password;
                updates.metadata.url = url;
            }

            if (type === 'task') {
                updates.metadata.status = status;
                updates.metadata.due_date = dueDate;
            }

            // Clean up empty keys
            Object.keys(updates.metadata).forEach(key => {
                if (updates.metadata[key] === '' || updates.metadata[key] === null) {
                    delete updates.metadata[key];
                }
            });

            await onSave(item.id, updates);
            onClose();
        } catch (error) {
            console.error("Failed to save item", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm p-0 md:p-4">
            <div className="bg-gray-900 w-full md:w-full md:max-w-2xl md:rounded-2xl rounded-t-2xl shadow-2xl border border-gray-800 flex flex-col max-h-[90vh] md:max-h-[85vh] animate-in slide-in-from-bottom-10 duration-300">

                {/* Header */}
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-800">
                    <h2 className="text-xl font-bold text-white">Editar Item</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-2">
                        <X size={24} />
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="p-4 md:p-6 space-y-6 overflow-y-auto custom-scrollbar">

                    {/* Type Selector - Scrollable on mobile */}
                    <div className="flex gap-2 p-1 bg-gray-950/50 rounded-xl overflow-x-auto no-scrollbar pb-2 md:pb-1">
                        {[
                            { id: 'note', icon: FileText, label: 'Nota' },
                            { id: 'expense', icon: DollarSign, label: 'Gasto' },
                            { id: 'credential', icon: Lock, label: 'Senha' },
                            { id: 'task', icon: CheckCircle, label: 'Tarefa' }
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setType(t.id as ItemType)}
                                className={`flex-1 min-w-[100px] flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${type === t.id ? 'bg-blue-600 text-white shadow-lg scale-[1.02]' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                            >
                                <t.icon size={18} />
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Common Content */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Conteúdo / Título</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                            placeholder="Descrição do item..."
                        />
                    </div>

                    {/* DYNAMIC FIELDS */}
                    {type === 'expense' && (
                        <div className="animate-in fade-in slide-in-from-top-2">
                            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                                <DollarSign size={14} /> Valor (R$)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="0.00"
                            />
                        </div>
                    )}

                    {type === 'credential' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                                    <User size={14} /> Usuário / Login
                                </label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="user@email.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                                    <Lock size={14} /> Senha / Código
                                </label>
                                <input
                                    type="text"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                                    placeholder="••••••"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                                    <Link size={14} /> URL / Site
                                </label>
                                <input
                                    type="text"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="https://..."
                                />
                            </div>
                        </div>
                    )}

                    {type === 'task' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Status</label>
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="todo">A Fazer</option>
                                    <option value="done">Concluído</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Data Limite</label>
                                <input
                                    type="date"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    )}

                    {/* Common Metadata */}
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-700/50">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                                <Layers size={14} /> Seção
                            </label>
                            <input
                                type="text"
                                value={section}
                                onChange={(e) => setSection(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Ex: Transporte"
                                list="sections-list"
                            />
                            <datalist id="sections-list">
                                <option value="Geral" />
                                <option value="Transporte" />
                                <option value="Alimentação" />
                                <option value="Hospedagem" />
                                <option value="Segurança" />
                                <option value="Códigos" />
                            </datalist>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                                <Tag size={14} /> Categoria
                            </label>
                            <input
                                type="text"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="Ex: Uber"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                            <Calendar size={14} /> Data do Evento
                        </label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                <div className="flex gap-3 justify-end mt-8">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={isSaving}
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        icon={Save}
                    >
                        {isSaving ? 'Salvando...' : 'Salvar'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
