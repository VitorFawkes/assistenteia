-- Add preferred_name and phone to user_settings if they don't exist
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS preferred_name text,
ADD COLUMN IF NOT EXISTS phone text;

-- Update the handle_new_user function to initialize these if needed (optional, but good practice)
-- For now, just ensuring columns exist is enough.
