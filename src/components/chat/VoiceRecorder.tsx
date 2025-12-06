import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface VoiceRecorderProps {
    onRecordingComplete: (blob: Blob) => void;
    isProcessing?: boolean;
}

export default function VoiceRecorder({ onRecordingComplete, isProcessing }: VoiceRecorderProps) {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                onRecordingComplete(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);

            timerRef.current = window.setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Não foi possível acessar o microfone.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
    };

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (isProcessing) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-xl text-gray-400">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">Processando...</span>
            </div>
        );
    }

    if (isRecording) {
        return (
            <div className="flex items-center gap-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl animate-pulse">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                <span className="text-red-400 font-mono text-sm min-w-[40px]">{formatTime(recordingTime)}</span>
                <button
                    onClick={stopRecording}
                    className="p-1 text-red-400 hover:text-red-300 transition-colors"
                >
                    <Square size={20} fill="currentColor" />
                </button>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={startRecording}
            className="p-3 text-gray-400 hover:text-white hover:bg-gray-700 rounded-xl transition-colors"
        >
            <Mic size={20} />
        </button>
    );
}
