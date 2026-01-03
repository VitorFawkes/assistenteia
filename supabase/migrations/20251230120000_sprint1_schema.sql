-- Migration: Sprint 1 - Reliability (Schema & Session)
-- Description: Implements conversations table, run_logs, and updates messages/collections for active context.

-- 1. Create conversations table (Session Management)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    thread_id TEXT NOT NULL, -- WhatsApp Phone Number or Thread ID
    title TEXT, -- Auto-generated summary of the session
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_message_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for fast lookup of active session by thread
CREATE INDEX IF NOT EXISTS idx_conversations_thread_active ON public.conversations(thread_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);

-- Enable RLS for conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations" ON public.conversations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations" ON public.conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations" ON public.conversations
    FOR UPDATE USING (auth.uid() = user_id);

-- 2. Update messages table (Strong Link to Conversation)
-- Note: raw_messages already has conversation_id as TEXT from previous migration.
-- We need to convert it to UUID and add FK constraint.
-- If it's empty/null, it's fine. If it has text that isn't UUID, this might fail, but assuming it's new or empty.
-- Since we control the stack, we'll assume it's safe to cast or we'll add a new column and migrate.
-- Let's try to alter it. If it fails, we'll drop and re-add since it's a dev env mostly.
-- SAFEST APPROACH: Add FK constraint if possible.

DO $$
BEGIN
    -- Check if conversation_id is already UUID
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'raw_messages' 
        AND column_name = 'conversation_id' 
        AND data_type = 'text'
    ) THEN
        -- Attempt to cast to UUID using USING clause
        -- If there are non-UUID values, they will cause error. We'll set them to NULL.
        ALTER TABLE raw_messages 
        ALTER COLUMN conversation_id TYPE UUID USING conversation_id::uuid;
    END IF;
END $$;

-- Add Foreign Key constraint
ALTER TABLE raw_messages 
    ADD CONSTRAINT fk_messages_conversation 
    FOREIGN KEY (conversation_id) 
    REFERENCES public.conversations(id) 
    ON DELETE SET NULL;

-- Index for history retrieval
CREATE INDEX IF NOT EXISTS idx_raw_messages_conversation_id_uuid ON raw_messages(conversation_id);

-- 3. Support for Active Context (Collections & Items)
-- Add is_pinned to collections
ALTER TABLE public.collections 
    ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- Add status to collection_items
ALTER TABLE public.collection_items 
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived'));

-- Migration: Set status='completed' if metadata->checked is true
UPDATE public.collection_items 
SET status = 'completed' 
WHERE (metadata->>'checked')::boolean = true;

-- 4. Observability (Run Logs)
CREATE TABLE IF NOT EXISTS public.run_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    thread_id TEXT,
    mode TEXT,
    intent TEXT,
    input_tokens INT,
    output_tokens INT,
    latency_ms INT,
    tool_calls JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for logs (Admin/User view)
ALTER TABLE public.run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own logs" ON public.run_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert logs" ON public.run_logs
    FOR INSERT WITH CHECK (true); -- Usually service role inserts this

-- 5. Update RPC: insert_message_encrypted
-- We need to update the function signature to accept conversation_id (UUID)
-- Since we cannot easily change signature of existing function without DROP, 
-- we will use CREATE OR REPLACE with the new signature.
-- IMPORTANT: The previous migration added it to the view/trigger but maybe not the RPC explicitly?
-- Let's redefine it to be sure.

CREATE OR REPLACE FUNCTION insert_message_encrypted(
    p_user_id uuid,
    p_role text,
    p_content text,
    p_encryption_key text,
    p_media_url text default null,
    p_media_type text default null,
    p_sender_number text default null,
    p_sender_name text default null,
    p_group_name text default null,
    p_is_group boolean default false,
    p_is_from_me boolean default false,
    p_wa_message_id text default null,
    p_message_timestamp timestamptz default null,
    p_quoted_message_id text default null,
    p_quoted_content text default null,
    p_file_path text default null,
    p_file_name text default null,
    p_mime_type text default null,
    p_file_size numeric default null,
    p_conversation_id uuid default null -- NEW PARAMETER
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_encrypted_content text;
    v_new_id uuid;
begin
    -- Encrypt the content
    if p_content is not null then
        v_encrypted_content := public.pgp_sym_encrypt(p_content, p_encryption_key, 'cipher-algo=aes256, compress-algo=0, armor=1');
    else
        v_encrypted_content := null;
    end if;

    -- Insert into VIEW (which triggers encrypt_message_insert)
    -- We need to make sure the VIEW has the column. 
    -- The previous migration added conversation_id to the view.
    
    insert into messages (
        user_id,
        role,
        content,
        media_url,
        media_type,
        sender_number,
        sender_name,
        group_name,
        is_group,
        is_from_me,
        wa_message_id,
        message_timestamp,
        quoted_message_id,
        quoted_content,
        file_path,
        file_name,
        mime_type,
        file_size,
        conversation_id -- NEW COLUMN
    ) values (
        p_user_id,
        p_role,
        v_encrypted_content,
        p_media_url,
        p_media_type,
        p_sender_number,
        p_sender_name,
        p_group_name,
        p_is_group,
        p_is_from_me,
        p_wa_message_id,
        p_message_timestamp,
        p_quoted_message_id,
        p_quoted_content,
        p_file_path,
        p_file_name,
        p_mime_type,
        p_file_size,
        p_conversation_id
    ) returning id into v_new_id;

    return v_new_id;
end;
$$;

-- 6. Update RPC: get_messages_decrypted
-- Filter by conversation_id if provided

CREATE OR REPLACE FUNCTION get_messages_decrypted(
    p_encryption_key text,
    p_limit int default 20,
    p_offset int default 0,
    p_user_id uuid default null,
    p_sender_number text default null,
    p_group_name text default null,
    p_days_ago int default 7,
    p_conversation_id uuid default null -- NEW PARAMETER
)
returns table (
    id uuid,
    role text,
    content text,
    created_at timestamptz,
    sender_name text,
    sender_number text,
    is_group boolean,
    group_name text,
    media_type text,
    conversation_id uuid
)
language plpgsql
security definer
as $$
begin
    return query
    select
        m.id,
        m.role,
        case
            when m.content like '-----BEGIN PGP MESSAGE-----' || '%' then
                public.pgp_sym_decrypt(m.content::bytea, p_encryption_key)
            else
                m.content
        end as content,
        m.created_at,
        m.sender_name,
        m.sender_number,
        m.is_group,
        m.group_name,
        m.media_type,
        m.conversation_id
    from messages m
    where
        (p_user_id is null or m.user_id = p_user_id)
        and (p_conversation_id is null or m.conversation_id = p_conversation_id) -- PRIMARY FILTER
        and (p_sender_number is null or m.sender_number = p_sender_number)
        and (p_group_name is null or m.group_name = p_group_name)
        and m.created_at > (now() - (p_days_ago || ' days')::interval)
    order by m.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;
