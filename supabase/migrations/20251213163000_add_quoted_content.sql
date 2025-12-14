-- Add quoted_content to messages table for better context
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS quoted_content TEXT;

-- Create index for full text search on quoted content (optional but good for future)
-- CREATE INDEX IF NOT EXISTS idx_messages_quoted_content ON public.messages USING gin(to_tsvector('english', quoted_content));
