import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CheckSquare, Plus, Search, Filter, Trash2, CheckCircle2, Circle } from 'lucide-react';
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
    const [newTaskPriority, setNewTaskPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('todo');

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
                    priority: newTaskPriority,
                    status: 'todo'
                }])
                .select()
                .single();

            if (error) throw error;
            setTasks([data, ...tasks]);
            setNewTaskTitle('');
            setNewTaskPriority('medium');
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

    const deleteTask = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta tarefa?')) return;
        try {
            const { error } = await supabase.from('tasks').delete().eq('id', id);
            if (error) throw error;
            setTasks(tasks.filter(t => t.id !== id));
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    };

    const filteredTasks = tasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;

        if (activeFilter === 'all') return true;
        return task.status === activeFilter;
    });

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'urgent': return 'text-red-500 bg-red-500/10 border-red-500/20';
            case 'high': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
            case 'medium': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
            case 'low': return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
            default: return 'text-gray-400';
        }
    };

    const getPriorityLabel = (priority: string) => {
        switch (priority) {
            case 'urgent': return 'Urgente';
            case 'high': return 'Alta';
            case 'medium': return 'Média';
            case 'low': return 'Baixa';
            default: return priority;
        }
    };

    if (isLoading) return <div className="p-8 text-center text-gray-400">Carregando tarefas...</div>;

    return (
        <div className="p-4 md:p-6 pb-28 md:pb-6 max-w-4xl mx-auto h-full overflow-y-auto overflow-x-hidden box-border w-full">
            <PageHeader
                title="Tarefas"
                subtitle="Gerencie suas atividades e prioridades"
                icon={CheckSquare}
                iconColor="text-green-400"
            />

            {/* Add Task Form */}
            <Card className="mb-6 md:mb-8 p-4 w-full box-border">
                <form onSubmit={addTask} className="flex flex-col gap-3 w-full">
                    <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Nova tarefa..."
                        className="flex-1 bg-gray-900 border border-gray-600 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                    <select
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value as any)}
                        className="bg-gray-900 border border-gray-600 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    >
                        <option value="low">Baixa</option>
                        <option value="medium">Média</option>
                        <option value="high">Alta</option>
                        <option value="urgent">Urgente</option>
                    </select>
                    <Button type="submit" icon={Plus} className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-900/20 w-full shrink-0">
                        Adicionar
                    </Button>
                </form>
            </Card>

            {/* Filters */}
            <div className="mb-6 space-y-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar tarefas..."
                        className="w-full bg-gray-900/50 border border-gray-700 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    />
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
                        <Card key={task.id} className={`p-4 group transition-all ${task.status === 'done' ? 'opacity-60 bg-gray-900 border-gray-800' : ''}`} hover>
                            <div className="flex items-start gap-3">
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
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getPriorityColor(task.priority)}`}>
                                            {getPriorityLabel(task.priority)}
                                        </span>
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
