import { WorkerFactory } from '../supabase/functions/process-message/workers/worker_factory.ts';
import { Renderer } from '../supabase/functions/process-message/render/renderer.ts';

async function testTransformContract() {
    console.log('🧪 Testing Transform Contract...');

    const mockRouterOutput = {
        mode: 'TRANSFORM',
        intent: 'format_data',
        confidence: 1.0,
        entities: {}
    };

    // Mock Worker Response (Simulating LLM output)
    const mockWorkerResponse = {
        content: JSON.stringify({
            response: "Here is the data",
            data: { name: "Item A", quantity: 10, value: 50 },
            constraints: { data_only: true }
        })
    };

    // Test Renderer
    const rendered = Renderer.render(JSON.parse(mockWorkerResponse.content));
    console.log(`Input: ${mockWorkerResponse.content}`);
    console.log(`Rendered: ${rendered}`);

    if (rendered.includes("Here is the data")) {
        console.error('❌ Failed: Renderer did not strip filler text.');
    } else if (rendered.includes('"name": "Item A"')) {
        console.log('✅ Success: Renderer produced data-only JSON.');
    } else {
        console.error('❌ Failed: Unexpected output.');
    }
}

testTransformContract();
