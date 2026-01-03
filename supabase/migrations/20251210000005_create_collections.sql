-- Create collections table
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create collection_items table
CREATE TABLE IF NOT EXISTS public.collection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT,
    type TEXT NOT NULL,
    media_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;

-- Policies for collections
CREATE POLICY "Users can view their own collections" ON public.collections
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own collections" ON public.collections
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collections" ON public.collections
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own collections" ON public.collections
    FOR DELETE USING (auth.uid() = user_id);

-- Policies for collection_items
CREATE POLICY "Users can view their own collection items" ON public.collection_items
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own collection items" ON public.collection_items
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own collection items" ON public.collection_items
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own collection items" ON public.collection_items
    FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at on collections
CREATE TRIGGER update_collections_updated_at
    BEFORE UPDATE ON public.collections
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
