import { type LucideIcon } from 'lucide-react';
import Button from './ui/Button';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    exampleCommand?: string;
}

export default function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    exampleCommand
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-gray-800/30 border border-gray-700/50 rounded-2xl animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-black/20">
                <Icon size={40} className="text-gray-400" />
            </div>

            <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
            <p className="text-gray-400 max-w-md mb-8 leading-relaxed">
                {description}
            </p>

            {exampleCommand && (
                <div className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-4 mb-8 max-w-md w-full text-left">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-2 tracking-wider">Tente pedir no WhatsApp:</p>
                    <div className="flex items-start gap-3 text-gray-300 font-mono text-sm">
                        <span className="text-blue-500 select-none">"</span>
                        {exampleCommand}
                        <span className="text-blue-500 select-none">"</span>
                    </div>
                </div>
            )}

            {actionLabel && onAction && (
                <Button onClick={onAction} variant="secondary">
                    {actionLabel}
                </Button>
            )}
        </div>
    );
}
