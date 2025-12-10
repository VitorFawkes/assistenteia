import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format, isPast, parseISO, isSameDay, addDays, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, Circle, Clock, Trash2, Plus, Search, Calendar, Filter, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Reminder {
    id: string;
    title: string;
    due_at: string | null;
    is_completed: boolean;
    completed_at?: string | null;
    created_at: string;
    recurrence_type?: 'once' | 'daily' | 'weekly' | 'custom';
    recurrence_interval?: number;
    recurrence_unit?: 'minutes' | 'hours' | 'days' | 'weeks';
    recurrence_count?: number;
    times_reminded?: number;
    last_reminded_at?: string | null;
}

export default function RemindersPage() {
    const { user } = useAuth();
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newReminder, setNewReminder] = useState('');
    const [newDate, setNewDate] = useState('');
    const [reminderToDelete, setReminderToDelete] = useState<string | null>(null);
    const [selectedReminders, setSelectedReminders] = useState<Set<string>>(new Set());

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'overdue' | 'completed'>('all');

    useEffect(() => {
        if (user) {
            fetchReminders();
        }
    }, [user]);

    // ... fetchReminders ...

    const filteredReminders = reminders.filter(reminder => {
        // 1. Search Filter
        const matchesSearch = reminder.title.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;

        // 2. Tab Filter
        if (activeFilter === 'all') return !reminder.is_completed;
        if (activeFilter === 'completed') return reminder.is_completed;

        if (reminder.is_completed) return false; // Other filters only apply to active items

        if (!reminder.due_at) return false; // Items without date only show in 'all'

        const date = parseISO(reminder.due_at);
        const now = new Date();

        if (activeFilter === 'overdue') return isPast(date) && !isSameDay(date, now);
        if (activeFilter === 'today') return isSameDay(date, now);
        if (activeFilter === 'tomorrow') return isSameDay(date, addDays(now, 1));
        if (activeFilter === 'week') return isWithinInterval(date, { start: now, end: addDays(now, 7) });

        return true;
    });

    const fetchReminders = async () => {
        try {
            const { data, error } = await supabase
                .from('reminders')
                .select('*')
                .eq('user_id', user?.id)
                .order('due_at', { ascending: true });

            if (error) throw error;
            setReminders(data || []);
        } catch (error) {
            console.error('Error fetching reminders:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleComplete = async (id: string, currentStatus: boolean) => {
        try {
            const updates = {
                is_completed: !currentStatus,
                completed_at: !currentStatus ? new Date().toISOString() : null
            };

            const { error } = await supabase
                .from('reminders')
                .update(updates)
                .eq('id', id);

            if (error) throw error;

            // Optimistic update
            setReminders(reminders.map(r =>
                r.id === id ? { ...r, ...updates } : r
            ));
        } catch (error) {
            console.error('Error updating reminder:', error);
        }
    };

    const toggleSelection = (id: string) => {
        const newSelection = new Set(selectedReminders);
        if (newSelection.has(id)) {
            newSelection.delete(id);
        } else {
            newSelection.add(id);
        }
        setSelectedReminders(newSelection);
    };

    const toggleSelectAll = () => {
        if (selectedReminders.size === reminders.length) {
            setSelectedReminders(new Set());
        } else {
            setSelectedReminders(new Set(reminders.map(r => r.id)));
        }
    };

    const deleteSelected = async () => {
        if (selectedReminders.size === 0) return;
        if (!confirm(`Tem certeza que deseja excluir ${selectedReminders.size} lembretes?`)) return;

        try {
            const ids = Array.from(selectedReminders);
            const { error } = await supabase
                .from('reminders')
                .delete()
                .in('id', ids);

            if (error) throw error;

            setReminders(reminders.filter(r => !selectedReminders.has(r.id)));
            setSelectedReminders(new Set());
        } catch (error) {
            console.error('Error deleting selected:', error);
            alert('Erro ao excluir itens selecionados.');
        }
    };

    const getRecurrenceText = (reminder: Reminder): string | null => {
        if (!reminder.recurrence_type || reminder.recurrence_type === 'once') return null;

        if (reminder.recurrence_type === 'daily') return '🔁 Repete diariamente';
        if (reminder.recurrence_type === 'weekly') return '🔁 Repete semanalmente';

        if (reminder.recurrence_type === 'custom') {
            const unit = reminder.recurrence_unit === 'minutes' ? 'minuto(s)' :
                reminder.recurrence_unit === 'hours' ? 'hora(s)' :
                    reminder.recurrence_unit === 'days' ? 'dia(s)' : 'semana(s)';
            let text = `🔁 A cada ${reminder.recurrence_interval} ${unit}`;

            if (reminder.recurrence_count) {
                const remaining = reminder.recurrence_count - (reminder.times_reminded || 0);
                text += ` (${remaining}/${reminder.recurrence_count} restantes)`;
            }
            return text;
        }
        return null;
    };

    const handleDeleteClick = (id: string) => {
        setReminderToDelete(id);
    };

    const cancelDelete = () => {
        setReminderToDelete(null);
    };

    const confirmDelete = async () => {
        if (!reminderToDelete) return;

        const id = reminderToDelete;
        setReminderToDelete(null);

        try {
            console.log('🗑️ Deleting reminder:', id);
            const { error } = await supabase
                .from('reminders')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('❌ Error deleting reminder:', error);
                alert(`Erro ao excluir lembrete: ${error.message}`);
                return;
            }

            console.log('✅ Reminder deleted successfully');
            setReminders(reminders.filter(r => r.id !== id));
        } catch (error) {
            console.error('❌ Unexpected error deleting reminder:', error);
            alert('Erro inesperado ao excluir lembrete.');
        }
    };

    const clearCompleted = async () => {
        if (!confirm('Deseja excluir todos os lembretes concluídos?')) return;

        try {
            const { error } = await supabase
                .from('reminders')
                .delete()
                .eq('user_id', user?.id)
                .eq('is_completed', true);

            if (error) throw error;
            setReminders(reminders.filter(r => !r.is_completed));
        } catch (error) {
            console.error('Error clearing completed:', error);
        }
    };

    const addReminder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newReminder.trim()) return;

        try {
            const { data, error } = await supabase
                .from('reminders')
                .insert([{
                    user_id: user?.id,
                    title: newReminder,
                    due_at: newDate ? new Date(newDate).toISOString() : null,
                    is_completed: false,
                    recurrence_type: 'once'
                }])
                .select()
                .single();

            if (error) throw error;
            setReminders([...reminders, data]);
            setNewReminder('');
            setNewDate('');
        } catch (error) {
            console.error('Error adding reminder:', error);
        }
    };

    if (isLoading) {
        return <div className="p-8 text-center text-gray-400">Carregando lembretes...</div>;
    }

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto h-full overflow-y-auto overflow-x-hidden box-border w-full">
            <PageHeader
                title="Lembretes"
                subtitle="Gerencie suas tarefas e compromissos"
                icon={Clock}
                iconColor="text-blue-400"
            />

            {/* Add New Reminder */}
            <Card className="mb-6 md:mb-8 p-4 w-full box-border">
                <form onSubmit={addReminder} className="flex flex-col gap-3 w-full">
                    <input
                        type="text"
                        value={newReminder}
                        onChange={(e) => setNewReminder(e.target.value)}
                        placeholder="Novo lembrete..."
                        className="flex-1 bg-gray-900 border border-gray-600 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    <input
                        type="datetime-local"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="bg-gray-900 border border-gray-600 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all w-full"
                    />
                    <Button type="submit" icon={Plus} className="w-full shrink-0">
                        Adicionar
                    </Button>
                </form>
            </Card>

            {/* Filters & Search */}
            <div className="mb-6 space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar lembretes..."
                        className="w-full bg-gray-900/50 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {[
                        { id: 'all', label: 'Todos', icon: null },
                        { id: 'today', label: 'Hoje', icon: Calendar },
                        { id: 'tomorrow', label: 'Amanhã', icon: Calendar },
                        { id: 'week', label: 'Esta Semana', icon: Calendar },
                        { id: 'overdue', label: 'Atrasados', icon: Clock },
                        { id: 'completed', label: 'Concluídos', icon: CheckCircle2 },
                    ].map(filter => (
                        <button
                            key={filter.id}
                            onClick={() => setActiveFilter(filter.id as any)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${activeFilter === filter.id
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
                                }`}
                        >
                            {filter.icon && <filter.icon size={14} />}
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* List Header & Bulk Actions */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-300 flex items-center gap-2">
                    {activeFilter === 'completed' ? 'Concluídos' : 'A Fazer'}
                    <span className="bg-gray-800 text-gray-400 text-xs px-2 py-1 rounded-full">{filteredReminders.length}</span>
                </h2>

                {filteredReminders.length > 0 && (
                    <div className="flex items-center gap-3">
                        {activeFilter === 'completed' && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={clearCompleted}
                                className="text-red-400 hover:text-red-300"
                            >
                                Limpar concluídos
                            </Button>
                        )}
                        {selectedReminders.size > 0 && (
                            <Button
                                variant="danger"
                                size="sm"
                                onClick={deleteSelected}
                                icon={Trash2}
                            >
                                Excluir ({selectedReminders.size})
                            </Button>
                        )}
                        <button
                            onClick={toggleSelectAll}
                            className="text-sm text-gray-400 hover:text-white transition-colors"
                        >
                            {selectedReminders.size === filteredReminders.length ? 'Desmarcar todos' : 'Selecionar todos'}
                        </button>
                    </div>
                )}
            </div>

            {/* Reminders List */}
            <div className="space-y-3">
                {filteredReminders.length === 0 ? (
                    <div className="text-center py-16 bg-gray-800/30 rounded-2xl border border-dashed border-gray-700">
                        <Filter className="mx-auto text-gray-600 mb-3" size={48} />
                        <p className="text-gray-500 font-medium">Nenhum lembrete encontrado</p>
                        <p className="text-gray-600 text-sm mt-1">Tente mudar os filtros ou criar um novo.</p>
                    </div>
                ) : (
                    filteredReminders.map(reminder => (
                        <Card key={reminder.id} className={`p-4 flex items-center justify-between group transition-all ${selectedReminders.has(reminder.id) ? 'border-blue-500/50 bg-blue-500/5' :
                            reminder.is_completed ? 'opacity-60 hover:opacity-100 bg-gray-900 border-gray-800' : ''
                            }`} hover>
                            <div className="flex items-center gap-4 flex-1">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={selectedReminders.has(reminder.id)}
                                        onChange={() => toggleSelection(reminder.id)}
                                        className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                                    />
                                    <button
                                        onClick={() => toggleComplete(reminder.id, reminder.is_completed)}
                                        className={`${reminder.is_completed ? 'text-green-500 hover:text-green-400' : 'text-gray-400 hover:text-blue-400'} transition-colors`}
                                    >
                                        {reminder.is_completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                                    </button>
                                </div>

                                <div className="flex-1">
                                    <p className={`text-lg font-medium ${reminder.is_completed ? 'text-gray-500 line-through' : 'text-white'}`}>
                                        {reminder.title}
                                    </p>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                                        {/* Created At */}
                                        <p className="text-xs text-gray-500 flex items-center gap-1" title="Data do pedido">
                                            <span className="opacity-70">📅 Pedido:</span>
                                            {format(parseISO(reminder.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                        </p>

                                        {/* Due Date */}
                                        {reminder.due_at && !reminder.is_completed && (
                                            <p className={`text-xs flex items-center gap-1 ${isPast(parseISO(reminder.due_at)) ? 'text-red-400' : 'text-blue-300'}`} title="Data de realização prevista">
                                                <span className="opacity-70">⏰ Para:</span>
                                                {format(parseISO(reminder.due_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                                {isPast(parseISO(reminder.due_at)) && <span className="font-bold bg-red-500/10 px-1.5 rounded text-[10px] ml-1">Atrasado</span>}
                                            </p>
                                        )}

                                        {/* Completed At */}
                                        {reminder.is_completed && reminder.completed_at && (
                                            <p className="text-xs text-green-700/70 flex items-center gap-1">
                                                <span className="opacity-70">✅ Feito:</span>
                                                {format(parseISO(reminder.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                            </p>
                                        )}
                                    </div>

                                    {getRecurrenceText(reminder) && !reminder.is_completed && (
                                        <p className="text-xs text-purple-400 mt-1 font-medium bg-purple-500/10 inline-block px-2 py-0.5 rounded-full">
                                            {getRecurrenceText(reminder)}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteClick(reminder.id)}
                                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                icon={Trash2}
                            />
                        </Card>
                    ))
                )}
            </div>

            {/* Confirmation Modal */}
            {reminderToDelete && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={cancelDelete}>
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-white mb-3">Confirmar Exclusão</h3>
                        <p className="text-gray-300 mb-6">
                            Tem certeza que deseja excluir este lembrete?
                        </p>
                        <div className="flex gap-3 justify-end">
                            <Button variant="secondary" onClick={cancelDelete}>
                                Cancelar
                            </Button>
                            <Button variant="danger" onClick={confirmDelete}>
                                Excluir
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
