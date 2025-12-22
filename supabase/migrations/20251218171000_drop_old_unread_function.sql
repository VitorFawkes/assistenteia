-- Drop the old function signature to resolve ambiguity
DROP FUNCTION IF EXISTS get_unread_conversations(UUID, INT, INT);
