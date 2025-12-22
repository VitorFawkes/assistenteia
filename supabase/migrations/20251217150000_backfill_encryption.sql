-- Backfill encryption for existing messages
-- WARNING: This will encrypt ALL existing messages that are not already encrypted (do not start with PGP header)
-- It uses the same key as the new messages.

do $$
declare
    v_encryption_key text := '18julho10julho'; -- HARDCODED FOR MIGRATION ONLY (User provided this key)
    v_count int;
begin
    -- Update messages that are NOT encrypted yet
    -- We check if content does NOT start with PGP header
    
    -- 1. Count messages to be encrypted
    select count(*) into v_count from messages 
    where content is not null 
    and content not like '-----BEGIN PGP MESSAGE-----' || '%';
    
    raise notice 'Encrypting % messages...', v_count;

    -- 2. Update
    update messages
    set content = pgp_sym_encrypt(content, v_encryption_key, 'cipher-algo=aes256, compress-algo=0, armor=1')
    where content is not null 
    and content not like '-----BEGIN PGP MESSAGE-----' || '%';
    
    raise notice 'Done.';
end $$;
