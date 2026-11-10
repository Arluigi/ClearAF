BEGIN;
DROP TRIGGER launch_check_ins_immutable ON public.launch_check_ins;
-- Persist original occurrence boundaries so overdue obligations survive later plan switches.
ALTER TABLE public.launch_check_ins ADD COLUMN "captureAfter" timestamp(3);
UPDATE public.launch_check_ins c SET "captureAfter"=COALESCE((SELECT p."dueAt" FROM public.launch_check_ins p WHERE p."membershipId"=c."membershipId" AND p."cadenceAnchor"=c."cadenceAnchor" AND p.ordinal=c.ordinal-1),c."cadenceAnchor");
ALTER TABLE public.launch_check_ins ALTER COLUMN "captureAfter" SET NOT NULL;
-- A launch form is independently assigned/versioned and cannot be answered through the legacy form endpoint.
ALTER TABLE public.care_form_revisions ADD COLUMN "launchManaged" boolean NOT NULL DEFAULT false;
ALTER TABLE public.care_form_revisions ADD COLUMN "launchContentHash" text;
ALTER TABLE public.care_form_revisions ADD COLUMN "launchContentVersion" text;
ALTER TABLE public.care_form_revisions ADD CHECK (NOT "launchManaged" OR ("launchContentHash" IS NOT NULL AND "launchContentVersion" IS NOT NULL));
CREATE TABLE public.launch_check_in_submissions (
 "responseId" uuid PRIMARY KEY,
 "checkInId" uuid NOT NULL,
 "patientId" uuid NOT NULL,
 "formId" uuid NOT NULL,
 "photoSetId" uuid NOT NULL UNIQUE,
 answers jsonb NOT NULL CHECK (jsonb_typeof(answers)='object' AND octet_length(answers::text)<=8000),
 "submittedAt" timestamp(3) NOT NULL,
 "requestHash" text NOT NULL,
 FOREIGN KEY ("checkInId","patientId") REFERENCES public.launch_check_ins(id,"patientId") ON DELETE RESTRICT,
 FOREIGN KEY ("responseId","formId","patientId") REFERENCES public.care_form_responses(id,"formId","userId") ON DELETE RESTRICT,
 FOREIGN KEY ("photoSetId","patientId") REFERENCES public.clinical_photo_sets(id,"patientId") ON DELETE RESTRICT
);
ALTER TABLE public.launch_check_in_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_check_in_submissions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.launch_check_in_submissions TO service_role;
CREATE INDEX launch_check_in_submissions_history_idx ON public.launch_check_in_submissions("checkInId","submittedAt","responseId");
-- Preserve any already-submitted local records when upgrading; no response or photo history is rewritten.
INSERT INTO public.launch_check_in_submissions("responseId","checkInId","patientId","formId","photoSetId",answers,"submittedAt","requestHash")
 SELECT "responseId",id,"patientId","formId","photoSetId",answers,"submittedAt",'legacy-migration'
 FROM public.launch_check_ins WHERE "submittedAt" IS NOT NULL AND "responseId" IS NOT NULL AND "photoSetId" IS NOT NULL AND answers IS NOT NULL;
CREATE FUNCTION public.unzit_check_in_attempt_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Immutable check-in attempt' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.clinical_photo_sets s WHERE s.id=NEW."photoSetId" AND s."patientId"=NEW."patientId" AND s."checkInId"=NEW."checkInId" AND s.purpose='check_in' AND s.status='submitted') THEN RAISE EXCEPTION 'Invalid check-in photo snapshot' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.unzit_check_in_attempt_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER launch_check_in_submissions_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.launch_check_in_submissions FOR EACH ROW EXECUTE FUNCTION public.unzit_check_in_attempt_guard();
-- Replace only the launch check-in trigger. Other existing immutable snapshot guards remain unchanged.
CREATE FUNCTION public.unzit_check_in_projection_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable check-in history' USING ERRCODE='23514'; END IF;
 IF OLD."submittedAt" IS NOT NULL THEN
  IF (to_jsonb(OLD)-ARRAY['status','reviewedAt','patientMessage','responseId','photoSetId','answers','submittedAt']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','reviewedAt','patientMessage','responseId','photoSetId','answers','submittedAt']) THEN RAISE EXCEPTION 'Immutable check-in identity' USING ERRCODE='23514'; END IF;
  IF (OLD."responseId",OLD."photoSetId",OLD.answers,OLD."submittedAt") IS DISTINCT FROM (NEW."responseId",NEW."photoSetId",NEW.answers,NEW."submittedAt") THEN
   IF NEW."submittedAt" IS NULL OR NEW."responseId" IS NULL OR NEW."photoSetId" IS NULL OR NEW.answers IS NULL OR OLD.status<>'needs_changes' OR NEW.status<>'submitted' OR NEW."responseId" IS NOT DISTINCT FROM OLD."responseId" OR NEW."submittedAt"<OLD."submittedAt" THEN RAISE EXCEPTION 'Invalid correction transition' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 IF NEW."submittedAt" IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM public.launch_check_in_submissions s WHERE s."responseId"=NEW."responseId" AND s."checkInId"=NEW.id AND s."patientId"=NEW."patientId" AND s."formId"=NEW."formId" AND s."photoSetId"=NEW."photoSetId" AND s.answers=NEW.answers AND s."submittedAt"=NEW."submittedAt") THEN RAISE EXCEPTION 'Missing immutable check-in attempt' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.unzit_check_in_projection_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER launch_check_ins_immutable BEFORE UPDATE OR DELETE ON public.launch_check_ins FOR EACH ROW EXECUTE FUNCTION public.unzit_check_in_projection_guard();

COMMIT;
