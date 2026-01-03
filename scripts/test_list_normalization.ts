
import { HeuristicRouter } from '../supabase/functions/process-message/routing/heuristic_router.ts';
import { WorkerFactory } from '../supabase/functions/process-message/workers/worker_factory.ts';

// Mock context with "Viagem Curitiba"
const MOCK_CONTEXT = {
    active_list: null,
    pinned_collections: [
        { id: '123', name: 'Viagem Curitiba', items: [] }
    ],
    recent_collections: []
};

// Mock OpenAI Key (won't be used if we mock fetch, but needed for signature)
const MOCK_KEY = "sk-mock";

async function runTests() {
    console.log("🧪 Starting List Normalization Tests...\n");

    // TEST 1: Router Heuristic
    console.log("🔹 Test 1: Router Heuristic");
    const input1 = "Faz uma lista de coisas pra levar:\nRemédios\nNotebook";
    const route1 = HeuristicRouter.route(input1, MOCK_CONTEXT);

    if (route1?.mode === 'TRANSFORM' && route1?.intent === 'list_normalization') {
        console.log("✅ Router Correctly identified TRANSFORM/list_normalization");
    } else {
        console.error("❌ Router Failed:", route1);
    }

    // TEST 2: Worker Prompt Generation (Mocking Fetch to inspect prompt)
    console.log("\n🔹 Test 2: Worker Prompt Context Isolation");

    // We need to spy on fetch or just inspect the logic. 
    // Since we can't easily spy on global fetch in this environment without a test runner,
    // we will instantiate the WorkerFactory and rely on the fact that we modified it.
    // However, to truly verify the PROMPT, we'd need to intercept the fetch call.

    // Let's monkey-patch fetch to capture the body
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;

    globalThis.fetch = async (url, options) => {
        if (url.toString().includes('openai')) {
            capturedBody = JSON.parse(options?.body as string);
            return {
                ok: true,
                json: async () => ({
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                response: "Lista de coisas:\n- Remédios\n- Notebook",
                                data: ["Remédios", "Notebook"]
                            })
                        }
                    }]
                })
            } as any;
        }
        return originalFetch(url, options);
    };

    try {
        await WorkerFactory.run(
            { mode: 'TRANSFORM', intent: 'list_normalization', confidence: 1.0 },
            input1,
            MOCK_CONTEXT,
            [],
            MOCK_KEY,
            []
        );

        const systemPrompt = capturedBody.messages.find((m: any) => m.role === 'system').content;

        console.log("System Prompt Snapshot:\n", systemPrompt);

        if (systemPrompt.includes("You are a LIST NORMALIZER")) {
            console.log("✅ Prompt uses LIST NORMALIZER persona");
        } else {
            console.error("❌ Prompt missing persona");
        }

        if (systemPrompt.includes("Context: " + JSON.stringify(MOCK_CONTEXT))) {
            console.log("✅ Context injected for conflict detection");
        } else {
            console.error("❌ Context missing");
        }

        if (systemPrompt.includes("Do NOT infer a destination/title from Context")) {
            console.log("✅ Strict Context Isolation Rule Present");
        } else {
            console.error("❌ Isolation Rule Missing");
        }

    } catch (e) {
        console.error("Test Failed with Error:", e);
    } finally {
        globalThis.fetch = originalFetch;
    }
}

runTests();
