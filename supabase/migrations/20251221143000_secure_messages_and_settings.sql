-- 1. Enable RLS on messages table
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 2. Create Policies for messages
-- Allow users to view their own messages
CREATE POLICY "Users can view their own messages"
ON public.messages
FOR SELECT
USING (auth.uid() = user_id);

-- Allow users to insert their own messages (e.g. Note to Self or manual send)
CREATE POLICY "Users can insert their own messages"
ON public.messages
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own messages (e.g. editing, status update)
CREATE POLICY "Users can update their own messages"
ON public.messages
FOR UPDATE
USING (auth.uid() = user_id);

-- Allow users to delete their own messages
CREATE POLICY "Users can delete their own messages"
ON public.messages
FOR DELETE
USING (auth.uid() = user_id);


-- 3. Secure is_admin in user_settings
-- Create a function to check if the user is trying to change is_admin
CREATE OR REPLACE FUNCTION public.prevent_admin_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- If is_admin is being changed
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- Allow if the user is already an admin (to demote themselves or promote others if we had a UI for it)
    -- OR if it's a service_role (which bypasses RLS/Triggers usually, but triggers run for service_role unless specified)
    -- Actually, simpler: ONLY allow if the current user has the 'service_role' role or is already an admin.
    
    -- Check if the executing user is a service_role (supabase_admin)
    IF (auth.role() = 'service_role') THEN
      RETURN NEW;
    END IF;

    -- Check if the user is ALREADY an admin in the database
    IF EXISTS (SELECT 1 FROM public.user_settings WHERE user_id = auth.uid() AND is_admin = true) THEN
       RETURN NEW;
    END IF;

    -- Otherwise, RAISE EXCEPTION
    RAISE EXCEPTION 'Unauthorized: You cannot change your own admin status.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS tr_protect_admin_status ON public.user_settings;

CREATE TRIGGER tr_protect_admin_status
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.prevent_admin_escalation();
