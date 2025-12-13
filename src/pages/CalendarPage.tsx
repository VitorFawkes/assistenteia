import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, Plus, Trash2, MapPin, Clock, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';

interface CalendarEvent {
    id: string;
    title: string;
    start: string;
    end: string;
    allDay: boolean;
    provider: 'google' | 'microsoft';
    link?: string;
    location?: string;
    description?: string;
}

export default function CalendarPage() {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // New Event Form
    const [newEvent, setNewEvent] = useState({
        title: '',
        start: '',
        end: '',
        allDay: false,
        location: '',
        description: ''
    });

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        setIsLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await fetch('https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/calendar-proxy', {
                method: 'GET', // Or POST with action='list' if we decided that. Let's try GET as implemented in proxy.
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            const result = await response.json();
            if (result.success && result.data) {
                // Sort by date
                const sorted = result.data.sort((a: any, b: any) => new Date(a.start).getTime() - new Date(b.start).getTime());
                setEvents(sorted);
            }
        } catch (err) {
            console.error('Error fetching events:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateEvent = async () => {
        if (!newEvent.title || !newEvent.start) return alert('Título e Data de Início são obrigatórios');

        setIsCreating(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await fetch('https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/calendar-proxy', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'create',
                    ...newEvent
                })
            });

            const result = await response.json();
            if (result.success) {
                setShowModal(false);
                setNewEvent({ title: '', start: '', end: '', allDay: false, location: '', description: '' });
                fetchEvents();
            } else {
                alert('Erro ao criar evento: ' + result.error);
            }
        } catch (err) {
            console.error('Error creating event:', err);
            alert('Erro ao criar evento');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteEvent = async (id: string, provider: string) => {
        if (!confirm('Tem certeza que deseja apagar este evento?')) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await fetch('https://bvjfiismidgzmdmrotee.supabase.co/functions/v1/calendar-proxy', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action: 'delete',
                    id,
                    provider
                })
            });

            const result = await response.json();
            if (result.success) {
                setEvents(events.filter(e => e.id !== id));
            } else {
                alert('Erro ao apagar: ' + result.error);
            }
        } catch (err) {
            console.error('Error deleting event:', err);
        }
    };

    const formatEventDate = (dateStr: string, allDay: boolean) => {
        const date = new Date(dateStr);
        if (allDay) return date.toLocaleDateString('pt-BR');
        return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="p-6 max-w-4xl mx-auto pb-32">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Calendário</h1>
                    <p className="text-gray-400">Gerencie seus eventos do Google e Outlook.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={fetchEvents} disabled={isLoading}>
                        <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                    <Button onClick={() => setShowModal(true)}>
                        <Plus size={20} className="mr-2" />
                        Novo Evento
                    </Button>
                </div>
            </div>

            {isLoading && events.length === 0 ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                </div>
            ) : events.length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                    <CalendarIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <p>Nenhum evento encontrado para os próximos 30 dias.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {events.map(event => (
                        <div key={event.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-start justify-between hover:bg-gray-800 transition-colors group">
                            <div className="flex gap-4">
                                <div className={`w-1 h-full rounded-full ${event.provider === 'google' ? 'bg-blue-500' : 'bg-blue-700'}`}></div>
                                <div>
                                    <h3 className="font-semibold text-white text-lg">{event.title}</h3>
                                    <div className="flex flex-col gap-1 mt-1 text-sm text-gray-400">
                                        <div className="flex items-center gap-2">
                                            <Clock size={14} />
                                            <span>
                                                {formatEventDate(event.start, event.allDay)}
                                                {!event.allDay && ` - ${new Date(event.end).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                                            </span>
                                        </div>
                                        {event.location && (
                                            <div className="flex items-center gap-2">
                                                <MapPin size={14} />
                                                <span>{event.location}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-xs px-2 py-0.5 rounded-full border ${event.provider === 'google'
                                                    ? 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                                                    : 'border-blue-700/30 text-blue-300 bg-blue-700/10'
                                                }`}>
                                                {event.provider === 'google' ? 'Google Calendar' : 'Outlook'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {event.link && (
                                    <a href={event.link} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg">
                                        Link
                                    </a>
                                )}
                                <button
                                    onClick={() => handleDeleteEvent(event.id, event.provider)}
                                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <h2 className="text-xl font-bold text-white mb-6">Novo Evento</h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Título</label>
                                <input
                                    type="text"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                                    value={newEvent.title}
                                    onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                                    placeholder="Ex: Reunião de Projeto"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Início</label>
                                    <input
                                        type="datetime-local"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                                        value={newEvent.start}
                                        onChange={e => setNewEvent({ ...newEvent, start: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Fim</label>
                                    <input
                                        type="datetime-local"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                                        value={newEvent.end}
                                        onChange={e => setNewEvent({ ...newEvent, end: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="allDay"
                                    checked={newEvent.allDay}
                                    onChange={e => setNewEvent({ ...newEvent, allDay: e.target.checked })}
                                    className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-600"
                                />
                                <label htmlFor="allDay" className="text-sm text-gray-300">Dia inteiro</label>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Local</label>
                                <input
                                    type="text"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none"
                                    value={newEvent.location}
                                    onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
                                    placeholder="Ex: Sala 1 ou Link do Meet"
                                />
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Descrição</label>
                                <textarea
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 outline-none h-24 resize-none"
                                    value={newEvent.description}
                                    onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                                    placeholder="Detalhes do evento..."
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <Button variant="ghost" className="flex-1" onClick={() => setShowModal(false)}>
                                Cancelar
                            </Button>
                            <Button className="flex-1" onClick={handleCreateEvent} disabled={isCreating}>
                                {isCreating ? <Loader2 className="animate-spin" /> : 'Criar Evento'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
