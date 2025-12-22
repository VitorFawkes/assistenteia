CREATE OR REPLACE FUNCTION get_messages_decrypted(
    p_user_id UUID,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0,
    p_encryption_key TEXT DEFAULT NULL,
    p_sender_number TEXT DEFAULT NULL,
    p_group_name TEXT DEFAULT NULL,
    p_days_ago INT DEFAULT 7,
    p_sender_name TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    role TEXT,
    content TEXT,
    created_at TIMESTAMPTZ,
    sender_name TEXT,
    sender_number TEXT,
    is_group BOOLEAN,
    group_name TEXT,
    media_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.role,
        CASE
            WHEN p_encryption_key IS NOT NULL AND m.content LIKE 'ENC:%' THEN
                pgp_sym_decrypt(decode(substring(m.content from 5), 'base64'), p_encryption_key)
            WHEN p_encryption_key IS NOT NULL AND m.content LIKE '%-----BEGIN PGP MESSAGE-----%' THEN
                pgp_sym_decrypt(m.content::bytea, p_encryption_key)
            ELSE
                m.content
        END as content,
        m.created_at,
        m.sender_name,
        m.sender_number,
        m.is_group,
        m.group_name,
        m.media_type
    FROM messages m
    WHERE
        (p_user_id IS NULL OR m.user_id = p_user_id)
        AND (p_sender_number IS NULL OR m.sender_number = p_sender_number)
        AND (p_group_name IS NULL OR m.group_name = p_group_name)
        AND (p_sender_name IS NULL OR m.sender_name ILIKE '%' || p_sender_name || '%')
        AND m.created_at > (now() - (p_days_ago || ' days')::interval)
    ORDER BY m.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;
