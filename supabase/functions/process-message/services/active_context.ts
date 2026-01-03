import { createClient } from 'jsr:@supabase/supabase-js@2';

export class ActiveContextService {
    static async build(supabase: any, userId: string): Promise<any> {
        console.time('ActiveContext');

        // 1. Fetch User State (Active List)
        const { data: userState } = await supabase
            .from('user_state')
            .select('active_list_id')
            .eq('user_id', userId)
            .maybeSingle();

        // 2. Fetch Top Tasks
        const { data: tasks } = await supabase
            .from('tasks')
            .select('id, title, status, priority, due_date')
            .eq('user_id', userId)
            .neq('status', 'done')
            .neq('status', 'archived')
            .order('priority', { ascending: false })
            .limit(5);

        // 3. Fetch Urgent Reminders
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const { data: reminders } = await supabase
            .from('reminders')
            .select('id, title, due_at')
            .eq('user_id', userId)
            .eq('completed', false)
            .lte('due_at', tomorrow.toISOString())
            .order('due_at', { ascending: true })
            .limit(5);

        // 5. Determine Active List (Collection OR Checklist Task)
        let activeListId = userState?.active_list_id;
        let activeList = null;

        // Check for recent Checklist Task (Task with '[ ]' in description)
        const { data: recentChecklist } = await supabase
            .from('tasks')
            .select('id, title, description, updated_at')
            .eq('user_id', userId)
            .neq('status', 'done')
            .neq('status', 'archived')
            .ilike('description', '%[ ]%') // Only tasks with checkboxes
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Check for Active Collection
        let activeCollection = null;
        if (activeListId) {
            const { data: list } = await supabase
                .from('collections')
                .select('id, name, updated_at')
                .eq('id', activeListId)
                .single();
            activeCollection = list;
        }

        // DECISION: Who is the "Active List"?
        // If we have a recent checklist and it's newer than the active collection (or no collection), use the Checklist.
        const useChecklist = recentChecklist && (!activeCollection || new Date(recentChecklist.updated_at) > new Date(activeCollection.updated_at));

        if (useChecklist) {
            // Parse items from Markdown Description
            const lines = recentChecklist.description.split('\n');
            const items = lines
                .filter((line: string) => line.includes('[ ]')) // Only unchecked items
                .map((line: string, index: number) => ({
                    id: `line-${index}`, // Virtual ID
                    content: line.replace('[ ]', '').trim(),
                    status: 'todo'
                }));

            activeList = {
                id: recentChecklist.id,
                name: recentChecklist.title,
                type: 'checklist', // New type
                items: items,
                count: items.length
            };
        } else if (activeCollection) {
            // Use Collection
            const { data: items } = await supabase
                .from('collection_items')
                .select('id, content, status')
                .eq('collection_id', activeCollection.id)
                .neq('status', 'completed')
                .neq('status', 'archived')
                .limit(10);

            activeList = {
                id: activeCollection.id,
                name: activeCollection.name,
                type: 'collection',
                items: items?.map((i: any) => ({ id: i.id, content: i.content })) || [],
                count: items?.length || 0
            };
        }

        // 6. Fetch Pinned Collections (Metadata only)
        const { data: pinnedCollections } = await supabase
            .from('collections')
            .select('id, name')
            .eq('user_id', userId)
            .eq('is_pinned', true)
            .limit(3);

        console.timeEnd('ActiveContext');

        return {
            user: { now: new Date().toISOString(), active_list_id: activeListId },
            active_list: activeList,
            top_tasks: tasks?.map((t: any) => ({ id: t.id, title: t.title, priority: t.priority })) || [],
            urgent_reminders: reminders?.map((r: any) => ({ id: r.id, title: r.title, due_at: r.due_at })) || [],
            pinned_collections: pinnedCollections || []
        };
    }
}
