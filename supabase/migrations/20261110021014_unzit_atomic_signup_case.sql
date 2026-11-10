-- New Auth identities must enter launch enrollment before any API request.
-- Replacing only the trigger function preserves every existing legacy account.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.launch_settings WHERE active)
 OR NOT EXISTS (
  SELECT 1 FROM public.launch_allowlist
  WHERE email=pg_catalog.lower(pg_catalog.btrim(NEW.email)) AND enabled
 ) THEN
  RAISE EXCEPTION 'Closed waitlist access' USING ERRCODE='42501';
 END IF;

 -- Editable metadata supplies only the display name, never a clinical role,
 -- assignment, onboarding completion, payment entitlement or enrollment status.
 INSERT INTO public.user_profiles (id,name,"createdAt","updatedAt")
 VALUES (NEW.id,COALESCE(NEW.raw_user_meta_data->>'name',NEW.email),now(),now());
 INSERT INTO public.launch_cases ("patientId") VALUES (NEW.id);
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
