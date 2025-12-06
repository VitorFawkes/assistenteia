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
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { user } = useAuth();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        fetchMessages();

        // Subscribe to new messages
        const channel = supabase
            .channel('messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                setMessages((prev) => [...prev, payload.new as Message]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchMessages = async () => {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) console.error('Error fetching messages:', error);
        else setMessages(data || []);
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
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                <div className="max-w-3xl mx-auto">
                    {messages.length === 0 ? (
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
