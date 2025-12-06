import { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
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
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { user } = useAuth();

    useEffect(() => {
        if (user) {
            loadSettings();
        }
    }, [user]);

    const loadSettings = async () => {
        if (!user) return;

        setIsLoading(true);
        const { data, error } = await supabase
            .from('user_settings')
            .select('custom_system_prompt, ai_model')
            .eq('user_id', user.id)
            .maybeSingle();

        if (error) {
            console.error('Error loading settings:', error);
        }

        setSystemPrompt(data?.custom_system_prompt || DEFAULT_PROMPT);
        setAiModel(data?.ai_model || 'gpt-4o');
        setIsLoading(false);
    };

    const handleSave = async () => {
        if (!user) return;

        setIsSaving(true);

        console.log('💾 Tentando salvar:', {
            user_id: user.id,
            custom_system_prompt: systemPrompt.substring(0, 50) + '...',
            ai_model: aiModel
        });

        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                custom_system_prompt: systemPrompt,
                ai_model: aiModel,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id'
            });

        if (error) {
            console.error('❌ Erro ao salvar configurações:', error);
            alert('Erro ao salvar configurações: ' + error.message);
        } else {
            console.log('✅ Configurações salvas com sucesso!');
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 2000);
        }

        setIsSaving(false);
    };

    const handleReset = async () => {
        if (!confirm('Deseja restaurar o prompt padrão?')) return;

        setSystemPrompt(DEFAULT_PROMPT);
        if (user) {
            await handleSave();
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full bg-gray-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-900 p-6 overflow-auto">
            <div className="max-w-4xl mx-auto w-full">
                <PageHeader
                    title="Configurações"
                    subtitle="Configure o comportamento da sua assistente"
                    icon={Settings}
                    iconColor="text-blue-400"
                />

                <Card className="p-6 mb-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-semibold text-white mb-1">System Prompt da IA</h2>
                            <p className="text-gray-400 text-sm">
                                Personalize como a IA se comporta. Mudanças são aplicadas imediatamente.
                            </p>
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

                    <div className="mb-6 p-4 bg-gray-900 rounded-xl border border-gray-700">
                        <label className="block text-white font-semibold mb-2">
                            🤖 Modelo de IA
                        </label>
                        <select
                            value={aiModel}
                            onChange={(e) => setAiModel(e.target.value)}
                            disabled={isSaving}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
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

                    <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        disabled={isSaving}
                        className="w-full h-96 bg-gray-900 border border-gray-600 rounded-xl p-4 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50 transition-all"
                        placeholder="Digite o system prompt aqui..."
                    />

                    <div className="mt-4 flex items-center justify-between">
                        <p className="text-gray-500 text-sm">
                            {systemPrompt.length} caracteres • {systemPrompt.split('\n').length} linhas
                        </p>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            isLoading={isSaving}
                            icon={isSaved ? undefined : Save}
                            className={isSaved ? 'bg-green-600 hover:bg-green-500' : ''}
                        >
                            {isSaved ? 'Salvo!' : 'Salvar'}
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
}
