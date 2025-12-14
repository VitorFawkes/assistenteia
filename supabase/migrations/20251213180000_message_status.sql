-- Add status column to messages table
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';

-- Create index for status
CREATE INDEX IF NOT EXISTS idx_messages_status ON public.messages(status);
