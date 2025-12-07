import { useState, useEffect } from 'react';
import { Save, RotateCcw, Loader2, Check, AlertCircle, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';

const DEFAULT_PROMPT = `Você é um assistente pessoal inteligente e organizado.

Use as ferramentas disponíveis para:
- Criar e organizar coleções de informações
- Adicionar e consultar itens estruturados
- Gerenciar lembretes

Exemplos de uso:
- "Crie sessão Viagem Curitiba" → create_collection
- "Anote em Controle de Custos: Mercado R$20" → add_item_to_collection com metadata {"amount": 20, "category": "mercado"}
- "Quanto gastei em Controle de Custos?" → query_collection com operation "sum" e field "amount"
- "Me lembre de reunião amanhã às 10h" → create_reminder
- "Adiou para 15h" → update_reminder

Sempre confirme ações com mensagens claras e amigáveis.`;

export default function SettingsPage() {
    const [systemPrompt, setSystemPrompt] = useState('');
    const [aiModel, setAiModel] = useState('gpt-4o');
    const [preferredName, setPreferredName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('user_settings')
                .select('custom_system_prompt, ai_model, preferred_name')
                .eq('user_id', user.id)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                setSystemPrompt(data.custom_system_prompt || DEFAULT_PROMPT);
                setAiModel(data.ai_model || 'gpt-4o');
                setPreferredName(data.preferred_name || '');
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setMessage(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');

            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    custom_system_prompt: systemPrompt,
                    ai_model: aiModel,
                    preferred_name: preferredName,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) throw error;

            setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });

            // Clear success message after 3 seconds
            setTimeout(() => setMessage(null), 3000);
        } catch (error) {
            console.error('Error saving settings:', error);
            setMessage({ type: 'error', text: 'Erro ao salvar configurações.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        if (!confirm('Deseja restaurar o prompt padrão?')) return;

        setSystemPrompt(DEFAULT_PROMPT);
        // We don't reset preferredName as it's personal

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            // Save immediately to persist the reset
            setIsSaving(true);
            try {
                await supabase.from('user_settings').upsert({
                    user_id: user.id,
                    custom_system_prompt: DEFAULT_PROMPT,
                    ai_model: aiModel,
                    preferred_name: preferredName,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
                setMessage({ type: 'success', text: 'Prompt restaurado com sucesso!' });
                setTimeout(() => setMessage(null), 3000);
            } catch (error) {
                console.error('Error resetting prompt:', error);
                setMessage({ type: 'error', text: 'Erro ao restaurar prompt.' });
            } finally {
                setIsSaving(false);
            }
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full bg-gray-900">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-900 p-6 overflow-auto">
            <div className="max-w-4xl mx-auto w-full space-y-6">

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Configurações</h1>
                        <p className="text-gray-400">Personalize o comportamento da sua assistente.</p>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleReset}
                        disabled={isSaving}
                        icon={RotateCcw}
                    >
                        Restaurar Padrão
                    </Button>
                </div>

                {message && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                        {message.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
                        {message.text}
                    </div>
                )}

                {/* Preferred Name Section */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 bg-purple-500/10 rounded-xl">
                            <User className="w-6 h-6 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-white">Como devo te chamar?</h3>
                            <p className="text-sm text-gray-400">Defina um apelido ou nome preferido para a IA usar.</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                            Nome / Apelido
                        </label>
                        <input
                            type="text"
                            value={preferredName}
                            onChange={(e) => setPreferredName(e.target.value)}
                            placeholder="Ex: Chefe, Vitor, Mestre..."
                            className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none"
                        />
                    </div>
                </div>

                {/* AI Model Section */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <label className="block text-white font-semibold mb-2">
                        🤖 Modelo de IA
                    </label>
                    <select
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        disabled={isSaving}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
                    >
                        <optgroup label="🚀 GPT-5 (Mais Recentes)">
                            <option value="gpt-5.1">GPT-5.1 (Flagship - Melhor para agentes e código)</option>
                            <option value="gpt-5.1-codex">GPT-5.1 Codex (Especializado em código)</option>
                            <option value="gpt-5.1-codex-mini">GPT-5.1 Codex Mini (Código rápido)</option>
                            <option value="gpt-5">GPT-5 (Modelo forte)</option>
                            <option value="gpt-5-mini">GPT-5 Mini (Rápido e econômico)</option>
                            <option value="gpt-5-nano">GPT-5 Nano (Muito barato)</option>
                        </optgroup>
                        <optgroup label="⚡ GPT-4.1 (Nova Geração)">
                            <option value="gpt-4.1">GPT-4.1 (Mais inteligente da família 4.x)</option>
                            <option value="gpt-4.1-mini">GPT-4.1 Mini (Mais rápido)</option>
                            <option value="gpt-4.1-nano">GPT-4.1 Nano (Ultra leve)</option>
                        </optgroup>
                        <optgroup label="💎 GPT-4o (Atual - Recomendado)">
                            <option value="gpt-4o">GPT-4o (Padrão - Ótimo custo-benefício)</option>
                            <option value="gpt-4o-mini">GPT-4o Mini (Mais rápido e econômico)</option>
                        </optgroup>
                        <optgroup label="🧠 Raciocínio Avançado (O1)">
                            <option value="o1">O1 (Raciocínio máximo)</option>
                            <option value="o1-preview">O1 Preview (Raciocínio avançado)</option>
                            <option value="o1-mini">O1 Mini (Raciocínio rápido)</option>
                        </optgroup>
                        <optgroup label="📚 Modelos Anteriores">
                            <option value="gpt-4-turbo">GPT-4 Turbo</option>
                            <option value="gpt-4">GPT-4 (Clássico)</option>
                        </optgroup>
                    </select>
                    <p className="text-gray-400 text-sm mt-2">
                        {aiModel === 'gpt-5.1' && '🚀 Flagship GPT-5 - Melhor para agentes, código e instruções complexas'}
                        {aiModel === 'gpt-5.1-codex' && '💻 Especializado em código - Melhor para programação'}
                        {aiModel === 'gpt-5.1-codex-mini' && '⚡💻 Código rápido - Versão menor do Codex'}
                        {aiModel === 'gpt-5' && '🚀 GPT-5 - Modelo forte da nova geração'}
                        {aiModel === 'gpt-5-mini' && '💰 GPT-5 Mini - Rápido e econômico'}
                        {aiModel === 'gpt-5-nano' && '🪶 GPT-5 Nano - Muito barato para alto volume'}
                        {aiModel === 'gpt-4.1' && '⚡ GPT-4.1 - Mais inteligente da família 4.x'}
                        {aiModel === 'gpt-4.1-mini' && '💨 GPT-4.1 Mini - Versão rápida'}
                        {aiModel === 'gpt-4.1-nano' && '🪶 GPT-4.1 Nano - Ultra leve'}
                        {aiModel === 'gpt-4o' && '💎 Padrão atual - Ótimo custo-benefício'}
                        {aiModel === 'gpt-4o-mini' && '💰 Mais barato e 2x mais rápido'}
                        {aiModel === 'o1' && '🧠 Raciocínio máximo - Problemas complexos'}
                        {aiModel === 'o1-preview' && '🧪 Raciocínio avançado em preview'}
                        {aiModel === 'o1-mini' && '⚡🧠 Raciocínio rápido'}
                        {aiModel === 'gpt-4-turbo' && '🐢 Modelo anterior'}
                        {aiModel === 'gpt-4' && '🦕 GPT-4 Clássico'}
                    </p>
                </div>

                {/* System Prompt Section */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <label className="block text-white font-semibold mb-2">
                        📝 System Prompt
                    </label>
                    <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        disabled={isSaving}
                        className="w-full h-96 bg-gray-900 border border-gray-600 rounded-xl p-4 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50 transition-all"
                        placeholder="Digite o system prompt aqui..."
                    />
                    <div className="mt-2 text-right">
                        <p className="text-gray-500 text-sm">
                            {systemPrompt.length} caracteres • {systemPrompt.split('\n').length} linhas
                        </p>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        isLoading={isSaving}
                        icon={Save}
                        className="w-full sm:w-auto"
                    >
                        Salvar Alterações
                    </Button>
                </div>
            </div>
        </div>
    );
}
