import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Router Output
export const RouterOutputSchema = z.object({
    mode: z.enum(['CAPTURE', 'QUERY', 'TRANSFORM', 'CHAT', 'WHATSAPP_SUMMARY']),
    intent: z.string(),
    confidence: z.number(),
    entities: z.record(z.any()).optional(),
    direct_action: z.boolean().optional()
});

// Generic Worker Output
export const WorkerOutputSchema = z.object({
    response: z.string(), // The text to show the user (or empty if data-only)
    data: z.any().optional(), // Structured data for rendering
    constraints: z.object({
        data_only: z.boolean().optional(),
        strict_output: z.boolean().optional()
    }).optional(),
    tool_calls: z.array(z.any()).optional() // For when the worker decides to call tools
});

// Specific Schemas (can be used for stricter validation per mode if needed)
export const CaptureOutputSchema = WorkerOutputSchema.extend({
    data: z.object({
        action: z.enum(['created', 'updated', 'deleted', 'none']),
        item_type: z.enum(['task', 'reminder', 'list_item', 'collection', 'memory', 'setting']),
        id: z.string().optional()
    }).optional()
});

export const QueryOutputSchema = WorkerOutputSchema; // Generic is usually fine for query
export const TransformOutputSchema = WorkerOutputSchema; // Generic is usually fine

// Strict Schema for List Normalization
export const ListNormalizationSchema = WorkerOutputSchema.extend({
    response: z.string().optional(), // Allow empty response for auto-recovery
    action: z.enum(['create_list', 'create_collection', 'create_checklist', 'add_to_context', 'ask_confirmation']),
    list_name: z.string().optional(), // Required if action is create_list
    data: z.union([
        z.array(z.string()),
        z.array(z.object({ content: z.string(), status: z.string().optional() }))
    ]) // The items
});
