import { z } from 'zod';

// Mock Schema (Simplified)
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
    response: z.string().optional(), // The change we made
    action: z.enum(['create_list', 'create_collection', 'create_checklist', 'add_to_context', 'ask_confirmation']),
    list_name: z.string().optional(),
    data: z.union([
        z.array(z.string()),
        z.array(z.object({ content: z.string(), status: z.string().optional() }))
    ])
});

// The Logic to Test
function processResponse(workerResponse, routerOutput) {
    let parsedOutput = null;
    console.log(`\n--- Testing Input: ${workerResponse.content} ---`);

    try {
        const rawContent = workerResponse.content || '{}';
        const jsonContent = JSON.parse(rawContent);

        // DYNAMIC SCHEMA SELECTION
        if (routerOutput.mode === 'TRANSFORM' && routerOutput.intent === 'list_normalization') {
            parsedOutput = ListNormalizationSchema.parse(jsonContent);
            console.log('✅ Schema Validation Passed');
        } else {
            parsedOutput = WorkerOutputSchema.parse(jsonContent);
        }
    } catch (e) {
        console.warn('⚠️ Invalid JSON from Worker. Attempting Elite Recovery...', e.message);

        // ELITE RECOVERY LOGIC
        try {
            const rawContent = workerResponse.content || '{}';
            const jsonContent = JSON.parse(rawContent);

            if (routerOutput.mode === 'TRANSFORM' && routerOutput.intent === 'list_normalization') {
                if (jsonContent.action && jsonContent.data) {
                    console.log('✅ Elite Recovery: Found valid action/data despite validation error.');
                    parsedOutput = {
                        ...jsonContent,
                        response: jsonContent.response || 'Ação realizada com sucesso.'
                    };
                } else {
                    throw new Error('Missing critical fields (action/data) for TRANSFORM');
                }
            } else {
                if (jsonContent.response) {
                    parsedOutput = { response: jsonContent.response };
                } else {
                    parsedOutput = { response: workerResponse.content || 'Ação realizada com sucesso.' };
                }
            }
        } catch (parseError) {
            console.error('❌ Elite Recovery Failed:', parseError.message);
            parsedOutput = { response: workerResponse.content || 'Erro ao processar resposta.' };
        }
    }

    return parsedOutput;
}

// Test Cases
const routerOutput = { mode: 'TRANSFORM', intent: 'list_normalization' };

// Case 1: Perfect Input
const input1 = { content: JSON.stringify({ action: 'create_checklist', list_name: 'Test', data: ['item1'], response: 'Lista criada.' }) };
console.log('Result 1:', processResponse(input1, routerOutput));

// Case 2: Missing Response (The "Action completed" cause)
const input2 = { content: JSON.stringify({ action: 'create_checklist', list_name: 'Test', data: ['item2'] }) };
console.log('Result 2:', processResponse(input2, routerOutput));

// Case 3: English Response (Should be preserved if valid JSON, but prompt should prevent)
const input3 = { content: JSON.stringify({ action: 'create_checklist', list_name: 'Test', data: ['item3'], response: 'Action completed.' }) };
console.log('Result 3:', processResponse(input3, routerOutput));

// Case 4: Malformed JSON (Unrecoverable)
const input4 = { content: '{ action: "broken" ' }; // Invalid JSON
console.log('Result 4:', processResponse(input4, routerOutput));

// Case 5: Missing Data (Unrecoverable for TRANSFORM)
const input5 = { content: JSON.stringify({ action: 'create_checklist' }) }; // Missing data
console.log('Result 5:', processResponse(input5, routerOutput));
