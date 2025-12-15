-- Add group_name column to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS group_name TEXT;

-- Create index for faster search
CREATE INDEX IF NOT EXISTS idx_messages_group_name ON public.messages(group_name);
