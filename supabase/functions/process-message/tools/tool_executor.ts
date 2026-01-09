import { createClient } from 'jsr:@supabase/supabase-js@2';
declare const Deno: any;

export class ToolExecutor {
    static async execute(toolName: string, toolArgs: any, supabase: any, userId: string): Promise<string> {
        console.log(`🛠️ Executing Tool: ${toolName}`, toolArgs);

        // LOG TOOL START
        try {
            await supabase.from('debug_logs').insert({
                function_name: 'tool_executor',
                level: 'info',
                message: `Executing ${toolName}`,
                meta: { args: toolArgs }
            });
        } catch (e) { /* ignore log error */ }

        try {
            let result = '';
            switch (toolName) {
                case 'manage_collections':
                    result = await this.manageCollections(toolArgs, supabase, userId);
                    break;
                case 'manage_tasks':
                    result = await this.manageTasks(toolArgs, supabase, userId);
                    break;
                case 'manage_reminders':
                    result = await this.manageReminders(toolArgs, supabase, userId);
                    break;
                case 'save_memory':
                    result = await this.saveMemory(toolArgs, supabase, userId);
                    break;
                case 'query_messages':
                    result = await this.queryMessages(toolArgs, supabase, userId);
                    break;
                default:
                    result = JSON.stringify({ error: `Tool ${toolName} not implemented` });
            }

            // LOG TOOL SUCCESS
            try {
                await supabase.from('debug_logs').insert({
                    function_name: 'tool_executor',
                    level: 'info',
                    message: `Tool ${toolName} Success`,
                    meta: { result }
                });
            } catch (e) { /* ignore log error */ }

            return result;

        } catch (error: any) {
            console.error(`❌ Tool Execution Error (${toolName}):`, error);

            // LOG TOOL ERROR
            try {
                await supabase.from('debug_logs').insert({
                    function_name: 'tool_executor',
                    level: 'error',
                    message: `Tool ${toolName} Failed`,
                    meta: { error: error.message, stack: error.stack }
                });
            } catch (e) { /* ignore log error */ }

            return JSON.stringify({ error: error.message });
        }
    }

