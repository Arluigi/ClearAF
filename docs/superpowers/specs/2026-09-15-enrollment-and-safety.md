# Release 1 — enrollment and safety

First release of the [client brief](../../features/client-brief-2026-09-14.md) (GitHub #13), tracked in [client expansion](../../features/client-expansion.md). The owner asked to go straight to development and delegated implementation decisions; defaults for questions the client has not answered are recorded in the tracker and must stay configurable or clearly labeled. Synthetic data only; the app remains unapproved for clinical use.

Scope: eligibility screening and informed consent, clinician "refer out / needs in-person" decisions with a refund status, and a patient urgent flag with a clinician urgent queue. Also a cleanup of unreachable legacy code in both clients. Out of scope: payment processing, prescribing, pharmacy integration, notifications/push, message limits (none exist), and anything in Releases 2–3.

## Shared rules

- Every route mounts behind `authenticateToken`; roles come from the server. Clinician access requires current assignment, rechecked under the patient-profile `FOR UPDATE` (writes) or `FOR SHARE` (reads) lock, like `routineCare` and `assignedMessages`.
- Client-generated UUIDs make writes idempotent: exact replay returns 200 with the stored record, same ID with different content returns 409, new record 201. Unique-constraint races retry once, as existing services do.
- Strict zod bodies/queries in `services/*Validation.ts`; list endpoints use `{data, pagination:{page,limit,total,totalPages}}`, limit 1–50.
- New tables: RLS enabled, all privileges revoked from PUBLIC/anon/authenticated, service_role only; Prisma `@@map`; listed in `applicationTables` of the recovery drill. Additive only; no seeded rows (the recovery drill restores data-only into a fresh migrated database).
- Errors never contain free text the patient entered. Logs stay metadata-only.
- UI follows `docs/design/design-language.md`. Urgent and not-eligible states use semantic error/destructive colours plus an icon and a text label, never colour alone. No scores, streaks or response-time promises.

## 1. Eligibility and consent

**Where it sits.** The screener cannot run before an account exists without storing sensitive answers anonymously, so it runs immediately after the first verified sign-in, before onboarding and before any clinical feature. "Signup completes" means enrollment plus onboarding. Existing accounts are screened the next time they open the app.

**Rules** live in `backend/src/services/enrollmentRules.ts` with an exported `RULES_VERSION` recorded on each screening:
- State of residence: USPS code for the 50 states and DC, or `NON_US`. Eligible only if in `LICENSED_STATES` (env, comma-separated; default demo list `CA,FL,IL,NY,TX`, labeled a placeholder). `NON_US` is never eligible.
- Age: from date of birth (`YYYY-MM-DD`, real calendar date, not in the future) against the server's current UTC date. Minimum `MINIMUM_PATIENT_AGE` (env, default 18).
- Pregnancy status (single select): `none`, `pregnant`, `trying_to_conceive`, `breastfeeding`. `pregnant` and `breastfeeding` are not eligible for async care; `trying_to_conceive` is eligible and raises a flag shown to the clinician.
- Result: `{eligible, reasons: ('state'|'age'|'pregnancy'|'breastfeeding')[], flags: ('trying_to_conceive')[]}` computed only on the server.

**Consent document** is versioned in code (`backend/src/content/consent.ts`): `{version, title, body}` plus a SHA-256 of the exact title+body. Version 1 is a clearly marked DRAFT placeholder that states it is pending clinical/legal review. A later version replaces it by adding an entry; accepting an older version is rejected.

**Data**
- `eligibility_screenings`: `id` (client UUID), `userId`, `stateCode`, `dateOfBirth` (date), `pregnancyStatus`, `eligible`, `reasons` (text[]), `flags` (text[]), `rulesVersion`, `submittedAt`, `waitlistRequestedAt` (nullable, set once). Immutable otherwise. A patient may submit again (e.g. after moving); the latest screening decides status and all are kept.
- `consent_acceptances`: server UUID, `userId`, `documentVersion`, `documentSha256`, `acceptedAt`; unique `(userId, documentVersion)`.

**Status** = `screening_required` (no screening) → `ineligible` (latest screening not eligible) → `consent_required` (current version not accepted) → `enrolled`.

**API** (`/api/enrollment`)
- `GET /` (patient) → `{status, rulesVersion, screening: Screening|null, consent: {version, title, body, sha256, acceptedAt|null}}`.
- `PUT /screenings/:screeningId` (patient) body `{stateCode, dateOfBirth, pregnancyStatus}` → `{screening, status}`.
- `PUT /waitlist` (patient) body `{screeningId}` → `{screening}`; only the caller's latest screening and only when ineligible; idempotent.
- `PUT /consents/:version` (patient) body `{documentSha256}` → `{acceptance, status}`; requires `enrolled`-eligible latest screening, current version and matching hash (409 otherwise). Idempotent.
- `GET /patients/:patientId` (assigned clinician) → `{status, screening, screeningCount, consent: {version, acceptedAt|null}}` without the consent body.

**Enforcement.** `requireEnrolledPatient` middleware returns 403 `ENROLLMENT_REQUIRED` for patient clinical writes when status is not `enrolled`: photo capture intent/complete and legacy upload routes, routine completion PUT, check-in response PUT, patient message sends. Clinicians pass through. Reads, profile, enrollment, care-decision reads and urgent reports are never gated (an urgent report must always be possible). `ENROLLMENT_ENFORCEMENT=off` disables it so production can keep serving installed older builds until the updated iOS app is installed; default `on`.

**iOS.** New `enrollment` phase between profile load and onboarding. Screener: state picker (menu/searchable), date-of-birth picker, pregnancy single select, Continue. Not eligible: plain explanation of the reason(s), "You have not been charged", a "Notify me if ClearAF becomes available to me" waitlist action, and Sign out. Consent: scrollable title/body, explicit "I understand and agree" button, Sign out. Offline or failed enrollment fetch reuses the profile-error retry state. A 403 `ENROLLMENT_REQUIRED` from any request re-checks enrollment.

**Portal.** Patient workspace header shows eligibility (eligible / not eligible with reason / not screened), the trying-to-conceive flag, and consent version with date.

## 2. Care decisions (non-candidate / escalation)

**Data** `care_decisions`: `id` (client UUID), `patientId`, `clinicianId`, `decision` (`async_care` | `refer_out` | `needs_in_person`), `patientMessage` (optional, trimmed, ≤ 2000), `photoId` (optional; must belong to the patient, application-checked like message references, no FK), `refundStatus` (`not_applicable` | `pending` | `issued`), `refundUpdatedAt`, `createdAt`. `refer_out`/`needs_in_person` start `pending`; `async_care` is `not_applicable`. Rows are immutable except the one-way refund transition `pending → issued`. The latest row is the patient's current care status; no row means async care.

**API** (`/api/care-decisions`)
- `GET /current` (patient) → `{decision: CareDecision|null}` (latest).
- `GET /patients/:patientId?page&limit` (assigned clinician) → paginated history, newest first.
- `PUT /patients/:patientId/decisions/:decisionId` (assigned clinician) body `{decision, patientMessage, photoId}` → `{decision}`.
- `PUT /patients/:patientId/decisions/:decisionId/refund` (assigned clinician) body `{refundStatus: 'issued'}` → `{decision}`; 409 unless pending; idempotent when already issued.
- `CareDecision = {id, patientId, clinicianId, clinicianName, decision, patientMessage, photoId, refundStatus, refundUpdatedAt, createdAt}`.

**Portal.** Beside each photo's "Mark reviewed": "Refer out" and "Needs in-person", opening a confirm dialog with an optional patient-facing message and the photo linked. A "Care status" card at the top of the workspace shows the current status, its history, "Mark refund issued" while pending, and "Resume async care".

**iOS.** When the current decision is `refer_out` or `needs_in_person`, Today shows a care-status card: what the clinician decided, their message, next steps (see an in-person dermatologist; your photos and history stay available; you can still message your care team) and the refund status in plain words. The rest of the app keeps working; this is not a dead end.

## 3. Urgent flag

**Data** `urgent_reports`: `id` (client UUID), `patientId`, `clinicianId` (assigned at creation, provenance), `category` (`reaction_to_treatment` | `rapid_worsening` | `pain_or_infection` | `other`), `description` (trimmed 1–2000), `status` (`open` | `acknowledged` | `resolved`), `createdAt`, `acknowledgedAt/By`, `resolvedAt/By`, `resolutionNote` (optional patient-facing, ≤ 2000). Status only moves forward; DB checks keep the timestamps consistent with status.

**Visibility.** The queue follows current assignment, not the original clinician, so an open report is never stranded by reassignment. Reports never count as messages and have no limit.

**API** (`/api/urgent-reports`)
- `PUT /:reportId` (patient) body `{category, description}` → `{report}`; 409 `NO_ASSIGNED_CLINICIAN` when unassigned (client then shows emergency and support guidance).
- `GET /` (patient) → own reports, paginated, newest first.
- `GET /queue?page&limit` (clinician) → unresolved reports of currently assigned patients: open before acknowledged, then oldest first, then ID; each row includes `patientName`; response adds `openCount`.
- `GET /patients/:patientId?page&limit` (assigned clinician) → that patient's history.
- `POST /:reportId/acknowledge` and `POST /:reportId/resolve` body `{resolutionNote}` (assigned clinician) → `{report}`; idempotent on repeat, 409 on backwards moves.

**iOS.** A "Something's wrong?" row near the top of Today (warning symbol, label text) opens a sheet: an emergency notice first ("If you have trouble breathing, swelling of your face, lips or throat, or feel seriously unwell, call 911 now."), category picker, description, Send with a stable report ID kept for retry. After sending: "Sent. It's flagged as urgent at the top of your care team's queue." — no promised response time. Recent reports show their status and any resolution note.

**Portal.** An "Urgent reports" section above "Photos awaiting review" on Patients, styled with the destructive token, warning icon and "Urgent" label, oldest open first, linking to the workspace. The workspace lists the patient's urgent reports with Acknowledge and Resolve (with optional note).

## 4. Cleanup

Remove code no user can reach, verified by build and grep before deletion: iOS `CareView`, `ShopView`, `AppointmentBookingView`, `AppointmentDetailView`, `MedicalProfileView`, unused ProfileView/OnboardingView/Dashboard/Progress subviews (legacy settings, export, help, privacy, score, streak and fabricated "+3 from last week" components) and APIService appointment/product methods; portal API methods for retired messaging, appointments, prescriptions, dashboard stats, photo timeline and `uploadFile`, with their now-unused types (updating tests that used them as fixtures). Turn the bare "Check-in" and "Completion history" links into Care Journal rows; format check-in history timestamps. Correct stale docs (device status, README). Legacy backend routes stay; retiring them is a separate API decision.

## Acceptance

1. Rules matrix (state in/out, `NON_US`, age boundary on birthday, each pregnancy value) and consent version/hash checks have unit tests; gate on/off behaviour, every gated route and the ungated urgent route have route tests.
2. Denial tests for every new endpoint: anonymous, wrong role, other patient, unassigned and reassigned clinician. Idempotent replay and 409 conflicts covered. Urgent queue ordering and reassignment visibility covered.
3. Local migration applied; RLS and grants verified; migration-chain and recovery inventory tests pass; recovery drill still passes.
4. Loopback-only live probe creates exact synthetic accounts, exercises all three features end to end and cleans up by recorded ID.
5. Portal: controller tests, lint, typecheck, build; Playwright walkthrough of enrollment status, refer-out with refund, urgent queue acknowledge/resolve.
6. iOS: repository tests, signed Simulator build, walkthrough of screener → not eligible, screener → consent → onboarding, urgent report, care-status card.
7. `care-access-reviewer`, `api-contract-checker` and `/code-review` findings resolved in one fix wave. PR with green CI. Merge, API deploy and hosted migration wait for explicit approval; production starts with `ENROLLMENT_ENFORCEMENT=off`.
