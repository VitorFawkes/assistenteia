-- Create whatsapp_instances table
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    instance_name TEXT NOT NULL, -- Will be the user_id
    status TEXT DEFAULT 'disconnected' CHECK (status IN ('connecting', 'connected', 'disconnected')),
    qr_code TEXT, -- Base64 QR Code (temporary)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id),
    UNIQUE(instance_name)
);

-- Enable RLS
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own instance" ON public.whatsapp_instances
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own instance" ON public.whatsapp_instances
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own instance" ON public.whatsapp_instances
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own instance" ON public.whatsapp_instances
    FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_instances_updated_at
    BEFORE UPDATE ON public.whatsapp_instances
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
