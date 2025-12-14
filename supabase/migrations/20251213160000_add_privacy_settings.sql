-- Add privacy settings columns to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS privacy_read_scope TEXT DEFAULT 'all' CHECK (privacy_read_scope IN ('all', 'private_only', 'groups_only')),
ADD COLUMN IF NOT EXISTS privacy_allow_outgoing BOOLEAN DEFAULT true;

-- Comment on columns
COMMENT ON COLUMN public.user_settings.privacy_read_scope IS 'Determines which messages the AI processes: all, private_only, or groups_only';
COMMENT ON COLUMN public.user_settings.privacy_allow_outgoing IS 'Determines if the AI is allowed to send messages to others via command';
