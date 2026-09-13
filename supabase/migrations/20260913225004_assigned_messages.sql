-- Additive native messaging; legacy messages remain preserved and are not imported.
CREATE TABLE public.assigned_messages (
 id uuid PRIMARY KEY,
 "patientId" uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 "clinicianId" uuid NOT NULL REFERENCES public.dermatologists(id) ON DELETE RESTRICT,
 "senderId" uuid NOT NULL,
 "senderType" text NOT NULL,
 "recipientId" uuid NOT NULL,
 "recipientType" text NOT NULL,
 content text NOT NULL CHECK(char_length(content) BETWEEN 1 AND 4000 AND content=btrim(content) AND char_length(btrim(content))>0),
 "sentAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "readAt" timestamp(3),
 origin text NOT NULL DEFAULT 'native' CHECK(origin='native'),
 "referenceType" text,
 "referenceId" uuid,
 CHECK (("senderType"='patient' AND "senderId"="patientId" AND "recipientType"='dermatologist' AND "recipientId"="clinicianId") OR ("senderType"='dermatologist' AND "senderId"="clinicianId" AND "recipientType"='patient' AND "recipientId"="patientId")),
 CHECK (("referenceType" IS NULL AND "referenceId" IS NULL) OR ("referenceType" IS NOT NULL AND "referenceType" IN ('photo','routineRevision') AND "referenceId" IS NOT NULL)),
 CHECK ("referenceId" IS NULL OR "senderType"='dermatologist')
);
CREATE INDEX assigned_messages_pair_page_idx ON public.assigned_messages("patientId","clinicianId","sentAt" DESC,id DESC);
CREATE INDEX assigned_messages_unread_idx ON public.assigned_messages("patientId","clinicianId","recipientId","recipientType") WHERE "readAt" IS NULL;
ALTER TABLE public.assigned_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assigned_messages FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.assigned_messages TO service_role;
