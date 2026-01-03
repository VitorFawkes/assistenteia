-- Migration: Sprint 2 - Router & Workers
-- Description: Adds user_state for context tracking and enhances run_logs for observability.

-- 1. Create user_state table
CREATE TABLE IF NOT EXISTS public.user_state (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    active_list_id UUID REFERENCES public.collections(id) ON DELETE SET NULL,
    direct_mode BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_user_state_active_list ON public.user_state(active_list_id);

-- RLS
ALTER TABLE public.user_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own state" ON public.user_state
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own state" ON public.user_state
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own state" ON public.user_state
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2. Update run_logs table
ALTER TABLE public.run_logs
    ADD COLUMN IF NOT EXISTS confidence REAL,
    ADD COLUMN IF NOT EXISTS router_source TEXT CHECK (router_source IN ('heuristic', 'llm')),
    ADD COLUMN IF NOT EXISTS active_context_size INT;

-- 3. Trigger for updated_at on user_state
CREATE OR REPLACE FUNCTION update_user_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_state_timestamp ON public.user_state;
CREATE TRIGGER update_user_state_timestamp
    BEFORE UPDATE ON public.user_state
    FOR EACH ROW
    EXECUTE PROCEDURE update_user_state_updated_at();
