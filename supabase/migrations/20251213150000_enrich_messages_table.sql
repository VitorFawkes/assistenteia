-- Add metadata columns to messages table for rich history
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS sender_number TEXT,
ADD COLUMN IF NOT EXISTS sender_name TEXT,
ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_from_me BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS wa_message_id TEXT, -- WhatsApp Message ID
ADD COLUMN IF NOT EXISTS quoted_message_id TEXT, -- For threading
ADD COLUMN IF NOT EXISTS message_timestamp TIMESTAMPTZ;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_messages_sender_number ON public.messages(sender_number);
CREATE INDEX IF NOT EXISTS idx_messages_is_group ON public.messages(is_group);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON public.messages(message_timestamp);
