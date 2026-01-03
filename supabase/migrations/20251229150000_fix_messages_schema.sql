-- 1. Add column to raw_messages
ALTER TABLE raw_messages ADD COLUMN IF NOT EXISTS conversation_id TEXT;
CREATE INDEX IF NOT EXISTS idx_raw_messages_conversation_id ON raw_messages(conversation_id);

-- 2. Update the view to expose the new column
-- We reconstruct the view based on existing definition + new column
CREATE OR REPLACE VIEW messages AS
SELECT
    id,
    user_id,
    role,
    pgp_sym_decrypt(content::bytea, 'vitor-assistente-ia-secret-key-2025'::text) AS content,
    media_url,
    media_type,
    created_at,
    sender_number,
    sender_name,
    is_group,
    is_from_me,
    wa_message_id,
    quoted_message_id,
    message_timestamp,
    quoted_content,
    file_path,
    file_name,
    mime_type,
    file_size,
    is_edited,
    original_content,
    status,
    group_name,
    conversation_id
FROM raw_messages;

-- 3. Update the trigger function to handle the new column
CREATE OR REPLACE FUNCTION public.encrypt_message_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    returned_id uuid;
    returned_created_at timestamptz;
BEGIN
    INSERT INTO raw_messages (
        id, user_id, role, content, media_url, media_type, created_at,
        sender_number, sender_name, is_group, is_from_me, wa_message_id,
        quoted_message_id, message_timestamp, quoted_content, file_path,
        file_name, mime_type, file_size, is_edited, original_content, status, group_name,
        conversation_id
    ) VALUES (
        COALESCE(NEW.id, gen_random_uuid()),
        NEW.user_id,
        NEW.role,
        pgp_sym_encrypt(NEW.content, 'vitor-assistente-ia-secret-key-2025'),
        NEW.media_url,
        NEW.media_type,
        COALESCE(NEW.created_at, now()),
        NEW.sender_number,
        NEW.sender_name,
        NEW.is_group,
        NEW.is_from_me,
        NEW.wa_message_id,
        NEW.quoted_message_id,
        NEW.message_timestamp,
        NEW.quoted_content,
        NEW.file_path,
        NEW.file_name,
        NEW.mime_type,
        NEW.file_size,
        NEW.is_edited,
        NEW.original_content,
        NEW.status,
        NEW.group_name,
        NEW.conversation_id
    ) RETURNING id, created_at INTO returned_id, returned_created_at;

    -- Update NEW with generated values
    NEW.id := returned_id;
    NEW.created_at := returned_created_at;

    RETURN NEW;
END;
$function$;
