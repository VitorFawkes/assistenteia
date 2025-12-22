import React from 'react';
import { Briefcase, Heart, Home, Copy, Check } from 'lucide-react';

const CAPABILITIES = [
    {
        category: 'Pessoal',
        icon: Home,
        color: 'text-green-600',
        bg: 'bg-green-50',
        examples: [
            "Me lembre de beber água a cada 2h",
            "Crie uma lista de compras para lasanha",
            "Resuma meu dia hoje"
        ]
    },
    {
        category: 'Trabalho',
        icon: Briefcase,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        examples: [
            "Agende uma reunião com Carlos quinta 15h",
            "Resuma esse PDF em tópicos",
            "Quais minhas tarefas pendentes?"
        ]
    },
    {
        category: 'Bem-estar',
        icon: Heart,
        color: 'text-ela-pink',
        bg: 'bg-ela-pink/5',
        examples: [
            "Sugira um treino de 20min em casa",
            "Me ajude a meditar por 5 minutos",
            "Ideias de jantar saudável e rápido"
        ]
    }
];

export default function CapabilitiesGallery() {
    const [copied, setCopied] = React.useState<string | null>(null);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(text);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="grid md:grid-cols-3 gap-6 w-full max-w-4xl">
            {CAPABILITIES.map((cat) => (
                <div key={cat.category} className="bg-white border border-ela-border rounded-2xl p-6 hover:bg-gray-50/50 transition-all shadow-sm hover:shadow-md">
                    <div className="flex items-center gap-3 mb-6">
                        <div className={`p-2.5 rounded-xl ${cat.bg} border border-black/5`}>
                            <cat.icon size={20} className={cat.color} />
                        </div>
                        <h3 className="font-bold text-ela-text text-lg">{cat.category}</h3>
                    </div>

                    <ul className="space-y-2">
                        {cat.examples.map((example, i) => (
                            <li
                                key={i}
                                onClick={() => handleCopy(example)}
                                className="group flex items-start gap-3 text-sm text-ela-sub hover:text-ela-text cursor-pointer transition-all p-3 hover:bg-white hover:shadow-sm border border-transparent hover:border-ela-border rounded-xl -mx-2"
                            >
                                <div className="mt-0.5 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                    {copied === example ? <Check size={14} className="text-green-500" /> : <Copy size={14} className="text-ela-pink" />}
                                </div>
                                <span className="leading-relaxed italic">"{example}"</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}
