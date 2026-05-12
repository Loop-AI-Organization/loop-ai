-- Ensure auth users have profile rows before workspaces.owner_id references them.
-- Some deployed databases have workspaces.owner_id -> public.profiles(id), while
-- older local migrations did not create profiles. Keep this migration guarded so
-- fresh schemas without profiles still migrate.

DO $$
DECLARE
  has_profiles boolean;
  has_first_name boolean;
BEGIN
  SELECT to_regclass('public.profiles') IS NOT NULL INTO has_profiles;
  IF NOT has_profiles THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'id'
  ) INTO has_profiles;
  IF NOT has_profiles THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'first_name'
  ) INTO has_first_name;

  IF has_first_name THEN
    INSERT INTO public.profiles (id, first_name)
    SELECT
      users.id,
      COALESCE(NULLIF(split_part(users.email, '@', 1), ''), 'User')
    FROM auth.users
    LEFT JOIN public.profiles ON profiles.id = users.id
    WHERE profiles.id IS NULL
    ON CONFLICT (id) DO NOTHING;

    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.ensure_profile_for_auth_user()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      BEGIN
        INSERT INTO public.profiles (id, first_name)
        VALUES (
          NEW.id,
          COALESCE(NULLIF(split_part(NEW.email, '@', 1), ''), 'User')
        )
        ON CONFLICT (id) DO NOTHING;
        RETURN NEW;
      END;
      $body$;
    $fn$;
  ELSE
    INSERT INTO public.profiles (id)
    SELECT users.id
    FROM auth.users
    LEFT JOIN public.profiles ON profiles.id = users.id
    WHERE profiles.id IS NULL
    ON CONFLICT (id) DO NOTHING;

    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.ensure_profile_for_auth_user()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
      BEGIN
        INSERT INTO public.profiles (id)
        VALUES (NEW.id)
        ON CONFLICT (id) DO NOTHING;
        RETURN NEW;
      END;
      $body$;
    $fn$;
  END IF;

  DROP TRIGGER IF EXISTS on_auth_user_created_ensure_profile ON auth.users;
  CREATE TRIGGER on_auth_user_created_ensure_profile
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_profile_for_auth_user();
END $$;