    private static async manageCollections(args: any, supabase: any, userId: string): Promise<string> {
        const { action, name, items, list_id, item_id, status } = args;

        if (action === 'create') {
            const collectionName = name || 'Nova Lista';

            // 1. Check if collection already exists (Case Insensitive)
            const { data: existing } = await supabase
                .from('collections')
                .select('id, name')
                .eq('user_id', userId)
                .ilike('name', collectionName)
                .single();

            let targetListId;
            let messagePrefix;

            if (existing) {
                console.log(`⚠️ Collection '${collectionName}' already exists. Using ID: ${existing.id}`);
                targetListId = existing.id;
                messagePrefix = `Lista '${existing.name}' já existia.`;
            } else {
                // 2. Create new if not exists
                const { data, error } = await supabase
                    .from('collections')
                    .insert({ user_id: userId, name: collectionName })
                    .select()
                    .single();

                if (error) throw error;
                targetListId = data.id;
                messagePrefix = `Lista '${data.name}' criada.`;
            }

            // ATOMIC STATE UPDATE: Set this list as active
            await supabase
                .from('user_state')
                .update({ active_list_id: targetListId })
                .eq('user_id', userId);

            // Add items if provided
            let itemsAdded = 0;
            if (items && Array.isArray(items) && items.length > 0) {
                const itemsToInsert = items.map((item: any) => ({
                    collection_id: targetListId,
                    content: typeof item === 'object' && item.content ? item.content : String(item),
                    user_id: userId,
                    status: 'todo',
                    type: 'text'
                }));
                await supabase.from('collection_items').insert(itemsToInsert);
                itemsAdded = itemsToInsert.length;
            }

            return JSON.stringify({
                success: true,
                message: `${messagePrefix} ${itemsAdded} itens adicionados.`,
                list_id: targetListId
            });
        }

        if (action === 'add_item') {
            const targetListId = list_id; // Should be resolved by LLM or context
            if (!targetListId) return JSON.stringify({ error: "Faltando list_id para add_item" });

            const itemsToInsert = (items || []).map((item: any) => ({
                collection_id: targetListId,
                content: typeof item === 'object' && item.content ? item.content : String(item),
                user_id: userId,
                status: 'todo',
                type: 'text' // REQUIRED field
            }));

            const { error } = await supabase.from('collection_items').insert(itemsToInsert);
            if (error) throw error;

            return JSON.stringify({ success: true, message: `Adicionado(s) ${itemsToInsert.length} item(ns) à lista.` });
        }

        if (action === 'update_item') {
            // If item_id is provided, update directly
            if (item_id) {
                const { error } = await supabase
                    .from('collection_items')
                    .update({ status: status || 'completed' })
                    .eq('id', item_id)
                    .eq('user_id', userId);

                if (error) throw error;
                return JSON.stringify({ success: true, message: `Item ${item_id} atualizado para ${status || 'completed'}` });
            }
            // If content is provided, try to find it (fuzzy match)
            else if (args.content) {
                // Try to find the item in the active list or recent items
                const { data: foundItems } = await supabase
                    .from('collection_items')
                    .select('id')
                    .eq('user_id', userId)
                    .ilike('content', `%${args.content}%`)
                    .neq('status', status || 'completed') // Don't update if already done
                    .limit(1);

                if (foundItems && foundItems.length > 0) {
                    await supabase
                        .from('collection_items')
                        .update({ status: status || 'completed' })
                        .eq('id', foundItems[0].id);
                    return JSON.stringify({ success: true, message: `Item '${args.content}' atualizado para ${status || 'completed'}` });
                }
                return JSON.stringify({ error: `Item '${args.content}' não encontrado para atualizar.` });
            }

            return JSON.stringify({ error: "Faltando item_id ou content para update_item" });
        }

        if (action === 'archive_list') {
            const targetListId = list_id;
            if (!targetListId) return JSON.stringify({ error: "Faltando list_id para archive_list" });

            // Archive the list (we don't have a status on collections yet, so we might just unpin or clear state)
            // Assuming we want to just clear the active state for now, or maybe we should add status to collections too?
            // For now, let's just clear the active state and maybe set a metadata flag if possible, or just rely on 'clearing context'.
            // Actually, let's just clear the user_state.active_list_id

            await supabase
                .from('user_state')
                .update({ active_list_id: null })
                .eq('user_id', userId);

            return JSON.stringify({ success: true, message: "Lista fechada e removida do contexto ativo." });
        }

        return JSON.stringify({ error: `Ação desconhecida ${action} para manage_collections` });
    }

    private static async manageTasks(args: any, supabase: any, userId: string): Promise<string> {
        const { action, title, priority } = args;

        if (action === 'create') {
            const { data, error } = await supabase
                .from('tasks')
                .insert({
                    user_id: userId,
                    title: title,
                    description: args.description, // Added description support
                    priority: priority || 'medium',
                    status: 'todo'
                })
                .select()
                .single();

            if (error) throw error;
            return JSON.stringify({ success: true, message: `Tarefa '${data.title}' criada.`, task_id: data.id });
        }

        if (action === 'add_item') {
            if (!args.task_id || !args.items || !Array.isArray(args.items)) {
                return JSON.stringify({ error: 'Faltando parâmetros: task_id e items (array) são obrigatórios para add_item.' });
            }

            // 1. Fetch Task
            const { data: task } = await supabase
                .from('tasks')
                .select('description')
                .eq('id', args.task_id)
                .single();

            if (!task) return JSON.stringify({ error: 'Tarefa não encontrada.' });

            // 2. Append Items
            const currentDescription = task.description || '';
            const newItems = args.items.map((item: any) => {
                const content = typeof item === 'object' && item.content ? item.content : String(item);
                return `[ ] ${content}`;
            }).join('\n');
            // Ensure we start on a new line if there is existing content
            const separator = currentDescription.length > 0 && !currentDescription.endsWith('\n') ? '\n' : '';
            const updatedDescription = `${currentDescription}${separator}${newItems}`;

            // 3. Save
            const { error } = await supabase
                .from('tasks')
                .update({ description: updatedDescription })
                .eq('id', args.task_id);

            if (error) throw error;
            return JSON.stringify({ success: true, message: `Adicionado(s) ${args.items.length} item(ns) ao checklist.` });
        }

        if (action === 'update_checklist_item') {
            // LAYER 2: Defensive Validation
            if (!args.task_id || !args.item_content) {
                return JSON.stringify({
                    error: 'Faltando parâmetros: task_id e item_content são obrigatórios para update_checklist_item.',
                    received: { task_id: args.task_id, item_content: args.item_content }
                });
            }

            // 1. Fetch Task
            const { data: task } = await supabase
                .from('tasks')
                .select('description')
                .eq('id', args.task_id)
                .single();

            if (!task || !task.description) return JSON.stringify({ error: 'Tarefa não encontrada ou sem checklist.' });

            // 2. Update Line
            const lines = task.description.split('\n');
            let found = false;
            const updatedLines = lines.map((line: string) => {
                if (line.toLowerCase().includes(args.item_content.toLowerCase())) {
                    found = true;
                    // Toggle check
                    if (line.includes('[ ]')) return line.replace('[ ]', '[x]');
                    if (line.includes('[x]')) return line.replace('[x]', '[ ]');
                }
                return line;
            });

            if (!found) return JSON.stringify({ error: `Item '${args.item_content}' não encontrado no checklist.` });

            // 3. Save
            const { error } = await supabase
                .from('tasks')
                .update({ description: updatedLines.join('\n') })
                .eq('id', args.task_id);

            if (error) throw error;
            return JSON.stringify({ success: true, message: `Item do checklist atualizado: ${args.item_content}` });
        }

        return JSON.stringify({ error: `Ação desconhecida ${action} para manage_tasks` });
    }

