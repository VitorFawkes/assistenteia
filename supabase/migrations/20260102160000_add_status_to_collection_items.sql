-- Add status column to collection_items if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'collection_items' AND column_name = 'status') THEN
        ALTER TABLE collection_items ADD COLUMN status text DEFAULT 'todo';
    END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_collection_items_status ON collection_items(status);
