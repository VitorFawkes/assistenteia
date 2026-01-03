import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Try loading .env and .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('Loaded envs:', Object.keys(process.env).filter(k => k.startsWith('SUPABASE')));
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifyRemoteState() {
    console.log('🔍 Verifying Remote DB State...');

    const tablesToCheck = ['conversations', 'user_state', 'run_logs'];
    const results: any = {};

    for (const table of tablesToCheck) {
        const { error } = await supabase.from(table).select('id').limit(1);
        // 42P01 is "undefined_table" in Postgres, but Supabase JS might wrap it.
        // Usually error message contains "relation ... does not exist"
        if (error) {
            if (error.message.includes('does not exist') || error.code === '42P01') {
                results[table] = 'MISSING';
            } else {
                results[table] = `ERROR: ${error.message}`;
            }
        } else {
            results[table] = 'EXISTS';
        }
    }

    console.log('📊 Table Status:', results);

    if (results['run_logs'] === 'EXISTS') {
        const { error } = await supabase.from('run_logs').select('confidence, router_source, active_context_size').limit(1);
        if (error) {
            console.log('⚠️ run_logs columns missing:', error.message);
        } else {
            console.log('✅ run_logs columns exist.');
        }
    }
}

verifyRemoteState();
