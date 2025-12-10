import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import { useAuth } from '../contexts/AuthContext';
import { Bot, Loader2, Calendar, X } from 'lucide-react';

type Message = Database['public']['Tables']['messages']['Row'];

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'user' | 'assistant' | 'media'>('all');
    const [dateRange, setDateRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const { user } = useAuth();

    const scrollToBottom = () => {
        if (!isLoadingMore) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages.length, isLoadingMore]); // Only scroll on new messages if not loading older ones

    useEffect(() => {
        fetchMessages(true);

        // Subscribe to new messages
        const channel = supabase
            .channel('messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                const newMessage = payload.new as Message;

                // Filter logic for real-time updates
                let matchesFilter = true;
                if (filterType === 'user' && newMessage.role !== 'user') matchesFilter = false;
                if (filterType === 'assistant' && newMessage.role !== 'assistant') matchesFilter = false;
                if (filterType === 'media' && !newMessage.media_url) matchesFilter = false;

                // Search logic
                if (searchQuery && newMessage.content && !newMessage.content.toLowerCase().includes(searchQuery.toLowerCase())) {
                    matchesFilter = false;
                }

                if (matchesFilter) {
                    setMessages((prev) => [...prev, newMessage]);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [searchQuery, filterType, dateRange]); // Refetch when search, filter or date changes

    const fetchMessages = async (reset = false) => {
        if (reset) {
            setIsLoading(true);
            setMessages([]);
        } else {
            setIsLoadingMore(true);
        }

        try {
            let query = supabase
                .from('messages')
                .select('*')
                .order('created_at', { ascending: false }); // Fetch newest first

            if (searchQuery) {
                query = query.ilike('content', `%${searchQuery}%`);
            }

            // Apply Filters
            if (filterType === 'user') {
                query = query.eq('role', 'user');
            } else if (filterType === 'assistant') {
                query = query.eq('role', 'assistant');
            } else if (filterType === 'media') {
                query = query.not('media_url', 'is', null);
            }

            // Apply Date Filters
            if (dateRange.start) {
                // Construct date from YYYY-MM-DD string to ensure Local Midnight
                const [sYear, sMonth, sDay] = dateRange.start.split('-').map(Number);
                const startDate = new Date(sYear, sMonth - 1, sDay); // Local Midnight
                query = query.gte('created_at', startDate.toISOString());
            }
            if (dateRange.end) {
                // Construct date from YYYY-MM-DD string to ensure Local End of Day
                const [eYear, eMonth, eDay] = dateRange.end.split('-').map(Number);
                const endDate = new Date(eYear, eMonth - 1, eDay);
                endDate.setHours(23, 59, 59, 999); // Local End of Day
                query = query.lte('created_at', endDate.toISOString());
            }

            // Pagination
            const PAGE_SIZE = 50;
            const currentLength = reset ? 0 : messages.length;

            query = query.range(currentLength, currentLength + PAGE_SIZE - 1);

            const { data, error } = await query;

            if (error) throw error;

            const newMessages = data || [];

            // Reverse to display chronologically (oldest at top)
            const reversedMessages = [...newMessages].reverse();

            if (reset) {
                setMessages(reversedMessages);
            } else {
                // Prepend older messages
                setMessages((prev) => [...reversedMessages, ...prev]);
            }

            setHasMore(newMessages.length === PAGE_SIZE);

        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    };

    const handleSendMessage = async (content: string, file?: File) => {
        setIsLoading(true);

        try {
            const userId = user?.id || '00000000-0000-0000-0000-000000000000';

            let mediaUrl: string | undefined;
            let mediaType: 'image' | 'audio' | 'document' | undefined;

            // Upload file if present
            if (file) {
                const { uploadFileToStorage } = await import('../lib/storage');
                const uploadResult = await uploadFileToStorage(file, userId);

                if (uploadResult.error) {
                    console.error('Upload failed:', uploadResult.error);
                    setIsLoading(false);
                    return;
                }

                mediaUrl = uploadResult.url || undefined;

                // Determine media type
                if (file.type.startsWith('image/')) {
                    mediaType = 'image';
                } else if (file.type.startsWith('audio/')) {
                    mediaType = 'audio';
                } else {
                    mediaType = 'document';
                }
            }

            // Insert user message
            const { data: insertData, error: insertError } = await supabase
                .from('messages')
                .insert({
                    role: 'user',
                    content: content || null,
                    media_url: mediaUrl || null,
                    media_type: mediaType || null,
                    user_id: userId,
                })
                .select('id')
                .single();

            if (insertError) {
                console.error('Error saving message:', insertError);
                setIsLoading(false);
                return;
            }

            // Process with AI
            const { processMessage } = await import('../lib/storage');
            // @ts-ignore - messageId is optional but we know it's there
            const result = await processMessage(content, userId, mediaUrl, mediaType, insertData?.id);

            if (result.success && result.response) {
                // AI response is saved by the backend function
                // We just wait for the subscription to pick it up
            }

            setIsLoading(false);
        } catch (error) {
            console.error('Error in handleSendMessage:', error);
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-900">
            {/* Header / Search */}
            <div className="p-2 md:p-4 border-b border-gray-800 bg-gray-900/95 backdrop-blur z-10">
                <div className="max-w-3xl mx-auto flex flex-col gap-3">
                    <input
                        type="text"
                        placeholder="Buscar mensagens..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                    />

                    {/* Filters */}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                        {[
                            { id: 'all', label: 'Todas' },
                            { id: 'user', label: 'Minhas' },
                            { id: 'assistant', label: 'IA' },
                            { id: 'media', label: 'Mídia' }
                        ].map((filter) => (
                            <button
                                key={filter.id}
                                onClick={() => setFilterType(filter.id as any)}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${filterType === filter.id
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                                    }`}
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>

                    {/* Date Filter Toggle */}
                    <div className="relative">
                        <button
                            onClick={() => setShowDatePicker(!showDatePicker)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full md:w-auto justify-center ${dateRange.start || dateRange.end
                                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
                                }`}
                        >
                            <Calendar size={16} />
                            {dateRange.start ? (
                                <span>
                                    {new Date(dateRange.start + 'T12:00:00').toLocaleDateString('pt-BR')}
                                    {dateRange.end ? ` - ${new Date(dateRange.end + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                                </span>
                            ) : (
                                "Filtrar por Data"
                            )}
                            {(dateRange.start || dateRange.end) && (
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDateRange({ start: null, end: null });
                                    }}
                                    className="ml-2 p-1 hover:bg-purple-500/20 rounded-full"
                                >
                                    <X size={14} />
                                </div>
                            )}
                        </button>

                        {showDatePicker && (
                            <div className="absolute top-full left-0 right-0 md:right-auto mt-2 w-full md:w-80 bg-gray-800 border border-gray-700 rounded-xl shadow-xl p-4 z-20">
                                <div className="grid grid-cols-2 gap-2 mb-4">
                                    <button
                                        onClick={() => {
                                            const today = new Date();
                                            const yyyy = today.getFullYear();
                                            const mm = String(today.getMonth() + 1).padStart(2, '0');
                                            const dd = String(today.getDate()).padStart(2, '0');
                                            const todayStr = `${yyyy}-${mm}-${dd}`;
                                            setDateRange({ start: todayStr, end: todayStr });
                                            setShowDatePicker(false);
                                        }}
                                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300"
                                    >
                                        Hoje
                                    </button>
                                    <button
                                        onClick={() => {
                                            const yesterday = new Date();
                                            yesterday.setDate(yesterday.getDate() - 1);
                                            const yyyy = yesterday.getFullYear();
                                            const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
                                            const dd = String(yesterday.getDate()).padStart(2, '0');
                                            const yStr = `${yyyy}-${mm}-${dd}`;
                                            setDateRange({ start: yStr, end: yStr });
                                            setShowDatePicker(false);
                                        }}
                                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300"
                                    >
                                        Ontem
                                    </button>
                                    <button
                                        onClick={() => {
                                            const today = new Date();
                                            const lastWeek = new Date();
                                            lastWeek.setDate(today.getDate() - 7);

                                            const t_yyyy = today.getFullYear();
                                            const t_mm = String(today.getMonth() + 1).padStart(2, '0');
                                            const t_dd = String(today.getDate()).padStart(2, '0');

                                            const l_yyyy = lastWeek.getFullYear();
                                            const l_mm = String(lastWeek.getMonth() + 1).padStart(2, '0');
                                            const l_dd = String(lastWeek.getDate()).padStart(2, '0');

                                            setDateRange({ start: `${l_yyyy}-${l_mm}-${l_dd}`, end: `${t_yyyy}-${t_mm}-${t_dd}` });
                                            setShowDatePicker(false);
                                        }}
                                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300"
                                    >
                                        Últimos 7 dias
                                    </button>
                                    <button
                                        onClick={() => {
                                            const today = new Date();
                                            const lastMonth = new Date();
                                            lastMonth.setDate(today.getDate() - 30);

                                            const t_yyyy = today.getFullYear();
                                            const t_mm = String(today.getMonth() + 1).padStart(2, '0');
                                            const t_dd = String(today.getDate()).padStart(2, '0');

                                            const l_yyyy = lastMonth.getFullYear();
                                            const l_mm = String(lastMonth.getMonth() + 1).padStart(2, '0');
                                            const l_dd = String(lastMonth.getDate()).padStart(2, '0');

                                            setDateRange({ start: `${l_yyyy}-${l_mm}-${l_dd}`, end: `${t_yyyy}-${t_mm}-${t_dd}` });
                                            setShowDatePicker(false);
                                        }}
                                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300"
                                    >
                                        Últimos 30 dias
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Início</label>
                                        <input
                                            type="date"
                                            value={dateRange.start || ''}
                                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Fim</label>
                                        <input
                                            type="date"
                                            value={dateRange.end || ''}
                                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6" ref={scrollContainerRef}>
                <div className="max-w-3xl mx-auto">
                    {hasMore && !isLoading && (
                        <div className="flex justify-center mb-4">
                            <button
                                onClick={() => fetchMessages(false)}
                                disabled={isLoadingMore}
                                className="text-sm text-purple-400 hover:text-purple-300 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isLoadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                                {isLoadingMore ? 'Carregando...' : 'Carregar mensagens anteriores'}
                            </button>
                        </div>
                    )}

                    {messages.length === 0 && !isLoading ? (
                        <div className="flex flex-col items-center justify-center h-[70vh] text-gray-500">
                            <div className="w-24 h-24 bg-gradient-to-br from-purple-600 to-blue-600 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-purple-900/40">
                                <Bot size={48} className="text-white" />
                            </div>
                            <h3 className="text-3xl font-bold text-white mb-3 tracking-tight">Como posso ajudar?</h3>
                            <p className="text-gray-400 text-center max-w-md mb-10 text-lg">
                                Sou seu assistente pessoal. Posso organizar tarefas, lembrar de compromissos e responder perguntas.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl px-4">
                                {[
                                    { icon: "📝", text: "Criar uma tarefa para revisar o contrato" },
                                    { icon: "⏰", text: "Me lembre de ligar para o João às 14h" },
                                    { icon: "💰", text: "Quanto eu gastei com Uber esse mês?" },
                                    { icon: "🧠", text: "O que eu te falei sobre o Projeto X?" }
                                ].map((prompt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleSendMessage(prompt.text)}
                                        className="bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 p-4 rounded-xl text-left transition-all group flex items-center gap-3"
                                    >
                                        <span className="text-2xl group-hover:scale-110 transition-transform">{prompt.icon}</span>
                                        <span className="text-gray-300 group-hover:text-white text-sm font-medium">{prompt.text}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <MessageBubble
                                key={msg.id}
                                content={msg.content || ''}
                                role={msg.role as 'user' | 'assistant'}
                                timestamp={msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined}
                                mediaUrl={msg.media_url}
                                mediaType={msg.media_type}
                            />
                        ))
                    )}

                    {isLoading && (
                        <div className="flex gap-3 mr-auto max-w-[85%] animate-pulse">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-purple-600">
                                <Bot size={16} className="text-white" />
                            </div>
                            <div className="bg-gray-800 border border-gray-700 text-gray-100 rounded-2xl p-4 shadow-sm flex items-center gap-2">
                                <Loader2 size={16} className="animate-spin text-purple-400" />
                                <span className="text-sm text-gray-400">Pensando...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* Input Area */}
            <div className="shrink-0">
                <div className="max-w-3xl mx-auto w-full">
                    <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
                </div>
            </div>
        </div>
    );
}
