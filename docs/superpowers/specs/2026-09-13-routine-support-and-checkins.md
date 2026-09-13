# Routine support and clinician-configured check-ins

Second bounded release of docs/features/expansion.md. The owner confirmed clinician-authored forms with no default clinical questions. Build on immutable routine revisions and patient completion events; do not reinterpret legacy booleans as history.

## Routine templates

Clinicians manage their own reusable named templates with ordered title/instruction steps, using the existing routine editor's field limits and validation. A template has a stable UUID and optimistic version. Create/update retries use a stable mutation UUID, preserving exact body until resolved; stale versions show conflict and retain draft. Archive templates instead of deleting. Copying a template only populates a patient's routine draft; the clinician reviews it and explicitly saves a new patient routine revision. Later template edits never change patient assignments. No shared/public library or preset treatment content.

## Completion calendar

Patients and their assigned clinician can select one calendar month and see recorded morning/evening completions by the event's reported local date. Days without events say “Not recorded”; do not infer non-adherence or show scores/streaks. Day detail shows exact routine revision, reported date/timezone and received timestamp. A calendar month request is bounded and server-authorized, and navigation clears old data while loading. Existing offline completion outbox remains source of pending status; do not mix pending with server-recorded.

## Local reminders

Patients can enable morning/evening daily reminders and an optional weekly photo reminder with their own time/day choices. Request notification permission only after the user explicitly enables a reminder. Schedule through iOS local notifications; no remote push setup. Use generic notification text without patient names or clinical content. Persist preferences in protected account-specific storage, reconcile after sign-in/timezone change, and cancel ClearAF-owned pending reminders on sign-out/account change. Show denied permission/failed scheduling accurately; no “enabled” claim if scheduling failed. No clinician-set schedule or emergency monitoring claims.

## Structured check-ins

A clinician assigns a versioned form to a patient, with a title and 1–10 ordered questions. Supported types: short text (up to 2000 characters) or single choice (2–10 clinician-authored options). Each question has a stable UUID, prompt (1–300 characters), type, required boolean and stable option UUIDs/labels where applicable. Unique IDs, strict unknown-field rejection and field limits on server. No preset forms, symptoms, severity scales or clinical conclusions.

Form revisions immutable with expected previous revision conflict handling; inactive revision archives the form. Patient reads current active form and submits answers to the exact viewed revision using a stable client UUID and captured submission time. Reject answers to unknown questions/options, duplicates, missing required answers, oversize text and wrong patient; patient cannot change form definition. Submission is an immutable dated record and idempotent retries retain exact body. Offline/failed sends preserve drafts and stable attempt identity, with explicit pending/failed/sent states. No automatic resubmission to a replacement form. Clinician sees paginated submissions with original prompts/options/revision, never current-form relabeling. A replaced form's already-started response may be submitted against its active historical revision; do not accept a revision that was itself inactive.

## Shared boundaries and verification

All clinician reads/writes require current patient assignment and authoritative server role/session; serialize assignment-sensitive writes under patient-profile lock. Templates require author ownership. New public-schema tables enable RLS and deny anon/authenticated Data API access. No destructive migration or baseline-hash editing. Reuse Care Journal editor, record, empty/error/retry and native selector patterns. Clinical details stay off notification previews/logs/fixtures.

Acceptance: focused validation/authorization/idempotency/conflict tests; actual local additive migration and exact synthetic integration; template copy isolation; truthful date/month/calendar state; reminder fake scheduler covering opt-in, denial, account switch and failures; form-version/answer validation and draft retry; portal/iOS builds and one focused UI walkthrough. Record limits without repeating camera/T4 matrices. Release only working slices; retained demo remains usable.

## API contract

Paths are under authenticated `/api/care-support`; errors follow current sanitized middleware. Reuse `{data,pagination:{page,limit,total,totalPages}}` for lists; limits 1–50, stable timestamp/ID ordering.

Template DTO: `{id,version,name,steps:[{title,instructions}],isActive,updatedAt}`. Store immutable template revisions with stable mutation UUID `revisionId`; template ownership is clinician UUID. `GET /templates?page&limit` clinician-owned latest revisions. `PUT /templates/:templateId/revisions/:revisionId` clinician-only strict body `{expectedRevisionId:string|null,name,steps,isActive}`; returns `{template}` (201/200 exact retry,409 conflict). Use routine step/name validation. Template DTO additionally includes `revisionId`; list latest revisions including archived. Copy happens in client draft; existing routine save endpoint remains authoritative.

`GET /calendar?month=YYYY-MM` patient; `GET /patients/:patientId/calendar?month=YYYY-MM` clinician. Return `{month,days:[{localDate,morning:number,evening:number}]}` only days with server-recorded events. SQL groups completions by stored localDate and joined immutable routine slot, with inclusive month start/exclusive next month. `GET /calendar/events?localDate=YYYY-MM-DD&page&limit` patient and `/patients/:patientId/calendar/events` clinician return paginated completion+routine DTO already used by routine history. No client-derived completion success.

Form DTO: `{id,userId,version,createdBy,createdAt,title,isActive,questions:[{id,prompt,type:'text'|'choice',required,options:[{id,label}]}]}`. Empty options only for text; choice labels 1–160 characters; title 1–120. `GET /form` patient and `GET /patients/:patientId/form` clinician return `{form:Form|null}` latest revision including inactive. `PUT /patients/:patientId/forms/:revisionId` clinician body `{expectedRevisionId:string|null,title,isActive,questions}` → `{form}` 201/200; inactive can have zero questions; active requires1–10. Lock patient profile and compare latest immutable revision like routines.

Response DTO: `{id,userId,formId,submittedAt,receivedAt,answers:[{questionId,text?:string,optionId?:string}],form:Form}`. `PUT /responses/:responseId` patient body `{formId,submittedAt,answers}` → `{response}` 201/200 exact retry;409 different body. submittedAt valid ISO instant, at most5minutes future. Validate against referenced form and owner; honor historical active form responses. `GET /responses?page&limit` patient and `/patients/:patientId/responses` clinician list newest receivedAt then id. References always attach original form revision.

All new tables have explicit UUID FKs and constraints. Immutable template revisions keyed stable revision UUID, unique(templateId,version), owner on all versions. Patient form versions unique(userId,version). Responses reference exact form and owner via composite FK. No free-form owner/author fields accepted in mutation bodies. Template optimistic edits serialize on clinician row; patient writes serialize on patient profile. User-supplied names/questions/text remain text in both UIs.
