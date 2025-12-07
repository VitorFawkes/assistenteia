-- Add preferred_name to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS preferred_name TEXT;

COMMENT ON COLUMN public.user_settings.preferred_name IS 'The name the user wants the AI to use when addressing them.';