    private static async manageReminders(args: any, supabase: any, userId: string): Promise<string> {
        const { action, title, due_at, recurrence_type, recurrence_interval, recurrence_unit, recurrence_count } = args;

        if (action === 'create') {
            if (!title || !due_at) {
                return JSON.stringify({ error: 'Faltando parâmetros: title e due_at são obrigatórios para criar lembrete.' });
            }

            const { data, error } = await supabase
                .from('reminders')
                .insert({
                    user_id: userId,
                    title: title,
                    due_at: due_at,
                    is_completed: false,
                    recurrence_type: recurrence_type || 'once',
                    recurrence_interval: recurrence_interval,
                    recurrence_unit: recurrence_unit,
                    recurrence_count: recurrence_count
                })
                .select()
                .single();

            if (error) throw error;
            return JSON.stringify({ success: true, message: `Lembrete '${data.title}' definido para ${data.due_at}.`, reminder_id: data.id });
        }

        return JSON.stringify({ error: `Ação desconhecida ${action} para manage_reminders` });
    }

    private static async saveMemory(args: any, supabase: any, userId: string): Promise<string> {
        // For now, just log it. In future, vector DB.
        console.log('🧠 Saving Memory:', args.content);
        return JSON.stringify({ success: true, message: "Memória salva (simulado)." });
    }

    private static async queryMessages(args: any, supabase: any, userId: string): Promise<string> {
        const { limit, group_name, sender_name, days_ago } = args;

        console.log(`🔍 Querying Messages: Group=${group_name}, Sender=${sender_name}, Days=${days_ago}`);

        const { data, error } = await supabase.rpc('get_messages_decrypted', {
            p_user_id: userId,
            p_limit: limit || 20,
            p_encryption_key: Deno.env.get('ENCRYPTION_KEY'),
            p_group_name: group_name || null,
            p_sender_name: sender_name || null,
            p_days_ago: days_ago || 7
        });

        if (error) {
            console.error('❌ Error querying messages:', error);
            return JSON.stringify({ error: 'Falha ao recuperar mensagens.' });
        }

        if (!data || data.length === 0) {
            return JSON.stringify({ message: 'Nenhuma mensagem encontrada com esses critérios.' });
        }

        // Format for LLM
        const formatted = data.map((m: any) => {
            const date = new Date(m.created_at).toLocaleString('pt-BR');
            const source = m.is_group ? `[Group: ${m.group_name}]` : `[Direct]`;
            const sender = m.sender_name || m.sender_number;
            return `[${date}] ${source} ${sender}: ${m.content}`;
        }).join('\n');

        return JSON.stringify({
            success: true,
            count: data.length,
            messages: formatted
        });
    }
}
