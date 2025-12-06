import { clsx } from 'clsx';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageBubbleProps {
    content: string;
    role: 'user' | 'assistant';
    timestamp?: string;
    mediaUrl?: string | null;
}

export default function MessageBubble({ content, role, timestamp, mediaUrl }: MessageBubbleProps) {
    const isUser = role === 'user';

    return (
        <div className={clsx("flex gap-3 max-w-[85%] mb-6", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}>
            <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                isUser ? "bg-blue-600" : "bg-purple-600"
            )}>
                {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
            </div>

            <div className={clsx(
                "rounded-2xl p-4 shadow-sm",
                isUser ? "bg-blue-600 text-white" : "bg-gray-800 border border-gray-700 text-gray-100"
            )}>
                {mediaUrl && (
                    <div className="mb-3 rounded-lg overflow-hidden">
                        <img src={mediaUrl} alt="Attachment" className="max-w-full h-auto" />
                    </div>
                )}

                <div className={clsx("prose prose-sm max-w-none break-words", isUser ? "prose-invert text-white" : "prose-invert text-gray-100")}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content}
                    </ReactMarkdown>
                </div>

                {timestamp && (
                    <p className={clsx("text-[10px] mt-2 opacity-70", isUser ? "text-blue-100" : "text-gray-400")}>
                        {timestamp}
                    </p>
                )}
            </div>
        </div>
    );
}
