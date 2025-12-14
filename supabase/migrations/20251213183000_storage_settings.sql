-- Add storage preferences to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS storage_download_images BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS storage_download_videos BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS storage_download_audio BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS storage_download_documents BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS storage_track_status BOOLEAN DEFAULT true;
