-- Migration: Single Instance Architecture Support
-- Description: Adds phone verification columns and master instance flag.

-- 1. Ensure phone_number is unique in user_settings (Critical for Handshake)
-- We use a DO block to handle potential duplicates if necessary, but for now we assume data is clean or we just add the constraint.
-- If there are duplicates, this will fail, alerting the user to clean up data.
ALTER TABLE public.user_settings
ADD CONSTRAINT user_settings_phone_number_key UNIQUE (phone_number);

-- 2. Add Verification Columns to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS phone_verification_code TEXT,
ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ;

-- 3. Add is_master flag to whatsapp_instances
ALTER TABLE public.whatsapp_instances
ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;

-- 4. Index for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_is_master ON public.whatsapp_instances(is_master);

-- 5. RLS Policies (Update if needed)
-- Ensure users can only see their own verification data (already covered by existing policies usually, but good to verify)
-- Existing policies on user_settings should cover this.
