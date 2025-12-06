-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Create TASKS table (Separate from Reminders)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'archived')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date TIMESTAMPTZ, -- Optional deadline
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Add RLS policies for tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'Users can view their own tasks') THEN
        CREATE POLICY "Users can view their own tasks" ON tasks FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'Users can insert their own tasks') THEN
        CREATE POLICY "Users can insert their own tasks" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'Users can update their own tasks') THEN
        CREATE POLICY "Users can update their own tasks" ON tasks FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tasks' AND policyname = 'Users can delete their own tasks') THEN
        CREATE POLICY "Users can delete their own tasks" ON tasks FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- 2. Create MEMORIES table with Vector support
CREATE TABLE IF NOT EXISTS memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS policies for memories
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'memories' AND policyname = 'Users can view their own memories') THEN
        CREATE POLICY "Users can view their own memories" ON memories FOR SELECT USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'memories' AND policyname = 'Users can insert their own memories') THEN
        CREATE POLICY "Users can insert their own memories" ON memories FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'memories' AND policyname = 'Users can update their own memories') THEN
        CREATE POLICY "Users can update their own memories" ON memories FOR UPDATE USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'memories' AND policyname = 'Users can delete their own memories') THEN
        CREATE POLICY "Users can delete their own memories" ON memories FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Create index for faster vector search
CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 3. Create match_memories function (RPC)
-- DROP first to avoid return type conflict
DROP FUNCTION IF EXISTS match_memories(vector, float, int, uuid);
DROP FUNCTION IF EXISTS match_memories(vector, double precision, int, uuid);

CREATE OR REPLACE FUNCTION match_memories (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    memories.id,
    memories.content,
    1 - (memories.embedding <=> query_embedding) as similarity,
    memories.created_at
  FROM memories
  WHERE 1 - (memories.embedding <=> query_embedding) > match_threshold
  AND memories.user_id = p_user_id
  ORDER BY memories.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
