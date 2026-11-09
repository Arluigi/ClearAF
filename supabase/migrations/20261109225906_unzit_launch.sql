-- Additive UNZIT launch schema; SQL owns clinical constraints and authorization.
BEGIN;
CREATE TABLE public.launch_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  active boolean NOT NULL DEFAULT false,
  "careAmountCents" integer NOT NULL CHECK ("careAmountCents" > 0),
  "allInAmountCents" integer NOT NULL CHECK ("allInAmountCents" > 0),
  "carePriceId" text,
  "allInPriceId" text,
  "clinicianId" uuid REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
  "contentVersion" text NOT NULL DEFAULT '0.9-draft',
  content jsonb NOT NULL DEFAULT '{}' CHECK (octet_length(content::text) <= 200000),
  "weeklyWeeks" integer NOT NULL DEFAULT 8 CHECK ("weeklyWeeks" = 8),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.launch_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_settings FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.launch_settings TO service_role;
CREATE TABLE public.launch_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  enabled boolean NOT NULL DEFAULT true,
  "importBatch" uuid NOT NULL,
  "importedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.launch_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_allowlist FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.launch_allowlist TO service_role;
CREATE TABLE public.launch_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId" uuid NOT NULL UNIQUE REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  status text NOT NULL DEFAULT 'consents' CHECK (status IN ('consents','identity','eligibility','payment','medical_history','photos','destination','submitted','needs_changes','approved','rejected','ineligible')),
  eligibility jsonb CHECK (octet_length(eligibility::text) <= 8000),
  "rulesVersion" text,
  "planId" text CHECK ("planId" IN ('care','all_in')),
  "settingsVersion" integer REFERENCES public.launch_settings(version) ON DELETE RESTRICT,
  destination jsonb CHECK (octet_length(destination::text) <= 8000),
  "identityId" uuid,
  "intakeId" uuid,
  "photoSetId" uuid,
  flags jsonb NOT NULL DEFAULT '[]',
  "submittedAt" timestamp(3),
  "approvedAt" timestamp(3),
  "patientMessage" text CHECK (length("patientMessage") <= 2000),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.launch_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_cases FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.launch_cases TO service_role;
CREATE TABLE public.identity_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId" uuid NOT NULL,
  "patientId" uuid NOT NULL,
  "idPhotoPath" text NOT NULL,
  "selfiePath" text NOT NULL,
  "fullName" text NOT NULL CHECK (length("fullName") BETWEEN 1 AND 160),
  "dateOfBirth" date NOT NULL,
  "attestedInNC" boolean NOT NULL,
  "attestedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','approved','needs_changes','rejected')),
  "reviewedBy" uuid REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
  "reviewedAt" timestamp(3),
  "patientMessage" text CHECK (length("patientMessage") <= 2000),
  "requestHash" text NOT NULL
);
ALTER TABLE public.identity_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.identity_verifications FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.identity_verifications TO service_role;
CREATE TABLE public.intake_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId" uuid NOT NULL,
  "patientId" uuid NOT NULL,
  "questionnaireVersion" text NOT NULL,
  answers jsonb NOT NULL CHECK (jsonb_typeof(answers) = 'object' AND octet_length(answers::text) <= 64000),
  "requestHash" text NOT NULL,
  "submittedAt" timestamp(3),
  "attestedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.intake_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.intake_revisions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.intake_revisions TO service_role;
CREATE TABLE public.care_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId" uuid NOT NULL UNIQUE REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  "caseId" uuid NOT NULL UNIQUE,
  "planId" text NOT NULL CHECK ("planId" IN ('care','all_in')),
  "settingsVersion" integer NOT NULL REFERENCES public.launch_settings(version) ON DELETE RESTRICT,
  "amountCents" integer NOT NULL CHECK ("amountCents" > 0),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','paid_pending_review','active','past_due','ended','rejected')),
  "stripeCustomerId" text UNIQUE,
  "stripeSubscriptionId" text UNIQUE,
  "checkoutSessionId" text UNIQUE,
  "activatedAt" timestamp(3),
  "currentPeriodEnd" timestamp(3),
  "paidThrough" timestamp(3),
  "cancelAtPeriodEnd" boolean NOT NULL DEFAULT false,
  "cadenceAnchor" timestamp(3),
  "destinationRequired" boolean NOT NULL DEFAULT false,
  "refundStatus" text NOT NULL DEFAULT 'not_applicable' CHECK ("refundStatus" IN ('not_applicable','pending','issued','failed')),
  "providerUpdatedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.care_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.care_memberships FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.care_memberships TO service_role;
