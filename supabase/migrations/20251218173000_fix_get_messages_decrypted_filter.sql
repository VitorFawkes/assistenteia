-- Drop the old function to avoid ambiguity if signature changes slightly (though here we are just adding logic, better safe)
DROP FUNCTION IF EXISTS get_messages_decrypted(text, int, int, uuid, text, text, int);

-- Re-create with better filtering logic
CREATE OR REPLACE FUNCTION get_messages_decrypted(
    p_encryption_key text,
    p_limit int default 20,
    p_offset int default 0,
    p_user_id uuid default null,
    p_sender_number text default null,
    p_group_name text default null,
    p_sender_name text default null, -- Added parameter
    p_days_ago int default 7
)
RETURNS TABLE (
    id uuid,
    role text,
    content text,
    created_at timestamptz,
    sender_name text,
    sender_number text,
    is_group boolean,
    group_name text,
    media_type text,
    is_from_me boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.role,
        -- Decryption Logic with Fallback for both Armor and Base64 formats
        CASE
            -- Case 1: PGP Armor (Old format)
            WHEN m.content LIKE '-----BEGIN PGP MESSAGE-----' || '%' THEN
                pgp_sym_decrypt(m.content::bytea, p_encryption_key)
            -- Case 2: ENC:Prefix + Base64 (New format)
            WHEN m.content LIKE 'ENC:%' THEN
                pgp_sym_decrypt(decode(substring(m.content from 5), 'base64'), p_encryption_key)
            -- Case 3: Plain text (Legacy / Fallback)
            ELSE
                m.content
        END AS content,
        m.created_at,
        m.sender_name,
        m.sender_number,
        m.is_group,
        m.group_name,
        m.media_type,
        m.is_from_me
    FROM messages m
    WHERE
        (p_user_id IS NULL OR m.user_id = p_user_id)
        AND (p_sender_number IS NULL OR m.sender_number = p_sender_number)
        AND (p_group_name IS NULL OR m.group_name = p_group_name)
        -- Fuzzy match for sender name if provided
        AND (p_sender_name IS NULL OR m.sender_name ILIKE '%' || p_sender_name || '%')
        AND m.created_at > (now() - (p_days_ago || ' days')::interval)
    ORDER BY m.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;
