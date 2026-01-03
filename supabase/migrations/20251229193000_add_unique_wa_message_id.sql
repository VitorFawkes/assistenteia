-- Add UNIQUE constraint to wa_message_id on the underlying table raw_messages
CREATE UNIQUE INDEX IF NOT EXISTS raw_messages_wa_message_id_idx ON raw_messages (wa_message_id);
