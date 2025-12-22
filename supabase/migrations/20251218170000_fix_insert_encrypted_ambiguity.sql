-- Drop both versions to clear ambiguity
DROP FUNCTION IF EXISTS insert_message_encrypted(uuid, text, text, text, text, text, text, text, text, boolean, boolean, text, timestamptz, text, text, text, text, text, integer);
DROP FUNCTION IF EXISTS insert_message_encrypted(uuid, text, text, text, text, text, text, text, text, boolean, boolean, text, timestamptz, text, text, text, text, text, numeric);

-- Re-create the correct version (using INT for file_size)
CREATE OR REPLACE FUNCTION insert_message_encrypted(
    p_user_id UUID,
    p_role TEXT,
    p_content TEXT,
    p_encryption_key TEXT,
    p_media_url TEXT DEFAULT NULL,
    p_media_type TEXT DEFAULT NULL,
    p_sender_number TEXT DEFAULT NULL,
    p_sender_name TEXT DEFAULT NULL,
    p_group_name TEXT DEFAULT NULL,
    p_is_group BOOLEAN DEFAULT FALSE,
    p_is_from_me BOOLEAN DEFAULT FALSE,
    p_wa_message_id TEXT DEFAULT NULL,
    p_message_timestamp TIMESTAMPTZ DEFAULT NOW(),
    p_quoted_message_id TEXT DEFAULT NULL,
    p_quoted_content TEXT DEFAULT NULL,
    p_file_path TEXT DEFAULT NULL,
    p_file_name TEXT DEFAULT NULL,
    p_mime_type TEXT DEFAULT NULL,
    p_file_size INT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_encrypted_content TEXT;
    v_new_id UUID;
BEGIN
    -- Encrypt content using PGP Symmetric Encryption + Base64 + ENC: Prefix
    IF p_content IS NOT NULL THEN
        v_encrypted_content := 'ENC:' || encode(pgp_sym_encrypt(p_content, p_encryption_key, 'cipher-algo=aes256, compress-algo=0'), 'base64');
    ELSE
        v_encrypted_content := NULL;
    END IF;

    INSERT INTO messages (
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
        file_size
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
        p_file_size
    ) RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;
