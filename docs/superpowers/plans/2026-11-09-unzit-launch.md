# UNZIT launch implementation plan — December 1, 2026

## Orchestrator amendments (Nov 9) — these OVERRIDE anything below that conflicts

Scope is a closed launch in three weeks. Prefer the simplest design that is safe.

1. **Billing is Stripe Checkout in `subscription` mode, plus the Stripe Customer Portal.** No prepaid-payment allocation, no "subscription created at approval", no invoice attach (drop that part of A5 and its spike).
   - At the payment step, `POST /billing/checkout` creates a Checkout Session (mode=subscription, server-side price ID from `launch_settings`, `client_reference_id`=membership id, metadata = opaque ids only). The billing period starts at payment.
   - `checkout.session.completed` / `customer.subscription.*` / `invoice.*` webhooks (signed, event id stored once) update `care_memberships` (status, planId, currentPeriodEnd, cancelAtPeriodEnd, paidThrough). Webhooks are the source of truth. The return URL only triggers a refresh.
   - Rejection at review → refund the latest paid invoice's charge in full and cancel the subscription immediately (durable `billing_operations` row, retried by `reconcile-billing.cjs`).
   - Cancel and plan switch → `POST /billing/portal` returns a Customer Portal session URL (portal is configured for cancel-at-period-end and switching between the two prices with `always_invoice` proration). Drop `/billing/cancel` and `/billing/switch` endpoints. When a webhook shows a plan change, re-anchor cadence from the change time. If the new plan is All-In and there is no NC shipping address, or Care with no own pharmacy, set `destinationRequired=true` on the membership; the app then asks for it via `PUT /enrollment/:caseId/destination`.
   - Cadence anchors at **clinical approval**, independent of the billing anchor.
   - Membership statuses: `awaiting_payment | paid_pending_review | active | past_due | ended | rejected`. Drop `activating` and `Operation`/`/billing/operations/*` polling except a simple `GET /billing` refresh. Keep the fake adapter for local tests (it simulates the webhooks).
2. **Idempotency:** use client-generated ids on PUT (existing repo pattern) plus `expectedRevision`. Drop the generic `launch_request_receipts` table and the `Idempotency-Key` header requirement.
3. **Cadence:** accept the proposed rule (Care monthly from approval; All-In weekly days +7…+56 replacing monthly, then monthly from day 56).
4. **Check-in questions:** the five topics only (plus the two detail text fields). No adherence question.
5. **Location:** NC attestation only. No IP geolocation. Care may use any US pharmacy.
6. **Clinical/legal content isn't signed yet.** Build with the current DRAFT text from sources.md, clearly marked DRAFT with version `0.9-draft`, stored so the real text can be published as a new version without code changes. Do not block on it.
7. **Templates:** seed the six from sources.md as DRAFT clinician templates.
8. Leave `/billing/fake/...` dev-only as planned. Everything else in the plan stands.

Execution: three engineers work in parallel in separate worktrees (A: backend, B: iOS, C: portal) against the shapes in this file (as amended). A1 still encodes the contract in backend; B and C mirror it from this document. Commit after each task with a conventional message.

## Inventory against the eight final decisions

Inspected November 9 on `feature/unzit-launch-prep`. Paths are relative to this worktree.
“Exists” means source exists, not clinical approval or production verification. Final decisions in the request supersede drafts in `sources.md` and older expansion decisions.

| Decision | Backend and migrations already present | iOS already present | Portal already present | Missing / reuse boundary |
|---|---|---|---|---|
| 1. Care $39 / All-In $89, server prices, Vida bills clinic | `backend/prisma/schema.prisma` has Product and a product-delivery Subscription; `backend/src/routes/products.ts`; `supabase/migrations/20260910183704_application_baseline.sql`. Existing routines/messaging are reusable care capabilities. | `ClearAF/Views/RoutineView.swift`, `MessagingView.swift`, `Services/RoutineRepository.swift`, `MessagingRepository.swift`; DEBUG plan/payment sketches in `Views/Prototype/PhotoAndPaymentPrototypes.swift`. | `web-portal/src/components/patients/PatientRoutineCare.tsx`, `src/components/messages/ConversationView.tsx`, `src/app/templates/page.tsx`. | No membership catalog, settings, payment entitlement or shipping model. Legacy Subscription requires a Product and models deliveries: preserve it; add a care membership. No Vida API or patient billing integration. |
| 2. Stripe, refund rejection, period-end cancel, immediate prorated switches | No Stripe dependency in `backend/package.json`, payment routes or payment ledger. `backend/src/services/careDecisions.ts` and `routes/care-decisions.ts` record pending/issued manually; same enrollment migration below stores refund status. | `ClearAF/Views/CareStatusCard.swift` displays refund records; `ProfileView.swift` has no billing controls. Prototype payment UI has no processor. | `web-portal/src/components/patients/CareDecisionDialog.tsx`, `CareStatusCard.tsx`; “issued” currently means a clinician marked it, not money moved. | Add provider adapter, Stripe test integration, local fake, durable webhook/operation processing and billing controls. Reuse care decisions, replace manual refund confirmation for launch payments. |
| 3a. Four consents, identity, NC, E1–E4 before payment | `backend/src/services/enrollment.ts`, `enrollmentRules.ts`, `enrollmentValidation.ts`, `routes/enrollment.ts`, `middleware/enrollmentGate.ts`; `src/content/consent.ts` contains ONE immutable hashed DRAFT. `supabase/migrations/20260915185139_enrollment_and_safety.sql` creates EligibilityScreening and ConsentAcceptance. Defaults allow CA/FL/IL/NY/TX and reject pregnancy/breastfeeding. | `ClearAF/Services/EnrollmentModels.swift`, `EnrollmentRepository.swift`, `Views/EnrollmentView.swift`; `ContentView.swift` routes legacy screening → consent → onboarding. `Views/Prototype/EnrollmentPrototypes.swift` is DEBUG scaffolding. | `web-portal/src/lib/enrollment.ts`, `src/components/patients/EnrollmentStatus.tsx` show a legacy screening/consent summary. | Extend versioned acceptances to four document identities; add case state, ID/selfie and current-location evidence. New launch rules: NC, 18+, E1/E2 stops; E3/E4 flags, not pregnancy rejection. Retain legacy DTOs. |
| 3b. Paid M1–M22 + medication preference, photo set, destinations, submitted | No fixed medical intake. `backend/src/services/careSupport.ts` / `careSupportValidation.ts` implement versioned clinician forms capped at TEN text/choice questions; do not stretch this into 23-question enrollment. `routes/photos.ts`, `services/photoCapture.ts`, `photoAccess.ts`, `photoThumbnail.ts` support durable individual captures/private reads. | `ClearAF/Views/OnboardingView.swift` is introductory onboarding, not medical history. `PhotoCaptureManager.swift`, `PhotoReviewSheet.swift`, `Services/PhotoRepository.swift` provide capture/retry. DEBUG photo/submitted prototypes exist. | `web-portal/src/app/patients/[id]/page.tsx`, `PatientPhotoHistory.tsx`, `workspace/PhotoCompareView.tsx` provide chart/photos; no fixed intake or destination review. | Add typed versioned intake, angle/site grouping and submission completeness, own-pharmacy/NC address. Reuse captures and chart, isolate identity from skin photos. Existing photo gate otherwise deadlocks pre-enrollment uploads. |
| 4. Monthly; All-In weekly weeks 1–8; photos + questions in queue; no score | `backend/src/services/careSupport.ts`, `routes/care-support.ts`; `supabase/migrations/20260913222507_care_support.sql` stores CareFormRevision/Response. `services/worklist.ts`, `photoReview.ts`; `20260913220545_photo_reviews.sql` supplies photo review. Existing forms have no cadence, photo requirement or response review status. Legacy score/streak fields/mutations remain in `routes/photos.ts`, `dashboard.ts`, `users.ts` and baseline schema. | `ClearAF/Services/CheckInRepository.swift`, `CareSupportModels.swift`, `Views/CheckInView.swift` have account-scoped drafts/retries/history. `Services/LaunchFlags.swift` currently hides clinician forms AND adherence calendar; `DashboardViewEnhanced.swift` respects that flag. | `web-portal/src/components/care-support/PatientCheckIns.tsx`, `CheckInViews.tsx`, `FormEditor.tsx`; `src/components/patients/worklist/*` and `src/lib/worklist.ts` show photo/urgent queues, not complete check-in reviews. | Wrap existing form responses in scheduled photo-set check-ins; expose launch check-ins independently of hidden arbitrary forms. Reuse review views and paging; add case/check-in queue entries. Disable launch score/streak writes, preserve old response keys. |
| 5. ID/intake/check-in review; record TreatRx prescription sent | `backend/src/routes/prescriptions.ts` already creates/reads/patches assigned-patient chart records; Prescription has medicationName/dosage/instructions/pharmacy/prescribedDate in baseline SQL/Prisma. `careDecisions.ts` supports async_care/refer_out/needs_in_person. `routineCare.ts` and `20260912212136_clinician_routines.sql` provide versioned AM/PM plans. | Routine and care-status views exist, but no integrated prescription-sent list. Existing photo/plan/message histories should remain. | `src/app/prescriptions/page.tsx` redirects to patients; workspace/routine template picker/editor already work. No ID comparison, full intake, or prescription-sent recorder. | Extend Prescription with explicit strength/date-sent/source fields and add a chart recorder. Reuse decisions, templates and photo review. TreatRx transmission stays outside the app; no automated prescribing or Vida integration. |
| 6. Waitlist email allowlist at account creation | `backend/src/routes/auth-supabase.ts` only syncs profiles; signup goes directly to Supabase Auth. `20260910183704_application_baseline.sql` defines `public.handle_new_user()` and `on_auth_user_created`; they currently create every signup's profile. No allowlist/importer. | `ClearAF/Services/SupabaseService.swift`, `Views/AuthenticationView.swift` provide signup/confirmation/recovery. | `web-portal/src/app/login/page.tsx`, `src/lib/auth.tsx` verify clinician role; `src/app/register/page.tsx` is not public clinician provisioning. | Enforce allowlist in the Auth creation transaction, not a bypassable iOS/API preflight. Add idempotent CSV importer with normalized exact emails; existing ineligibility waitlist requests are a different feature. |
| 7. Review within 1 to 2 business days | Existing content is mostly generic; `backend/src/content/consent.ts` is still a ClearAF DRAFT. No central launch turnaround contract. | Prototype submitted copy already says “within 1 to 2 business days”; production has no submitted-case state. | Existing review tools/quick replies, but no launch case turnaround display. | Add canonical server copy and replace conflicting launch copy in each owned surface. Never translate into 24/48 elapsed hours. Emergency guidance remains immediate. |
| 8. Preserve hosting/org/bundle/Letterpress | `backend/src/server.ts`, `supabase/config.toml`, existing migrations/deployment setup remain foundations. | UNZIT branding already exists; `ClearAF/Config/SupabaseConfig.swift` and project retain current identity; all `Views/Prototype/*` are DEBUG-only. | Existing UNZIT brand components and `src/app/globals.css` retain Letterpress. | No Cloud Run, Paubox, bundle-ID or Supabase-org move; no colour/UI redesign, website implementation, distribution or deployment tasks here. |

