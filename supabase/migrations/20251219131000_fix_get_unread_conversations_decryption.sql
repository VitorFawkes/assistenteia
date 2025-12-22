-- Fix get_unread_conversations decryption logic and ensure correct unread count
CREATE OR REPLACE FUNCTION get_unread_conversations(
    p_user_id UUID,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0,
    p_encryption_key TEXT DEFAULT NULL
)
RETURNS TABLE (
    sender_number TEXT,
    sender_name TEXT,
    group_name TEXT,
    is_group BOOLEAN,
    last_message_content TEXT,
    last_message_at TIMESTAMPTZ,
    unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH unread_counts AS (
        SELECT
            CASE WHEN m.is_group THEN m.group_name ELSE m.sender_number END as conversation_id,
            COUNT(*) as count
        FROM messages m
        WHERE m.user_id = p_user_id
          AND m.is_from_me = false
          AND (m.status IS NULL OR m.status != 'read') -- Count only unread
        GROUP BY 1
    ),
    ranked_messages AS (
        SELECT
            m.sender_number,
            m.sender_name,
            m.group_name,
            m.is_group,
            -- Updated Decryption Logic to match get_messages_decrypted
            CASE
                WHEN p_encryption_key IS NOT NULL AND m.content LIKE '-----BEGIN PGP MESSAGE-----' || '%' THEN
                    pgp_sym_decrypt(m.content::bytea, p_encryption_key)
                WHEN p_encryption_key IS NOT NULL AND m.content LIKE 'ENC:%' THEN
                    pgp_sym_decrypt(decode(substring(m.content from 5), 'base64'), p_encryption_key)
                ELSE
                    m.content
            END as content,
            m.created_at,
            ROW_NUMBER() OVER (
                PARTITION BY (CASE WHEN m.is_group THEN m.group_name ELSE m.sender_number END)
                ORDER BY m.created_at DESC
            ) as rn
        FROM messages m
        WHERE m.user_id = p_user_id
    )
    SELECT
        rm.sender_number,
        rm.sender_name,
        rm.group_name,
        rm.is_group,
        rm.content as last_message_content,
        rm.created_at as last_message_at,
        uc.count as unread_count
    FROM ranked_messages rm
    JOIN unread_counts uc ON (CASE WHEN rm.is_group THEN rm.group_name ELSE rm.sender_number END) = uc.conversation_id
    WHERE rm.rn = 1
    ORDER BY rm.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;
