import { HeuristicRouter } from '../supabase/functions/process-message/routing/heuristic_router.ts';

function testHeuristics() {
    console.log('🧪 Testing Heuristic Router...');

    const context = { active_list: { id: '123' } };

    // 1. Query Agenda
    const r1 = HeuristicRouter.route('O que tenho hoje?', context);
    console.log(`"O que tenho hoje?" -> ${r1?.mode} (${r1?.intent})`);
    if (r1?.mode !== 'QUERY') console.error('❌ Failed: Expected QUERY');

    // 2. Add Item
    const r2 = HeuristicRouter.route('Comprar leite', context);
    console.log(`"Comprar leite" -> ${r2?.mode} (${r2?.intent})`);
    if (r2?.mode !== 'CAPTURE') console.error('❌ Failed: Expected CAPTURE');

    // 3. Chat (Should return null for LLM fallback)
    const r3 = HeuristicRouter.route('Oi, tudo bem?', context);
    console.log(`"Oi, tudo bem?" -> ${r3 === null ? 'NULL (LLM Fallback)' : r3.mode}`);
    if (r3 !== null) console.error('❌ Failed: Expected NULL');
}

testHeuristics();
