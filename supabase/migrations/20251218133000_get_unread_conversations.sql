-- Function to get unread conversations (conversations where the last message is NOT from the user)
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
    WITH ranked_messages AS (
        SELECT
            m.sender_number,
            m.sender_name,
            m.group_name,
            m.is_group,
            -- Decryption Logic
            CASE
                WHEN p_encryption_key IS NOT NULL AND m.content LIKE '-----BEGIN PGP MESSAGE-----' || '%' THEN
                    public.pgp_sym_decrypt(m.content::bytea, p_encryption_key)
                ELSE
                    m.content
            END as content,
            m.created_at,
            m.is_from_me,
            ROW_NUMBER() OVER (
                PARTITION BY (CASE WHEN m.is_group THEN m.group_name ELSE m.sender_number END)
                ORDER BY m.created_at DESC
            ) as rn
        FROM messages m
        WHERE m.user_id = p_user_id
    ),
    latest_messages AS (
        SELECT * FROM ranked_messages WHERE rn = 1
    )
    SELECT
        lm.sender_number,
        lm.sender_name,
        lm.group_name,
        lm.is_group,
        lm.content as last_message_content,
        lm.created_at as last_message_at,
        1::BIGINT as unread_count -- Placeholder, ideally we count consecutive unread
    FROM latest_messages lm
    WHERE lm.is_from_me = false
    ORDER BY lm.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;
