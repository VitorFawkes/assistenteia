-- Migration: Patch 1.1 - Reliability Fixes
-- Description: Enforces UNIQUE constraint on active sessions to prevent race conditions.

-- 1. Drop the old non-unique index if it exists
DROP INDEX IF EXISTS public.idx_conversations_thread_active;

-- 2. Create a UNIQUE index on thread_id where status is 'active'
-- This ensures that for a given thread, only ONE session can be active at a time.
-- Any concurrent insert will fail with a unique constraint violation.
CREATE UNIQUE INDEX idx_conversations_thread_active_unique 
ON public.conversations(thread_id) 
WHERE status = 'active';

-- 3. Add comment to explain the strategy
COMMENT ON INDEX public.idx_conversations_thread_active_unique IS 'Enforces single active session per thread to prevent race conditions.';
