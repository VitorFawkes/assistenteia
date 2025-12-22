-- Secure is_admin in user_settings
-- Create a function to check if the user is trying to change is_admin
CREATE OR REPLACE FUNCTION public.prevent_admin_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- If is_admin is being changed
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
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
