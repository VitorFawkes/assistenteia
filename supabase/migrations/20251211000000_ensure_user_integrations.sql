-- Create user_integrations table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    provider TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Users can view their own integrations" ON public.user_integrations;
CREATE POLICY "Users can view their own integrations" ON public.user_integrations
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own integrations" ON public.user_integrations;
CREATE POLICY "Users can insert their own integrations" ON public.user_integrations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own integrations" ON public.user_integrations;
CREATE POLICY "Users can update their own integrations" ON public.user_integrations
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own integrations" ON public.user_integrations;
CREATE POLICY "Users can delete their own integrations" ON public.user_integrations
    FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_integrations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_user_integrations_updated_at_trigger ON public.user_integrations;
CREATE TRIGGER update_user_integrations_updated_at_trigger
    BEFORE UPDATE ON public.user_integrations
    FOR EACH ROW
    EXECUTE PROCEDURE update_user_integrations_updated_at();
