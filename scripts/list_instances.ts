import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listInstances() {
    const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*');

    if (error) {
        console.error('Error fetching instances:', error);
        return;
    }

    console.log('WhatsApp Instances:');
    data.forEach(instance => {
        console.log(`- ID: ${instance.id}, Name: ${instance.instance_name}, Type: ${instance.type}, Status: ${instance.status}, User: ${instance.user_id}`);
    });
}

listInstances();
