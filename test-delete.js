// Test script to debug collection delete
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDelete() {
    console.log('🔍 Testing collection delete...');

    // Get all collections
    const { data: collections, error: listError } = await supabase
        .from('collections')
        .select('*');

    if (listError) {
        console.error('❌ Error listing collections:', listError);
        return;
    }

    console.log('📋 Found collections:', collections?.map(c => ({ id: c.id, name: c.name })));

    if (!collections || collections.length === 0) {
        console.log('⚠️  No collections to test delete');
        return;
    }

    const testCollection = collections[0];
    console.log(`\n🎯 Testing delete for: ${testCollection.name} (${testCollection.id})`);

    // Try to delete items first
    console.log('1️⃣ Deleting collection items...');
    const { error: itemsError } = await supabase
        .from('collection_items')
        .delete()
        .eq('collection_id', testCollection.id);

    if (itemsError) {
        console.error('❌ Error deleting items:', itemsError);
    } else {
        console.log('✅ Items deleted successfully');
    }

    // Try to delete collection
    console.log('2️⃣ Deleting collection...');
    const { error: collectionError } = await supabase
        .from('collections')
        .delete()
        .eq('id', testCollection.id);

    if (collectionError) {
        console.error('❌ Error deleting collection:', collectionError);
    } else {
        console.log('✅ Collection deleted successfully!');
    }
}

testDelete().then(() => process.exit(0));
