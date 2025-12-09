import { useState, useEffect } from 'react';
import { X, Save, DollarSign, Tag, Layers, Calendar } from 'lucide-react';
import Button from '../ui/Button';

interface EditItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (id: string, updates: any) => Promise<void>;
    item: any;
}

export default function EditItemModal({ isOpen, onClose, onSave, item }: EditItemModalProps) {
    const [content, setContent] = useState('');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [section, setSection] = useState('');
    const [date, setDate] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (item) {
            setContent(item.content || '');
            setAmount(item.metadata?.amount || item.metadata?.value || '');
            setCategory(item.metadata?.category || '');
            setSection(item.metadata?.section || item.metadata?.subcategory || '');
            // Format date for input type="date" (YYYY-MM-DD)
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
                    amount: amount ? parseFloat(amount.toString().replace(',', '.')) : null,
                    category,
                    section,
                    date: date ? new Date(date).toISOString() : null
                }
            };

            // Remove null/empty keys if needed, or keep them to clear values
            if (!updates.metadata.amount) delete updates.metadata.amount;
            if (!updates.metadata.category) delete updates.metadata.category;
            if (!updates.metadata.section) delete updates.metadata.section;

            await onSave(item.id, updates);
            onClose();
        } catch (error) {
            console.error("Failed to save item", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white">Editar Item</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Content */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Conteúdo</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                            placeholder="Descrição do item..."
                        />
                    </div>

                    {/* Amount */}
                    <div>
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

                    <div className="grid grid-cols-2 gap-4">
                        {/* Section */}
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
                                <option value="Lazer" />
                            </datalist>
                        </div>

                        {/* Category */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                                <Tag size={14} /> Categoria (Tag)
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

                    {/* Date */}
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1 flex items-center gap-2">
                            <Calendar size={14} /> Data
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
