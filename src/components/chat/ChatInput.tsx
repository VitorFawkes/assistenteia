import React, { useState, useRef } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import { clsx } from 'clsx';
import VoiceRecorder from './VoiceRecorder';

interface ChatInputProps {
    onSendMessage: (content: string, file?: File) => void;
    isLoading?: boolean;
}

export default function ChatInput({ onSendMessage, isLoading }: ChatInputProps) {
    const [input, setInput] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if ((!input.trim() && !selectedFile) || isLoading) return;

        onSendMessage(input, selectedFile || undefined);
        setInput('');
        setSelectedFile(null);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };


    const handleVoiceRecording = async (audioBlob: Blob) => {
        // Convert blob to file
        const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
        onSendMessage('', audioFile);
    };

    return (
        <div className="p-4 bg-gray-900 border-t border-gray-800">
            {selectedFile && (
                <div className="mb-2 p-2 bg-gray-800 rounded-lg flex items-center justify-between max-w-xs">
                    <span className="text-sm text-gray-300 truncate">{selectedFile.name}</span>
                    <button
                        onClick={() => setSelectedFile(null)}
                        className="p-1 hover:bg-gray-700 rounded-full"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="relative flex items-end gap-2 bg-gray-800 p-2 rounded-2xl border border-gray-700 focus-within:border-blue-500 transition-colors">
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors"
                >
                    <Paperclip size={20} />
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                />

                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    className="flex-1 bg-transparent border-0 focus:ring-0 text-white placeholder-gray-500 resize-none py-3 max-h-32"
                    rows={1}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                    }}
                />

                <div className="flex items-center gap-1">
                    {input.trim() || selectedFile ? (
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={clsx(
                                "p-3 rounded-xl transition-all duration-200",
                                isLoading
                                    ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                                    : "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/30"
                            )}
                        >
                            <Send size={20} />
                        </button>
                    ) : (
                        <VoiceRecorder onRecordingComplete={handleVoiceRecording} />
                    )}
                </div>
            </form>
        </div>
    );
}