CREATE TABLE public.billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "membershipId" uuid NOT NULL REFERENCES public.care_memberships(id) ON DELETE RESTRICT,
  "patientId" uuid NOT NULL,
  "providerPaymentId" text NOT NULL UNIQUE,
  "providerInvoiceId" text NOT NULL UNIQUE,
  "amountCents" integer NOT NULL CHECK ("amountCents" > 0),
  "refundedCents" integer NOT NULL DEFAULT 0 CHECK ("refundedCents" >= 0 AND "refundedCents" <= "amountCents"),
  "confirmedAt" timestamp(3) NOT NULL,
  "refundedAt" timestamp(3)
);
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_payments FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.billing_payments TO service_role;
CREATE TABLE public.billing_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "membershipId" uuid NOT NULL REFERENCES public.care_memberships(id) ON DELETE RESTRICT,
  "patientId" uuid NOT NULL,
  "requestHash" text NOT NULL,
  "providerKey" text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('checkout','refund','cancel')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','requires_action','succeeded','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  "nextAttemptAt" timestamp(3),
  "failureCode" text CHECK (length("failureCode") <= 100),
  result jsonb CHECK (octet_length(result::text) <= 8000),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.billing_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_operations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.billing_operations TO service_role;
CREATE TABLE public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "providerEventId" text NOT NULL UNIQUE,
  "objectId" text NOT NULL,
  type text NOT NULL,
  "providerCreatedAt" timestamp(3) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  data jsonb NOT NULL CHECK (octet_length(data::text) <= 8000),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.stripe_events TO service_role;
CREATE TABLE public.launch_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "membershipId" uuid NOT NULL,
  "patientId" uuid NOT NULL,
  "cadenceAnchor" timestamp(3) NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal > 0),
  "dueAt" timestamp(3) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('weekly','monthly')),
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due','draft','submitted','needs_changes','reviewed','superseded')),
  "formId" uuid NOT NULL REFERENCES public.care_form_revisions(id) ON DELETE RESTRICT,
  "responseId" uuid UNIQUE REFERENCES public.care_form_responses(id) ON DELETE RESTRICT,
  "photoSetId" uuid,
  answers jsonb CHECK (octet_length(answers::text) <= 8000),
  "submittedAt" timestamp(3),
  "reviewedAt" timestamp(3),
  "patientMessage" text CHECK (length("patientMessage") <= 2000)
);
ALTER TABLE public.launch_check_ins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_check_ins FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.launch_check_ins TO service_role;
CREATE TABLE public.clinical_photo_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('enrollment','check_in')),
  "caseId" uuid,
  "checkInId" uuid,
  "requiredSlots" jsonb NOT NULL CHECK (jsonb_typeof("requiredSlots") = 'array' AND jsonb_array_length("requiredSlots") BETWEEN 3 AND 5),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','needs_changes','reviewed')),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.clinical_photo_sets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clinical_photo_sets FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.clinical_photo_sets TO service_role;
CREATE TABLE public.clinical_photo_set_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "setId" uuid NOT NULL,
  "patientId" uuid NOT NULL,
  slot text NOT NULL CHECK (slot IN ('front','left','right','chest','back','close_up')),
  "photoId" uuid NOT NULL UNIQUE,
  "captureId" uuid NOT NULL UNIQUE
);
ALTER TABLE public.clinical_photo_set_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clinical_photo_set_items FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.clinical_photo_set_items TO service_role;
CREATE TABLE public.launch_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  "caseId" uuid NOT NULL,
  "clinicianId" uuid NOT NULL REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
  "targetType" text NOT NULL CHECK ("targetType" IN ('identity','case','check_in')),
  "targetId" uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('approve','needs_changes','reject')),
  "patientMessage" text CHECK (length("patientMessage") <= 2000),
  "caseRevision" integer NOT NULL CHECK ("caseRevision" >= 0),
  "requestHash" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.launch_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_reviews FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.launch_reviews TO service_role;
