-- Add type and settings to whatsapp_instances
-- type: 'assistant' (Legacy/Bot) or 'user_personal' (User's own number)
ALTER TABLE public.whatsapp_instances
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'assistant' CHECK (type IN ('assistant', 'user_personal')),
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Update existing instances to be 'assistant' to preserve legacy behavior
UPDATE public.whatsapp_instances SET type = 'assistant' WHERE type IS NULL;
