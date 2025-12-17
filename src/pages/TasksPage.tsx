import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CheckSquare, Plus, Search, Filter, Trash2, CheckCircle2, Circle, Check, Calendar, Sun } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { format, isToday, isPast, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import SwipeableItem from '../components/ui/SwipeableItem';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

interface Task {
    id: string;
    title: string;
    description?: string;
    status: 'todo' | 'in_progress' | 'done' | 'archived';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    tags?: string[];
    created_at: string;
    completed_at?: string;
    due_date?: string; // New field
}

export default function TasksPage() {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('todo');
    const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);

    const [sortOption, setSortOption] = useState<'created_desc' | 'created_asc' | 'alpha_asc'>('created_desc');

    useEffect(() => {
        if (user) {
            fetchTasks();
        }
    }, [user]);

    const fetchTasks = async () => {
        try {
            const { data, error } = await supabase
                .from('tasks')
                .select('*')
                .eq('user_id', user?.id)
                .neq('status', 'archived')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTasks(data || []);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const addTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;

        try {
            const { data, error } = await supabase
                .from('tasks')
                .insert([{
                    user_id: user?.id,
                    title: newTaskTitle,
                    priority: 'medium', // Default priority
                    status: 'todo',
                    due_date: new Date().toISOString() // Default to today for quick add
                }])
                .select()
                .single();

            if (error) throw error;
            setTasks([data, ...tasks]);
            setNewTaskTitle('');
            setIsAddTaskOpen(false);
        } catch (error) {
            console.error('Error adding task:', error);
        }
    };

    const updateStatus = async (id: string, newStatus: Task['status']) => {
        try {
            const updates: any = { status: newStatus };
            if (newStatus === 'done') {
                updates.completed_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from('tasks')
                .update(updates)
                .eq('id', id);

            if (error) throw error;

            setTasks(tasks.map(t => t.id === id ? { ...t, ...updates } : t));
        } catch (error) {
            console.error('Error updating task:', error);
        }
    };

    const toggleChecklistItem = async (taskId: string, description: string, lineIndex: number) => {
        const lines = description.split('\n');
        const line = lines[lineIndex];

        let newLine = line;
        if (line.includes('[ ]')) {
            newLine = line.replace('[ ]', '[x]');
        } else if (line.includes('[x]')) {
            newLine = line.replace('[x]', '[ ]');
        } else {
            return; // Not a checklist item
        }

        lines[lineIndex] = newLine;
        const newDescription = lines.join('\n');

        // Optimistic update
        setTasks(tasks.map(t => t.id === taskId ? { ...t, description: newDescription } : t));

        try {
            const { error } = await supabase
                .from('tasks')
                .update({ description: newDescription })
                .eq('id', taskId);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating checklist:', error);
        }
    };

    const deleteTask = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta tarefa?')) return;
        try {
            const { error } = await supabase.from('tasks').delete().eq('id', id);
            if (error) throw error;
            setTasks(tasks.filter(t => t.id !== id));
            if (selectedTasks.has(id)) {
                const newSelected = new Set(selectedTasks);
                newSelected.delete(id);
                setSelectedTasks(newSelected);
            }
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };

    const toggleSelectTask = (id: string) => {
        const newSelected = new Set(selectedTasks);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedTasks(newSelected);
    };

    const deleteSelectedTasks = async () => {
        if (selectedTasks.size === 0) return;
        if (!confirm(`Tem certeza que deseja excluir ${selectedTasks.size} tarefas?`)) return;

        try {
            const { error } = await supabase
                .from('tasks')
                .delete()
                .in('id', Array.from(selectedTasks));

            if (error) throw error;

            setTasks(tasks.filter(t => !selectedTasks.has(t.id)));
            setSelectedTasks(new Set());
        } catch (error) {
            console.error('Error deleting tasks:', error);
        }
    };

    // --- FILTERING LOGIC ---
    // 1. Separate "Today's Focus" (Due Today or Overdue AND Not Done)
    const todayTasks = tasks.filter(t => {
        if (t.status === 'done' || t.status === 'archived') return false;
        if (!t.due_date) return false;
        const date = parseISO(t.due_date);
        return isToday(date) || isPast(date); // Today or Overdue
    });

    // 2. Filter the rest for the main list
    const otherTasks = tasks.filter(task => {
        // Exclude tasks already in "Today's Focus"
        if (todayTasks.find(t => t.id === task.id)) return false;

        const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;

        if (activeFilter === 'all') return true;
        return task.status === activeFilter;
    }).sort((a, b) => {
        if (sortOption === 'created_desc') {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (sortOption === 'created_asc') {
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortOption === 'alpha_asc') {
            return a.title.localeCompare(b.title);
        }
        return 0;
    });

    const renderTaskItem = (task: Task) => (
        <SwipeableItem
            key={task.id}
            onSwipeRight={() => updateStatus(task.id, task.status === 'done' ? 'todo' : 'done')}
            onSwipeLeft={() => deleteTask(task.id)}
            leftActionIcon={task.status === 'done' ? <Circle size={24} /> : <CheckCircle2 size={24} />}
            leftActionColor={task.status === 'done' ? 'bg-gray-400' : 'bg-green-500'}
            rightActionColor="bg-red-500"
        >
            <Card className={`p-4 group transition-all ${task.status === 'done' ? 'opacity-60 bg-gray-50 border-gray-100' : 'bg-white border-gray-200'} ${selectedTasks.has(task.id) ? 'border-rose-600/50 bg-rose-600/5' : ''}`} hover>
                <div className="flex items-start gap-3">
                    {/* Selection Checkbox */}
                    <div className="pt-1">
                        <input
                            type="checkbox"
                            checked={selectedTasks.has(task.id)}
                            onChange={() => toggleSelectTask(task.id)}
                            className="w-5 h-5 rounded border-gray-300 bg-white text-rose-600 focus:ring-rose-600 focus:ring-offset-white cursor-pointer"
                        />
                    </div>

                    <button
                        onClick={() => updateStatus(task.id, task.status === 'done' ? 'todo' : 'done')}
                        className={`${task.status === 'done' ? 'text-green-500' : 'text-gray-400 hover:text-green-500'} transition-colors mt-1 shrink-0`}
                    >
                        {task.status === 'done' ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                    </button>

                    <div className="flex-1 min-w-0">
                        <p className={`text-base font-medium ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {task.title}
                        </p>

                        {/* Description / Checklist Rendering */}
                        {task.description && (
                            <div className="mt-3 space-y-1 text-sm text-gray-600">
                                {task.description.split('\n').map((line, index) => {
                                    const isChecklist = line.includes('[ ]') || line.includes('[x]');
                                    if (!isChecklist) {
                                        return <p key={index} className="pl-1 whitespace-pre-wrap">{line}</p>;
                                    }

                                    const isChecked = line.includes('[x]');
                                    const text = line.replace(/\[.\]/, '').replace(/^-/, '').trim();

                                    return (
                                        <div
                                            key={index}
                                            className="flex items-start gap-3 group/item cursor-pointer py-0.5"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleChecklistItem(task.id, task.description!, index);
                                            }}
                                        >
                                            <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${isChecked
                                                ? 'bg-rose-600 border-rose-600 text-white'
                                                : 'border-gray-300 group-hover/item:border-rose-600'
                                                }`}>
                                                {isChecked && <Check size={10} strokeWidth={3} />}
                                            </div>
                                            <span className={`${isChecked ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                                                {text}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            {task.due_date && (
                                <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${task.status !== 'done' && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
                                    ? 'bg-red-100 text-red-600'
                                    : isToday(parseISO(task.due_date))
                                        ? 'bg-amber-100 text-amber-600'
                                        : 'bg-gray-100 text-gray-500'
                                    }`}>
                                    <Calendar size={12} />
                                    {isToday(parseISO(task.due_date)) ? 'Hoje' : format(parseISO(task.due_date), "dd/MM", { locale: ptBR })}
                                </span>
                            )}
                            <span className="text-xs text-gray-400">
                                Criado em {format(new Date(task.created_at), "dd/MM", { locale: ptBR })}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => deleteTask(task.id)}
                        className="text-gray-500 hover:text-red-400 p-1 shrink-0"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </Card>
        </SwipeableItem>
    );

    if (isLoading) return <div className="p-8 text-center text-gray-500">Carregando tarefas...</div>;

    return (
        <div className="p-4 md:p-6 pb-28 md:pb-6 max-w-4xl mx-auto h-full overflow-y-auto overflow-x-hidden box-border w-full">
            <PageHeader
                title="Tarefas"
                subtitle="Gerencie suas atividades"
                icon={CheckSquare}
                iconColor="text-rose-600"
            />

            {/* Add Task Form */}
            <Card className="mb-6 md:mb-8 p-4 w-full box-border bg-white border-gray-200">
                <form onSubmit={addTask} className="flex gap-3 w-full">
                    <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Nova tarefa para hoje..."
                        className="flex-1 bg-gray-50 border border-ela-border rounded-xl p-3 text-ela-text focus:outline-none focus:ring-2 focus:ring-ela-pink focus:bg-white transition-all placeholder:text-gray-400"
                    />
                    <Button type="submit" icon={Plus} variant="primary" className="shrink-0 shadow-lg shadow-rose-900/20">
                        <span className="hidden md:inline">Adicionar</span>
                    </Button>
                </form>
            </Card>

            {/* TODAY'S FOCUS SECTION */}
            {todayTasks.length > 0 && (
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <Sun className="text-amber-500" size={24} />
                        <h2 className="text-xl font-bold text-gray-800">Foco de Hoje</h2>
                        <span className="bg-amber-100 text-amber-600 text-xs px-2 py-1 rounded-full font-medium">
                            {todayTasks.length}
                        </span>
                    </div>
                    <div className="space-y-3">
                        {todayTasks.map(renderTaskItem)}
                    </div>
                    <div className="my-6 border-t border-gray-200"></div>
                </div>
            )}

            {/* Filters & Actions */}
            <div className="mb-6 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar tarefas..."
                            className="w-full bg-white border border-ela-border rounded-xl pl-10 pr-4 py-3 text-ela-text focus:outline-none focus:ring-2 focus:ring-ela-pink transition-all placeholder:text-gray-400"
                        />
                    </div>

                    <div className="flex gap-2">
                        {selectedTasks.size > 0 && (
                            <Button
                                variant="danger"
                                onClick={deleteSelectedTasks}
                                className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100 whitespace-nowrap"
                                icon={Trash2}
                            >
                                Excluir ({selectedTasks.size})
                            </Button>
                        )}

                        <select
                            value={sortOption}
                            onChange={(e) => setSortOption(e.target.value as any)}
                            className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-600 transition-all appearance-none cursor-pointer min-w-[160px]"
                        >
                            <option value="created_desc">✨ Mais Recentes</option>
                            <option value="created_asc">📅 Mais Antigas</option>
                            <option value="alpha_asc">🔤 Alfabética (A-Z)</option>
                        </select>
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {[
                        { id: 'todo', label: 'A Fazer' },
                        { id: 'in_progress', label: 'Em Progresso' },
                        { id: 'done', label: 'Concluídas' },
                        { id: 'all', label: 'Todas' },
                    ].map(filter => (
                        <button
                            key={filter.id}
                            onClick={() => setActiveFilter(filter.id as any)}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${activeFilter === filter.id
                                ? 'bg-rose-600 text-white shadow-md shadow-rose-900/20'
                                : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900 border border-gray-200'
                                }`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Task List */}
            <div className="space-y-3">
                {otherTasks.length === 0 ? (
                    <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                        <Filter className="mx-auto text-gray-400 mb-3" size={48} />
                        <p className="text-gray-500 font-medium">Nenhuma tarefa encontrada</p>
                    </div>
                ) : (
                    otherTasks.map(renderTaskItem)
                )}
            </div>

            {/* Mobile FAB */}
            <button
                onClick={() => setIsAddTaskOpen(true)}
                className="md:hidden fixed bottom-24 right-4 w-14 h-14 bg-rose-600 text-white rounded-full shadow-lg shadow-rose-900/40 flex items-center justify-center z-40 active:scale-95 transition-transform"
            >
                <Plus size={28} />
            </button>

            {/* Add Task Bottom Sheet */}
            {isAddTaskOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center md:hidden" onClick={() => setIsAddTaskOpen(false)}>
                    <div
                        className="bg-white border-t border-gray-200 rounded-t-3xl p-6 w-full shadow-2xl animate-in slide-in-from-bottom-full duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-center mb-6">
                            <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
                        </div>

                        <h3 className="text-xl font-bold text-gray-900 mb-4">Nova Tarefa</h3>

                        <form onSubmit={addTask} className="flex flex-col gap-4">
                            <input
                                type="text"
                                value={newTaskTitle}
                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                placeholder="O que precisa ser feito hoje?"
                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-600 text-lg"
                                autoFocus
                            />
                            <Button type="submit" icon={Plus} className="bg-rose-600 hover:bg-rose-700 w-full justify-center py-3 text-lg text-white">
                                Adicionar Tarefa
                            </Button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
