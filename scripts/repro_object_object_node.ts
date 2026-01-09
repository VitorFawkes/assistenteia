
// Mocking the logic to verify the fix without Deno

console.log('🧪 Testing Serialization Fix (Node.js Version)...');

// --- MOCK DATA ---
const bugData = [
    { content: 'Milk', status: 'todo' },
    { content: 'Eggs', status: 'todo' },
    'Bread' // Mixed types just in case
];

// --- LOGIC FROM process-message/index.ts (Fixed Version) ---
function createChecklistDescription(data: any[]) {
    return (data || []).map((item: any) => {
        // FIX APPLIED HERE:
        const content = typeof item === 'object' && item !== null && 'content' in item ? item.content : String(item);
        return `[ ] ${content}`;
    }).join('\n');
}

// --- LOGIC FROM tool_executor.ts (Fixed Version) ---
function prepareCollectionItems(items: any[]) {
    return (items || []).map((item: any) => {
        // FIX APPLIED HERE:
        const content = typeof item === 'object' && item !== null && 'content' in item ? item.content : String(item);
        return {
            content,
            status: 'todo',
            type: 'text'
        };
    });
}

// --- TEST EXECUTION ---

// Test 1: Checklist Description
console.log('\n--- Test 1: Create Checklist Description ---');
const description = createChecklistDescription(bugData);
console.log('Generated Description:\n', description);

if (description.includes('[object Object]')) {
    console.error('❌ FAIL: Description contains [object Object]');
    process.exit(1);
} else if (description.includes('Milk') && description.includes('Eggs') && description.includes('Bread')) {
    console.log('✅ PASS: Description is clean and contains all items');
} else {
    console.error('❌ FAIL: Description missing items');
    process.exit(1);
}

// Test 2: Collection Items
console.log('\n--- Test 2: Prepare Collection Items ---');
const collectionItems = prepareCollectionItems(bugData);
console.log('Generated Items:\n', JSON.stringify(collectionItems, null, 2));

const invalidItem = collectionItems.find(i => i.content === '[object Object]' || typeof i.content !== 'string');
if (invalidItem) {
    console.error('❌ FAIL: Found invalid item content:', invalidItem);
    process.exit(1);
} else {
    console.log('✅ PASS: All collection items have string content');
}

console.log('\n🎉 ALL TESTS PASSED');
