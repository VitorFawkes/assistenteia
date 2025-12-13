-- Add phone_number and bot_mode to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS phone_number TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS bot_mode TEXT DEFAULT 'always_reply' CHECK (bot_mode IN ('always_reply', 'mention_only'));

-- Create index for faster lookup by phone number
CREATE INDEX IF NOT EXISTS idx_user_settings_phone_number ON public.user_settings(phone_number);
