-- Drop all overloads of the function to clear the ambiguity
DROP FUNCTION IF EXISTS public.insert_message_encrypted(uuid, text, text, text, text, text, text, text, text, boolean, boolean, text, timestamptz, text, text, text, text, text, integer, text);
DROP FUNCTION IF EXISTS public.insert_message_encrypted(uuid, text, text, text, text, text, text, text, text, boolean, boolean, text, timestamptz, text, text, text, text, text, integer, text, text);

-- Recreate the function with the superset of arguments (including p_status with default)
CREATE OR REPLACE FUNCTION public.insert_message_encrypted(
    p_user_id uuid,
    p_role text,
    p_content text,
    p_encryption_key text,
    p_media_url text DEFAULT NULL,
    p_media_type text DEFAULT NULL,
    p_sender_number text DEFAULT NULL,
    p_sender_name text DEFAULT NULL,
    p_group_name text DEFAULT NULL,
    p_is_group boolean DEFAULT false,
    p_is_from_me boolean DEFAULT false,
    p_wa_message_id text DEFAULT NULL,
    p_message_timestamp timestamptz DEFAULT now(),
    p_quoted_message_id text DEFAULT NULL,
    p_quoted_content text DEFAULT NULL,
    p_file_path text DEFAULT NULL,
    p_file_name text DEFAULT NULL,
    p_mime_type text DEFAULT NULL,
    p_file_size integer DEFAULT 0,
    p_conversation_id text DEFAULT NULL,
    p_status text DEFAULT 'received' -- Added with default to handle both calls
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_message_id uuid;
    v_encrypted_content text;
BEGIN
    -- Encrypt content if key is provided
    IF p_encryption_key IS NOT NULL AND p_content IS NOT NULL THEN
        v_encrypted_content := pgp_sym_encrypt(p_content, p_encryption_key);
    ELSE
        v_encrypted_content := p_content;
    END IF;

    -- Insert into messages
    INSERT INTO public.messages (
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
        conversation_id,
        status
    ) VALUES (
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
        p_conversation_id,
        p_status
    )
    RETURNING id INTO v_message_id;

    RETURN v_message_id;
END;
$$;