Inventory sources: `CLAUDE.md`, `docs/design/design-language.md`, `docs/features/expansion.md`, `docs/handoff/README.md`, and the supplied `scratchpad/reports/{sources,repo}.md` (absolute scratchpad path in the request). The older survey predates this worktree's branding/prototypes/LaunchFlags; current source takes precedence for those details.

## Chunk 1: contract and parallel implementation

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` when implementing. This document is planning only; do not execute its commands during this planning session.

**Goal:** Build closed-waitlist enrollment and subscription care for the December 1 launch, extending the existing API, iOS app and clinician chart.
**Architecture:** One Express API remains the only gateway to application data and Storage. Add launch-specific case orchestration around existing eligibility, consent, capture, care-form, routine, decision and prescription services; use additive `/api/launch` endpoints to avoid changing installed clients' DTOs.
**Stack:** Express/TypeScript/zod, Prisma query client, Supabase Postgres/Auth/private Storage; SwiftUI iOS 18.5+; Next 15/React 19; Stripe hosted Checkout and Billing behind an injectable adapter.

### Ownership, order and working rules

- A owns **all** `backend/**`, `supabase/**` and `scripts/**` changes below, including contracts, manifests/lockfile, examples, migrations and recovery fixtures. No client files.
- B owns **all** `ClearAF/**`, `ClearAFTests/**` and `ClearAF.xcodeproj/project.pbxproj` changes below. Never open or edit `ClearAF/Config/Local.generated.xcconfig`. No backend or portal files.
- C owns **all** `web-portal/**` changes below, including `src/types/api.ts`. No backend/iOS files. No shared generated source or cross-owned fixtures.
- A1 freezes the wire contract first. B1/C1 then copy the shapes into their owned models and mock transports; A2–A10, B2–B7 and C2–C6 can proceed concurrently across workstreams. Tasks within one workstream are sequential because they deliberately reuse its files.
- Any contract correction is coordinated through A1, then mirrored by B1/C1 before integration. Add fields/endpoints; do not delete or rename old fields/status values. The plan itself is the initial common reference.
- Write focused failing tests, implement the named behavior, then run the stated verification; “pass” means exit 0 and the acceptance assertions below. No bulk rewrites/refactors or tests that only grep implementation text.
- Never read/print `.env*` except `.env.example`, or generated local xcconfig. Runtime services may load their configured secrets normally. Use synthetic `@example.invalid` identities only; no CSV contents, ID images, intake answers, tokens, signed URLs or Stripe client secrets in logs.
- Every patient route derives patient identity from the confirmed live session; every clinician read/write rechecks current assignment inside the transaction/lock. No role/assignment from request metadata. Urgent reporting, account recovery and billing cancellation remain reachable outside paid clinical-write gates.

### Contract conventions and state machine

All paths below start `/api/launch`; UUIDs are lowercase JSON strings, timestamps ISO-8601 UTC, dates `YYYY-MM-DD`, amounts integer USD cents. Required nullable fields are present as `null`; request-only optional fields are marked `?`. Bodies reject unknown keys. Limits: note/text 2,000 characters, name 160, address line 200; lists page 1+, limit 1–50 (default 20).
GETs return 200. New idempotent PUTs return 201, identical retries 200, different payload under the same operation/revision ID 409. All mutating requests require `Idempotency-Key: <UUID>` and replay the same logical result; store scoped request fingerprints/results with the case revision or durable operation. Webhooks use provider event IDs instead. GET operation polling is always owner/assignment scoped.
Errors use `{error:string,code:string}` plus existing validation `details?:{field:string,message:string}[]`. Codes: 401 `INVALID_TOKEN`/`INVALID_SESSION`; 403 `INSUFFICIENT_PERMISSIONS`/`LAUNCH_STEP_REQUIRED`/`CARE_ACCESS_REQUIRED`; 404 `NOT_FOUND`; 409 `REVISION_CONFLICT`/`CONSENT_OUTDATED`/`OPERATION_CONFLICT`/`SETTINGS_CHANGED`/`INCOMPLETE_CASE`/`INCOMPLETE_PHOTO_SET`; 413 `PAYLOAD_TOO_LARGE`; 503 `BILLING_UNAVAILABLE`. Do not expose provider errors or submitted values.

State order: consents → identity uploads + NC attestation → eligibility → plan/payment → medical history → photos → destination → submitted → clinician ID and medical approval → active.
Manual identity approval occurs in the submitted-case review; an upload is never approval. Rejected identity/medical review after payment triggers the same full-refund workflow. Corrections use `needs_changes`, immutable submitted snapshots and new revisions/photo sets; no second initial charge.
Payment is captured before history; **no subscription renewal, care entitlement or cadence starts until both identity and medical approval**. Store a prepaid first month, create the monthly subscription on approval and apply that payment to its first invoice without charging again (A5). Waiting does not consume the first month.
Before approval, cancel records a no-renewal instruction but preserves the prepaid review/first-month entitlement if approved. Switching a wholly unused prepaid plan settles the full price difference; after activation Stripe prorates the remaining period immediately. These edge interpretations are called out at the end.

```ts
type UUID = string;
type Instant = string;
type DateOnly = string;
type PlanId = 'care' | 'all_in';
type ConsentKey = 'telehealth' | 'medication' | 'privacy_notice' | 'subscription_terms';
type PhotoSlot = 'front' | 'left' | 'right' | 'chest' | 'back' | 'close_up';
type CaseStatus = 'consents' | 'identity' | 'eligibility' | 'payment' | 'medical_history'
  | 'photos' | 'destination' | 'submitted' | 'needs_changes' | 'approved' | 'rejected' | 'ineligible';
type Page<T> = {data:T[];pagination:{page:number;limit:number;total:number;totalPages:number}};
type Plan = {id:PlanId;name:string;amountCents:number;currency:'usd';interval:'month';
  includesPartnerRx:boolean;cadence:{weeklyWeeks:number;then:'monthly'}};
type Consent = {key:ConsentKey;version:number;versionLabel:string;title:string;body:string;
  sha256:string;effectiveAt:Instant;acceptedAt:Instant|null};
type Catalog = {contractVersion:1;settingsVersion:number;plans:Plan[];consents:Consent[];
  reviewCopy:'Review within 1 to 2 business days.';questionnaireVersion:string;
  eligibilityQuestions:Question[];medicalQuestions:Question[]};
type Question = {id:string;prompt:string;kind:'choice'|'multi_choice'|'text'|'repeat'|'attestation';
  required:boolean;options:{id:string;label:string}[];fields:Question[];
  showWhen:{questionId:string;operator:'in'|'not_in';values:string[]}[]};
type SignedImage = {url:string;expiresAt:Instant};
type Identity = {id:UUID;status:'uploaded'|'approved'|'needs_changes'|'rejected';
  fullName:string;dateOfBirth:DateOnly;attestedInNC:boolean;attestedAt:Instant;
  reviewedAt:Instant|null;reviewedBy:UUID|null;patientMessage:string|null};
type Pharmacy = {name:string;addressLine1:string;addressLine2:string|null;city:string;
  state:string;postalCode:string;phone:string};
type Address = {recipient:string;line1:string;line2:string|null;city:string;state:'NC';postalCode:string};
type Destination = {planId:'care';pharmacy:Pharmacy} |
  {planId:'all_in';pharmacy:'vida';shippingAddress:Address};
type Eligibility = {E1:'acne'|'dark_marks'|'something_else';E2:'yes'|'no';
  E3:'pregnant'|'breastfeeding'|'neither'|'not_applicable';E4:'yes'|'no'};
type EligibilityResult = {answers:Eligibility;eligible:boolean;reasons:string[];flags:string[];rulesVersion:string};
type MedicalHistory = {
  M1:'female'|'male'|'intersex'|'prefer_not_to_say';
  M2:'yes'|'no'|'not_sure'|null; M3:'yes'|'no'|'not_sure'|null;
  M4:{method:'pill_patch_ring'|'iud'|'implant'|'shot'|'condoms'|'none'|'other';details:string|null}|null;
  M5:'under_6_months'|'6_to_12_months'|'1_to_5_years'|'over_5_years';
  M6:('forehead'|'cheeks'|'nose'|'jaw_chin'|'neck'|'chest'|'back'|'other')[];
  M7:('comedones'|'red_bumps'|'pus_bumps'|'deep_painful_lumps'|'dark_marks'|'scars')[];
  M8:'yes'|'no'|'not_sure'|'not_applicable'|null;
  M9:{signs:('irregular_periods'|'new_hair_growth'|'scalp_thinning'|'voice_change')[];none:boolean;details:string|null};
  M10:'burns_rarely_tans'|'burns_then_tans'|'rarely_burns_tans_easily'|'very_rarely_burns_deeply_pigmented';
  M11:{none:boolean;treatments:{name:string;duration:string;helped:string;sideEffects:string}[]};
  M12:'never'|'past'|'now';
  M13:('ace_arb'|'water_pills'|'potassium'|'trimethoprim'|'lithium'|'digoxin'|'warfarin'|'minerals_antacids'|'seizure_medicine'|'none')[];
  M14:{none:boolean;details:string|null};
  M15:{picks:('tetracyclines'|'sulfites'|'clindamycin'|'benzoyl_peroxide'|'other'|'none')[];reaction:string|null};
  M16:('kidney'|'liver'|'high_potassium'|'heart'|'fainting_low_bp'|'adrenal'|'lupus_sun_sensitivity'|'raised_brain_pressure'|'swallowing_esophagus'|'breast_cancer'|'ibd'|'none')[];
  M17:'not_sensitive'|'somewhat'|'very'|'eczema_rosacea'; M18:string;
  M19:'yes'|'sometimes'|'no'; M20:{pcpName:string|null;pcpPhone:string|null;shareSummary:boolean};
  M21:string; M22:true; medicationPreference:'topical'|'oral'|'no_preference';
};
type MedicalDraft = Partial<MedicalHistory>;
type PhotoSet = {id:UUID;purpose:'enrollment'|'check_in';status:'draft'|'submitted'|'needs_changes'|'reviewed';
  requiredSlots:PhotoSlot[];items:{slot:PhotoSlot;photoId:UUID;captureId:UUID}[]};
type Capture = {id:UUID;captureId:UUID;captureDate:Instant;uploadedAt:Instant};
type Case = {id:UUID;revision:number;status:CaseStatus;identity:Identity|null;
  eligibility:EligibilityResult|null;medicalHistory:MedicalDraft;questionnaireVersion:string;
  photoSet:PhotoSet|null;destination:Destination|null;planId:PlanId|null;flags:string[];
  submittedAt:Instant|null;approvedAt:Instant|null;patientMessage:string|null};
type Membership = {id:UUID;planId:PlanId;status:'awaiting_payment'|'paid_pending_review'|'activating'|'active'|'past_due'|'ended'|'rejected';
  amountCents:number;currency:'usd';activatedAt:Instant|null;currentPeriodEnd:Instant|null;
  paidThrough:Instant|null;cancelAtPeriodEnd:boolean;cadenceAnchor:Instant|null;
  refundStatus:'not_applicable'|'pending'|'issued'|'failed';access:'enrollment'|'care'|'read_only'};
type EnrollmentResponse = {case:Case;membership:Membership|null;consents:Consent[]};
type PaymentAction = {url:string;expiresAt:Instant};
type Operation = {id:UUID;kind:'initial_payment'|'activate'|'switch'|'cancel'|'refund';
  status:'pending'|'requires_action'|'succeeded'|'failed';action:PaymentAction|null;failureCode:string|null};
type BillingResponse = {membership:Membership|null;operation:Operation;action:PaymentAction|null};
type FollowUp = {tolerability:'good'|'some_irritation'|'not_tolerating';
  sideEffects:{none:boolean;details:string|null};
  pregnancyStatus:'pregnant'|'breastfeeding'|'trying'|'not_sure'|'neither'|'not_applicable';
  newMedicines:{none:boolean;details:string|null};physicallyInNC:boolean};
type CheckIn = {id:UUID;dueAt:Instant;cadenceAnchor:Instant;kind:'weekly'|'monthly';
  status:'due'|'draft'|'submitted'|'needs_changes'|'reviewed'|'superseded';
  formId:UUID;form:CheckInForm;responseId:UUID|null;photoSet:PhotoSet|null;answers:FollowUp|null;
  submittedAt:Instant|null;reviewedAt:Instant|null;patientMessage:string|null};
type CheckInForm = {id:UUID;userId:UUID;version:number;createdBy:UUID;createdAt:Instant;
  title:string;isActive:boolean;questions:{id:UUID;prompt:string;type:'text'|'choice';
    required:boolean;options:{id:UUID;label:string}[]}[]};
type Review = {id:UUID;targetType:'identity'|'case'|'check_in';targetId:UUID;
  outcome:'approve'|'needs_changes'|'reject';patientMessage:string|null;createdAt:Instant;clinicianId:UUID};
type QueueItem = {id:UUID;patientId:UUID;patientName:string|null;
  kind:'identity'|'enrollment'|'check_in';targetId:UUID;receivedAt:Instant;flags:string[]};
type Chart = {enrollment:EnrollmentResponse;checkIns:Page<CheckIn>;reviews:Page<Review>;
  prescriptions:Page<PrescriptionSent>};
type PrescriptionSent = {id:UUID;patientId:UUID;clinicianId:UUID;drug:string;strength:string;
  sig:string;pharmacy:Pharmacy;sentAt:Instant;recordedAt:Instant;source:'treatrx_external'};
```

### Endpoint shapes (freeze in A1 before parallel client work)

| Method and path | Exact request | Exact success response / caller |
|---|---|---|
| GET `/catalog` | None | `Catalog`; authenticated patient/clinician. Prices come from settings, never client literals. |
| GET `/enrollment` | None | `EnrollmentResponse`; patient. Lazily creates one launch case per patient, safely on concurrent first read. |
| PUT `/enrollment/:caseId/consents` | `{expectedRevision:number,acceptances:{key:ConsentKey,version:number,sha256:string}[]}` | `EnrollmentResponse`; patient; all four distinct current documents accepted together with server timestamp/IP. |
| PUT `/enrollment/:caseId/identity/:identityId` | Multipart: `idPhoto` JPEG, `selfie` JPEG, `fullName`, `dateOfBirth`, `physicallyInNC` (`'true'`/`'false'`), `expectedRevision` (decimal string). | `EnrollmentResponse`; patient; max 1.5 MiB per image, entire request ≤3.5 MiB; selfie camera-only in iOS. |
| PUT `/enrollment/:caseId/eligibility` | `{expectedRevision:number,answers:Eligibility}` | `EnrollmentResponse`; patient; E1/E2 rejects prevent any checkout. |
| POST `/billing/checkout` | `{caseId:UUID,planId:PlanId,settingsVersion:number}` | `BillingResponse`; patient; hosted Stripe payment page, no card data through API. |
| GET `/billing` | None | `{membership:Membership|null}`; patient. |
| GET `/billing/operations/:operationId` | None | `BillingResponse`; patient, or assigned clinician for a review-triggered operation. |
| POST `/billing/cancel` | `{membershipId:UUID}` | `BillingResponse`; patient; retains paid care to paidThrough. |
| POST `/billing/switch` | `{membershipId:UUID,planId:PlanId,settingsVersion:number,destination:Destination}` | `BillingResponse`; patient; new destination must match new plan. |
| POST `/billing/webhook` | Raw Stripe event bytes + `Stripe-Signature` | `{received:true}`; signed provider only; invalid signatures 400. No patient bearer auth. |
| GET `/billing/return` | `{operationId:UUID}` query | Generic HTML “Return to UNZIT”; no operation data. Returning never confirms payment; app refreshes authenticated status. |
| PUT `/enrollment/:caseId/medical/:revisionId` | `{expectedRevision:number,questionnaireVersion:string,answers:MedicalDraft}` | `EnrollmentResponse`; patient; full draft replacement, paid-only. Submission later requires complete active branches. |
| POST `/photo-captures/:captureId` | Multipart: `photo` JPEG, `captureDate` ISO timestamp, `notes` string (optional), `targetType` (`'enrollment'`/`'check_in'`), `targetId` UUID. | `{capture:Capture}`; patient; max 3 MiB image, entire request ≤3.5 MiB; API re-encodes/stores/completes existing capture identity; no Storage URL. |
| PUT `/photo-sets/:setId` | `{purpose:'enrollment'|'check_in',targetId:UUID,items:{slot:PhotoSlot,photoId:UUID,captureId:UUID}[]}` | `{photoSet:PhotoSet}`; patient; target and all photos must belong to session patient, no reuse across cases/check-ins. |
| PUT `/enrollment/:caseId/destination` | `{expectedRevision:number,destination:Destination}` | `EnrollmentResponse`; patient. |
| POST `/enrollment/:caseId/submit` | `{expectedRevision:number,photoSetId:UUID}` | `EnrollmentResponse`; patient; freezes snapshot, queues review once, does not activate membership. |
| GET `/check-ins` | `{page?:number,limit?:number}` query | `Page<CheckIn>`; patient; includes deterministic next due occurrence. |
| PUT `/check-ins/:checkInId/submissions/:responseId` | `{formId:UUID,photoSetId:UUID,answers:FollowUp}` | `{checkIn:CheckIn}`; patient; atomically creates existing CareFormResponse + submission/queue state. |
| GET `/review-queue` | `{kind?:'identity'|'enrollment'|'check_in',page?:number,limit?:number}` query | `Page<QueueItem>`; assigned clinician; receivedAt ascending then id ascending. |
| GET `/patients/:patientId/chart` | `{page?:number,limit?:number}` query | `Chart`; assigned clinician; paging applies independently to each history. No identity image URLs here. |
| GET `/patients/:patientId/identity/:identityId/images` | None | `{idPhoto:SignedImage,selfie:SignedImage}`; assigned clinician only; 300-second expiry. |
| PUT `/patients/:patientId/reviews/:reviewId` | `{targetType:Review['targetType'],targetId:UUID,expectedRevision:number,outcome:Review['outcome'],patientMessage:string|null}` | `{review:Review,enrollment:EnrollmentResponse,checkIn:CheckIn|null,operation:Operation|null}`; assigned clinician. Case revision is concurrency token; identity/check-in reviews also increment it. |
| PUT `/patients/:patientId/prescriptions-sent/:recordId` | `{drug:string,strength:string,sig:string,pharmacy:Pharmacy,sentAt:Instant}` | `{prescription:PrescriptionSent}`; assigned clinician; identical retries preserve recordedAt. |
| GET `/prescriptions-sent` | `{page?:number,limit?:number}` query | `Page<PrescriptionSent>`; patient. |
| POST `/billing/fake/operations/:operationId/resolve` | `{outcome:'succeed'|'decline'|'requires_action'}` | `BillingResponse`; owning synthetic patient; mounted only with fake adapter on loopback test/development. |

Skin image byte upload reuses existing capture IDs/completion service logic through the new byte endpoint, with server-scoped launch permission added in A4. New clients POST bytes to the API, not to Storage signed-upload URLs. Existing legacy upload responses remain compatible, but launch requests cannot obtain a direct Storage upload URL. Downloads use existing authorized original/thumbnail APIs and five-minute signed URLs. There is no public allowlist/settings editor or arbitrary refund-marking endpoint.
The 3.5 MiB total multipart budget stays below [Vercel's 4.5 MB request cap](https://vercel.com/docs/functions/limitations). iOS re-encodes/resizes within per-image budgets while preserving readable ID text/sharp skin photos; offer retake if that fails. Backend enforces actual streamed bytes/parts plus decode pixel limits, not just Content-Length. Never raise a hosting limit or silently fall back to direct Storage upload.

Question rules: use `sources.md` §1 E1–E4/M1–M22 verbatim prompts and choice labels; machine IDs above are the fixed mapping. Keep M22's identity; append medicationPreference (“Do you prefer topical or oral medications?” / topical, oral, no preference). `M2` shown unless M1=male; M3/M4 only if M2=yes/not_sure; M8 only for female/intersex. Hidden answers are null; changing a parent clears hidden branches server-side. “None” must be exclusive and actively selected; optional M20 contact/M21 may be blank. M11 ≤20 rows; multisets are unique and bounded by their options. M22 attestation gets a server timestamp at submission. Flags are clinical review cues, never automatic prescriptions.

### Cadence, access and processing invariants

- Approval anchors Care monthly at +1 calendar month, clamped to valid month-end. Proposed All-In boundary: days +7,+14,…,+56, then +1 calendar month from day 56 and monthly thereafter. Weekly weeks replace overlapping monthly occurrences during weeks 1–8; there is no duplicate monthly submission. This follows decision 1's “weekly ... then monthly,” but decision 4's “monthly for everyone” could mean additional monthly obligations; resolve this boundary before A1 freezes cadence fixtures. NC calendar scheduling uses `America/New_York`, preserving wall time across DST, with UTC dueAt on the wire.
- A successful active plan switch anchors a fresh schedule on the confirmed switch instant: Care first monthly +1 month; All-In starts a new eight-week sequence. Pending/failed payment cannot reset cadence or change the effective plan. Replacing future unsubmitted occurrences marks them superseded; submitted history and overdue obligations remain visible. Switching does not reset the Stripe billing anchor.
- On-time submission never shifts later due dates. Generate occurrences idempotently on reads/submissions from the persisted anchor with a unique membership/anchor/ordinal key; no resident process or new cron deployment needed. Serialize cadence regeneration with membership updates.
- `paidThrough`, not Stripe's status string alone, governs access. Cancellation preserves care through that instant. Failed renewal never extends it; access becomes read_only after it. Chart/history, recovery, cancellation and urgent reports remain accessible; no new paid care writes after expiry. Submitted/needs_changes patients may exchange clarification messages with the currently assigned clinician before activation, using existing assigned messaging; this does not grant prescribing/routine access. Out-of-NC answers are recorded and queued, but block approval/prescription records until a fresh affirmative attestation.
- Every check-in requires a fresh front/left/right set and chest/back if those sites remain in the case's M6. Follow-up questions use a versioned seven-question CareFormRevision (the final decision's five topics plus side-effect/new-medicine detail questions), with stable UUID option identities. Persist structured FollowUp plus matching CareFormResponse in one transaction, preserving existing response histories/message links. Source-only adherence questions are flagged below for clinical-content reconciliation, not silently added to the final launch scope.
- Durable billing operations are an outbox/state machine: persist intent, call Stripe outside DB locks with stable provider idempotency key, reconcile result in a new locked transaction. Persist signed webhook event ID before acknowledging; duplicates harmless. A bounded backend reconciliation script retries pending/failed-retryable operations and retrieves provider truth after out-of-order events. No detached work after a Vercel response.

## Workstream A — backend + migrations (10 tasks)

### A1. Publish contract types, validators and compatibility fixtures

**Files:** create `backend/src/contracts/unzitLaunch.ts`, `backend/tests/unzit-contract.test.ts`; later services import this contract rather than duplicate it.
- [ ] Encode all types/endpoints/enums above and synthetic request/response fixtures; reject money, clinician IDs, timestamps of acceptance and entitlement overrides from clients.
- [ ] Tests: every endpoint fixture parses; missing/null/dates/cents/pagination match; old enrollment/form/prescription payloads still parse in their existing tests. Freeze errors and idempotency semantics before B1/C1 begin.
- [ ] Verify: `cd backend && node --import tsx --test tests/unzit-contract.test.ts tests/enrollment.test.ts tests/care-support.test.ts`.

### A2. Add launch schema and recovery coverage

**Files:** new CLI-generated `supabase/migrations/<timestamp>_unzit_launch.sql`; modify `backend/prisma/schema.prisma`, `backend/scripts/recovery-drill.cjs`, `backend/tests/migration-chain.test.ts`, `backend/src/services/enrollment.ts`; create `backend/tests/unzit-schema.test.ts`.
- [ ] From root create, do not hand-name: `npx --yes supabase@2.117.0 migration new unzit_launch`. Never edit committed migrations, baseline metadata or legacy chain; never use Prisma migration/db-push/reset commands.
- [ ] Add these tables with UUID PKs, timestamp(3), restrictive clinical FKs and bounded CHECK constraints. Names below are also the exact `@@map` names and `applicationTables` additions:

| Table | Data / database invariants |
|---|---|
| `launch_settings` | Immutable settings versions; Care/All-In cents, Stripe price mapping, cadence constants, approved content version and designated launch clinician ID. Seed 3900/8900 server-side only; active pointer/version update is transactional. No secrets. |
| `launch_allowlist` | Normalized email unique, enabled, import batch/time; no patient health fields. Existing identities not deleted by imports. |
| `launch_cases` | Patient unique, case revision/status, eligibility answers/rules snapshot, selected plan/settings version, destination snapshot, submission/approval timestamps and current intake/photo-set refs. |
| `identity_verifications` | Case/patient, attempt ID unique, two private object paths, claimed name/DOB, NC attestation/server time, manual review outcome/reviewer/time; no SkinPhoto rows. |
| `intake_revisions` | Case/patient, client revision ID, questionnaire version, bounded answers JSON, submitted snapshot/attestation time; immutable after submission. |
| `clinical_photo_sets` | Patient, purpose, case or check-in target, required-slot snapshot and state; exactly one target kind. |
| `clinical_photo_set_items` | Set + slot unique; SkinPhoto and capture ID, same-patient composite FK/constraint; no duplicate image serving two required slots or distinct submissions. |
| `care_memberships` | Patient unique; case/plan/settings snapshot, prepaid/active state, Stripe IDs, paidThrough/cancel intent and cadence anchor. Keep legacy `subscriptions` unchanged. |
| `billing_payments` | Membership/provider payment/invoice IDs unique, charged/refunded cents and confirmed times; positive amounts; no card payload/medical metadata. |
| `billing_operations` | Patient/membership, request fingerprint, idempotency UUID unique, provider key, kind/state, bounded retry metadata and result references; cumulative refunds cannot exceed confirmed charges. |
| `stripe_events` | Provider event ID unique, object/type/time, processing state; minimal normalized event data, not unfiltered event payloads. |
| `launch_check_ins` | Membership/anchor/ordinal unique, patient, dueAt/kind/status, CareFormRevision/Response and photo-set refs; immutable submitted answers, review linkage. |
| `launch_reviews` | Idempotent review ID, target/patient/current clinician, outcome/message/time, case revision; append-only audit trail, unique terminal decision per submitted revision. |
| `launch_request_receipts` | Session patient/actor, method/path target, idempotency UUID and request hash unique per actor; resulting revision/object IDs and response snapshot for safe retry. Clinical response snapshots receive the same RLS/retention protection. No signed URLs persisted here. |

- [ ] Extend `consent_acceptances` with documentKey default `legacy`, server-observed IP and versionLabel; replace user/version uniqueness with user/key/version. Update existing enrollment service's Prisma unique lookup to include documentKey=legacy in this task so regenerated client/build stays valid. Preserve old rows/hash semantics. New version=1/versionLabel=1.0 is independent for each launch document; do not count legacy acceptance toward any of the four.
- [ ] Extend Prescription additively with `strength`, `sentAt`, `recordedAt`, structured pharmacy snapshot, `source` and optional launchCaseId. Legacy rows stay valid with null additions; map existing medicationName/dosage/instructions/prescribedDate for existing clients. Add scoped unique record IDs for retry safety.
- [ ] Each new table: `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM PUBLIC,anon,authenticated`, `GRANT ALL ... TO service_role`. No client policies, public views or table grants. Use same-patient composite FKs and indexes on patient/latest, assigned queue receivedAt/id, provider IDs and pending operations. Resolve case/set cyclic references with staged constraints, not nullable ownership checks.
- [ ] Add every table to Prisma with `@@map` and recovery `applicationTables`; regenerate query client. Extend recovery guards to accept only exact synthetic fixture rows plus exact server settings seeds; never broadly exempt new tables from unknown-data checks. Save/restore real identity object bytes as well as skin photos; compare consent, intake, reviews and ledger after restoration.
- [ ] Include the A3 Auth-trigger allowlist definition before this migration's first application. Once applied/committed, later changes require a new pinned-CLI migration; do not reopen the applied file during A3.
- [ ] Tests: SQL constraints/ownership, direct anon/authenticated denial, all mapped tables in recovery, legacy rows preserved, settings seed bounds. Verify: `cd backend && npm run db:migrate && npm run db:status && npx prisma generate && node --import tsx --test tests/migration-chain.test.ts tests/unzit-schema.test.ts && npm run build` (local stack only).

### A3. Settings, waitlist importer and unbypassable account creation

**Files:** Auth trigger is already in A2's new migration; modify `backend/src/routes/auth-supabase.ts`, `backend/src/services/enrollmentRules.ts`; create `backend/src/services/launchSettings.ts`, `backend/src/services/launchAllowlist.ts`, `backend/scripts/import-waitlist.cjs`, `backend/scripts/set-launch-settings.cjs`, `backend/tests/launch-allowlist.test.ts`, `backend/tests/launch-settings.test.ts`.
- [ ] Add an exact normalized-email allowlist check to the existing `public.handle_new_user()` Auth transaction, preserving its profile insert. Denial aborts auth.users AND profile creation, including direct SDK signup. Keep existing SECURITY DEFINER/search_path empty, qualified relations and REVOKE EXECUTE; no client-callable lookup. Fail closed on missing settings/allowlist. Do not add a bypass via user_metadata or email domain.
- [ ] CSV importer: quoted CSV parsing, UTF-8 BOM, `email` column, trim/lowercase, basic validity, deduplication, atomic upsert, dry-run default and explicit `--apply`; print counts only. No CSV tracked in Git. `set-launch-settings.cjs` validates positive cents, known plans, monthly Stripe test-price amount/currency/interval and clinician ID before publishing a new version. Restrict price changes to this operator script; no patient or clinician settings route.
- [ ] `GET /catalog` projects active settings/approved documents; keep checkout snapshots stable and return SETTINGS_CHANGED on stale selection. A provider-free fake catalog still comes from the DB. New launch rules lock NC/18+ and do not inherit permissive legacy defaults or enforcement=off. Existing legacy evaluation remains readable/tested.
- [ ] Tests: malformed/duplicate/quoted CSV, mixed case, concurrent repeat import, forged metadata, nonallowlisted direct Supabase signup rolls back all account rows; confirmation/login/recovery of existing accounts unaffected. Explicitly provision clinician/synthetic fixture emails through controlled backend tooling, never public clinician registration.
- [ ] Verify: `cd backend && node --import tsx --test tests/launch-allowlist.test.ts tests/launch-settings.test.ts tests/auth.test.ts tests/enrollment-rules.test.ts`.

### A4. Extend enrollment, intake, consent and secure image submission

**Files:** modify `backend/src/content/consent.ts`, `src/services/enrollment.ts`, `src/services/enrollmentRules.ts`, `src/services/enrollmentValidation.ts`, `src/middleware/enrollmentGate.ts`, `src/routes/photos.ts`; create `backend/src/content/launchIntake.ts`, `src/content/launchConsents.ts`, `src/services/launchEnrollment.ts`, `src/services/launchEnrollmentValidation.ts`, `src/services/identityVerification.ts`, `src/services/clinicalPhotoSets.ts`, `src/routes/launch-enrollment.ts`, `backend/tests/launch-enrollment.test.ts`, `backend/tests/launch-intake.test.ts`, `backend/tests/launch-images.test.ts`.
- [ ] Reuse consent hashing/version immutability and enrollment row-lock/idempotency patterns, ageOn, capture identity/path/privatePhoto and existing thumbnail logic. Preserve legacy route DTOs/statuses; launch orchestration is separate, not a rewrite of these services.
- [ ] Publish four independently versioned documents only after approved text is provided. Keep original full text/hash for each acceptance; record trusted server IP with constrained proxy handling, not arbitrary X-Forwarded-For. Reject stale hashes atomically; do not accept legacy DRAFT or silently replace an accepted version.
- [ ] Implement the ordered case API and questionnaire catalog above; payment confirmation gates medical history. E3 pregnancy/breastfeeding and M2/M3 uncertainty flag pregnancy-safe review; E4 shows overlap warning. No client-only eligibility checks or automatic treatment selection. Store source question version and exact submitted snapshot.
- [ ] Adapt existing capture completion to an API byte-upload path for launch (reuse captureId/retry), with narrowly scoped permission for the case's photo step or an authorized check-in. Identity uploads are permitted immediately after four consents; no requirement for final `isEnrolled`. Never weaken the general legacy gate to “any signed-in patient.”
- [ ] Re-encode all launch images on the backend with sharp to strip EXIF/GPS before storage; enforce actual JPEG decode, the contract's per-image/total multipart limits and bounded dimensions/orientation. Skin images reuse SkinPhoto/reviews; ID/selfie use distinct server-generated filenames in private `patient-photos`, no thumbnails/timeline/message references. Reuse existing owned-path grammar; no new public bucket or client-chosen path.
- [ ] Submission checks all required source questions/attestations, current consents, confirmed payment, NC, pharmacy/address and fresh complete photo set. M6 chest/back each adds its required slot. Never request breasts/genital areas; guidance says chest above breasts, allow crop/cover. Retakes use new IDs; submitted records cannot be deleted through legacy photo deletion/update endpoints. Protect original/thumbnail authorization too.
- [ ] Tests: full/resume/replay/concurrent flow; all M branches and exclusive none, hidden answer clearing, preference, unpaid history denial, incomplete angles, cross-patient photo references, ID missing/mislabeled, EXIF removed from stored bytes, oversize file/multipart rejection and retry, submitted immutability, unassigned/reassigned clinician denial. Verify: `cd backend && node --import tsx --test tests/launch-enrollment.test.ts tests/launch-intake.test.ts tests/launch-images.test.ts tests/enrollment-gate.test.ts tests/photo-capture.test.ts tests/photo-path.test.ts`.

### A5. Stripe test adapter, prepaid checkout and safe activation

**Files:** modify `backend/package.json`, `package-lock.json`, `.env.example`, `src/server.ts`; create `backend/src/services/billingProvider.ts`, `stripeBilling.ts`, `fakeBilling.ts`, `launchBilling.ts`, `launchBillingValidation.ts`, `src/routes/launch-billing.ts`, `backend/tests/launch-billing.test.ts`, `backend/tests/stripe-webhook.test.ts`, `backend/tests/billing-provider.test.ts`.
- [ ] Pin reviewed Stripe SDK/API version and lockfile. Adapter owns checkout, provider retrieval, first-invoice allocation, subscription creation, switch, cancellation and refunds. Inject deterministic fake with controllable clock/actions; prohibit fake in production and nonloopback runtime. Missing test credentials in Stripe mode fails closed, never silently activates fake.
- [ ] Example variable names only: BILLING_PROVIDER, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_API_VERSION, BILLING_RETURN_ORIGIN. Server-side settings hold validated price IDs. Require test keys and reject live-mode objects for this phase; validate both config and webhook event livemode. No Stripe secrets in clients; hosted Checkout avoids adding an iOS payment SDK.
- [ ] Initial Checkout uses payment mode, saved off-session payment method and server-priced first-month amount. Metadata contains opaque billing IDs only; no diagnoses/drugs/answers/ID images/shipping. Checkout return/cancel URLs are fixed allowlisted server configuration; redirects never accept a user URL. A browser return is only a refresh trigger; provider-confirmed captured payment unlocks history.
- [ ] Approval: create monthly subscription anchored on approval, with first invoice prevented from automatic collection; finalize and attach the already successful PaymentIntent(s) to that invoice, then configure automatic future collection using the saved method. Use supported [Stripe invoice-payment allocation](https://docs.stripe.com/api/invoices/attach_payment), never “mark paid” without a matched charge. Activate only when first invoice is fully covered; retain activating state on partial failure and reconcile. Never create a trial or charge a second first month.
- [ ] Spike this exact sequence in Stripe test mode before depending on it: first invoice/amount/currency match snapshot, paidThrough is a full month from approval, no renewal while pending. If the pinned Stripe version/account cannot support safe allocation, stop that task and revise the billing contract with B/C; do not improvise double charges or consume waiting days.
- [ ] Register webhook raw-body route before express.json and without patient auth; keep other launch routes authenticated. Verify signature, persist unique event, process with bounded retry; retrieve Stripe state to resist stale event overwrites. Mount the other A routes in server.ts. Never log payloads/provider URLs/client secrets.
- [ ] Tests: success, decline, abandoned Checkout, requires-action, spoofed return/event, bad signature/raw-body corruption, duplicate/out-of-order delivery, request timeout after provider success, approval retry/crash between create/finalize/allocate, missing keys, fake production denial and zero double charges. Verify: `cd backend && node --import tsx --test tests/launch-billing.test.ts tests/stripe-webhook.test.ts tests/billing-provider.test.ts && npm run build`.

### A6. Refund, cancellation, switch and entitlement lifecycle

**Files:** modify A5 billing services/routes, `backend/src/services/careDecisions.ts`, `src/routes/care-decisions.ts`, `src/middleware/enrollmentGate.ts`; create `backend/src/services/careAccess.ts`, `backend/scripts/reconcile-billing.cjs`, `backend/tests/billing-lifecycle.test.ts`, `backend/tests/care-access.test.ts`.
- [ ] Rejection records existing refer_out/needs_in_person decision plus launch review and durable full-refund operation. Refund all net first-month captures (including preapproval switches), stop renewal, and withhold care. “issued” requires confirmed successful provider refunds; pending/failed visible and retryable. Disable the legacy manual issued endpoint for payment-backed decisions, preserving legacy synthetic records. Successful refunds also update invoice/credit-note accounting as required by Stripe.
- [ ] Cancel sets cancel_at_period_end idempotently; pending-review cancel is remembered for activation. Access lasts through paidThrough; do not immediately clear routines/messages. Switching active plans uses Stripe `proration_behavior=always_invoice` and a payment-safe pending update, retaining billing anchor ([Stripe update contract](https://docs.stripe.com/api/subscriptions/update)). Handle negative proration as Stripe credit; disclose before switch, not a promised cash refund.
- [ ] Apply plan/destination/cadence only on confirmed settlement; failed/SCA-required switch leaves current plan active. Preapproval plan replacement settles wholly unused prepaid difference immediately (additional Checkout or confirmed partial refund); activation uses final net prepaid amount. Same-plan retries never reset schedule; switching preserves an existing period-end cancellation instruction. Switching to All-In requires NC address; switching to Care requires complete own pharmacy.
- [ ] Reconciliation script is bounded, idempotent and counts-only, reads existing runtime configuration, retrieves uncertain provider results and resumes durable operations. Explicit operator run is sufficient for test phase; choose a launch scheduler/operator interval before release. Never rely on in-memory jobs or public unprotected retry routes.
- [ ] Tests: rejection refund retries/failure, double decisions, total-refund ceiling, cancel at boundary, no preapproval renewal, plan upgrade/downgrade at mid-period and preapproval, SCA, credit, stale webhook, cadence reset only once, late renewal failure/success and expired clinical writes. Verify: `cd backend && node --import tsx --test tests/billing-lifecycle.test.ts tests/care-access.test.ts tests/care-decisions.test.ts`.

### A7. Scheduled photo check-ins using existing care forms

**Files:** modify `backend/src/services/careSupport.ts`, `src/services/careSupportValidation.ts`; create `backend/src/content/launchCheckIn.ts`, `src/services/launchCheckIns.ts`, `src/routes/launch-check-ins.ts`, `backend/tests/launch-cadence.test.ts`, `backend/tests/launch-check-ins.test.ts`.
- [ ] Build the launch form as a versioned assigned CareFormRevision using existing author/patient association and stable UUID questions/options. Map FollowUp to existing text/choice answers; use separate detail text questions for side effects/new medicines, staying below ten total. Keep historical clinician forms and existing response DTOs/links unchanged.
- [ ] Implement cadence/materialization and atomic photo-set + response submission as specified above. Require fresh photos and fixed follow-up answers even when legacy clinician forms are hidden. Prevent legacy `/care-support/responses` from satisfying/bypassing launch obligations; optional old form responses remain independent.
- [ ] Expose due/draft/submitted/reviewed states; preserve original due dates/history on retries. NC=false and pregnancy/new-medicine/side-effect answers are saved and flagged for the clinician, with existing urgent-report entry and approved emergency copy; never auto-prescribe or calculate a skin score.
- [ ] Tests: Care month-end/leap-year/DST, All-In all eight weekly dates and first monthly date, no duplicates, late submissions, both switch directions and switch back, cancellation/expiry, stale form, missing photo, foreign response/set, replay and atomic rollback. Verify: `cd backend && node --import tsx --test tests/launch-cadence.test.ts tests/launch-check-ins.test.ts tests/care-support-service.test.ts`.

### A8. Clinician review queue, chart and TreatRx record

**Files:** modify `backend/src/services/worklist.ts`, `src/services/careDecisions.ts`, `src/routes/prescriptions.ts`; create `backend/src/services/launchReview.ts`, `prescriptionRecords.ts`, `src/routes/launch-review.ts`, `backend/tests/launch-review.test.ts`, `backend/tests/prescription-records.test.ts`.
- [ ] Reuse worklist current-assignment snapshots, photo queue/compare and care-decision locks. Add separate launch queue projection for identity/enrollment/check-ins without changing old filters/envelopes; include receivedAt, no intake text or images in list rows. Identity queue starts on final case submission to keep one coherent review package; separate target can be reviewed first inside it.
- [ ] Automatically assign new submitted cases to the practice-managed launch clinician from settings inside the submit transaction (do not overwrite an existing assignment). Missing/invalid clinician blocks submit explicitly; otherwise no paid case can silently vanish from all queues. Reassignment invalidates prior clinician access immediately.
- [ ] Require approved ID/selfie (name/DOB match and 18+ manually verified), complete intake/photos and affirmative current NC evidence before case approval/activation. `needs_changes` records a patient-readable reason and pauses the case; revisions resume the same paid case. Case rejection triggers A6. Check-in review never implicitly issues a prescription or marks every photo reviewed; use existing factual per-photo review actions where performed.
- [ ] Seed/import the six approved routine starting points through existing clinician-owned CareTemplateRevision tooling (extend `backend/src/scripts/seed.ts` or create `backend/scripts/import-launch-content.cjs`); source §4, including pregnancy-safe. No autoassign/prescribe from intake; clinician edits/copies existing versioned routines. Draft templates cannot be published without clinical approval.
- [ ] PUT prescription-sent writes the existing Prescription plus launch audit fields, mapping drug→medicationName, strength→dosage for old clients, sig→instructions and date sent explicitly. It requires current assignment, approved case/current NC evidence, complete pharmacy, nonfuture date; shows source TreatRx external. No transmission, dispensing, shipping or pharmacy API call. Legacy create/patch must enforce the same launch prerequisites for launch patients.
- [ ] Tests: queue order/paging, assigned-only reads, post-lock reassignment, duplicate approval/rejection, ID unapproved blocks activation/Rx, changes/resubmit, chart joins, manual Rx date/strength mapping/retry, old Rx records still readable. Verify: `cd backend && node --import tsx --test tests/launch-review.test.ts tests/prescription-records.test.ts tests/worklist.test.ts tests/care-decisions.test.ts`.

### A9. Remove launch score writes and finish compatibility/access checks

**Files:** modify `backend/src/routes/photos.ts`, `src/routes/users.ts`, `src/routes/dashboard.ts`, `src/routes/appointments.ts`, `src/routes/assigned-messages.ts`; create `backend/tests/launch-compatibility.test.ts`, `backend/tests/launch-access.test.ts`.
- [ ] Retain score/streak columns and legacy JSON keys for decoding compatibility, but remove score/streak increments and reject/ignore attempted scoring mutations for launch patients; document exact legacy behavior in tests. Launch endpoints contain no score, streak or mock improvement. Do not clear historical chart data or rewrite migrations.
- [ ] Audit every legacy patient write route for bypass of launch payment/approval/NC gates; unify checks via careAccess. Account/profile, intake upload, assigned clarification messaging, recovery, cancellation, historic reads and urgent reports need their specific scopes, not a blanket paid subscription check. Test clarification send/read for paid submitted/needs_changes cases and deny unrelated patient/clinician access.
- [ ] Tests: old enrollment/Codable fixture envelopes, legacy capture can't mutate submitted launch photos or scores, expired/pending patient cannot access paid care writes, anonymous/other patient/unassigned and newly reassigned clinician on every new path including operation polling and signed reads.
- [ ] Verify: `cd backend && node --import tsx --test tests/launch-compatibility.test.ts tests/launch-access.test.ts tests/auth.test.ts tests/security.test.ts && npm test && npm run build`.

### A10. Local integrated billing/recovery evidence

**Files:** create `backend/scripts/unzit-launch-live.cjs`, `backend/tests/unzit-live-guards.test.ts`; modify `backend/scripts/security-live.cjs`, `accounts-live.cjs`, `recovery-drill.cjs`, `scripts/recovery.cjs` only where exact synthetic fixture provisioning/allowlist seeding requires it.
- [ ] Build one loopback-only synthetic journey: imported allowlisted signup, direct denied signup, four consents, identity, eligible case, fake paid checkout, branched intake, photo/destination submit, portal approval, one charge allocation, check-in review, switch, cancel and rejection/refund for a second synthetic patient's case. Inspect denied access and stored image metadata. Only exact owned synthetic identities/objects may be cleaned up.
- [ ] Tests: guard refuses nonloopback API/DB, non-synthetic identities, live Stripe objects/keys and unknown fixture data; retry leaves one payment/submission/review and exact account cleanup. Runtime sequence verifies stored bytes, ledger and restored records rather than only checking HTTP status.
- [ ] Extend existing recovery fixture preparation for allowlist enforcement and required approved launch content; no wildcard `example.invalid` Auth bypass. Preserve all unknown-user/data guards. Run security/backup/restore **before** any Simulator UI account creation. Local-stack scripts may generate ignored config normally without printing it.
- [ ] Verify: `cd backend && node --import tsx --test tests/unzit-live-guards.test.ts && npm test && npm run build`; from root `node scripts/recovery.cjs`, then `cd backend && node scripts/unzit-launch-live.cjs --provider fake`.
- [ ] With test keys configured by owner/operator, verify `cd backend && node scripts/unzit-launch-live.cjs --provider stripe_test`; use unique test objects and Stripe test clocks to prove first invoice, renewal, immediate prorations and refunds. Script refuses live keys/objects and nonlocal app/DB endpoints. Without keys, report this evidence pending; fake passing is not Stripe verification.

## Workstream B — iOS (7 tasks)

### B1. Mirror contract and account-scoped transports

**Files:** modify `ClearAF/Services/APIService.swift`, `EnrollmentModels.swift`, `EnrollmentRepository.swift`; create `ClearAF/Services/LaunchModels.swift`, `LaunchTransport.swift`, `LaunchEnrollmentRepository.swift`, `ClearAFTests/LaunchContractTests.swift`, `LaunchEnrollmentRepositoryTests.swift`.
- [ ] Mirror A1 shapes, including explicit nulls/UTC dates, typed intake branches and operation states. Route launch calls through existing authenticated AccountNetwork/APIService; retain old DTOs/repositories for installed data/legacy flow. Inject transport for tests; do not import backend fixtures across ownership boundaries.
- [ ] Reuse AccountAccess tickets/generations and existing repository reset conventions. Persist enrollment draft/revision/capture IDs per account with protected atomic files; cancel late responses on signout/A→B. Refresh case on foreground/retry; server state determines next step, not local booleans.
- [ ] XCTest: decode every endpoint shape, unknown future status fails safely, null/empty/amount handling, reconnect/resume, A→B late response isolation. Verify from root: `set -o pipefail; xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO -derivedDataPath /tmp/clearaf-unzit-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -only-testing:ClearAFTests/LaunchContractTests -only-testing:ClearAFTests/LaunchEnrollmentRepositoryTests test | xcbeautify`.

### B2. Production consent, identity and eligibility steps

**Files:** modify `ClearAF/ContentView.swift`, `Views/EnrollmentView.swift`, `Views/AuthenticationView.swift`, `Services/SupabaseService.swift`; create `ClearAF/Views/Enrollment/LaunchEnrollmentView.swift`, `ConsentDocumentsView.swift`, `IdentityCaptureView.swift`, `EligibilityView.swift`, `ClearAFTests/LaunchEnrollmentFlowTests.swift`.
- [ ] Reuse existing account/enrollment shell and Letterpress controls, adding production step views from the DEBUG prototypes' useful layout/copy. Keep prototype source DEBUG-only; never promote sample success states into production logic. Four unchecked controls show full versioned text; stale-consent response refreshes and requires review again.
- [ ] ID picker/camera plus live-selfie camera only, full name/DOB and exact NC attestation; capture camera denial/retake/error states. Compress each JPEG ≤1.5 MiB and multipart ≤3.5 MiB, retaining readable name/DOB/face; if unreadable, retake rather than submit. No claim of automated liveness verification. ID/selfie never enter skin timeline/library drafts; protect temporary files and purge after acknowledged upload/signout. No clinical access while manual review is pending.
- [ ] E1–E4 run before checkout; pregnancy/breastfeeding continue with the safe-review cue. Explain signup rejection generically as closed-waitlist access, preserve Supabase confirmation/recovery and urgent entry. Route pending, rejected and needs_changes cases to the appropriate server state.
- [ ] XCTest: four independent acceptances, stale versions, step ordering/relaunch, identity upload error, NC=false/underage, E1/E2 stops without charge and E3/E4 continue. Verify from root: `set -o pipefail; xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO -derivedDataPath /tmp/clearaf-unzit-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -only-testing:ClearAFTests/LaunchEnrollmentFlowTests test | xcbeautify`.

### B3. Plan choice, hosted Stripe payment and membership controls

**Files:** modify `ClearAF/Views/ProfileView.swift`, `Services/APIService.swift`, `ContentView.swift`; create `ClearAF/Services/BillingRepository.swift`, `ClearAF/Views/Enrollment/PlanChoiceView.swift`, `PaymentStatusView.swift`, `ClearAF/Views/MembershipView.swift`, `ClearAFTests/LaunchBillingTests.swift`.
- [ ] Render Care/All-In inclusions, amounts and cadence from catalog; no $39/$89 constants or selectable weekly add-on. Explain Care pharmacy payment versus included Vida Rx, recurrent terms and approval timing. Present hosted HTTPS Checkout in system browser; validate Stripe host before opening. Provide explicit refresh/continue after returning; no new deep-link scheme or bundle-ID change needed.
- [ ] Poll/refresh operation through authenticated API with bounded retries; cancellation/failed/SCA-required status stays recoverable. Never trust a browser-return query or fake screen toggle as paid. Fake tests inject adapter responses; fake resolution UI exists only in DEBUG with server fake mode.
- [ ] Membership shows plan/paid-through/cancellation/refund state. Switch collects new required destination, presents immediate proration/possible credit semantics, handles settings changes and payment action. Cancel requests server action and displays period-end access. Pending review remains pending after payment.
- [ ] XCTest: server price changes/formatting, duplicate taps, browser cancel/return spoof, stale account callback, requires_action, pending approval, cancel/end period, switch destination validation and cadence refresh. Verify from root: `set -o pipefail; xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO -derivedDataPath /tmp/clearaf-unzit-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -only-testing:ClearAFTests/LaunchBillingTests test | xcbeautify`.

### B4. Medical intake and pharmacy/shipping

**Files:** create `ClearAF/Views/Enrollment/MedicalHistoryView.swift`, `MedicalHistoryFields.swift`, `DestinationView.swift`, `ClearAFTests/LaunchMedicalHistoryTests.swift`; modify `LaunchEnrollmentRepository.swift` and `LaunchModels.swift` from B1.
- [ ] Implement source M1–M22 controls, repeatable prior treatments, active none choices, conditional pregnancy/period questions and appended topical/oral preference. Keep short reusable fields and step sections rather than adding 23 unrelated fields to EnrollmentView. Display catalog text, validate fixed machine values and clear hidden branches.
- [ ] Save draft to server and protected per-account storage with revision conflict reload/reapply; never overwrite a submitted snapshot. History is inaccessible until provider-confirmed payment. Care collects own pharmacy name/full address/phone; All-In shows Vida default plus validated NC recipient/address. No Vida account, insurance or patient pharmacy-payment workflow.
- [ ] XCTest: all branches, every answer kind, required/optional fields, none exclusivity, parent edits, offline resume/conflict, preference persistence and destination discriminated union. Verify from root: `set -o pipefail; xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO -derivedDataPath /tmp/clearaf-unzit-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -only-testing:ClearAFTests/LaunchMedicalHistoryTests test | xcbeautify`.

### B5. Guided photo sets and final case submission

**Files:** modify `ClearAF/Views/PhotoCaptureManager.swift`, `PhotoReviewSheet.swift`, `Services/PhotoRepository.swift`; create `ClearAF/Views/Enrollment/ClinicalPhotoSetView.swift`, `CaseSubmittedView.swift`, `ClearAFTests/LaunchPhotoSetTests.swift`.
- [ ] Extend existing capture/review/retry pipeline with set/slot context and API-mediated launch uploads, preserving durable capture IDs/account isolation. Show front/left/right, conditional chest/back, optional close-up, daylight/no filters/no makeup/hair guidance and “zoom in and check it is sharp.” Chest is above breasts; cover/crop allowed.
- [ ] Strip metadata client-side as well as server-side; re-encode skin JPEG ≤3 MiB with total multipart ≤3.5 MiB and a sharpness preview. Test encoder boundary/oversize retry; never call Supabase Storage directly. Required slots count as complete only after acknowledged server completion and set association. Retake removes only the draft association; submitted images remain immutable chart records.
- [ ] Final review submits existing case once; receipt says review within 1 to 2 business days. Show ID/clinical approval pending, needs_changes correction, rejection/refund pending/issued and active transitions. Hide “You have not been charged” on paid/rejected states. No 48-hour countdown.
- [ ] XCTest: chest/back independently required, optional close-up, interrupted upload/retake/retry/relaunch, another account, missing/duplicate angles, submit race and paid-state copy. Verify from root: `set -o pipefail; xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO -derivedDataPath /tmp/clearaf-unzit-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -only-testing:ClearAFTests/LaunchPhotoSetTests test | xcbeautify`.

### B6. Launch check-ins and recorded prescriptions

**Files:** modify `ClearAF/Services/CheckInRepository.swift`, `CareSupportModels.swift`, `LaunchFlags.swift`, `Views/CheckInView.swift`, `DashboardViewEnhanced.swift`, `RoutineView.swift`, `CareStatusCard.swift`; create `ClearAFTests/LaunchCheckInTests.swift`, `LaunchPrescriptionTests.swift`.
- [ ] Extend existing protected draft/retry/question/review UI with launch occurrence ID, photo set and structured follow-up mapping. Reuse B5 photo set component; read dueAt/kind from server. Show due/continue/submitted/reviewed states, never calculate clinical due dates from local “weekly” constants.
- [ ] Add an independent launch-check-in entry/flag so `clinicianForms=false` does not suppress required launch check-ins. Keep adherence calendar hidden. Existing arbitrary forms and their history remain intact; do not flip the broad legacy flag or delete the old code.
- [ ] Display recorded prescription drug/strength/sig/pharmacy/date in existing Plan/history views; label recorded sent state, no dispensing/shipment promises. Keep approved emergency/stop-and-message notices. Read-only history persists after cancellation/expiry; new check-in creation follows API entitlement.
- [ ] XCTest: due weekly/monthly, complete photos+answers before send, stale form/occurrence after switch, replay/offline isolation, NC=false recorded/flagged, sent history and prescription fields/access. Verify from root: `set -o pipefail; xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO -derivedDataPath /tmp/clearaf-unzit-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -only-testing:ClearAFTests/LaunchCheckInTests -only-testing:ClearAFTests/LaunchPrescriptionTests test | xcbeautify`.

### B7. Copy, compatibility and bounded device acceptance

**Files:** modify existing `ClearAFTests/EnrollmentTests.swift`, `UNZITLaunchTests.swift`, `AccountAccessTests.swift`, `CheckInFlowTests.swift`, `PhotoUploadSecurityTests.swift`; update only launch-facing copy in B2–B6-owned views.
- [ ] Remove hardcoded weekly/add-on/$55/score promises from production launch surfaces; standardize review copy to 1 to 2 business days. Preserve Letterpress, bundled identity/auth callback and DEBUG prototypes. Do not expose prototype navigation in Release.
- [ ] XCTest regression: legacy models/drafts, account signout, hidden arbitrary forms versus visible launch check-ins, no score/streak UI, no production fake controls. Perform one user-led device pass for actual ID/selfie capture, photo retake/crop, browser payment return, Dynamic Type/VoiceOver and submit/resume; record any unresolved device limits.
- [ ] Verify from root: `set -o pipefail; xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO -derivedDataPath /tmp/clearaf-unzit-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- test | xcbeautify`. Release exclusion build: `set -o pipefail; xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Release -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO -derivedDataPath /tmp/clearaf-unzit-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build | xcbeautify`. No distribution/upload.

### iOS verification (exact command; run from repository root)

All new tests above are XCTest classes in ClearAFTests, with mocked transports/clocks and synthetic image bytes. B owns project membership if files are not automatically included. Installed destination follows CLAUDE.md; substitute only an actually installed simulator if iPhone 17 is unavailable, and record the substitution.

`set -o pipefail; xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO -derivedDataPath /tmp/clearaf-unzit-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- test | xcbeautify`

The focused commands are written under each B task; B7 runs the complete suite. Do not run multiple xcodebuild processes. Run A10 recovery first if any later Simulator UI walkthrough creates accounts.

## Workstream C — clinician portal (6 tasks)

### C1. Mirror contract and API helpers

**Files:** modify `web-portal/src/types/api.ts`, `src/lib/api.ts`; create `web-portal/src/lib/launch.ts`, `web-portal/tests/launch-api.test.ts`.
- [ ] Mirror A1 shapes without changing existing enrollment/worklist types. Add helpers for catalog/chart/queue/reviews/prescription records and operation refresh using existing bearer/no-store/no-referrer transport. No direct table/Storage access or server-component PHI fetching.
- [ ] Tests: exact method/path/body/idempotency/revision headers, dates/null/paging, assignment/step/error handling and session-change cancellation; independent fixtures match plan. Verify: `cd web-portal && npm test && npm run typecheck`.

### C2. Add enrollment and check-in queue entries

**Files:** modify `web-portal/src/components/patients/worklist/Worklist.tsx`, `WorklistView.tsx`, `src/lib/patient-navigation.ts`; create `src/components/patients/LaunchReviewQueue.tsx`, `web-portal/tests/launch-queue.test.ts`.
- [ ] Add launch review queue alongside existing photo/urgent/message worklist, retaining its current filters/order and URL context. Use receivedAt order and explicit kind; show waiting time without imposing a 48-hour SLA. Navigate directly to target review within the existing patient workspace.
- [ ] Reuse existing loading/error/empty/pagination and race-cancellation patterns. Identity/intake content stays out of list rows and URLs. Refresh after review removes resolved items, preserves needs_changes audit history and handles reassignment/404.
- [ ] Tests: stable chronological paging, all three kinds, empty/error/retry, stale request/session, target links and review removal. Verify: `cd web-portal && npm test && npm run typecheck`.

### C3. ID/selfie and full intake review in existing workspace

**Files:** modify `web-portal/src/app/patients/[id]/page.tsx`, `src/components/patients/EnrollmentStatus.tsx`, `src/lib/workspace.ts`; create `src/components/patients/IdentityReview.tsx`, `LaunchIntakeReview.tsx`, `web-portal/tests/launch-intake-review.test.ts`.
- [ ] Add enrollment review panel to the existing workspace; show four versioned consent receipts, claimed name/DOB/NC time, paired ID/selfie fetched only on explicit opening, structured M1–M22 + medication preference, flags and destination beside existing photos. Reuse existing image/compare primitives and refresh expiring signed links; no persistent browser cache for identity images.
- [ ] Explicit manual ID match/age outcome plus clinician needs_changes/reject controls. Case approval disabled until server ID approval and complete package; confirm the server result and activating versus active state. Concurrent revision conflict reloads and requires re-review. Never imply the UI performed identity automation.
- [ ] Tests: consent version mapping, conditional answers/none/preference, missing ID/consent, protected image refresh/revoke, stale revision and chart changing to another patient. Verify: `cd web-portal && npm test && npm run typecheck`.

### C4. Clinical approval/rejection, check-in reviews and refund visibility

**Files:** modify `web-portal/src/components/patients/CareDecisionDialog.tsx`, `CareStatusCard.tsx`, `src/components/care-support/PatientCheckIns.tsx`, `CheckInViews.tsx`, `src/lib/care-decisions.ts`; create `web-portal/tests/launch-review-actions.test.ts`.
- [ ] Reuse existing decision dialog/response renderer for launch case/check-in review; show photo set, follow-up answers, flags and submittedAt. Distinguish factual per-photo review from approving a case/check-in. Needs_changes requires patient message and preserves prior submissions. Pregnant/out-of-NC/side-effect answers remain visible for clinician action.
- [ ] Rejection explains full refund and calls launch review endpoint, showing pending/failed/issued from provider-backed status. Remove manual “mark issued” for launch cases; allow authorized retry/refresh through durable review replay, never a local status toggle. Approval displays pending activation until reconciled, avoiding false care-start confirmation.
- [ ] Tests: approval prerequisites, duplicate click/retry, concurrency, rejected/refund failure/success, legacy decision behavior, all check-in states and reassignment denial. Verify: `cd web-portal && npm test && npm run typecheck`.

### C5. “Prescription sent” recorder and approved templates

**Files:** modify `web-portal/src/components/patients/PatientRoutineCare.tsx`, `src/components/patients/workspace/CareRail.tsx`; create `src/components/patients/PrescriptionSentForm.tsx`, `PrescriptionSentHistory.tsx`, `web-portal/tests/prescription-sent.test.ts`.
- [ ] Add recorder to existing patient plan workspace: drug, strength, directions/sig, full pharmacy and date/time sent; clinician confirms already sent outside UNZIT in TreatRx. Reuse native form/dialog validation, record IDs for retries, date formatting and existing prescription visual tokens.
- [ ] Show saved chart entry/history and pending unsaved state accurately; no “send e-Rx,” dispensing success or shipping control. Prefill current destination but confirm/save immutable pharmacy snapshot; missing ID/approval/current NC blocks the action with server explanation.
- [ ] Reuse existing template picker/editor/versioned routine assignment for six clinically approved templates from A8. No automatic pregnancy-safe drug prescribing, new clinical scoring or independent treatment engine.
- [ ] Tests: each required field, date conversion/future date, retry/duplicate, pharmacy snapshot and current assignment, legacy prescriptions lacking new fields, persisted record rendered. Verify: `cd web-portal && npm test && npm run typecheck`.

### C6. Copy, access regression and one portal acceptance pass

**Files:** modify `web-portal/tests/enrollment-status.test.ts`, `care-decisions.test.ts`, `check-ins.test.ts`, `worklist.test.ts`; create `web-portal/tests/launch-workspace.test.ts`; update only affected C-owned launch surfaces and `src/lib/quick-replies.ts` if turnaround text conflicts.
- [ ] Standardize launch review copy to 1 to 2 business days, retain approved emergency guidance/Letterpress. No score/streak, Vida integration, billing operator editor or web patient enrollment scope.
- [ ] Tests: API denied after clinician reassignment, no stale patient/session data, no manual refund issue on launch accounts, correct ID/intake/check-in/Rx navigation plus existing photo/message/routine regressions. Browser acceptance against local synthetic API: review one case and one check-in, request corrections, record TreatRx prescription and observe refund state; check keyboard/focus and narrow layout.
- [ ] Verify: `cd web-portal && npm test && npm run lint && npm run typecheck && npm run build`. Build font downloads may require network; report actual errors rather than treating unit tests as build evidence.

## Integration exit criteria and handoff

- A1 contract freeze is the only client start dependency. Integrate A2–A9 API and B/C mocks after their focused suites, then A10 once end to end. Run existing `care-access-reviewer` and `api-contract-checker` agent instructions before implementation commits; reconcile any DTO drift in all three owned trees.
- Acceptance: allowlisted account → four receipts → private ID/live selfie + NC → eligible → real/fake confirmed payment → branched intake/preference → all required photos → correct destination → submitted receipt → manual ID/case approval → one first-month payment, active care → scheduled complete check-in in queue → recorded external prescription → paid-period cancel. Separate rejection proves real full refund; plan switches prove immediate settlement and fresh cadence.
- Recovery round-trips new clinical/payment records and private images; no new anon/authenticated access. Existing enrollment/form/routine/message/photo contracts and installed iOS decoding remain compatible. No secrets/private CSV or clinical fixtures are committed.
- Each engineer reports exact commands/results and remaining blockers. Clinical use/distribution, hosted migrations and deploy remain separate release work requiring the approvals described in CLAUDE.md; this plan does not lift the current pilot/App Store hold.

## Conflicts, assumptions and open questions

- **Resolved by final decisions:** drafts/site say $55, optional undefined weekly upgrade/UNZIT Score, follow-up at 8–12 weeks then quarterly, and refund-on-referral undecided. Implement $39/$89 settings, no score, monthly/All-In eight weekly check-ins, full post-payment rejection refund. Prototype weekly toggle and any sample prices are not production behavior. External marketing/source documents need separate owner updates.
- **Existing code conflicts:** default non-NC states and pregnancy/breastfeeding exclusion, screening-before-single-consent order, pre-enrollment photo gate, hidden clinician forms, legacy score/streak mutations and manual refund-issued control must change for launch. Do not rewrite working repositories, form/routine histories or legacy DTOs. The old design document's “no schema changes” was scoped to the Letterpress redesign; this launch explicitly requires additive migrations.
- **Approval/billing interpretation:** this plan captures one prepaid month, waits for ID AND medical approval, and starts a full paid period/cadence at approval. Confirm that this is the intended meaning of “plan doesn't start until approved”; otherwise billing and cancellation terms need a contract revision. Also confirm preapproval cancellation preserves the prepaid review/month, and wholly unused preapproval switches settle the full difference. Stripe test allocation is the largest engineering risk.
- **Cadence interpretation:** approve the explicit +7…+56 then monthly-from-day-56 rule, monthly replaced during weekly weeks, and preservation of overdue obligations on switch. Final decisions do not specify these boundary details; they are proposed deterministic defaults, not an 8–12-week protocol follow-up substitute.
- **Clinical/legal content still needed:** sources are unsigned DRAFTs. Obtain approved four documents, effective dates/address/retention language, final questionnaire/preference wording, six templates, licensure and prescribing workflow sign-off. Source §3h additionally asks adherence at follow-up; final decision 4 lists five topics and this plan follows those five. Confirm whether to add an eighth fixed form question before A1 freeze. Do not fabricate approved consent text from this summary. Resolve source urgency conflicts C-4/C-5/C-8, pregnancy branch ambiguity C-7, BPO wording C-9 and medication exclusions with Dr. Om; do not add an automated formulary/exclusion engine in this launch plan.
- **Location/pharmacy:** final decision requires NC shipping only for All-In, while source ID-3 asks every patient for NC shipping and IP-region/written exception. This plan uses affirmative physical-location evidence for both and NC shipping only All-In; confirm whether IP geolocation/exception evidence is required (not built here). Define freshness for NC attestation at later prescribing messages/refills; current plan blocks Rx without current affirmative case/check-in evidence. Confirm Care can choose any pharmacy and All-In pharmacy changes mean switching plans.
- **Operational inputs:** Stripe test keys/webhook configuration and a test-verified API version are unavailable; real Stripe evidence cannot be replaced by fake tests. Confirm launch clinician assignment, waitlist CSV email column/authoritative export, retry-monitoring interval, failed-renewal handling (proposed no extension beyond paidThrough), tax treatment (proposed listed USD totals, no automatic tax until configured) and how long abandoned paid cases wait before operational refund review.
- **Launch readiness outside implementation:** current synthetic-demo/pilot/distribution hold, counsel review, provider agreements/appropriate data-processing arrangements and NC licensure remain owner release prerequisites. Vida pricing/compounding confirmation and public privacy/terms/NC availability copy remain source-set issues; no Vida API, website rewrite, Cloud Run/Paubox, bundle/org migration or colour overhaul is included.
