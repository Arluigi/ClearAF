-- Schema-only baseline of existing production, with explicit security boundary.
-- Fresh environments apply this once. Existing environments must use verified history reconciliation, never replay.
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.4
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, name, "createdAt", "updatedAt")
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', new.email),
    now(),
    now()
  );
  RETURN new;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "scheduledDate" timestamp(3) without time zone NOT NULL,
    duration integer DEFAULT 30 NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    concern text,
    notes text,
    "visitNotes" text,
    "videoCallURL" text,
    "createdDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "patientId" uuid NOT NULL,
    "dermatologistId" uuid NOT NULL
);


--
-- Name: dermatologists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dermatologists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    title text,
    specialization text,
    "profileImageUrl" text,
    phone text,
    "isAvailable" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text NOT NULL,
    "sentDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isRead" boolean DEFAULT false NOT NULL,
    "messageType" text DEFAULT 'text'::text NOT NULL,
    "attachmentUrl" text,
    "attachmentType" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "senderId" text NOT NULL,
    "senderType" text DEFAULT 'patient'::text NOT NULL,
    "recipientId" text NOT NULL,
    "recipientType" text DEFAULT 'dermatologist'::text NOT NULL
);


--
-- Name: prescriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prescriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "medicationName" text NOT NULL,
    dosage text NOT NULL,
    instructions text NOT NULL,
    "prescribedDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiryDate" timestamp(3) without time zone,
    "refillsRemaining" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    pharmacy text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "patientId" uuid NOT NULL,
    "dermatologistId" uuid NOT NULL,
    "productId" uuid
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    brand text,
    category text NOT NULL,
    price numeric(65,30) NOT NULL,
    "productDescription" text,
    ingredients text,
    "imageUrl" text,
    "isAvailable" boolean DEFAULT true NOT NULL,
    "isPrescriptionRequired" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: routine_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routine_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "productName" text NOT NULL,
    "productType" text,
    instructions text,
    duration integer DEFAULT 0 NOT NULL,
    "orderIndex" integer DEFAULT 0 NOT NULL,
    "isCompleted" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "routineId" uuid NOT NULL
);


--
-- Name: routines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    "timeOfDay" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "completedToday" boolean DEFAULT false NOT NULL,
    "userId" uuid NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: skin_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skin_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "photoUrl" text NOT NULL,
    "skinScore" integer DEFAULT 0 NOT NULL,
    notes text,
    "captureDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" uuid NOT NULL,
    "appointmentId" uuid
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "startDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "nextDeliveryDate" timestamp(3) without time zone NOT NULL,
    frequency text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    "totalPrice" numeric(65,30) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" uuid NOT NULL,
    "productId" uuid NOT NULL
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid NOT NULL,
    name text,
    "skinType" text,
    "currentSkinScore" integer DEFAULT 0 NOT NULL,
    "streakCount" integer DEFAULT 0 NOT NULL,
    "onboardingCompleted" boolean DEFAULT false NOT NULL,
    allergies text,
    "currentMedications" text,
    "skinConcerns" text,
    "joinDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dermatologistId" uuid
);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: dermatologists dermatologists_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermatologists
    ADD CONSTRAINT dermatologists_email_key UNIQUE (email);


--
-- Name: dermatologists dermatologists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dermatologists
    ADD CONSTRAINT dermatologists_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: prescriptions prescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT prescriptions_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: routine_steps routine_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_steps
    ADD CONSTRAINT routine_steps_pkey PRIMARY KEY (id);


--
-- Name: routines routines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT routines_pkey PRIMARY KEY (id);


--
-- Name: skin_photos skin_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skin_photos
    ADD CONSTRAINT skin_photos_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: idx_appointments_dermatologist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_dermatologist ON public.appointments USING btree ("dermatologistId");


--
-- Name: idx_appointments_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_patient ON public.appointments USING btree ("patientId");


--
-- Name: idx_prescriptions_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prescriptions_patient ON public.prescriptions USING btree ("patientId");


--
-- Name: idx_skin_photos_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skin_photos_user ON public.skin_photos USING btree ("userId");


--
-- Name: idx_user_profiles_dermatologist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_dermatologist ON public.user_profiles USING btree ("dermatologistId");


--
-- Name: appointments appointments_dermatologistId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_dermatologistId_fkey" FOREIGN KEY ("dermatologistId") REFERENCES public.dermatologists(id) ON DELETE RESTRICT;


--
-- Name: appointments appointments_patientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES public.user_profiles(id) ON DELETE RESTRICT;


--
-- Name: prescriptions prescriptions_dermatologistId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT "prescriptions_dermatologistId_fkey" FOREIGN KEY ("dermatologistId") REFERENCES public.dermatologists(id) ON DELETE RESTRICT;


--
-- Name: prescriptions prescriptions_patientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT "prescriptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES public.user_profiles(id) ON DELETE RESTRICT;


--
-- Name: prescriptions prescriptions_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescriptions
    ADD CONSTRAINT "prescriptions_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: routine_steps routine_steps_routineId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routine_steps
    ADD CONSTRAINT "routine_steps_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES public.routines(id) ON DELETE RESTRICT;


--
-- Name: routines routines_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routines
    ADD CONSTRAINT "routines_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.user_profiles(id) ON DELETE RESTRICT;


--
-- Name: skin_photos skin_photos_appointmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skin_photos
    ADD CONSTRAINT "skin_photos_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES public.appointments(id) ON DELETE SET NULL;


--
-- Name: skin_photos skin_photos_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skin_photos
    ADD CONSTRAINT "skin_photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.user_profiles(id) ON DELETE RESTRICT;


--
-- Name: subscriptions subscriptions_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT "subscriptions_productId_fkey" FOREIGN KEY ("productId") REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: subscriptions subscriptions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.user_profiles(id) ON DELETE RESTRICT;


--
-- Name: user_profiles user_profiles_dermatologistId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT "user_profiles_dermatologistId_fkey" FOREIGN KEY ("dermatologistId") REFERENCES public.dermatologists(id) ON DELETE SET NULL;


--
-- Name: user_profiles user_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: _prisma_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: appointments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

--
-- Name: dermatologists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dermatologists ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: prescriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: routine_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routine_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: routines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routines ENABLE ROW LEVEL SECURITY;

--
-- Name: skin_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skin_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: TABLE _prisma_migrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public._prisma_migrations TO service_role;


--
-- Name: TABLE appointments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.appointments TO service_role;


--
-- Name: TABLE dermatologists; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dermatologists TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE prescriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.prescriptions TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE routine_steps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routine_steps TO service_role;


--
-- Name: TABLE routines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.routines TO service_role;


--
-- Name: TABLE skin_photos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skin_photos TO service_role;


--
-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscriptions TO service_role;


--
-- Name: TABLE user_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_profiles TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
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

INSERT INTO storage.buckets (id,name,public) VALUES ('patient-photos','patient-photos',false) ON CONFLICT (id) DO UPDATE SET public=false;