ALTER TABLE public.launch_cases ADD CONSTRAINT launch_cases_id_patient_key UNIQUE (id,"patientId");
ALTER TABLE public.care_memberships ADD CONSTRAINT care_memberships_id_patient_key UNIQUE (id,"patientId");
ALTER TABLE public.identity_verifications ADD CONSTRAINT identity_verifications_id_patient_key UNIQUE (id,"patientId");
ALTER TABLE public.intake_revisions ADD CONSTRAINT intake_revisions_id_patient_key UNIQUE (id,"patientId");
ALTER TABLE public.launch_check_ins ADD CONSTRAINT launch_check_ins_id_patient_key UNIQUE (id,"patientId");
ALTER TABLE public.clinical_photo_sets ADD CONSTRAINT clinical_photo_sets_id_patient_key UNIQUE (id,"patientId");
ALTER TABLE public.skin_photos ADD CONSTRAINT skin_photos_id_patient_key UNIQUE (id,"userId");
ALTER TABLE public.identity_verifications ADD FOREIGN KEY ("caseId","patientId") REFERENCES public.launch_cases(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.intake_revisions ADD FOREIGN KEY ("caseId","patientId") REFERENCES public.launch_cases(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.care_memberships ADD FOREIGN KEY ("caseId","patientId") REFERENCES public.launch_cases(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.launch_reviews ADD FOREIGN KEY ("caseId","patientId") REFERENCES public.launch_cases(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.billing_payments ADD FOREIGN KEY ("membershipId","patientId") REFERENCES public.care_memberships(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.billing_operations ADD FOREIGN KEY ("membershipId","patientId") REFERENCES public.care_memberships(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.launch_check_ins ADD FOREIGN KEY ("membershipId","patientId") REFERENCES public.care_memberships(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.launch_cases ADD FOREIGN KEY ("identityId","patientId") REFERENCES public.identity_verifications(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.launch_cases ADD FOREIGN KEY ("intakeId","patientId") REFERENCES public.intake_revisions(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.launch_cases ADD FOREIGN KEY ("photoSetId","patientId") REFERENCES public.clinical_photo_sets(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.clinical_photo_sets ADD CHECK ((purpose = 'enrollment' AND "caseId" IS NOT NULL AND "checkInId" IS NULL) OR (purpose = 'check_in' AND "caseId" IS NULL AND "checkInId" IS NOT NULL));
ALTER TABLE public.clinical_photo_sets ADD FOREIGN KEY ("caseId","patientId") REFERENCES public.launch_cases(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.clinical_photo_sets ADD FOREIGN KEY ("checkInId","patientId") REFERENCES public.launch_check_ins(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.clinical_photo_set_items ADD FOREIGN KEY ("setId","patientId") REFERENCES public.clinical_photo_sets(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.clinical_photo_set_items ADD FOREIGN KEY ("photoId","patientId") REFERENCES public.skin_photos(id,"userId") ON DELETE RESTRICT;
ALTER TABLE public.clinical_photo_set_items ADD UNIQUE ("setId",slot);
ALTER TABLE public.launch_check_ins ADD UNIQUE ("membershipId","cadenceAnchor",ordinal);
ALTER TABLE public.launch_check_ins ADD FOREIGN KEY ("photoSetId","patientId") REFERENCES public.clinical_photo_sets(id,"patientId") ON DELETE RESTRICT;
ALTER TABLE public.launch_reviews ADD UNIQUE ("caseId","caseRevision","targetType","targetId");
CREATE UNIQUE INDEX launch_settings_active_idx ON public.launch_settings(active) WHERE active;
INSERT INTO public.launch_settings (id,version,active,"careAmountCents","allInAmountCents","createdAt") VALUES ('00000000-0000-4000-8000-000000000039',1,true,3900,8900,'2026-11-09T00:00:00Z');
ALTER TABLE public.consent_acceptances ADD COLUMN "documentKey" text NOT NULL DEFAULT 'legacy', ADD COLUMN "observedIp" inet, ADD COLUMN "versionLabel" text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.consent_acceptances DROP CONSTRAINT consent_acceptances_user_version_key;
ALTER TABLE public.consent_acceptances ADD CONSTRAINT consent_acceptances_user_key_version_key UNIQUE ("userId","documentKey","documentVersion");
ALTER TABLE public.prescriptions ADD COLUMN strength text, ADD COLUMN "sentAt" timestamp(3), ADD COLUMN "recordedAt" timestamp(3), ADD COLUMN "pharmacySnapshot" jsonb, ADD COLUMN source text, ADD COLUMN "launchCaseId" uuid REFERENCES public.launch_cases(id) ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.launch_settings WHERE active)
 OR NOT EXISTS (SELECT 1 FROM public.launch_allowlist WHERE email=pg_catalog.lower(pg_catalog.btrim(new.email)) AND enabled) THEN
  RAISE EXCEPTION 'Closed waitlist access' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.user_profiles (id,name,"createdAt","updatedAt") VALUES (new.id,COALESCE(new.raw_user_meta_data->>'name',new.email),now(),now());
 RETURN new;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
CREATE FUNCTION public.unzit_immutable_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable launch snapshot' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='launch_reviews' THEN RAISE EXCEPTION 'Immutable review' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='launch_settings' THEN
  IF (to_jsonb(OLD)-'active') IS DISTINCT FROM (to_jsonb(NEW)-'active') THEN RAISE EXCEPTION 'Immutable settings' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='intake_revisions' THEN
  IF OLD."submittedAt" IS NOT NULL AND OLD IS DISTINCT FROM NEW THEN RAISE EXCEPTION 'Immutable intake' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='launch_check_ins' THEN
  IF OLD."submittedAt" IS NOT NULL AND (to_jsonb(OLD)-ARRAY['status','reviewedAt','patientMessage']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','reviewedAt','patientMessage']) THEN RAISE EXCEPTION 'Immutable submission' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.unzit_immutable_snapshot() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER launch_reviews_immutable BEFORE UPDATE OR DELETE ON public.launch_reviews FOR EACH ROW EXECUTE FUNCTION public.unzit_immutable_snapshot();
CREATE TRIGGER launch_settings_immutable BEFORE UPDATE OR DELETE ON public.launch_settings FOR EACH ROW EXECUTE FUNCTION public.unzit_immutable_snapshot();
CREATE TRIGGER intake_revisions_immutable BEFORE UPDATE OR DELETE ON public.intake_revisions FOR EACH ROW EXECUTE FUNCTION public.unzit_immutable_snapshot();
CREATE TRIGGER launch_check_ins_immutable BEFORE UPDATE OR DELETE ON public.launch_check_ins FOR EACH ROW EXECUTE FUNCTION public.unzit_immutable_snapshot();
CREATE INDEX identity_verifications_patient_latest_idx ON public.identity_verifications("patientId","attestedAt" DESC,id DESC);
CREATE INDEX intake_revisions_patient_latest_idx ON public.intake_revisions("patientId","createdAt" DESC,id DESC);
CREATE INDEX clinical_photo_sets_patient_latest_idx ON public.clinical_photo_sets("patientId","createdAt" DESC,id DESC);
CREATE INDEX billing_payments_patient_latest_idx ON public.billing_payments("patientId","confirmedAt" DESC,id DESC);
CREATE INDEX billing_operations_patient_latest_idx ON public.billing_operations("patientId","createdAt" DESC,id DESC);
CREATE INDEX launch_check_ins_patient_latest_idx ON public.launch_check_ins("patientId","dueAt" DESC,id DESC);
CREATE INDEX launch_reviews_patient_latest_idx ON public.launch_reviews("patientId","createdAt" DESC,id DESC);
CREATE INDEX billing_operations_pending_idx ON public.billing_operations(status,"nextAttemptAt",id);
CREATE INDEX launch_cases_queue_idx ON public.launch_cases("submittedAt",id) WHERE status = 'submitted';
ALTER TABLE public.care_form_responses ADD CONSTRAINT care_form_responses_owner_form_key UNIQUE (id,"formId","userId");
ALTER TABLE public.launch_check_ins ADD FOREIGN KEY ("formId","patientId") REFERENCES public.care_form_revisions(id,"userId") ON DELETE RESTRICT;
ALTER TABLE public.launch_check_ins ADD FOREIGN KEY ("responseId","formId","patientId") REFERENCES public.care_form_responses(id,"formId","userId") ON DELETE RESTRICT;
ALTER TABLE public.prescriptions ADD FOREIGN KEY ("launchCaseId","patientId") REFERENCES public.launch_cases(id,"patientId") ON DELETE RESTRICT;
CREATE FUNCTION public.unzit_review_target() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW."targetType"='case' THEN
  IF NEW."targetId" <> NEW."caseId" THEN RAISE EXCEPTION 'Invalid target' USING ERRCODE='23514'; END IF;
 ELSIF NEW."targetType"='identity' THEN
  IF NOT EXISTS (SELECT 1 FROM public.identity_verifications WHERE id=NEW."targetId" AND "caseId"=NEW."caseId" AND "patientId"=NEW."patientId") THEN RAISE EXCEPTION 'Invalid target' USING ERRCODE='23514'; END IF;
 ELSE
  IF NOT EXISTS (SELECT 1 FROM public.launch_check_ins c JOIN public.care_memberships m ON m.id=c."membershipId" WHERE c.id=NEW."targetId" AND c."patientId"=NEW."patientId" AND m."caseId"=NEW."caseId") THEN RAISE EXCEPTION 'Invalid target' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.unzit_review_target() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER launch_review_target BEFORE INSERT ON public.launch_reviews FOR EACH ROW EXECUTE FUNCTION public.unzit_review_target();
COMMIT;
