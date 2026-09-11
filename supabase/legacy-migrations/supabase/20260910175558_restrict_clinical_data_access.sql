-- Clinical records are served only by the authenticated Express API, not PostgREST.
-- Additive security change: no rows or tables are dropped. Do not replay legacy
-- Prisma fresh_start migrations against this existing database.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['_prisma_migrations','appointments','dermatologists','messages',
    'prescriptions','products','routine_steps','routines','skin_photos','subscriptions','user_profiles']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
-- Auth's trigger still executes normally; it is not a client RPC endpoint.
ALTER FUNCTION public.handle_new_user() SET search_path = '';
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- Only backend service-role storage operations are supported.
DROP POLICY IF EXISTS "Public access for all ops 1x29xl5_0" ON storage.objects;
DROP POLICY IF EXISTS "Public access for all ops 1x29xl5_1" ON storage.objects;
DROP POLICY IF EXISTS "Public access for all ops 1x29xl5_2" ON storage.objects;
DROP POLICY IF EXISTS "Public access for all ops 1x29xl5_3" ON storage.objects;
