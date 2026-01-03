import { createClient } from 'jsr:@supabase/supabase-js@2';

export class ToolExecutor {
    static async execute(toolName: string, toolArgs: any, supabase: any, userId: string): Promise<string> {
        console.log(`🛠️ Executing Tool: ${toolName}`, toolArgs);

        try {
            switch (toolName) {
                case 'manage_collections':
                    return await this.manageCollections(toolArgs, supabase, userId);
                case 'manage_tasks':
                    return await this.manageTasks(toolArgs, supabase, userId);
                case 'manage_reminders':
                    return await this.manageReminders(toolArgs, supabase, userId);
                case 'save_memory':
                    return await this.saveMemory(toolArgs, supabase, userId);
                default:
                    return JSON.stringify({ error: `Tool ${toolName} not implemented` });
            }
        } catch (error: any) {
            console.error(`❌ Tool Execution Error (${toolName}):`, error);
            return JSON.stringify({ error: error.message });
        }
    }

    private static async manageCollections(args: any, supabase: any, userId: string): Promise<string> {
        const { action, name, items, list_id, item_id, status } = args;

        if (action === 'create') {
            const { data, error } = await supabase
                .from('collections')
                .insert({ user_id: userId, name: name || 'Nova Lista' }) // Removed type: 'list'
                .select()
                .single();

            if (error) throw error;

            // ATOMIC STATE UPDATE: Set this new list as active immediately
            await supabase
                .from('user_state')
                .update({ active_list_id: data.id })
                .eq('user_id', userId);

            // Add items if provided
            if (items && Array.isArray(items) && items.length > 0) {
                const itemsToInsert = items.map((content: string) => ({
                    collection_id: data.id,
                    content,
                    user_id: userId,
                    status: 'todo',
                    type: 'text' // REQUIRED field
                }));
                await supabase.from('collection_items').insert(itemsToInsert);
            }

            return JSON.stringify({ success: true, message: `List '${data.name}' created with ${items?.length || 0} items.`, list_id: data.id });
        }

        if (action === 'add_item') {
            const targetListId = list_id; // Should be resolved by LLM or context
            if (!targetListId) return JSON.stringify({ error: "Missing list_id for add_item" });

            const itemsToInsert = (items || []).map((content: string) => ({
                collection_id: targetListId,
                content,
                user_id: userId,
                status: 'todo',
                type: 'text' // REQUIRED field
            }));

            const { error } = await supabase.from('collection_items').insert(itemsToInsert);
            if (error) throw error;

            return JSON.stringify({ success: true, message: `Added ${itemsToInsert.length} items to list.` });
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
                return JSON.stringify({ success: true, message: `Item ${item_id} updated to ${status || 'completed'}` });
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
                    return JSON.stringify({ success: true, message: `Item '${args.content}' updated to ${status || 'completed'}` });
                }
                return JSON.stringify({ error: `Item '${args.content}' not found to update.` });
            }

            return JSON.stringify({ error: "Missing item_id or content for update_item" });
        }

        if (action === 'archive_list') {
            const targetListId = list_id;
            if (!targetListId) return JSON.stringify({ error: "Missing list_id for archive_list" });

            // Archive the list (we don't have a status on collections yet, so we might just unpin or clear state)
            // Assuming we want to just clear the active state for now, or maybe we should add status to collections too?
            // For now, let's just clear the active state and maybe set a metadata flag if possible, or just rely on 'clearing context'.
            // Actually, let's just clear the user_state.active_list_id

            await supabase
                .from('user_state')
                .update({ active_list_id: null })
                .eq('user_id', userId);

            return JSON.stringify({ success: true, message: "List closed and removed from active context." });
        }

        return JSON.stringify({ error: `Unknown action ${action} for manage_collections` });
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
            return JSON.stringify({ success: true, message: `Task '${data.title}' created.`, task_id: data.id });
        }

        if (action === 'add_item') {
            if (!args.task_id || !args.items || !Array.isArray(args.items)) {
                return JSON.stringify({ error: 'Missing required parameters: task_id and items (array) are required for add_item.' });
            }

            // 1. Fetch Task
            const { data: task } = await supabase
                .from('tasks')
                .select('description')
                .eq('id', args.task_id)
                .single();

            if (!task) return JSON.stringify({ error: 'Task not found.' });

            // 2. Append Items
            const currentDescription = task.description || '';
            const newItems = args.items.map((item: string) => `[ ] ${item}`).join('\n');
            // Ensure we start on a new line if there is existing content
            const separator = currentDescription.length > 0 && !currentDescription.endsWith('\n') ? '\n' : '';
            const updatedDescription = `${currentDescription}${separator}${newItems}`;

            // 3. Save
            const { error } = await supabase
                .from('tasks')
                .update({ description: updatedDescription })
                .eq('id', args.task_id);

            if (error) throw error;
            return JSON.stringify({ success: true, message: `Added ${args.items.length} items to checklist.` });
        }

        if (action === 'update_checklist_item') {
            // LAYER 2: Defensive Validation
            if (!args.task_id || !args.item_content) {
                return JSON.stringify({
                    error: 'Missing required parameters: task_id and item_content are required for update_checklist_item.',
                    received: { task_id: args.task_id, item_content: args.item_content }
                });
            }

            // 1. Fetch Task
            const { data: task } = await supabase
                .from('tasks')
                .select('description')
                .eq('id', args.task_id)
                .single();

            if (!task || !task.description) return JSON.stringify({ error: 'Task not found or has no checklist.' });

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

            if (!found) return JSON.stringify({ error: `Item '${args.item_content}' not found in checklist.` });

            // 3. Save
            const { error } = await supabase
                .from('tasks')
                .update({ description: updatedLines.join('\n') })
                .eq('id', args.task_id);

            if (error) throw error;
            return JSON.stringify({ success: true, message: `Updated checklist item: ${args.item_content}` });
        }

        return JSON.stringify({ error: `Unknown action ${action} for manage_tasks` });
    }

    private static async manageReminders(args: any, supabase: any, userId: string): Promise<string> {
        const { action, title, due_at } = args;

        if (action === 'create') {
            const { data, error } = await supabase
                .from('reminders')
                .insert({
                    user_id: userId,
                    title: title,
                    due_at: due_at,
                    completed: false
                })
                .select()
                .single();

            if (error) throw error;
            return JSON.stringify({ success: true, message: `Reminder '${data.title}' set for ${data.due_at}.`, reminder_id: data.id });
        }

        return JSON.stringify({ error: `Unknown action ${action} for manage_reminders` });
    }

    private static async saveMemory(args: any, supabase: any, userId: string): Promise<string> {
        // For now, just log it. In future, vector DB.
        console.log('🧠 Saving Memory:', args.content);
        return JSON.stringify({ success: true, message: "Memory saved (simulated)." });
    }
}
