-- Fix user creation trigger
-- This migration ensures the handle_new_user function exists and is correctly triggered

-- 1. Create or Replace the function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, preferred_name, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuário'),
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop the trigger if it exists (to ensure clean state)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. Ensure RLS allows the function to work (SECURITY DEFINER handles this, but let's be safe with grants)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_settings TO postgres, service_role;
-- Authenticated users need to read/update their own settings (handled by policies), but the trigger runs as owner (postgres/supabase_admin) usually.
