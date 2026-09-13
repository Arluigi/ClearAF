-- Backend-only immutable clinical assignments and self-reported completion events.
-- Legacy routines and routine_steps deliberately remain untouched.
CREATE TABLE public.care_routine_revisions (
  id uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  "timeOfDay" text NOT NULL CHECK ("timeOfDay" IN ('morning', 'evening')),
  version integer NOT NULL CHECK (version > 0),
  "createdBy" uuid NOT NULL REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  "isActive" boolean NOT NULL,
  steps jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 20),
  CHECK (NOT "isActive" OR jsonb_array_length(steps) > 0),
  CONSTRAINT "care_routine_revisions_userId_timeOfDay_version_key" UNIQUE ("userId", "timeOfDay", version),
  CONSTRAINT "care_routine_revisions_id_userId_key" UNIQUE (id, "userId")
);
CREATE INDEX "care_routine_revisions_createdBy_idx" ON public.care_routine_revisions ("createdBy");
CREATE TABLE public.care_routine_completions (
  id uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  "revisionId" uuid NOT NULL,
  "completedAt" timestamp(3) NOT NULL CHECK (isfinite("completedAt")),
  "localDate" text NOT NULL CHECK ("localDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  "timeZone" text NOT NULL CHECK (char_length("timeZone") BETWEEN 1 AND 100),
  "receivedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "care_routine_completions_revisionId_userId_fkey" FOREIGN KEY ("revisionId", "userId") REFERENCES public.care_routine_revisions(id, "userId") ON DELETE RESTRICT,
  CONSTRAINT "care_routine_completions_userId_revisionId_localDate_key" UNIQUE ("userId", "revisionId", "localDate")
);
CREATE INDEX "care_routine_completions_userId_receivedAt_id_idx" ON public.care_routine_completions ("userId", "receivedAt", id);
CREATE INDEX "care_routine_completions_revisionId_userId_idx" ON public.care_routine_completions ("revisionId", "userId");
ALTER TABLE public.care_routine_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_routine_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.care_routine_revisions, public.care_routine_completions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.care_routine_revisions, public.care_routine_completions TO service_role;
