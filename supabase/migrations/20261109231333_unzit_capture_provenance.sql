BEGIN;
ALTER TABLE public.skin_photos ADD COLUMN "launchTargetType" text,
 ADD COLUMN "launchTargetId" uuid, ADD COLUMN "launchRequestHash" text;
ALTER TABLE public.skin_photos ADD CHECK (
 ("launchTargetType" IS NULL AND "launchTargetId" IS NULL AND "launchRequestHash" IS NULL) OR
 ("launchTargetType" IS NOT NULL AND "launchRequestHash" IS NOT NULL AND "launchTargetType" IN ('enrollment','check_in') AND "launchTargetId" IS NOT NULL AND "launchRequestHash" ~ '^[a-f0-9]{64}$')
);
CREATE FUNCTION public.unzit_capture_target() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF TG_OP='UPDATE' AND OLD."launchTargetType" IS NOT NULL AND
 (OLD."launchTargetType",OLD."launchTargetId",OLD."launchRequestHash",OLD."userId",OLD."photoUrl",OLD."captureDate") IS DISTINCT FROM
 (NEW."launchTargetType",NEW."launchTargetId",NEW."launchRequestHash",NEW."userId",NEW."photoUrl",NEW."captureDate") THEN
  RAISE EXCEPTION 'Immutable launch capture' USING ERRCODE='23514';
 END IF;
 IF NEW."launchTargetType"='enrollment' AND NOT EXISTS (SELECT 1 FROM public.launch_cases WHERE id=NEW."launchTargetId" AND "patientId"=NEW."userId") OR
 NEW."launchTargetType"='check_in' AND NOT EXISTS (SELECT 1 FROM public.launch_check_ins WHERE id=NEW."launchTargetId" AND "patientId"=NEW."userId") THEN
  RAISE EXCEPTION 'Invalid launch capture target' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.unzit_capture_target() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER unzit_capture_target BEFORE INSERT OR UPDATE ON public.skin_photos FOR EACH ROW EXECUTE FUNCTION public.unzit_capture_target();
CREATE FUNCTION public.unzit_photo_item_target() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.clinical_photo_sets s JOIN public.skin_photos p ON p.id=NEW."photoId" AND p."userId"=NEW."patientId" WHERE s.id=NEW."setId" AND s."patientId"=NEW."patientId" AND p."launchTargetType"=s.purpose AND p."launchTargetId"=COALESCE(s."caseId",s."checkInId") AND p."launchRequestHash" IS NOT NULL) THEN
  RAISE EXCEPTION 'Invalid launch photo provenance' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.unzit_photo_item_target() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER unzit_photo_item_target BEFORE INSERT OR UPDATE ON public.clinical_photo_set_items FOR EACH ROW EXECUTE FUNCTION public.unzit_photo_item_target();
COMMIT;
