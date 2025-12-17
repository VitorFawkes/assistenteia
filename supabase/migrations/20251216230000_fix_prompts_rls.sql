-- Fix RLS policies for prompts table

-- Drop existing flawed policies
DROP POLICY IF EXISTS "Admins can view prompts" ON public.prompts;
DROP POLICY IF EXISTS "Admins can update prompts" ON public.prompts;

-- 1. Allow ALL authenticated users to READ prompts
-- This is required so that the Edge Function (running as the user) can fetch the system prompt.
CREATE POLICY "Allow all users to read prompts" ON public.prompts
    FOR SELECT
    TO authenticated
    USING (true);

-- 2. Allow ONLY Admin to UPDATE prompts
-- We check the JWT email claim directly.
CREATE POLICY "Admin update prompts" ON public.prompts
    FOR UPDATE
    TO authenticated
    USING (auth.jwt() ->> 'email' = 'vitorgambetti@gmail.com')
    WITH CHECK (auth.jwt() ->> 'email' = 'vitorgambetti@gmail.com');

-- 3. Allow ONLY Admin to INSERT prompts
CREATE POLICY "Admin insert prompts" ON public.prompts
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.jwt() ->> 'email' = 'vitorgambetti@gmail.com');
