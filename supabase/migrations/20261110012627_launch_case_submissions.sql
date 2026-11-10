BEGIN;
CREATE TABLE public.launch_case_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "caseId" uuid NOT NULL,
 "patientId" uuid NOT NULL,
 "caseRevision" integer NOT NULL CHECK ("caseRevision">0),
 "settingsVersion" integer NOT NULL REFERENCES public.launch_settings(version) ON DELETE RESTRICT,
 "submittedAt" timestamp(3) NOT NULL,
 snapshot jsonb NOT NULL CHECK (
  jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=524288
  AND snapshot ?& ARRAY['case','references','consents']
  AND jsonb_typeof(snapshot->'case')='object'
  AND jsonb_typeof(snapshot->'references')='object'
  AND jsonb_typeof(snapshot->'consents')='array' AND jsonb_array_length(snapshot->'consents')=4
  AND NOT jsonb_path_exists(snapshot,'$.**.url')
  AND NOT jsonb_path_exists(snapshot,'$.**.idPhotoPath')
  AND NOT jsonb_path_exists(snapshot,'$.**.selfiePath')
 ),
 CONSTRAINT launch_case_submissions_case_revision_key UNIQUE ("caseId","caseRevision"),
 FOREIGN KEY ("caseId","patientId") REFERENCES public.launch_cases(id,"patientId") ON DELETE RESTRICT
);
ALTER TABLE public.launch_case_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_case_submissions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.launch_case_submissions TO service_role;
CREATE INDEX launch_case_submissions_patient_history_idx ON public.launch_case_submissions("patientId","submittedAt",id);

-- Preserve only verifiable CURRENT final packages. The source label explicitly avoids claiming
-- that this reconstructs any older package, correction, or historical review revision.
-- Editable corrections and unpinned/missing publications are deliberately not backfilled.
INSERT INTO public.launch_case_submissions("caseId","patientId","caseRevision","settingsVersion","submittedAt",snapshot)
SELECT c.id,c."patientId",c.revision,c."settingsVersion",c."submittedAt",
 jsonb_build_object('formatVersion',1,'source','migration_current_projection',
  'references',jsonb_build_object('identityId',c."identityId",'intakeId',c."intakeId",'photoSetId',c."photoSetId"),
  'case',(to_jsonb(c)-ARRAY['patientId','rulesVersion','settingsVersion','identityId','intakeId','photoSetId','createdAt']) ||
   jsonb_build_object('identity',to_jsonb(v)-ARRAY['caseId','patientId','idPhotoPath','selfiePath','requestHash'],
    'medicalHistory',i.answers,'questionnaireVersion',i."questionnaireVersion",'photoSet',
     (to_jsonb(p)-ARRAY['patientId','caseId','checkInId','createdAt']) || jsonb_build_object('items',
      COALESCE((SELECT jsonb_agg(jsonb_build_object('slot',x.slot,'photoId',x."photoId",'captureId',x."captureId") ORDER BY x.slot)
       FROM public.clinical_photo_set_items x WHERE x."setId"=p.id),'[]'::jsonb))),
  'consents',receipts.docs)
FROM public.launch_cases c
JOIN public.launch_settings s ON s.version=c."settingsVersion"
JOIN public.identity_verifications v ON v.id=c."identityId" AND v."patientId"=c."patientId" AND v."caseId"=c.id
JOIN public.intake_revisions i ON i.id=c."intakeId" AND i."patientId"=c."patientId" AND i."caseId"=c.id AND i."submittedAt" IS NOT NULL
JOIN public.clinical_photo_sets p ON p.id=c."photoSetId" AND p."patientId"=c."patientId" AND p."caseId"=c.id AND p.status='submitted'
CROSS JOIN LATERAL (
 SELECT jsonb_agg(d.doc || jsonb_build_object('acceptedAt',r."acceptedAt") ORDER BY d.doc->>'key') AS docs,
  count(*) AS count,count(DISTINCT d.doc->>'key') AS distinct_keys
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.content->'consents')='array' THEN s.content->'consents' ELSE '[]'::jsonb END) AS d(doc)
 JOIN public.consent_acceptances r ON r."userId"=c."patientId" AND r."documentKey"=d.doc->>'key'
  AND r."documentVersion"::text=d.doc->>'version' AND r."documentSha256"=d.doc->>'sha256'
 WHERE d.doc->>'key' IN ('telehealth','medication','privacy_notice','subscription_terms')
  AND jsonb_typeof(d.doc->'body')='string'
  AND encode(sha256(convert_to(d.doc->>'body','UTF8')),'hex')=d.doc->>'sha256'
  AND r."acceptedAt"<=c."submittedAt"
) receipts
WHERE c.status IN ('submitted','approved','rejected') AND c."submittedAt" IS NOT NULL
 AND c.revision>0 AND receipts.count=4 AND receipts.distinct_keys=4
 AND jsonb_array_length(s.content->'consents')=4;

CREATE FUNCTION public.unzit_case_submission_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.launch_cases;
BEGIN
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Immutable case submission' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM public.launch_cases WHERE id=NEW."caseId" AND "patientId"=NEW."patientId";
 IF NOT FOUND OR c.status<>'submitted' OR c.revision<>NEW."caseRevision"
  OR c."settingsVersion" IS DISTINCT FROM NEW."settingsVersion" OR c."submittedAt" IS DISTINCT FROM NEW."submittedAt"
  OR NEW.snapshot->'case'->>'id' IS DISTINCT FROM c.id::text
  OR NEW.snapshot->'case'->>'revision' IS DISTINCT FROM c.revision::text
  OR NEW.snapshot->'references' IS DISTINCT FROM jsonb_build_object('identityId',c."identityId",'intakeId',c."intakeId",'photoSetId',c."photoSetId")
 THEN RAISE EXCEPTION 'Invalid current case package' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.unzit_case_submission_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER launch_case_submissions_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.launch_case_submissions FOR EACH ROW EXECUTE FUNCTION public.unzit_case_submission_guard();
COMMIT;
