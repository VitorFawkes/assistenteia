import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import Button from './Button';

interface AlertDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'primary';
    isLoading?: boolean;
}

export default function AlertDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    variant = 'danger',
    isLoading = false
}: AlertDialogProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full shrink-0 ${variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            <AlertTriangle size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight">
                                {title}
                            </h3>
                            <div className="text-gray-600 text-sm leading-relaxed">
                                {description}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors -mt-2 -mr-2 p-2"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="bg-gray-50 px-6 py-4 flex gap-3 justify-end border-t border-gray-100">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={isLoading}
                        className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={variant}
                        onClick={onConfirm}
                        isLoading={isLoading}
                        disabled={isLoading}
                        className={variant === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20'}
                    >
                        {confirmText}
                    </Button>
                </div>
            </div>
        </div>
    );
}
