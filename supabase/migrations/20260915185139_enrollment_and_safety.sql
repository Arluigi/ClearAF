-- Release 1: eligibility screenings, consent acceptances, care decisions and urgent reports.
-- Backend-only clinical records. Additive; no seeded rows.
CREATE TABLE public.eligibility_screenings (
 id uuid PRIMARY KEY,
 "userId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 "stateCode" text NOT NULL CHECK ("stateCode" ~ '^([A-Z]{2}|NON_US)$'),
 "dateOfBirth" date NOT NULL,
 "pregnancyStatus" text NOT NULL CHECK ("pregnancyStatus" IN ('none','pregnant','trying_to_conceive','breastfeeding')),
 eligible boolean NOT NULL,
 reasons text[] NOT NULL DEFAULT '{}' CHECK (reasons <@ ARRAY['state','age','pregnancy','breastfeeding']::text[]),
 flags text[] NOT NULL DEFAULT '{}' CHECK (flags <@ ARRAY['trying_to_conceive']::text[]),
 "rulesVersion" text NOT NULL CHECK (char_length("rulesVersion") BETWEEN 1 AND 40),
 "submittedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "waitlistRequestedAt" timestamp(3),
 CHECK (eligible = (cardinality(reasons) = 0)),
 CHECK ("waitlistRequestedAt" IS NULL OR NOT eligible)
);
CREATE INDEX eligibility_screenings_user_latest_idx ON public.eligibility_screenings("userId","submittedAt" DESC,id DESC);
CREATE TABLE public.consent_acceptances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 "userId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 "documentVersion" integer NOT NULL CHECK ("documentVersion" > 0),
 "documentSha256" text NOT NULL CHECK ("documentSha256" ~ '^[a-f0-9]{64}$'),
 "acceptedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT consent_acceptances_user_version_key UNIQUE ("userId","documentVersion")
);
CREATE TABLE public.care_decisions (
 id uuid PRIMARY KEY,
 "patientId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 "clinicianId" uuid NOT NULL REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
 decision text NOT NULL CHECK (decision IN ('async_care','refer_out','needs_in_person')),
 "patientMessage" text CHECK ("patientMessage" IS NULL OR (char_length("patientMessage") BETWEEN 1 AND 2000 AND "patientMessage" = btrim("patientMessage"))),
 "photoId" uuid,
 "refundStatus" text NOT NULL CHECK ("refundStatus" IN ('not_applicable','pending','issued')),
 "refundUpdatedAt" timestamp(3),
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((decision = 'async_care') = ("refundStatus" = 'not_applicable')),
 CHECK (("refundStatus" = 'issued') = ("refundUpdatedAt" IS NOT NULL))
);
CREATE INDEX care_decisions_patient_latest_idx ON public.care_decisions("patientId","createdAt" DESC,id DESC);
CREATE TABLE public.urgent_reports (
 id uuid PRIMARY KEY,
 "patientId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 "clinicianId" uuid NOT NULL REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
 category text NOT NULL CHECK (category IN ('reaction_to_treatment','rapid_worsening','pain_or_infection','other')),
 description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 2000 AND description = btrim(description)),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
 "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "acknowledgedAt" timestamp(3),
 "acknowledgedBy" uuid REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
 "resolvedAt" timestamp(3),
 "resolvedBy" uuid REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
 "resolutionNote" text CHECK ("resolutionNote" IS NULL OR (char_length("resolutionNote") BETWEEN 1 AND 2000 AND "resolutionNote" = btrim("resolutionNote"))),
 CHECK ((status = 'open') = ("acknowledgedAt" IS NULL)),
 CHECK (("acknowledgedAt" IS NULL) = ("acknowledgedBy" IS NULL)),
 CHECK ((status = 'resolved') = ("resolvedAt" IS NOT NULL)),
 CHECK (("resolvedAt" IS NULL) = ("resolvedBy" IS NULL)),
 CHECK ("resolutionNote" IS NULL OR "resolvedAt" IS NOT NULL)
);
CREATE INDEX urgent_reports_patient_latest_idx ON public.urgent_reports("patientId","createdAt" DESC,id DESC);
CREATE INDEX urgent_reports_unresolved_idx ON public.urgent_reports("patientId",status,"createdAt") WHERE status <> 'resolved';
ALTER TABLE public.eligibility_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgent_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eligibility_screenings,public.consent_acceptances,public.care_decisions,public.urgent_reports FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.eligibility_screenings,public.consent_acceptances,public.care_decisions,public.urgent_reports TO service_role;
