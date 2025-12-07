import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';
import MessageBubble from '../components/chat/MessageBubble';
import ChatInput from '../components/chat/ChatInput';
import { useAuth } from '../contexts/AuthContext';
import { Bot, Loader2 } from 'lucide-react';

type Message = Database['public']['Tables']['messages']['Row'];

export default function ChatPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
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
                // Only add if it matches current search (or no search)
                const newMessage = payload.new as Message;
                if (!searchQuery || (newMessage.content && newMessage.content.toLowerCase().includes(searchQuery.toLowerCase()))) {
                    setMessages((prev) => [...prev, newMessage]);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [searchQuery]); // Refetch when search changes

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

            // Pagination
            const PAGE_SIZE = 50;
            const currentLength = reset ? 0 : messages.length;

            // If we are loading more, we want messages OLDER than the oldest we have
            // But since we fetch descending, we just use range.
            // Wait, if we fetch descending, index 0 is newest.
            // So range(0, 49) is newest 50.
            // range(50, 99) is next 50.

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
            const { error: insertError } = await supabase
                .from('messages')
                .insert({
                    role: 'user',
                    content: content || null,
                    media_url: mediaUrl || null,
                    media_type: mediaType || null,
                    user_id: userId,
                });

            if (insertError) {
                console.error('Error saving message:', insertError);
                setIsLoading(false);
                return;
            }

            // Process with AI
            const { processMessage } = await import('../lib/storage');
            const result = await processMessage(content, userId, mediaUrl, mediaType);

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
            <div className="p-4 border-b border-gray-800 bg-gray-900/95 backdrop-blur z-10">
                <div className="max-w-3xl mx-auto flex gap-2">
                    <input
                        type="text"
                        placeholder="Buscar mensagens..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600"
                    />
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
