-- Encryption functions

-- Function to insert an encrypted message
-- Uses PGP Symmetric Encryption with ASCII Armor to store the result as text in the existing column
create or replace function insert_message_encrypted(
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
    p_file_size numeric default null
)
returns uuid
language plpgsql
security definer
as $$
declare
    v_encrypted_content text;
    v_new_id uuid;
begin
    -- Encrypt the content using the provided key
    -- armor=1 ensures the output is ASCII text, safe for the text column
    if p_content is not null then
        v_encrypted_content := public.pgp_sym_encrypt(p_content, p_encryption_key, 'cipher-algo=aes256, compress-algo=0, armor=1');
    else
        v_encrypted_content := null;
    end if;

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
        file_size
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
        p_file_size
    ) returning id into v_new_id;

    return v_new_id;
end;
$$;

-- Function to get decrypted messages
-- Useful for the AI to read history
create or replace function get_messages_decrypted(
    p_encryption_key text,
    p_limit int default 20,
    p_offset int default 0,
    p_user_id uuid default null,
    p_sender_number text default null,
    p_group_name text default null,
    p_days_ago int default 7
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
    media_type text
)
language plpgsql
security definer
as $$
begin
    return query
    select
        m.id,
        m.role,
        -- Try to decrypt. If it fails (e.g. old unencrypted messages), return raw content or handle error.
        -- We use a safe approach: check if it looks like PGP message.
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
        m.media_type
    from messages m
    where
        (p_user_id is null or m.user_id = p_user_id)
        and (p_sender_number is null or m.sender_number = p_sender_number)
        and (p_group_name is null or m.group_name = p_group_name)
        and m.created_at > (now() - (p_days_ago || ' days')::interval)
    order by m.created_at desc
    limit p_limit
    offset p_offset;
end;
$$;
