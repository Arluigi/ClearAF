-- Backend-only immutable templates, clinician-authored forms, and dated responses.
CREATE TABLE public.care_template_revisions (
 id uuid PRIMARY KEY,
 "templateId" uuid NOT NULL,
 "ownerId" uuid NOT NULL REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0),
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 120),
 steps jsonb NOT NULL CHECK(jsonb_typeof(steps)='array' AND jsonb_array_length(steps)<=20),
 "isActive" boolean NOT NULL,
 "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(NOT "isActive" OR jsonb_array_length(steps)>0),
 CONSTRAINT "care_template_revisions_templateId_version_key" UNIQUE("templateId",version)
);
CREATE INDEX "care_template_revisions_ownerId_updatedAt_id_idx" ON public.care_template_revisions("ownerId","updatedAt",id);
CREATE TABLE public.care_form_revisions (
 id uuid PRIMARY KEY,
 "userId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0),
 "createdBy" uuid NOT NULL REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 title text NOT NULL CHECK(char_length(btrim(title)) BETWEEN 1 AND 120),
 "isActive" boolean NOT NULL,
 questions jsonb NOT NULL CHECK(jsonb_typeof(questions)='array' AND jsonb_array_length(questions)<=10),
 CHECK(NOT "isActive" OR jsonb_array_length(questions)>0),
 CONSTRAINT "care_form_revisions_userId_version_key" UNIQUE("userId",version),
 CONSTRAINT "care_form_revisions_id_userId_key" UNIQUE(id,"userId")
);
CREATE INDEX "care_form_revisions_createdBy_idx" ON public.care_form_revisions("createdBy");
CREATE TABLE public.care_form_responses (
 id uuid PRIMARY KEY,
 "userId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 "formId" uuid NOT NULL,
 "submittedAt" timestamp(3) NOT NULL CHECK(isfinite("submittedAt")),
 "receivedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 answers jsonb NOT NULL CHECK(jsonb_typeof(answers)='array' AND jsonb_array_length(answers)<=10),
 CONSTRAINT "care_form_responses_formId_userId_fkey" FOREIGN KEY("formId","userId") REFERENCES public.care_form_revisions(id,"userId") ON DELETE RESTRICT
);
CREATE INDEX "care_form_responses_userId_receivedAt_id_idx" ON public.care_form_responses("userId","receivedAt",id);
CREATE INDEX "care_form_responses_formId_userId_idx" ON public.care_form_responses("formId","userId");
ALTER TABLE public.care_template_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_form_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_form_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.care_template_revisions,public.care_form_revisions,public.care_form_responses FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.care_template_revisions,public.care_form_revisions,public.care_form_responses TO service_role;
