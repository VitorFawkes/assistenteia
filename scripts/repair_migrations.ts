import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const MIGRATIONS_TO_REPAIR = [
    '20251217212020',
    '20251221172816',
    '20251221203752',
    '20251229171113',
    '20251229171122',
    '20251229171128',
    '20251229171159',
    '20251229171207',
    '20251229171213',
    '20251229171214',
    '20251229171239',
    '20251229171303',
    '20251229171308',
    '20251229171315',
    '20251229171343',
    '20251229171348',
    '20251229171441',
    '20251229171442',
    '20251229171519',
    '20251229220901',
    '20251229223434'
];

async function repairAll() {
    console.log(`🔧 Repairing ${MIGRATIONS_TO_REPAIR.length} migrations...`);

    for (const version of MIGRATIONS_TO_REPAIR) {
        try {
            // Create dummy file
            const dummyFile = `supabase/migrations/${version}_dummy.sql`;
            await execAsync(`touch ${dummyFile}`);

            console.log(`Processing ${version}...`);
            const { stdout, stderr } = await execAsync(`npx supabase migration repair ${version} --status applied`);
            console.log(stdout);
            if (stderr) console.error(stderr);

            // Remove dummy file
            await execAsync(`rm ${dummyFile}`);

            // Wait to avoid circuit breaker
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error: any) {
            console.error(`❌ Failed to repair ${version}:`, error.message);
        }
    }
    console.log('✅ All repairs completed.');
}

repairAll();
