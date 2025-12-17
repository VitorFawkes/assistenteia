-- Add pairing_code column to whatsapp_instances table
ALTER TABLE public.whatsapp_instances
ADD COLUMN IF NOT EXISTS pairing_code TEXT;
