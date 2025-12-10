import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CheckSquare, Plus, Search, Filter, Trash2, CheckCircle2, Circle, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
}

export default function TasksPage() {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newTaskTitle, setNewTaskTitle] = useState('');
    const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('todo');

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
                    status: 'todo'
                }])
                .select()
                .single();

            if (error) throw error;
            setTasks([data, ...tasks]);
            setNewTaskTitle('');
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

    const filteredTasks = tasks.filter(task => {
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

    if (isLoading) return <div className="p-8 text-center text-gray-400">Carregando tarefas...</div>;

    return (
        <div className="p-4 md:p-6 pb-28 md:pb-6 max-w-4xl mx-auto h-full overflow-y-auto overflow-x-hidden box-border w-full">
            <PageHeader
                title="Tarefas"
                subtitle="Gerencie suas atividades"
                icon={CheckSquare}
                iconColor="text-green-400"
            />

            {/* Add Task Form */}
            <Card className="mb-6 md:mb-8 p-4 w-full box-border">
                <form onSubmit={addTask} className="flex gap-3 w-full">
                    <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Nova tarefa..."
                        className="flex-1 bg-gray-900 border border-gray-600 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    <Button type="submit" icon={Plus} className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-900/20 shrink-0">
                        Adicionar
                    </Button>
                </form>
            </Card>

            {/* Filters & Actions */}
            <div className="mb-6 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar tarefas..."
                            className="w-full bg-gray-900/50 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                    </div>

                    <div className="flex gap-2">
                        {selectedTasks.size > 0 && (
                            <Button
                                variant="danger"
                                onClick={deleteSelectedTasks}
                                className="bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20 whitespace-nowrap"
                                icon={Trash2}
                            >
                                Excluir ({selectedTasks.size})
                            </Button>
                        )}

                        <select
                            value={sortOption}
                            onChange={(e) => setSortOption(e.target.value as any)}
                            className="bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none cursor-pointer min-w-[160px]"
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
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-700'
                                }`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Task List */}
            <div className="space-y-3">
                {filteredTasks.length === 0 ? (
                    <div className="text-center py-16 bg-gray-800/30 rounded-2xl border border-dashed border-gray-700">
                        <Filter className="mx-auto text-gray-600 mb-3" size={48} />
                        <p className="text-gray-500 font-medium">Nenhuma tarefa encontrada</p>
                    </div>
                ) : (
                    filteredTasks.map(task => (
                        <Card key={task.id} className={`p-4 group transition-all ${task.status === 'done' ? 'opacity-60 bg-gray-900 border-gray-800' : ''} ${selectedTasks.has(task.id) ? 'border-blue-500/50 bg-blue-500/5' : ''}`} hover>
                            <div className="flex items-start gap-3">
                                {/* Selection Checkbox */}
                                <div className="pt-1">
                                    <input
                                        type="checkbox"
                                        checked={selectedTasks.has(task.id)}
                                        onChange={() => toggleSelectTask(task.id)}
                                        className="w-5 h-5 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-900 cursor-pointer"
                                    />
                                </div>

                                <button
                                    onClick={() => updateStatus(task.id, task.status === 'done' ? 'todo' : 'done')}
                                    className={`${task.status === 'done' ? 'text-green-500' : 'text-gray-400 hover:text-green-400'} transition-colors mt-1 shrink-0`}
                                >
                                    {task.status === 'done' ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                                </button>

                                <div className="flex-1 min-w-0">
                                    <p className={`text-base font-medium ${task.status === 'done' ? 'text-gray-500 line-through' : 'text-white'}`}>
                                        {task.title}
                                    </p>

                                    {/* Description / Checklist Rendering */}
                                    {task.description && (
                                        <div className="mt-3 space-y-1 text-sm text-gray-300">
                                            {task.description.split('\n').map((line, index) => {
                                                const isChecklist = line.includes('[ ]') || line.includes('[x]');
                                                if (!isChecklist) {
                                                    return <p key={index} className="pl-1 whitespace-pre-wrap">{line}</p>;
                                                }

                                                const isChecked = line.includes('[x]');
                                                // Remove [x], [ ], and leading dashes/spaces
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
                                                                ? 'bg-blue-500 border-blue-500 text-white'
                                                                : 'border-gray-500 group-hover/item:border-blue-400'
                                                            }`}>
                                                            {isChecked && <Check size={10} strokeWidth={3} />}
                                                        </div>
                                                        <span className={`${isChecked ? 'line-through text-gray-500' : 'text-gray-300'}`}>
                                                            {text}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                        <span className="text-xs text-gray-600">
                                            {format(new Date(task.created_at), "dd/MM", { locale: ptBR })}
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
                    ))
                )}
            </div>
        </div>
    );
}
