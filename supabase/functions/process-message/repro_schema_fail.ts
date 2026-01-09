
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Original Schema (from schemas.ts)
const WorkerOutputSchema = z.object({
    response: z.string(),
    data: z.any().optional(),
    constraints: z.object({
        data_only: z.boolean().optional(),
        strict_output: z.boolean().optional()
    }).optional(),
    tool_calls: z.array(z.any()).optional()
});

const ListNormalizationSchema = WorkerOutputSchema.extend({
    action: z.enum(['create_list', 'create_collection', 'create_checklist', 'add_to_context', 'ask_confirmation']),
    list_name: z.string().optional(),
    data: z.array(z.string()) // The problematic line
});

// The payload that caused the issue (from user report)
const problematicPayload = {
    "response": "Criei uma nova lista de tarefas com os itens informados.",
    "action": "create_checklist",
    "list_name": "Tarefas",
    "data": [
        {
            "content": "Fazer conta de gastos",
            "status": "todo"
        },
        {
            "content": "Enviar mensagem menino Carteira",
            "status": "todo"
        }
    ]
};

console.log("--- Testing Original Schema ---");
try {
    ListNormalizationSchema.parse(problematicPayload);
    console.log("✅ Validation PASSED (Unexpected)");
} catch (e) {
    console.log("❌ Validation FAILED (Expected)");
    console.log(e.issues);
}

// Proposed Fix
const ListNormalizationSchemaFixed = WorkerOutputSchema.extend({
    action: z.enum(['create_list', 'create_collection', 'create_checklist', 'add_to_context', 'ask_confirmation']),
    list_name: z.string().optional(),
    data: z.union([
        z.array(z.string()),
        z.array(z.object({ content: z.string(), status: z.string().optional() }))
    ])
});

console.log("\n--- Testing Fixed Schema ---");
try {
    ListNormalizationSchemaFixed.parse(problematicPayload);
    console.log("✅ Validation PASSED (Expected)");
} catch (e) {
    console.log("❌ Validation FAILED (Unexpected)");
    console.log(e);
}
