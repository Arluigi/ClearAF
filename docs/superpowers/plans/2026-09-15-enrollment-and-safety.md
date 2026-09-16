# Release 1 — Enrollment and Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eligibility screening + informed consent gate, clinician refer-out/needs-in-person decisions with refund status, and a patient urgent flag with a clinician urgent queue — across API, portal and iOS — plus removal of unreachable legacy client code.

**Architecture:** Four additive backend-only tables behind the existing Express API, one service/validation/route trio per feature following `routineCare`/`assignedMessages`. A `requireEnrolledPatient` middleware gates patient clinical writes (switchable by `ENROLLMENT_ENFORCEMENT`). Portal adds generation-bound API methods and small controllers; iOS adds account-bound repositories and an `enrollment` phase.

**Tech Stack:** Express + Prisma (query client) + zod, Supabase Postgres 17 migrations (CLI 2.117.0), Next.js 15/React 19 + Tailwind/shadcn, SwiftUI iOS 17 + Swift Testing. Tests: `node --import tsx --test`, xcodebuild.

**Spec:** `docs/superpowers/specs/2026-09-15-enrollment-and-safety.md`

## Global Constraints

- Work in the worktree `/Users/aryansachdev/code/ClearAF/.claude/worktrees/client-r1-enrollment-safety` only. Never `cd` into the main checkout.
- Never read or print `.env*` (except `.env.example`), `.local/`, `Local.generated.xcconfig`. Copy them with `cp` only.
- Migrations: `npx --yes supabase@2.117.0 migration new <name>`; never edit committed migrations, `supabase/baseline.json` or `supabase/legacy-migrations`. No seeded rows. New tables: `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM PUBLIC,anon,authenticated`, `GRANT ALL ... TO service_role`, Prisma `@@map`, add to `applicationTables` in `backend/scripts/recovery-drill.cjs`.
- Every new route: behind `authenticateToken` (mounted in `backend/src/server.ts`), role via `requirePatient`/`requireDermatologist`, clinician assignment rechecked after locking the patient profile (`FOR UPDATE` writes, `FOR SHARE` reads). Unknown/unassigned patients → 404, wrong role → 403.
- Client-generated UUID ids; exact replay 200, conflicting replay 409, create 201. Strict zod objects; UUIDs lowercased. Pagination `{data, pagination:{page,limit,total,totalPages}}`, limit 1–50, default 20.
- Error bodies never echo patient free text; logs metadata-only. Route wrappers map unknown errors to generic 500 like `routes/care-support.ts`.
- Enum values (exact): state `^[A-Z]{2}$` from the USPS list below or `NON_US`; pregnancy `none|pregnant|trying_to_conceive|breastfeeding`; reasons `state|age|pregnancy|breastfeeding`; flags `trying_to_conceive`; enrollment status `screening_required|ineligible|consent_required|enrolled`; decision `async_care|refer_out|needs_in_person`; refund `not_applicable|pending|issued`; urgent category `reaction_to_treatment|rapid_worsening|pain_or_infection|other`; urgent status `open|acknowledged|resolved`.
- Text limits: patient message / description / resolution note trimmed 1–2000.
- USPS list: AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY.
- Env: `LICENSED_STATES` (default `CA,FL,IL,NY,TX`), `MINIMUM_PATIENT_AGE` (default `18`), `ENROLLMENT_ENFORCEMENT` (`off` disables; anything else = on). Add all three, commented, to `backend/.env.example`.
- UI copy: sentence case, no scores/streaks/response-time promises; urgent/not-eligible use destructive/error semantic colour + icon + text. Emergency notice text exactly: "If you have trouble breathing, swelling of your face, lips or throat, or feel seriously unwell, call 911 now."
- iOS target iOS 17; the Xcode project uses file-system-synchronized groups, so adding/removing files under `ClearAF/`, `ClearAFTests/`, `ClearAFUITests/` needs no project edits. Build with signing: `-derivedDataPath /tmp/clearaf-r1-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- -parallel-testing-enabled NO` piped through `xcbeautify`, destination `platform=iOS Simulator,name=iPhone 17`.
- Commit after each task with a conventional message and the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File map

Backend (`backend/`)
- Create `src/services/enrollmentRules.ts` — pure rules + USPS list + `RULES_VERSION`.
- Create `src/content/consent.ts` — versioned consent documents + sha256.
- Create `src/services/enrollmentValidation.ts`, `src/services/enrollment.ts`, `src/routes/enrollment.ts`.
- Create `src/middleware/enrollmentGate.ts` — `requireEnrolledPatient`.
- Create `src/services/careDecisionsValidation.ts`, `src/services/careDecisions.ts`, `src/routes/care-decisions.ts`.
- Create `src/services/urgentReportsValidation.ts`, `src/services/urgentReports.ts`, `src/routes/urgent-reports.ts`.
- Modify `src/server.ts` (mount 3 routers), `src/routes/photos.ts`, `src/routes/routines.ts`, `src/routes/care-support.ts`, `src/routes/assigned-messages.ts` (apply gate), `prisma/schema.prisma`, `.env.example`.
- Create tests `tests/enrollment-rules.test.ts`, `tests/enrollment.test.ts`, `tests/enrollment-gate.test.ts`, `tests/care-decisions.test.ts`, `tests/urgent-reports.test.ts`; modify existing route tests to set `ENROLLMENT_ENFORCEMENT='off'`.
- Create `scripts/lib/enrollment-fixture.cjs`; create `scripts/enrollment-safety-live.cjs`; modify live/fixture scripts and `scripts/recovery-drill.cjs`.
- Create `../supabase/migrations/<timestamp>_enrollment_and_safety.sql`.

Portal (`web-portal/src/`)
- Create `lib/enrollment.ts`, `lib/care-decisions.ts`, `lib/urgent-reports.ts` (types + controllers).
- Modify `lib/api.ts` (new methods, remove dead ones), `types/api.ts` (remove dead types).
- Create `components/patients/EnrollmentStatus.tsx`, `components/patients/CareStatusCard.tsx`, `components/patients/CareDecisionDialog.tsx`, `components/patients/UrgentReportQueue.tsx`, `components/patients/PatientUrgentReports.tsx`.
- Modify `app/patients/page.tsx`, `app/patients/[id]/page.tsx`, `components/patients/PatientPhotoHistory.tsx`.
- Tests in `web-portal/tests/`.

iOS (`ClearAF/`)
- Create `Services/EnrollmentModels.swift`, `Services/EnrollmentRepository.swift`, `Services/CareDecisionRepository.swift`, `Services/UrgentReportRepository.swift`.
- Create `Views/EnrollmentView.swift`, `Views/UrgentReportView.swift`, `Views/CareStatusCard.swift`.
- Modify `Services/APIService.swift`, `ContentView.swift`, `Views/DashboardViewEnhanced.swift`, `Views/RoutineView.swift`, `Views/CheckInView.swift`.
- Delete unreachable legacy files (Task 1).
- Tests `ClearAFTests/EnrollmentTests.swift`, `ClearAFTests/SafetyTests.swift`; modify `ClearAFUITests/AccountFlowUITests.swift`.

---

### Task 1: Remove unreachable legacy client code and polish entry rows

Independent of all other tasks. No behaviour change for reachable screens except the two rows and timestamp formatting.

**Files:**
- Delete: `ClearAF/Views/CareView.swift`, `ClearAF/Views/ShopView.swift`, `ClearAF/Views/AppointmentBookingView.swift`, `ClearAF/Views/AppointmentDetailView.swift`, `ClearAF/Views/MedicalProfileView.swift`
- Modify: `ClearAF/Views/ProfileView.swift`, `ClearAF/Views/OnboardingView.swift`, `ClearAF/Views/DashboardViewEnhanced.swift`, `ClearAF/Views/ProgressView.swift`, `ClearAF/Views/RoutineView.swift`, `ClearAF/Views/CheckInView.swift`, `ClearAF/Views/MessagingView.swift`, `ClearAF/Views/DesignSystem.swift`, `ClearAF/Services/APIService.swift`
- Modify: `web-portal/src/lib/api.ts`, `web-portal/src/types/api.ts`, `web-portal/tests/auth.test.ts`
- Modify: `docs/features/expansion.md`, `docs/handoff/README.md`, `README.md`

- [ ] **Step 1: Prove each candidate is unreachable before deleting.** For every type below run `grep -rn "<TypeName>" ClearAF ClearAFTests ClearAFUITests --include=*.swift` and confirm the only references are its own declaration, its `#Preview`, or other candidates in this list.
  Candidates: `CareView`, `ShopView`, `ProductCardView`, `AppointmentBookingView` (and its step/indicator/button subviews in that file), `AppointmentDetailView`, `AppointmentStatusBadge`, `DetailRow`, `AppointmentPhotoCard`, `VideoCallView`, `MedicalProfileView`, `MedicalSection`, `StatCard`, `SettingsRow`, `EditProfileView`, `SkinTypeView`, `NotificationSettingsView`, `NotificationToggle`, `ExportDataView`, `ExportOption`, `DataSummaryRow`, `ShareSheet`, `HelpSupportView`, `HelpItem`, `PrivacyPolicyView`, `PrivacySection`, `EnhancedStatCard`, `WelcomeScreen`, `AppExplanationScreen`, `ProfileSetupScreen`, `CameraPermissionsScreen`, `FirstPhotoScreen`, `FeatureCard`, `PermissionFeature`, `PhotoTip`, `TaskProgressIndicator`, `AnimatedScoreDisplay`, `StreakIndicator`, `EnhancedProgressBar`, `ProgressInsight`, `ProgressPhotoTip`, `EnhancedFloatingActionButton`, and in DesignSystem `scoreColor`, `scoreDescription`, `scoreGradient`, `scoreAccessibility`, `sunsetGradient`, `progressGradient`, `scoreExcellent/Good/Fair/Poor`.
  In APIService: `createAppointment`, `fetchAppointments`, `fetchProducts`, `CreateAppointmentRequest`, `CreateAppointmentResponse`, `AppointmentResponse`, `AppointmentListResponse`, `syncProfile`, `SyncProfileResponse`, `updateProfile`, `getCurrentUser`, `performAuthenticatedRequest`, `LoginRequest`, `RegisterRequest`, `AuthResponse`, `APIPhoto`, `PhotoUploadResponse`, `APIError`, `ValidationError`. Keep anything still referenced (e.g. `EmptyBody`, `UpdateProfileRequest`, `AccountSaveState`, `AccountName`, `Color.primaryActionPurple/Teal`, `PrimaryButtonStyle`, `retainedErrorText`, `textSecondary`). `PersistenceController.preview` and the Core Data entities stay (the model is unchanged).
  If a candidate turns out to be referenced by reachable code, keep it and note it in the commit message.

- [ ] **Step 2: Delete / trim.** Delete the five files. Remove the unreachable types from the modified files. `MessagingView`: drop the unused `init(dermatologist:)` parameter (keep `init()` implicit). Keep `ProfileView` itself, `OnboardingView` itself, `PhotoSharingStatusView`, `PhotoDetailView`, `PhotoReviewStatusView`, `EnhancedEmptyProgressView`, grid/list views, `DailyPhotoCardEnhanced`, `DailyTasksCardEnhanced`, `PhotoDisplaySection`, `TodayPhotoActionAppearance`.

- [ ] **Step 3: Replace bare links with Care Journal rows.** In `DashboardViewEnhanced` replace `NavigationLink("Check-in") { CheckInView() }` with a row inside a `careJournalSurface()` card placed after `DailyTasksCardEnhanced`:

```swift
struct CareLinksCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceMD) {
            Text("Care team").font(.headlineLarge)
            NavigationLink { CheckInView() } label: {
                Label("Check-in from your clinician", systemImage: "list.clipboard")
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
        }
        .careJournalSurface()
        .padding(.horizontal, 20)
    }
}
```
In `RoutineView` move `NavigationLink("Completion history")` into the toolbar as `NavigationLink { CompletionCalendarView() } label: { Label("Completion history", systemImage: "calendar") }` (keep the existing Refresh button; use `ToolbarItemGroup`).

- [ ] **Step 4: Format check-in history timestamps.** In `CheckInHistoryView` replace `Text("Submitted: \(record.submittedAt)")` / `Received` with a helper:

```swift
private func formatted(_ value: String) -> String {
    RoutineDates.instant(value)?.formatted(date: .abbreviated, time: .shortened) ?? value
}
```
and render `Text("Submitted \(formatted(record.submittedAt))")`, `Text("Received \(formatted(record.receivedAt))")`.

- [ ] **Step 5: Portal dead API.** In `web-portal/src/lib/api.ts` remove methods with no caller in `src/`: verify with `grep -rn "\.<method>(" web-portal/src` for each of `updatePatient`, `assignPatientToDermatologist`, `getAppointments`, `createAppointment`, `updateAppointment`, `deleteAppointment`, `getMessages`, `sendMessage`, `markMessageAsRead`, `getPrescriptions`, `createPrescription`, `updatePrescription`, `getDashboardStats`, `getPatientPhotos`, `getPhotoTimeline`, `uploadFile`. Remove types in `types/api.ts` that become unused (`Message`, `Product`, `Prescription`, `Appointment`, `DashboardStats`, `LoginRequest`, `RegisterRequest`, `RegisterResponse`, `APIResponse`, and `User.skinPhotos/appointments/prescriptions` fields) — check each with grep across `src/` and `tests/`. In `tests/auth.test.ts`: delete the test "prescription and appointment list envelopes become portal paginated data"; in "late clinical response..." replace `scoped.sendMessage({ receiverId: 'patient-a', content: 'old continuation' })` with `scoped.getPatient('patient-a')`.

- [ ] **Step 6: Docs.** `docs/features/expansion.md` and `docs/handoff/README.md`: replace statements that the physical iPhone still needs the updated app with "The demo iPhone runs the current build (confirmed by the owner on September 15, 2026)." `docs/handoff/README.md`: add a line pointing to `docs/features/client-expansion.md`. `README.md`: replace the historical feature/"purple theme"/scores/project-structure sections with a short accurate overview: patient iOS app (Today, Photos, Routines, Messages; Profile), clinician portal, Express API over Supabase, link to `CLAUDE.md`-independent docs `docs/baseline/README.md` and `docs/handoff/README.md`, status "synthetic demo, not approved for clinical use".

- [ ] **Step 7: Verify.**
  Run: `cd web-portal && npm test && npm run lint && npm run typecheck && npm run build` — expect all pass (test count drops by one).
  Run the iOS unit suite with the Global Constraints xcodebuild command plus `-only-testing:ClearAFTests test` — expect success, zero compile errors.

- [ ] **Step 8: Commit** `chore: remove unreachable legacy client code and tidy entry rows`.

### Task 2: Schema, Prisma models, recovery inventory and enrolled fixtures

**Files:**
- Create: `supabase/migrations/<timestamp>_enrollment_and_safety.sql` (via CLI)
- Modify: `backend/prisma/schema.prisma`, `backend/scripts/recovery-drill.cjs`
- Create: `backend/scripts/lib/enrollment-fixture.cjs`
- Modify: `backend/scripts/security-live.cjs`, `photo-capture-live.cjs`, `photo-thumbnail-live.cjs`, `photo-review-live.cjs`, `routine-care-live.cjs`, `care-support-live.cjs`, `routine-ui-fixture.cjs`, `mvp-volume-fixture.cjs`, `../scripts/assigned-messages-live.cjs`

**Interfaces:**
- Produces Prisma models `EligibilityScreening`, `ConsentAcceptance`, `CareDecision`, `UrgentReport` (client names `prisma.eligibilityScreening` etc.) with the columns below; relations `User.eligibilityScreenings`, `User.consentAcceptances`, `User.careDecisions`, `User.urgentReports`, `Dermatologist.careDecisions`, `Dermatologist.urgentReports`, `Dermatologist.urgentAcknowledgements`, `Dermatologist.urgentResolutions`.
- Produces `enrollFixture(db, userIds: string[], {rulesVersion, documentVersion, documentSha256})` and `unenrollFixture(db, userIds)` in `backend/scripts/lib/enrollment-fixture.cjs` (pg `Client`).

- [ ] **Step 1: Create the migration.** Run from the worktree root: `npx --yes supabase@2.117.0 migration new enrollment_and_safety`. Put exactly this SQL in the created file:

```sql
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
```
Resolving an open report sets both acknowledged and resolved fields (the checks require it).

- [ ] **Step 2: Prisma models.** Append to `backend/prisma/schema.prisma` and add the relation fields listed under Interfaces to `User` and `Dermatologist`:

```prisma
model EligibilityScreening {
  id String @id @db.Uuid
  userId String @db.Uuid
  stateCode String
  dateOfBirth DateTime @db.Date
  pregnancyStatus String
  eligible Boolean
  reasons String[] @default([])
  flags String[] @default([])
  rulesVersion String
  submittedAt DateTime @default(now()) @db.Timestamp(3)
  waitlistRequestedAt DateTime? @db.Timestamp(3)
  user User @relation(fields: [userId], references: [id], onDelete: Restrict, onUpdate: NoAction)
  @@index([userId, submittedAt(sort: Desc), id(sort: Desc)], map: "eligibility_screenings_user_latest_idx")
  @@map("eligibility_screenings")
}
model ConsentAcceptance {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId String @db.Uuid
  documentVersion Int
  documentSha256 String
  acceptedAt DateTime @default(now()) @db.Timestamp(3)
  user User @relation(fields: [userId], references: [id], onDelete: Restrict, onUpdate: NoAction)
  @@unique([userId, documentVersion], map: "consent_acceptances_user_version_key")
  @@map("consent_acceptances")
}
model CareDecision {
  id String @id @db.Uuid
  patientId String @db.Uuid
  clinicianId String @db.Uuid
  decision String
  patientMessage String?
  photoId String? @db.Uuid
  refundStatus String
  refundUpdatedAt DateTime? @db.Timestamp(3)
  createdAt DateTime @default(now()) @db.Timestamp(3)
  patient User @relation(fields: [patientId], references: [id], onDelete: Restrict, onUpdate: NoAction)
  clinician Dermatologist @relation(fields: [clinicianId], references: [id], onDelete: Restrict, onUpdate: NoAction)
  @@index([patientId, createdAt(sort: Desc), id(sort: Desc)], map: "care_decisions_patient_latest_idx")
  @@map("care_decisions")
}
model UrgentReport {
  id String @id @db.Uuid
  patientId String @db.Uuid
  clinicianId String @db.Uuid
  category String
  description String
  status String @default("open")
  createdAt DateTime @default(now()) @db.Timestamp(3)
  acknowledgedAt DateTime? @db.Timestamp(3)
  acknowledgedBy String? @db.Uuid
  resolvedAt DateTime? @db.Timestamp(3)
  resolvedBy String? @db.Uuid
  resolutionNote String?
  patient User @relation(fields: [patientId], references: [id], onDelete: Restrict, onUpdate: NoAction)
  clinician Dermatologist @relation("UrgentReportClinician", fields: [clinicianId], references: [id], onDelete: Restrict, onUpdate: NoAction)
  acknowledger Dermatologist? @relation("UrgentReportAcknowledger", fields: [acknowledgedBy], references: [id], onDelete: Restrict, onUpdate: NoAction)
  resolver Dermatologist? @relation("UrgentReportResolver", fields: [resolvedBy], references: [id], onDelete: Restrict, onUpdate: NoAction)
  @@index([patientId, createdAt(sort: Desc), id(sort: Desc)], map: "urgent_reports_patient_latest_idx")
  @@map("urgent_reports")
}
```
On `Dermatologist` the three urgent relations are `urgentReports UrgentReport[] @relation("UrgentReportClinician")`, `urgentAcknowledgements UrgentReport[] @relation("UrgentReportAcknowledger")`, `urgentResolutions UrgentReport[] @relation("UrgentReportResolver")`.
Run `cd backend && npx prisma validate && npx prisma generate` — expect success.

- [ ] **Step 3: Recovery inventory (red first).** Run `cd backend && node --import tsx --test tests/migration-chain.test.ts` — expect FAIL "Recovery omits eligibility_screenings". Add `'eligibility_screenings','consent_acceptances','care_decisions','urgent_reports'` to the `tables` array in `scripts/recovery-drill.cjs`. In the backup-mode check, allow the two enrollment tables to be non-empty only for fixture accounts: add them to the exclusion list of the zero-count loop and add after the photo check:

```js
      const enrollmentRows=(await db.query('select "userId" from public.eligibility_screenings union all select "userId" from public.consent_acceptances')).rows;
      assert(enrollmentRows.every(r=>fixture.accounts.some(a=>a.id===r.userId)), 'Non-fixture enrollment records');
```
Re-run the test — expect PASS.

- [ ] **Step 4: Enrolled fixture helper.** Create `backend/scripts/lib/enrollment-fixture.cjs`:

```js
// Loopback live scripts enroll their synthetic patients so gated writes behave like the app.
const crypto=require('node:crypto');
async function enrollFixture(db,userIds,{rulesVersion,documentVersion,documentSha256}){
 for(const userId of userIds){
  await db.query('insert into public.eligibility_screenings(id,"userId","stateCode","dateOfBirth","pregnancyStatus",eligible,reasons,flags,"rulesVersion") values($1,$2,$3,$4,$5,true,$6,$6,$7)',[crypto.randomUUID(),userId,'IL','1990-01-01','none','{}',rulesVersion]);
  await db.query('insert into public.consent_acceptances("userId","documentVersion","documentSha256") values($1,$2,$3) on conflict do nothing',[userId,documentVersion,documentSha256]);
 }
}
async function unenrollFixture(db,userIds){
 await db.query('delete from public.consent_acceptances where "userId"=any($1::uuid[])',[userIds]);
 await db.query('delete from public.eligibility_screenings where "userId"=any($1::uuid[])',[userIds]);
}
module.exports={enrollFixture,unenrollFixture};
```
The current document parameters come from the backend: scripts load them with `require('../../src/content/consent.ts')` is not possible from plain CJS, so scripts read them over HTTP instead — after sign-in call `GET /api/enrollment` with the patient token and pass `{rulesVersion, documentVersion: body.consent.version, documentSha256: body.consent.sha256}`. The fixture's `IL` must be inside `LICENSED_STATES`; if the running API's list excludes it the gate stays closed and the script fails loudly (intended).

- [ ] **Step 5: Wire live and fixture scripts.** In each script listed under Files: after patient accounts are created and signed in, call `enrollFixture` for patient IDs using the values from `GET /api/enrollment`; in cleanup call `unenrollFixture(db, accountIds)` before any `delete from user_profiles`. For `routine-ui-fixture.cjs` and `mvp-volume-fixture.cjs` (they create UI fixtures used by Simulator tests) do the same so fixture patients open straight into the app. `security-live.cjs` prepare enrolls patientA and patientB and its cleanup unenrolls. These scripts only run after Task 3 exists; in this task make the edits and run `node --check` on each file.

- [ ] **Step 6: Apply locally and verify protections.**
  Run: `cd backend && npm run db:migrate && npm run db:status` — expect the new version listed as applied.
  Run: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -XAt -c "select relname, relrowsecurity from pg_class where relname in ('eligibility_screenings','consent_acceptances','care_decisions','urgent_reports')" -c "select table_name, grantee from information_schema.role_table_grants where table_name in ('eligibility_screenings','consent_acceptances','care_decisions','urgent_reports') and grantee in ('anon','authenticated')"` — expect four rows with `t` and zero grant rows.
  Run: `npm test && npm run build` — expect pass.

- [ ] **Step 7: Commit** `feat(db): add enrollment and safety tables` (include migration file, schema, recovery drill, helper, script edits). Record the migration SHA-256 (`shasum -a 256 <file>`) in the commit body.

### Task 3: Enrollment API (rules, consent, screening, gate)

**Files:**
- Create: `backend/src/services/enrollmentRules.ts`, `backend/src/content/consent.ts`, `backend/src/services/enrollmentValidation.ts`, `backend/src/services/enrollment.ts`, `backend/src/routes/enrollment.ts`, `backend/src/middleware/enrollmentGate.ts`
- Modify: `backend/src/server.ts`, `backend/src/routes/photos.ts`, `backend/src/routes/routines.ts`, `backend/src/routes/care-support.ts`, `backend/src/routes/assigned-messages.ts`, `backend/.env.example`
- Modify tests (add enforcement-off line): `backend/tests/security.test.ts`, `photo-capture.test.ts`, `routine-care.test.ts`, `care-support-service.test.ts`, `assigned-messages-service.test.ts`
- Create tests: `backend/tests/enrollment-rules.test.ts`, `backend/tests/enrollment.test.ts`, `backend/tests/enrollment-gate.test.ts`

**Interfaces:**
- Consumes: Prisma `eligibilityScreening`, `consentAcceptance` (Task 2).
- Produces (used by Tasks 5–8):
  - `enrollmentRules.ts`: `RULES_VERSION: string`, `US_STATES: readonly string[]`, `STATE_CODES` (= US_STATES + `'NON_US'`), `PREGNANCY_STATUSES`, `rulesFromEnv(env?): EligibilityRules`, `ageOn(dob: string, today: string): number`, `evaluate(input, rules, today): {eligible: boolean; reasons: IneligibleReason[]; flags: ScreeningFlag[]}`.
  - `consent.ts`: `currentConsent(): {version: number; title: string; body: string; sha256: string}`, `consentHash(doc): string`.
  - `enrollment.ts`: `enrollmentStatus(userId)`, `submitScreening(userId, id, input, deps?)`, `requestWaitlist(userId, screeningId)`, `acceptConsent(userId, version, sha256)`, `clinicianSummary(patientId, clinicianId)`, `isEnrolled(userId): Promise<boolean>`, `enrollmentError(status, code)`.
  - HTTP DTO `Screening = {id, stateCode, dateOfBirth: 'YYYY-MM-DD', pregnancyStatus, eligible, reasons, flags, rulesVersion, submittedAt: ISO, waitlistRequestedAt: ISO|null}`.
  - HTTP `GET /api/enrollment` → `{status, rulesVersion, screening: Screening|null, consent: {version, title, body, sha256, acceptedAt: ISO|null}}`; `PUT /screenings/:id` → `{screening, status}`; `PUT /waitlist` → `{screening}`; `PUT /consents/:version` → `{acceptance: {version, acceptedAt}, status}`; `GET /patients/:patientId` → `{status, screening, screeningCount, consent: {version, acceptedAt|null}}`.
  - `requireEnrolledPatient` middleware; 403 body `{error: 'Enrollment required', code: 'ENROLLMENT_REQUIRED'}`.

- [ ] **Step 1: Write the rules/consent tests.** Create `backend/tests/enrollment-rules.test.ts`:

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,ageOn,rulesFromEnv,RULES_VERSION,US_STATES} from '../src/services/enrollmentRules';
import {currentConsent,consentHash} from '../src/content/consent';
const rules=rulesFromEnv({LICENSED_STATES:'IL,NY',MINIMUM_PATIENT_AGE:'18'});
const base={stateCode:'IL',dateOfBirth:'2000-06-15',pregnancyStatus:'none' as const};
test('eligible adult in a licensed state with no pregnancy exclusion',()=>{
 assert.deepEqual(evaluate(base,rules,'2026-09-15'),{eligible:true,reasons:[],flags:[]});
});
test('state outside the list and outside the US are not eligible',()=>{
 assert.deepEqual(evaluate({...base,stateCode:'TX'},rules,'2026-09-15').reasons,['state']);
 assert.deepEqual(evaluate({...base,stateCode:'NON_US'},rules,'2026-09-15').reasons,['state']);
});
test('age boundary is the birthday itself',()=>{
 assert.equal(evaluate({...base,dateOfBirth:'2008-09-15'},rules,'2026-09-15').eligible,true);
 assert.deepEqual(evaluate({...base,dateOfBirth:'2008-09-16'},rules,'2026-09-15').reasons,['age']);
 assert.equal(ageOn('2008-02-29','2026-02-28'),17);
 assert.equal(ageOn('2008-02-29','2026-03-01'),18);
});
test('pregnancy and breastfeeding exclude; trying to conceive is flagged',()=>{
 assert.deepEqual(evaluate({...base,pregnancyStatus:'pregnant'},rules,'2026-09-15').reasons,['pregnancy']);
 assert.deepEqual(evaluate({...base,pregnancyStatus:'breastfeeding'},rules,'2026-09-15').reasons,['breastfeeding']);
 assert.deepEqual(evaluate({...base,pregnancyStatus:'trying_to_conceive'},rules,'2026-09-15'),{eligible:true,reasons:[],flags:['trying_to_conceive']});
});
test('multiple reasons are all reported in a stable order',()=>{
 assert.deepEqual(evaluate({stateCode:'NON_US',dateOfBirth:'2015-01-01',pregnancyStatus:'pregnant'},rules,'2026-09-15').reasons,['state','age','pregnancy']);
});
test('configuration parsing is strict with documented defaults',()=>{
 assert.deepEqual([...rulesFromEnv({}).licensedStates].sort(),['CA','FL','IL','NY','TX']);
 assert.equal(rulesFromEnv({}).minimumAge,18);
 assert.deepEqual([...rulesFromEnv({LICENSED_STATES:' il , ny '}).licensedStates],['IL','NY']);
 for(const env of [{LICENSED_STATES:'IL,XX'},{LICENSED_STATES:'NON_US'},{MINIMUM_PATIENT_AGE:'17.5'},{MINIMUM_PATIENT_AGE:'-1'}])assert.throws(()=>rulesFromEnv(env));
 assert.equal(US_STATES.length,51);assert.match(RULES_VERSION,/^\d{4}-\d{2}-\d{2}\.\d+$/);
});
test('consent is a hashed DRAFT version 1',()=>{
 const doc=currentConsent();
 assert.equal(doc.version,1);assert.match(doc.title,/DRAFT/);assert.match(doc.body,/911/);
 assert.equal(doc.sha256,consentHash(doc));assert.match(doc.sha256,/^[a-f0-9]{64}$/);
 assert.notEqual(consentHash({...doc,body:doc.body+' '}),doc.sha256);
});
```
Run `cd backend && node --import tsx --test tests/enrollment-rules.test.ts` — expect FAIL (modules missing).

- [ ] **Step 2: Implement rules and consent.** Create `backend/src/services/enrollmentRules.ts`:

```ts
// Eligibility is decided only here, on the server. Defaults are placeholders pending the client's answers
// (docs/features/client-expansion.md); change a rule by adding a new RULES_VERSION.
export const RULES_VERSION='2026-09-15.1';
export const US_STATES=['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'] as const;
export const STATE_CODES=[...US_STATES,'NON_US'] as const;
export const PREGNANCY_STATUSES=['none','pregnant','trying_to_conceive','breastfeeding'] as const;
export type StateCode=typeof STATE_CODES[number];
export type PregnancyStatus=typeof PREGNANCY_STATUSES[number];
export type IneligibleReason='state'|'age'|'pregnancy'|'breastfeeding';
export type ScreeningFlag='trying_to_conceive';
export type EligibilityRules={licensedStates:ReadonlySet<string>;minimumAge:number};
export type ScreeningAnswers={stateCode:string;dateOfBirth:string;pregnancyStatus:PregnancyStatus};
export function rulesFromEnv(env:Record<string,string|undefined>=process.env):EligibilityRules{
 const states=(env.LICENSED_STATES??'CA,FL,IL,NY,TX').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
 if(!states.length||states.some(s=>!(US_STATES as readonly string[]).includes(s)))throw new Error('LICENSED_STATES must list USPS state codes');
 const minimumAge=Number(env.MINIMUM_PATIENT_AGE??'18');
 if(!Number.isInteger(minimumAge)||minimumAge<0||minimumAge>120)throw new Error('MINIMUM_PATIENT_AGE must be a whole number');
 return {licensedStates:new Set(states),minimumAge};
}
export function ageOn(dateOfBirth:string,today:string):number{
 const [by,bm,bd]=dateOfBirth.split('-').map(Number),[ty,tm,td]=today.split('-').map(Number);
 return ty-by-(tm<bm||(tm===bm&&td<bd)?1:0);
}
export function evaluate(input:ScreeningAnswers,rules:EligibilityRules,today:string){
 const reasons:IneligibleReason[]=[];
 if(input.stateCode==='NON_US'||!rules.licensedStates.has(input.stateCode))reasons.push('state');
 if(ageOn(input.dateOfBirth,today)<rules.minimumAge)reasons.push('age');
 if(input.pregnancyStatus==='pregnant')reasons.push('pregnancy');
 if(input.pregnancyStatus==='breastfeeding')reasons.push('breastfeeding');
 const flags:ScreeningFlag[]=input.pregnancyStatus==='trying_to_conceive'?['trying_to_conceive']:[];
 return {eligible:reasons.length===0,reasons,flags};
}
```
Create `backend/src/content/consent.ts`:

```ts
import {createHash} from 'node:crypto';
// Versions are immutable once released: add a new entry to change the text. Acceptances record the hash.
export type ConsentDocument={version:number;title:string;body:string};
const documents:readonly ConsentDocument[]=[{version:1,title:'Consent to online dermatology care (DRAFT)',body:[
 'DRAFT — placeholder text pending review by ClearAF\'s clinical and legal leads. Do not rely on it.',
 'ClearAF provides asynchronous care: you share photos and answers, and your assigned clinician reviews them later. It is not a live visit.',
 'ClearAF is not an emergency service. If you have trouble breathing, swelling of your face, lips or throat, or feel seriously unwell, call 911.',
 'Your clinician may decide that online care is not right for you and recommend in-person care instead.',
 'Your photos and answers are shared with your assigned care team through ClearAF.',
 'You can stop using ClearAF at any time. Record retention will be described in the final version of this document.'
].join('\n\n')}];
export function consentHash(doc:ConsentDocument):string{return createHash('sha256').update(JSON.stringify([doc.version,doc.title,doc.body])).digest('hex')}
export function currentConsent(){const doc=documents[documents.length-1];return {...doc,sha256:consentHash(doc)}}
```
Run the test — expect PASS.

- [ ] **Step 3: Write the route tests.** Create `backend/tests/enrollment.test.ts` (harness style matches `care-support-service.test.ts`: Prisma replaced through `Module._load`, identity header, real routes and error handler):

```ts
import {after,before,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Module from 'node:module';
import {randomUUID} from 'node:crypto';
process.env.SUPABASE_URL='https://enrollment-test.supabase.co';process.env.SUPABASE_ANON_KEY='synthetic';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic';
process.env.LICENSED_STATES='IL,NY';process.env.MINIMUM_PATIENT_AGE='18';
const A=randomUUID(),B=randomUUID(),C=randomUUID(),D=randomUUID();
let screenings:any[]=[],acceptances:any[]=[],assigned=C,afterLock:(()=>void)|undefined,queue=Promise.resolve(),seq=0;
const matches=(r:any,w:any={}):boolean=>Object.entries(w).every(([k,v]:any)=>v&&typeof v==='object'&&!(v instanceof Date)?matches(r,v):r[k]===v);
function model(rows:()=>any[],unique:(a:any,b:any)=>boolean){return {
 findUnique:async({where}:any)=>rows().find(r=>matches(r,where))??null,
 findFirst:async({where,orderBy}:any)=>{const found=rows().filter(r=>matches(r,where));if(orderBy)found.sort((a,b)=>b.submittedAt-a.submittedAt||(a.id<b.id?1:-1));return found[0]??null},
 count:async({where}:any)=>rows().filter(r=>matches(r,where)).length,
 create:async({data}:any)=>{if(rows().some(r=>r.id===data.id||unique(r,data)))throw Object.assign(new Error('unique'),{code:'P2002'});const row={id:randomUUID(),...data,submittedAt:new Date(Date.now()+seq++),acceptedAt:new Date(),waitlistRequestedAt:null};rows().push(row);return row},
 update:async({where,data}:any)=>Object.assign(rows().find(r=>matches(r,where)),data)
}}
const db:any={eligibilityScreening:model(()=>screenings,()=>false),consentAcceptance:model(()=>acceptances,(a,b)=>a.userId===b.userId&&a.documentVersion===b.documentVersion),
 user:{findUnique:async({where}:any)=>where.id===A?{id:A,dermatologistId:assigned}:where.id===B?{id:B,dermatologistId:D}:null},
 $queryRaw:async()=>{afterLock?.();afterLock=undefined;return[]},
 $transaction:async(fn:any)=>{const prior=queue;let release!:()=>void;queue=new Promise<void>(r=>release=r);await prior;try{return await fn(db)}finally{release()}}};
const original=(Module as any)._load;(Module as any)._load=function(name:string,...args:any[]){if(name==='@prisma/client')return {PrismaClient:class{constructor(){return db}},Prisma:{}};return original.call(this,name,...args)};
const app=express();app.use(express.json());app.use((req:any,res,next)=>{const id=req.header('x-identity');if(!id)return res.sendStatus(401);req.user={id,userType:[C,D].includes(id)?'dermatologist':'patient',email:'synthetic@test.invalid'};next()});
app.use('/enrollment',require('../src/routes/enrollment').default);app.use(require('../src/middleware/errorHandler').errorHandler);(Module as any)._load=original;
const {currentConsent}=require('../src/content/consent');
let server:any,base:string;
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}/enrollment`});
after(()=>new Promise<void>(r=>server.close(r)));
beforeEach(()=>{screenings=[];acceptances=[];assigned=C;afterLock=undefined});
async function call(path:string,who:string=A,method='GET',body?:any){const r=await fetch(base+path,{method,headers:{'x-identity':who,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json().catch(()=>({})) as any}}
const answers=(patch:any={})=>({stateCode:'IL',dateOfBirth:'1995-04-02',pregnancyStatus:'none',...patch});
const screen=(id=randomUUID(),body=answers(),who=A)=>call('/screenings/'+id,who,'PUT',body);
const consent=()=>currentConsent();
test('roles are enforced on every endpoint',async()=>{
 for(const [path,method] of [['/','GET'],['/screenings/'+randomUUID(),'PUT'],['/waitlist','PUT'],['/consents/1','PUT']])assert.equal((await call(path,C,method,{})).status,403);
 assert.equal((await call('/patients/'+A,A)).status,403);
});
test('screening then consent reaches enrolled; replays are idempotent',async()=>{
 assert.equal((await call('/')).body.status,'screening_required');
 const id=randomUUID(),first=await screen(id);
 assert.equal(first.status,201);assert.equal(first.body.status,'consent_required');assert.equal(first.body.screening.dateOfBirth,'1995-04-02');
 assert.equal((await screen(id)).status,200);
 assert.equal((await screen(id,answers({stateCode:'NY'}))).status,409);
 assert.equal((await call('/consents/1',A,'PUT',{documentSha256:'0'.repeat(64)})).status,409);
 assert.equal((await call('/consents/2',A,'PUT',{documentSha256:consent().sha256})).status,409);
 const accepted=await call('/consents/1',A,'PUT',{documentSha256:consent().sha256});
 assert.equal(accepted.status,201);assert.equal(accepted.body.status,'enrolled');
 assert.equal((await call('/consents/1',A,'PUT',{documentSha256:consent().sha256})).status,200);
 const status=(await call('/')).body;assert.equal(status.status,'enrolled');assert.equal(status.consent.version,1);assert.ok(status.consent.acceptedAt);
});
test('ineligible screening explains reasons, supports waitlist once and blocks consent',async()=>{
 const id=randomUUID(),r=await screen(id,answers({stateCode:'TX',pregnancyStatus:'pregnant'}));
 assert.equal(r.body.status,'ineligible');assert.deepEqual(r.body.screening.reasons,['state','pregnancy']);
 assert.equal((await call('/consents/1',A,'PUT',{documentSha256:consent().sha256})).status,409);
 const w1=await call('/waitlist',A,'PUT',{screeningId:id}),w2=await call('/waitlist',A,'PUT',{screeningId:id});
 assert.equal(w1.status,200);assert.ok(w1.body.screening.waitlistRequestedAt);assert.equal(w2.body.screening.waitlistRequestedAt,w1.body.screening.waitlistRequestedAt);
 const later=randomUUID();await screen(later);assert.equal((await call('/waitlist',A,'PUT',{screeningId:later})).status,409);
 assert.equal((await call('/waitlist',A,'PUT',{screeningId:id})).status,404);
});
test('another patient cannot replay or waitlist a screening they do not own',async()=>{
 const id=randomUUID();await screen(id);
 assert.equal((await screen(id,answers(),B)).status,404);
 assert.equal((await call('/waitlist',B,'PUT',{screeningId:id})).status,404);
});
test('strict validation rejects malformed answers before storage',async()=>{
 for(const body of [answers({stateCode:'ZZ'}),answers({dateOfBirth:'2026-02-30'}),answers({dateOfBirth:'2999-01-01'}),answers({pregnancyStatus:'unknown'}),{...answers(),eligible:true},answers({dateOfBirth:'1899-12-31'})])assert.equal((await screen(randomUUID(),body)).status,400);
 assert.equal((await screen('not-a-uuid')).status,400);
 assert.equal(screenings.length,0);
});
test('clinician summary requires current assignment checked after the lock',async()=>{
 await screen();
 const ok=await call('/patients/'+A,C);
 assert.equal(ok.status,200);assert.equal(ok.body.screeningCount,1);assert.equal(ok.body.consent.body,undefined);assert.equal(ok.body.status,'consent_required');
 assert.equal((await call('/patients/'+A,D)).status,404);
 afterLock=()=>{assigned=D};assert.equal((await call('/patients/'+A,C)).status,404);
});
```
Run `node --import tsx --test tests/enrollment.test.ts` — expect FAIL (route missing).

- [ ] **Step 4: Implement validation, service and routes.** Create `backend/src/services/enrollmentValidation.ts`:

```ts
import {z} from 'zod';
import {STATE_CODES,PREGNANCY_STATUSES} from './enrollmentRules';
export const uuid=z.string().uuid().transform(v=>v.toLowerCase());
const realDate=(v:string)=>{const d=new Date(`${v}T00:00:00Z`);return /^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v};
export const dateOfBirth=z.string().refine(realDate,'Invalid date').refine(v=>v>='1900-01-01'&&v<=new Date().toISOString().slice(0,10),'Date of birth out of range');
export const screeningInput=z.object({stateCode:z.enum(STATE_CODES),dateOfBirth,pregnancyStatus:z.enum(PREGNANCY_STATUSES)}).strict();
export const waitlistInput=z.object({screeningId:uuid}).strict();
export const consentInput=z.object({documentSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const consentVersion=z.string().regex(/^[1-9]\d{0,5}$/).transform(Number);
```
Create `backend/src/services/enrollment.ts`:

```ts
import {Prisma,EligibilityScreening,ConsentAcceptance} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../config/database';
import {currentConsent} from '../content/consent';
import {evaluate,rulesFromEnv,RULES_VERSION,EligibilityRules} from './enrollmentRules';
import {screeningInput} from './enrollmentValidation';
type DB=Prisma.TransactionClient;
export type EnrollmentStatus='screening_required'|'ineligible'|'consent_required'|'enrolled';
export const enrollmentError=(statusCode:number,code:string)=>Object.assign(new Error(code),{statusCode,code});
const utcToday=()=>new Date().toISOString().slice(0,10);
const iso=(d:Date|null)=>d?d.toISOString():null;
export function screeningDTO(row:EligibilityScreening){return {id:row.id,stateCode:row.stateCode,dateOfBirth:row.dateOfBirth.toISOString().slice(0,10),pregnancyStatus:row.pregnancyStatus,eligible:row.eligible,reasons:row.reasons,flags:row.flags,rulesVersion:row.rulesVersion,submittedAt:row.submittedAt.toISOString(),waitlistRequestedAt:iso(row.waitlistRequestedAt)}}
const latest=(db:DB,userId:string)=>db.eligibilityScreening.findFirst({where:{userId},orderBy:[{submittedAt:'desc'},{id:'desc'}]});
async function evaluateStatus(db:DB,userId:string){
 const screening=await latest(db,userId),consent=currentConsent();
 const acceptance:ConsentAcceptance|null=screening?.eligible?await db.consentAcceptance.findUnique({where:{userId_documentVersion:{userId,documentVersion:consent.version}}}):null;
 const status:EnrollmentStatus=!screening?'screening_required':!screening.eligible?'ineligible':!acceptance?'consent_required':'enrolled';
 return {status,screening,acceptance,consent};
}
const lock=(db:DB,userId:string,write:boolean)=>write?db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${userId}::uuid FOR UPDATE`:db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${userId}::uuid FOR SHARE`;
async function retry<T>(save:()=>Promise<T>):Promise<T>{try{return await save()}catch(e){if((e as {code?:string}).code!=='P2002')throw e;return save()}}
export async function enrollmentStatus(userId:string){return prisma.$transaction(async db=>{
 const s=await evaluateStatus(db,userId);
 return {status:s.status,rulesVersion:RULES_VERSION,screening:s.screening&&screeningDTO(s.screening),consent:{version:s.consent.version,title:s.consent.title,body:s.consent.body,sha256:s.consent.sha256,acceptedAt:iso(s.acceptance?.acceptedAt??null)}};
})}
export async function isEnrolled(userId:string){return (await evaluateStatus(prisma as unknown as DB,userId)).status==='enrolled'}
export async function submitScreening(userId:string,id:string,input:z.infer<typeof screeningInput>,deps:{rules?:EligibilityRules;today?:string}={}){
 const rules=deps.rules??rulesFromEnv(),today=deps.today??utcToday();
 return retry(()=>prisma.$transaction(async db=>{
  await lock(db,userId,true);
  const existing=await db.eligibilityScreening.findUnique({where:{id}});
  if(existing){
   if(existing.userId!==userId)throw enrollmentError(404,'NOT_FOUND');
   if(existing.stateCode!==input.stateCode||screeningDTO(existing).dateOfBirth!==input.dateOfBirth||existing.pregnancyStatus!==input.pregnancyStatus)throw enrollmentError(409,'SCREENING_CONFLICT');
   return {screening:screeningDTO(existing),status:(await evaluateStatus(db,userId)).status,created:false};
  }
  const result=evaluate(input,rules,today);
  const row=await db.eligibilityScreening.create({data:{id,userId,stateCode:input.stateCode,dateOfBirth:new Date(`${input.dateOfBirth}T00:00:00Z`),pregnancyStatus:input.pregnancyStatus,eligible:result.eligible,reasons:result.reasons,flags:result.flags,rulesVersion:RULES_VERSION}});
  return {screening:screeningDTO(row),status:(await evaluateStatus(db,userId)).status,created:true};
 }));
}
export async function requestWaitlist(userId:string,screeningId:string){return prisma.$transaction(async db=>{
 await lock(db,userId,true);
 const row=await latest(db,userId);
 if(!row||row.id!==screeningId)throw enrollmentError(404,'NOT_FOUND');
 if(row.eligible)throw enrollmentError(409,'NOT_INELIGIBLE');
 const saved=row.waitlistRequestedAt?row:await db.eligibilityScreening.update({where:{id:row.id},data:{waitlistRequestedAt:new Date()}});
 return {screening:screeningDTO(saved)};
})}
export async function acceptConsent(userId:string,version:number,sha256:string){return retry(()=>prisma.$transaction(async db=>{
 await lock(db,userId,true);
 const s=await evaluateStatus(db,userId);
 if(version!==s.consent.version||sha256!==s.consent.sha256)throw enrollmentError(409,'CONSENT_OUTDATED');
 if(s.status==='screening_required'||s.status==='ineligible')throw enrollmentError(409,'SCREENING_REQUIRED');
 const row=s.acceptance??await db.consentAcceptance.create({data:{userId,documentVersion:version,documentSha256:sha256}});
 return {acceptance:{version:row.documentVersion,acceptedAt:row.acceptedAt.toISOString()},status:'enrolled' as EnrollmentStatus,created:!s.acceptance};
}))}
export async function clinicianSummary(patientId:string,clinicianId:string){return prisma.$transaction(async db=>{
 await lock(db,patientId,false);
 const patient=await db.user.findUnique({where:{id:patientId},select:{dermatologistId:true}});
 if(!patient||patient.dermatologistId!==clinicianId)throw enrollmentError(404,'NOT_FOUND');
 const s=await evaluateStatus(db,patientId);
 return {status:s.status,screening:s.screening&&screeningDTO(s.screening),screeningCount:await db.eligibilityScreening.count({where:{userId:patientId}}),consent:{version:s.consent.version,acceptedAt:iso(s.acceptance?.acceptedAt??null)}};
})}
```
Create `backend/src/routes/enrollment.ts`:

```ts
import express from 'express';
import {z,ZodError} from 'zod';
import {requirePatient,requireDermatologist} from '../middleware/auth';
import * as service from '../services/enrollment';
import {uuid,screeningInput,waitlistInput,consentInput,consentVersion} from '../services/enrollmentValidation';
const router=express.Router();
const route=(handler:express.RequestHandler):express.RequestHandler=>async(req,res,next)=>{try{await handler(req,res,next)}catch(error){next(error instanceof ZodError||(error as {statusCode?:number}).statusCode?error:service.enrollmentError(500,'ENROLLMENT_OPERATION_FAILED'))}};
const noQuery=(req:express.Request)=>z.object({}).strict().parse(req.query);
router.get('/',requirePatient,route(async(req,res)=>{noQuery(req);res.json(await service.enrollmentStatus(req.user!.id))}));
router.put('/screenings/:screeningId',requirePatient,route(async(req,res)=>{noQuery(req);const r=await service.submitScreening(req.user!.id,uuid.parse(req.params.screeningId),screeningInput.parse(req.body));res.status(r.created?201:200).json({screening:r.screening,status:r.status})}));
router.put('/waitlist',requirePatient,route(async(req,res)=>{noQuery(req);res.json(await service.requestWaitlist(req.user!.id,waitlistInput.parse(req.body).screeningId))}));
router.put('/consents/:version',requirePatient,route(async(req,res)=>{noQuery(req);const r=await service.acceptConsent(req.user!.id,consentVersion.parse(req.params.version),consentInput.parse(req.body).documentSha256);res.status(r.created?201:200).json({acceptance:r.acceptance,status:r.status})}));
router.get('/patients/:patientId',requireDermatologist,route(async(req,res)=>{noQuery(req);res.json(await service.clinicianSummary(uuid.parse(req.params.patientId),req.user!.id))}));
export default router;
```
Mount in `server.ts` after the care-support line: `app.use('/api/enrollment', authenticateToken, enrollmentRoutes);` with `import enrollmentRoutes from './routes/enrollment';`.
Run `node --import tsx --test tests/enrollment.test.ts tests/enrollment-rules.test.ts` — expect PASS. If the stub's `findFirst` ordering or `Prisma` import differs from what the service uses, fix the stub, not the service contract.

- [ ] **Step 5: Write the gate test.** Create `backend/tests/enrollment-gate.test.ts`: same harness as Step 3 but mounting `/photos` (`routes/photos`), `/routines`, `/care-support`, `/messages` (`routes/assigned-messages`) and stubbing Supabase storage like `photo-capture.test.ts` (any method returning `{data:null,error:{statusCode:'404'}}`). Stub every Prisma model the routers touch with `new Proxy({}, {get:()=>async()=>{writes++;return null}})` except `eligibilityScreening`/`consentAcceptance`, which read from arrays. Tests:

```ts
const gated:[string,string,any][]=[
 ['POST',`/photos/captures/${randomUUID()}/upload-url`,{}],
 ['POST',`/photos/captures/${randomUUID()}/complete`,{captureDate:'2026-09-01T10:00:00.000Z',notes:''}],
 ['POST','/photos/upload-url',{mimeType:'image/jpeg'}],
 ['POST','/photos/complete-upload',{storagePath:`${A}/${randomUUID()}.jpg`}],
 ['PUT',`/routines/completions/${randomUUID()}`,{revisionId:randomUUID(),completedAt:'2026-09-01T10:00:00.000Z',localDate:'2026-09-01',timeZone:'UTC'}],
 ['PUT',`/care-support/responses/${randomUUID()}`,{formId:randomUUID(),submittedAt:'2026-09-01T10:00:00.000Z',answers:[]}],
 ['PUT',`/messages/patients/${A}/clinicians/${C}/messages/${randomUUID()}`,{content:'Synthetic',reference:null}],
];
test('unenrolled patients are refused on every gated write before any storage or database write',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';
 for(const [method,path,body] of gated){const r=await call(path,A,method,body);assert.equal(r.status,403,path);assert.equal(r.body.code,'ENROLLMENT_REQUIRED',path)}
 assert.equal(writes,0);
});
test('multipart legacy upload is refused before the file is parsed',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';
 const form=new FormData();form.set('photo',new Blob([new Uint8Array([1])],{type:'image/png'}),'x.png');
 const r=await fetch(base+'/photos/upload',{method:'POST',headers:{'x-identity':A},body:form});
 assert.equal(r.status,403);
});
test('enrolled patients, clinicians and disabled enforcement pass the gate',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';
 screenings.push({id:randomUUID(),userId:A,eligible:true,submittedAt:new Date()});acceptances.push({userId:A,documentVersion:1});
 for(const [method,path,body] of gated)assert.notEqual((await call(path,A,method,body)).body.code,'ENROLLMENT_REQUIRED',path);
 screenings=[];acceptances=[];
 assert.notEqual((await call(`/messages/patients/${A}/clinicians/${C}/messages/${randomUUID()}`,C,'PUT',{content:'Synthetic',reference:null})).body.code,'ENROLLMENT_REQUIRED');
 process.env.ENROLLMENT_ENFORCEMENT='off';
 for(const [method,path,body] of gated)assert.notEqual((await call(path,A,method,body)).body.code,'ENROLLMENT_REQUIRED',path);
});
test('reads are never gated',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';
 for(const path of ['/routines/?localDate=2026-09-01','/care-support/form','/messages/current'])assert.notEqual((await call(path,A)).body.code,'ENROLLMENT_REQUIRED',path);
});
```
Here `A` is a patient, `C` a clinician; the `call` helper and header-based identity are as in Step 3. Downstream handlers may return any non-gate status after the gate; the assertions only concern the gate. Run — expect FAIL (no gate yet).

- [ ] **Step 6: Implement and apply the gate.** Create `backend/src/middleware/enrollmentGate.ts`:

```ts
import {Request,Response,NextFunction} from 'express';
import {isEnrolled} from '../services/enrollment';
// Read at request time so production can start with ENROLLMENT_ENFORCEMENT=off while older iOS builds remain installed.
export const enrollmentEnforced=()=>process.env.ENROLLMENT_ENFORCEMENT!=='off';
export async function requireEnrolledPatient(req:Request,res:Response,next:NextFunction){
 if(!enrollmentEnforced()||req.user?.userType!=='patient')return next();
 try{
  if(await isEnrolled(req.user.id))return next();
  return res.status(403).json({error:'Enrollment required',code:'ENROLLMENT_REQUIRED'});
 }catch(error){return next(error)}
}
```
Insert `requireEnrolledPatient` immediately after `requirePatient` on: photos `POST /captures/:captureId/upload-url`, `POST /captures/:captureId/complete`, `POST /upload-url`, `POST /complete-upload`, `POST /upload` (before `upload.single('photo')`); routines `PUT /completions/:completionId`; care-support `PUT /responses/:responseId`; assigned-messages `PUT path+'/messages/:messageId'` (it has no role middleware; add the gate as the first handler argument). Import from `'../middleware/enrollmentGate'`.
Add as the first statement after the existing `process.env.SUPABASE_*` lines in `security.test.ts`, `photo-capture.test.ts`, `routine-care.test.ts`, `care-support-service.test.ts`, `assigned-messages-service.test.ts`:
```ts
process.env.ENROLLMENT_ENFORCEMENT='off'; // The gate itself is covered by enrollment-gate.test.ts.
```
Add to `backend/.env.example`:
```
# Enrollment rules (placeholders until the practice confirms them)
# LICENSED_STATES="CA,FL,IL,NY,TX"
# MINIMUM_PATIENT_AGE=18
# ENROLLMENT_ENFORCEMENT=on   # set "off" only while older iOS builds without enrollment remain installed
```
Run `cd backend && npm test && npm run build` — expect every test PASS (164 + new) and a clean build.

- [ ] **Step 7: Commit** `feat(api): enrollment screening, consent and gated clinical writes`.

### Task 4: Care decisions API (refer out / needs in-person / refund)

**Files:**
- Create: `backend/src/services/careDecisionsValidation.ts`, `backend/src/services/careDecisions.ts`, `backend/src/routes/care-decisions.ts`, `backend/tests/care-decisions.test.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: Prisma `careDecision`, `skinPhoto`, `user`, `dermatologist` (Task 2).
- Produces HTTP (Tasks 6–8): `CareDecision = {id, patientId, clinicianId, clinicianName, decision, patientMessage: string|null, photoId: string|null, refundStatus, refundUpdatedAt: ISO|null, createdAt: ISO}`.
  - `GET /api/care-decisions/current` (patient) → `{decision: CareDecision|null}`
  - `GET /api/care-decisions/patients/:patientId?page&limit` (clinician) → `{data: CareDecision[], pagination}` newest first
  - `PUT /api/care-decisions/patients/:patientId/decisions/:decisionId` (clinician) body `{decision, patientMessage: string|null, photoId: string|null}` → `{decision}` 201/200
  - `PUT /api/care-decisions/patients/:patientId/decisions/:decisionId/refund` (clinician) body `{refundStatus:'issued'}` → `{decision}` 200
  - Error codes: `NOT_FOUND` 404, `DECISION_CONFLICT` 409, `REFUND_NOT_PENDING` 409.

- [ ] **Step 1: Write the failing tests.** Create `backend/tests/care-decisions.test.ts` with the Task 3 Step 3 harness (Module._load Prisma stub, `x-identity` header, patients `A`,`B`, clinicians `C`,`D`, serialized `$transaction`, `afterLock` hook, `assigned` variable for A's clinician; B is assigned to D). Stub models: `careDecision` rows (findFirst/findMany honour `orderBy` createdAt desc then id desc, `skip`, `take`, and return `{...row, clinician:{name: row.clinicianId===C?'Clinician C':'Clinician D'}}` when `include.clinician` is set; `create` throws `{code:'P2002'}` on duplicate id and stamps `createdAt=new Date(Date.now()+seq++)`; `update`), `skinPhoto` rows (`findFirst` by `{id,userId}`), `user.findUnique` returning `{dermatologistId}`. Mount `require('../src/routes/care-decisions').default` at `/decisions`. Tests:

```ts
const record=(id=randomUUID(),body:any={decision:'refer_out',patientMessage:'Please see an in-person dermatologist.',photoId:null},who=C,patient=A)=>call(`/patients/${patient}/decisions/${id}`,who,'PUT',body);
test('roles are enforced',async()=>{
 assert.equal((await call('/current',C)).status,403);
 assert.equal((await call(`/patients/${A}`,A)).status,403);
 assert.equal((await record(randomUUID(),undefined,A)).status,403);
});
test('refer out starts a pending refund, replays exactly and is visible only to that patient',async()=>{
 const id=randomUUID(),first=await record(id);
 assert.equal(first.status,201);assert.equal(first.body.decision.refundStatus,'pending');assert.equal(first.body.decision.clinicianName,'Clinician C');
 assert.equal((await record(id)).status,200);
 assert.equal((await record(id,{decision:'needs_in_person',patientMessage:null,photoId:null})).status,409);
 assert.equal((await call('/current',A)).body.decision.id,id);
 assert.equal((await call('/current',B)).body.decision,null);
});
test('linked photo must belong to the patient',async()=>{
 const own=randomUUID(),other=randomUUID();photos.push({id:own,userId:A},{id:other,userId:B});
 assert.equal((await record(randomUUID(),{decision:'needs_in_person',patientMessage:null,photoId:own})).status,201);
 assert.equal((await record(randomUUID(),{decision:'needs_in_person',patientMessage:null,photoId:other})).status,404);
 assert.equal((await record(randomUUID(),{decision:'needs_in_person',patientMessage:null,photoId:randomUUID()})).status,404);
});
test('assignment is required and rechecked after the lock',async()=>{
 assert.equal((await record(randomUUID(),undefined,D)).status,404);
 assert.equal((await call(`/patients/${A}`,D)).status,404);
 afterLock=()=>{assigned=D};assert.equal((await record()).status,404);assert.equal(decisions.length,0);
});
test('refund moves pending to issued once; async care has no refund',async()=>{
 const id=randomUUID();await record(id);
 const issued=await call(`/patients/${A}/decisions/${id}/refund`,C,'PUT',{refundStatus:'issued'});
 assert.equal(issued.status,200);assert.equal(issued.body.decision.refundStatus,'issued');assert.ok(issued.body.decision.refundUpdatedAt);
 const again=await call(`/patients/${A}/decisions/${id}/refund`,C,'PUT',{refundStatus:'issued'});
 assert.equal(again.body.decision.refundUpdatedAt,issued.body.decision.refundUpdatedAt);
 const resume=randomUUID();const r=await record(resume,{decision:'async_care',patientMessage:null,photoId:null});
 assert.equal(r.body.decision.refundStatus,'not_applicable');
 assert.equal((await call(`/patients/${A}/decisions/${resume}/refund`,C,'PUT',{refundStatus:'issued'})).status,409);
 assert.equal((await call('/current',A)).body.decision.decision,'async_care');
 assert.equal((await call(`/patients/${A}/decisions/${randomUUID()}/refund`,C,'PUT',{refundStatus:'issued'})).status,404);
});
test('history is paginated newest first',async()=>{
 const ids=[randomUUID(),randomUUID(),randomUUID()];for(const id of ids)await record(id);
 const page=await call(`/patients/${A}?page=1&limit=2`,C);
 assert.deepEqual(page.body.data.map((d:any)=>d.id),[ids[2],ids[1]]);assert.deepEqual(page.body.pagination,{page:1,limit:2,total:3,totalPages:2});
});
test('strict validation',async()=>{
 for(const body of [{decision:'discharge',patientMessage:null,photoId:null},{decision:'refer_out',patientMessage:'x'.repeat(2001),photoId:null},{decision:'refer_out',patientMessage:'  ',photoId:null},{decision:'refer_out',patientMessage:null,photoId:null,refundStatus:'issued'}])assert.equal((await record(randomUUID(),body)).status,400);
 assert.equal((await call(`/patients/${A}?limit=51`,C)).status,400);
 assert.equal((await call(`/patients/${A}/decisions/${randomUUID()}/refund`,C,'PUT',{refundStatus:'pending'})).status,400);
});
```
Run `cd backend && node --import tsx --test tests/care-decisions.test.ts` — expect FAIL.

- [ ] **Step 2: Implement.** `backend/src/services/careDecisionsValidation.ts`:

```ts
import {z} from 'zod';
export const uuid=z.string().uuid().transform(v=>v.toLowerCase());
const note=z.string().trim().min(1).max(2000);
export const DECISIONS=['async_care','refer_out','needs_in_person'] as const;
export const decisionInput=z.object({decision:z.enum(DECISIONS),patientMessage:note.nullable(),photoId:uuid.nullable()}).strict();
export const refundInput=z.object({refundStatus:z.literal('issued')}).strict();
export const pageQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
```
`backend/src/services/careDecisions.ts`:

```ts
import {Prisma,CareDecision} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../config/database';
import {decisionInput} from './careDecisionsValidation';
type DB=Prisma.TransactionClient;
type Row=CareDecision&{clinician:{name:string}};
export const decisionError=(statusCode:number,code:string)=>Object.assign(new Error(code),{statusCode,code});
const include={clinician:{select:{name:true}}} as const;
const order=[{createdAt:'desc' as const},{id:'desc' as const}];
const lock=(db:DB,id:string,write:boolean)=>write?db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${id}::uuid FOR UPDATE`:db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${id}::uuid FOR SHARE`;
async function authorize(db:DB,patientId:string,clinicianId:string){const p=await db.user.findUnique({where:{id:patientId},select:{dermatologistId:true}});if(!p||p.dermatologistId!==clinicianId)throw decisionError(404,'NOT_FOUND')}
async function retry<T>(save:()=>Promise<T>):Promise<T>{try{return await save()}catch(e){if((e as {code?:string}).code!=='P2002')throw e;return save()}}
export function decisionDTO(row:Row){return {id:row.id,patientId:row.patientId,clinicianId:row.clinicianId,clinicianName:row.clinician.name,decision:row.decision,patientMessage:row.patientMessage,photoId:row.photoId,refundStatus:row.refundStatus,refundUpdatedAt:row.refundUpdatedAt?.toISOString()??null,createdAt:row.createdAt.toISOString()}}
export async function current(patientId:string){const row=await prisma.careDecision.findFirst({where:{patientId},orderBy:order,include});return {decision:row?decisionDTO(row as Row):null}}
export async function history(patientId:string,clinicianId:string,page:number,limit:number){return prisma.$transaction(async db=>{
 await lock(db,patientId,false);await authorize(db,patientId,clinicianId);
 const total=await db.careDecision.count({where:{patientId}});
 const rows=await db.careDecision.findMany({where:{patientId},orderBy:order,include,skip:(page-1)*limit,take:limit});
 return {data:(rows as Row[]).map(decisionDTO),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
})}
export async function record(patientId:string,clinicianId:string,id:string,input:z.infer<typeof decisionInput>){return retry(()=>prisma.$transaction(async db=>{
 await lock(db,patientId,true);await authorize(db,patientId,clinicianId);
 const existing=await db.careDecision.findUnique({where:{id},include}) as Row|null;
 if(existing){
  if(existing.patientId!==patientId||existing.clinicianId!==clinicianId||existing.decision!==input.decision||existing.patientMessage!==input.patientMessage||existing.photoId!==input.photoId)throw decisionError(409,'DECISION_CONFLICT');
  return {decision:decisionDTO(existing),created:false};
 }
 if(input.photoId&&!await db.skinPhoto.findFirst({where:{id:input.photoId,userId:patientId},select:{id:true}}))throw decisionError(404,'NOT_FOUND');
 const row=await db.careDecision.create({data:{id,patientId,clinicianId,decision:input.decision,patientMessage:input.patientMessage,photoId:input.photoId,refundStatus:input.decision==='async_care'?'not_applicable':'pending'},include}) as Row;
 return {decision:decisionDTO(row),created:true};
}))}
export async function markRefundIssued(patientId:string,clinicianId:string,id:string){return prisma.$transaction(async db=>{
 await lock(db,patientId,true);await authorize(db,patientId,clinicianId);
 const row=await db.careDecision.findFirst({where:{id,patientId},include}) as Row|null;
 if(!row)throw decisionError(404,'NOT_FOUND');
 if(row.refundStatus==='issued')return {decision:decisionDTO(row)};
 if(row.refundStatus!=='pending')throw decisionError(409,'REFUND_NOT_PENDING');
 const saved=await db.careDecision.update({where:{id},data:{refundStatus:'issued',refundUpdatedAt:new Date()},include}) as Row;
 return {decision:decisionDTO(saved)};
})}
```
`backend/src/routes/care-decisions.ts`:

```ts
import express from 'express';
import {z,ZodError} from 'zod';
import {requirePatient,requireDermatologist} from '../middleware/auth';
import * as service from '../services/careDecisions';
import {uuid,decisionInput,refundInput,pageQuery} from '../services/careDecisionsValidation';
const router=express.Router();
const route=(handler:express.RequestHandler):express.RequestHandler=>async(req,res,next)=>{try{await handler(req,res,next)}catch(error){next(error instanceof ZodError||(error as {statusCode?:number}).statusCode?error:service.decisionError(500,'CARE_DECISION_OPERATION_FAILED'))}};
const noQuery=(req:express.Request)=>z.object({}).strict().parse(req.query);
router.get('/current',requirePatient,route(async(req,res)=>{noQuery(req);res.json(await service.current(req.user!.id))}));
router.get('/patients/:patientId',requireDermatologist,route(async(req,res)=>{const {page,limit}=pageQuery.parse(req.query);res.json(await service.history(uuid.parse(req.params.patientId),req.user!.id,page,limit))}));
router.put('/patients/:patientId/decisions/:decisionId',requireDermatologist,route(async(req,res)=>{noQuery(req);const r=await service.record(uuid.parse(req.params.patientId),req.user!.id,uuid.parse(req.params.decisionId),decisionInput.parse(req.body));res.status(r.created?201:200).json({decision:r.decision})}));
router.put('/patients/:patientId/decisions/:decisionId/refund',requireDermatologist,route(async(req,res)=>{noQuery(req);refundInput.parse(req.body);res.json(await service.markRefundIssued(uuid.parse(req.params.patientId),req.user!.id,uuid.parse(req.params.decisionId)))}));
export default router;
```
Mount in `server.ts`: `app.use('/api/care-decisions', authenticateToken, careDecisionRoutes);`.

- [ ] **Step 3: Verify.** `node --import tsx --test tests/care-decisions.test.ts` — PASS; `npm test && npm run build` — PASS.

- [ ] **Step 4: Commit** `feat(api): clinician care decisions with refund status`.

### Task 5: Urgent reports API

**Files:**
- Create: `backend/src/services/urgentReportsValidation.ts`, `backend/src/services/urgentReports.ts`, `backend/src/routes/urgent-reports.ts`, `backend/tests/urgent-reports.test.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: Prisma `urgentReport`, `user` (Task 2).
- Produces HTTP (Tasks 6–8): `UrgentReport = {id, patientId, category, description, status, createdAt: ISO, acknowledgedAt: ISO|null, resolvedAt: ISO|null, resolutionNote: string|null}`; queue rows add `patientName: string|null`.
  - `PUT /api/urgent-reports/:reportId` (patient) body `{category, description}` → `{report}` 201/200; 409 `NO_ASSIGNED_CLINICIAN`, 409 `REPORT_ID_CONFLICT`
  - `GET /api/urgent-reports?page&limit` (patient) → `{data, pagination}` newest first
  - `GET /api/urgent-reports/queue?page&limit` (clinician) → `{data, pagination, openCount}`
  - `GET /api/urgent-reports/patients/:patientId?page&limit` (clinician) → `{data, pagination}`
  - `POST /api/urgent-reports/:reportId/acknowledge` body `{}` and `POST /api/urgent-reports/:reportId/resolve` body `{resolutionNote: string|null}` (clinician) → `{report}`; 404 `NOT_FOUND`, 409 `REPORT_RESOLVED`.

- [ ] **Step 1: Write the failing tests.** Create `backend/tests/urgent-reports.test.ts` with the same harness. Stub `urgentReport` rows: `findUnique`, `findFirst`, `count`, `findMany` honouring `where` including the relation filter `patient:{dermatologistId}` (resolve through the `users` array), `status:{not:'resolved'}`, `orderBy` arrays (`status` desc, `createdAt` asc, `id` asc for the queue; `createdAt` desc, `id` desc otherwise), `skip`/`take`, and `include.patient` → `{name}`; `create` stamps `status:'open'`, `createdAt=new Date(Date.now()+seq++)`, nulls for the rest; `update`. `users` = `[{id:A,name:'Patient A',dermatologistId:assignedA},{id:B,name:'Patient B',dermatologistId:D},{id:E,name:'Unassigned',dermatologistId:null}]` (E is a third patient). Mount at `/urgent`. Tests:

```ts
const report=(id=randomUUID(),body:any={category:'reaction_to_treatment',description:'Synthetic swelling after new cream'},who=A)=>call('/'+id,who,'PUT',body);
test('roles are enforced',async()=>{
 assert.equal((await report(randomUUID(),undefined,C)).status,403);
 assert.equal((await call('/queue',A)).status,403);
 assert.equal((await call(`/${randomUUID()}/acknowledge`,A,'POST',{})).status,403);
});
test('patient report is created for the assigned clinician and replays exactly',async()=>{
 const id=randomUUID(),first=await report(id);
 assert.equal(first.status,201);assert.equal(first.body.report.status,'open');
 assert.equal((await report(id)).status,200);
 assert.equal((await report(id,{category:'other',description:'Changed'})).status,409);
 const foreign=await report(id,undefined,B);assert.equal(foreign.status,409);assert.equal(foreign.body.report,undefined);
 assert.equal(reports[0].clinicianId,C);
});
test('unassigned patient gets a clear conflict, never a silent drop',async()=>{
 const r=await report(randomUUID(),undefined,E);assert.equal(r.status,409);assert.equal(r.body.code,'NO_ASSIGNED_CLINICIAN');
});
test('queue shows only current assignments, open before acknowledged, oldest first',async()=>{
 const older=randomUUID(),newer=randomUUID(),acked=randomUUID(),resolved=randomUUID();
 await report(older);await report(newer);await report(acked);await report(resolved);
 await call(`/${acked}/acknowledge`,C,'POST',{});await call(`/${resolved}/resolve`,C,'POST',{resolutionNote:null});
 await report(randomUUID(),undefined,B);
 const q=await call('/queue',C);
 assert.deepEqual(q.body.data.map((r:any)=>r.id),[older,newer,acked]);assert.equal(q.body.openCount,2);assert.equal(q.body.data[0].patientName,'Patient A');
 assignedA=D;
 assert.equal((await call('/queue',C)).body.data.length,0);
 assert.equal((await call('/queue',D)).body.pagination.total,4);
});
test('acknowledge and resolve are idempotent, forward-only and assignment-checked',async()=>{
 const id=randomUUID();await report(id);
 assert.equal((await call(`/${id}/acknowledge`,D,'POST',{})).status,404);
 const a1=await call(`/${id}/acknowledge`,C,'POST',{}),a2=await call(`/${id}/acknowledge`,C,'POST',{});
 assert.equal(a1.body.report.status,'acknowledged');assert.equal(a2.body.report.acknowledgedAt,a1.body.report.acknowledgedAt);
 const r1=await call(`/${id}/resolve`,C,'POST',{resolutionNote:'Please stop the cream and book an in-person visit.'});
 assert.equal(r1.body.report.status,'resolved');
 assert.equal((await call(`/${id}/resolve`,C,'POST',{resolutionNote:'Please stop the cream and book an in-person visit.'})).status,200);
 assert.equal((await call(`/${id}/resolve`,C,'POST',{resolutionNote:'Different'})).status,409);
 assert.equal((await call(`/${id}/acknowledge`,C,'POST',{})).body.report.status,'resolved');
 const open=randomUUID();await report(open);
 const direct=await call(`/${open}/resolve`,C,'POST',{resolutionNote:null});
 assert.ok(direct.body.report.acknowledgedAt);assert.ok(direct.body.report.resolvedAt);
 const mine=await call('/',A);assert.equal(mine.body.data.find((r:any)=>r.id===id).resolutionNote,'Please stop the cream and book an in-person visit.');
 afterLock=()=>{assignedA=D};assert.equal((await call(`/${open}/acknowledge`,C,'POST',{})).status,404);
});
test('patient history requires assignment; reads are paginated',async()=>{
 await report();assert.equal((await call(`/patients/${A}`,C)).body.pagination.total,1);
 assert.equal((await call(`/patients/${A}`,D)).status,404);
 assert.equal((await call('/?limit=51',A)).status,400);
});
test('strict validation',async()=>{
 for(const body of [{category:'emergency',description:'x'},{category:'other',description:'   '},{category:'other',description:'x'.repeat(2001)},{category:'other',description:'x',severity:'high'}])assert.equal((await report(randomUUID(),body)).status,400);
 assert.equal((await call(`/${randomUUID()}/resolve`,C,'POST',{resolutionNote:'x'.repeat(2001)})).status,400);
});
test('urgent reports are never enrollment-gated',async()=>{
 process.env.ENROLLMENT_ENFORCEMENT='on';assert.equal((await report()).status,201);
});
```
Run — expect FAIL.

- [ ] **Step 2: Implement.** `backend/src/services/urgentReportsValidation.ts`:

```ts
import {z} from 'zod';
export const uuid=z.string().uuid().transform(v=>v.toLowerCase());
const text=z.string().trim().min(1).max(2000);
export const CATEGORIES=['reaction_to_treatment','rapid_worsening','pain_or_infection','other'] as const;
export const reportInput=z.object({category:z.enum(CATEGORIES),description:text}).strict();
export const resolveInput=z.object({resolutionNote:text.nullable()}).strict();
export const emptyBody=z.object({}).strict();
export const pageQuery=z.object({page:z.coerce.number().int().min(1).max(10000).default(1),limit:z.coerce.number().int().min(1).max(50).default(20)}).strict();
```
`backend/src/services/urgentReports.ts`:

```ts
import {Prisma,UrgentReport} from '@prisma/client';
import {z} from 'zod';
import {prisma} from '../config/database';
import {reportInput} from './urgentReportsValidation';
type DB=Prisma.TransactionClient;
export const urgentError=(statusCode:number,code:string)=>Object.assign(new Error(code),{statusCode,code});
const lock=(db:DB,id:string,write:boolean)=>write?db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${id}::uuid FOR UPDATE`:db.$queryRaw`SELECT id FROM public.user_profiles WHERE id=${id}::uuid FOR SHARE`;
async function authorize(db:DB,patientId:string,clinicianId:string){const p=await db.user.findUnique({where:{id:patientId},select:{dermatologistId:true}});if(!p||p.dermatologistId!==clinicianId)throw urgentError(404,'NOT_FOUND')}
async function retry<T>(save:()=>Promise<T>):Promise<T>{try{return await save()}catch(e){if((e as {code?:string}).code!=='P2002')throw e;return save()}}
const iso=(d:Date|null)=>d?d.toISOString():null;
export function reportDTO(row:UrgentReport){return {id:row.id,patientId:row.patientId,category:row.category,description:row.description,status:row.status,createdAt:row.createdAt.toISOString(),acknowledgedAt:iso(row.acknowledgedAt),resolvedAt:iso(row.resolvedAt),resolutionNote:row.resolutionNote}}
const newest=[{createdAt:'desc' as const},{id:'desc' as const}];
const page=(total:number,p:number,limit:number)=>({page:p,limit,total,totalPages:Math.ceil(total/limit)});
export async function create(patientId:string,id:string,input:z.infer<typeof reportInput>){return retry(()=>prisma.$transaction(async db=>{
 await lock(db,patientId,true);
 const existing=await db.urgentReport.findUnique({where:{id}});
 if(existing){
  if(existing.patientId!==patientId||existing.category!==input.category||existing.description!==input.description)throw urgentError(409,'REPORT_ID_CONFLICT');
  return {report:reportDTO(existing),created:false};
 }
 const profile=await db.user.findUnique({where:{id:patientId},select:{dermatologistId:true}});
 if(!profile?.dermatologistId)throw urgentError(409,'NO_ASSIGNED_CLINICIAN');
 const row=await db.urgentReport.create({data:{id,patientId,clinicianId:profile.dermatologistId,category:input.category,description:input.description}});
 return {report:reportDTO(row),created:true};
}))}
export async function mine(patientId:string,p:number,limit:number){
 const where={patientId};
 const [total,rows]=await Promise.all([prisma.urgentReport.count({where}),prisma.urgentReport.findMany({where,orderBy:newest,skip:(p-1)*limit,take:limit})]);
 return {data:rows.map(reportDTO),pagination:page(total,p,limit)};
}
export async function queue(clinicianId:string,p:number,limit:number){return prisma.$transaction(async db=>{
 const where={status:{not:'resolved'},patient:{dermatologistId:clinicianId}};
 const total=await db.urgentReport.count({where});
 const openCount=await db.urgentReport.count({where:{...where,status:'open'}});
 const rows=await db.urgentReport.findMany({where,orderBy:[{status:'desc'},{createdAt:'asc'},{id:'asc'}],skip:(p-1)*limit,take:limit,include:{patient:{select:{name:true}}}});
 return {data:rows.map(r=>({...reportDTO(r),patientName:r.patient.name})),pagination:page(total,p,limit),openCount};
},{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead})}
export async function patientHistory(patientId:string,clinicianId:string,p:number,limit:number){return prisma.$transaction(async db=>{
 await lock(db,patientId,false);await authorize(db,patientId,clinicianId);
 const where={patientId};
 const total=await db.urgentReport.count({where});
 const rows=await db.urgentReport.findMany({where,orderBy:newest,skip:(p-1)*limit,take:limit});
 return {data:rows.map(reportDTO),pagination:page(total,p,limit)};
})}
async function transition(reportId:string,clinicianId:string,apply:(row:UrgentReport,now:Date)=>Prisma.UrgentReportUpdateInput|null){return prisma.$transaction(async db=>{
 const found=await db.urgentReport.findUnique({where:{id:reportId},select:{patientId:true}});
 if(!found)throw urgentError(404,'NOT_FOUND');
 await lock(db,found.patientId,true);await authorize(db,found.patientId,clinicianId);
 const row=await db.urgentReport.findUnique({where:{id:reportId}});
 if(!row)throw urgentError(404,'NOT_FOUND');
 const data=apply(row,new Date());
 return {report:reportDTO(data?await db.urgentReport.update({where:{id:reportId},data}):row)};
})}
export const acknowledge=(reportId:string,clinicianId:string)=>transition(reportId,clinicianId,(row,now)=>row.status==='open'?{status:'acknowledged',acknowledgedAt:now,acknowledger:{connect:{id:clinicianId}}}:null);
export const resolve=(reportId:string,clinicianId:string,resolutionNote:string|null)=>transition(reportId,clinicianId,(row,now)=>{
 if(row.status==='resolved'){if(row.resolutionNote!==resolutionNote)throw urgentError(409,'REPORT_RESOLVED');return null}
 return {status:'resolved',resolvedAt:now,resolver:{connect:{id:clinicianId}},resolutionNote,...(row.status==='open'?{acknowledgedAt:now,acknowledger:{connect:{id:clinicianId}}}:{})};
});
```
In the test stub, `update` must accept `acknowledger:{connect:{id}}`/`resolver:{connect:{id}}` and set `acknowledgedBy`/`resolvedBy`.
`backend/src/routes/urgent-reports.ts`:

```ts
import express from 'express';
import {z,ZodError} from 'zod';
import {requirePatient,requireDermatologist} from '../middleware/auth';
import * as service from '../services/urgentReports';
import {uuid,reportInput,resolveInput,emptyBody,pageQuery} from '../services/urgentReportsValidation';
const router=express.Router();
const route=(handler:express.RequestHandler):express.RequestHandler=>async(req,res,next)=>{try{await handler(req,res,next)}catch(error){next(error instanceof ZodError||(error as {statusCode?:number}).statusCode?error:service.urgentError(500,'URGENT_REPORT_OPERATION_FAILED'))}};
const noQuery=(req:express.Request)=>z.object({}).strict().parse(req.query);
// Declared before '/:reportId' routes so the literal paths win.
router.get('/queue',requireDermatologist,route(async(req,res)=>{const {page,limit}=pageQuery.parse(req.query);res.json(await service.queue(req.user!.id,page,limit))}));
router.get('/patients/:patientId',requireDermatologist,route(async(req,res)=>{const {page,limit}=pageQuery.parse(req.query);res.json(await service.patientHistory(uuid.parse(req.params.patientId),req.user!.id,page,limit))}));
router.get('/',requirePatient,route(async(req,res)=>{const {page,limit}=pageQuery.parse(req.query);res.json(await service.mine(req.user!.id,page,limit))}));
router.put('/:reportId',requirePatient,route(async(req,res)=>{noQuery(req);const r=await service.create(req.user!.id,uuid.parse(req.params.reportId),reportInput.parse(req.body));res.status(r.created?201:200).json({report:r.report})}));
router.post('/:reportId/acknowledge',requireDermatologist,route(async(req,res)=>{noQuery(req);emptyBody.parse(req.body);res.json(await service.acknowledge(uuid.parse(req.params.reportId),req.user!.id))}));
router.post('/:reportId/resolve',requireDermatologist,route(async(req,res)=>{noQuery(req);res.json(await service.resolve(uuid.parse(req.params.reportId),req.user!.id,resolveInput.parse(req.body).resolutionNote))}));
export default router;
```
Mount in `server.ts`: `app.use('/api/urgent-reports', authenticateToken, urgentReportRoutes);` (no enrollment gate).

- [ ] **Step 3: Verify.** Focused test PASS; `npm test && npm run build` PASS.

- [ ] **Step 4: Commit** `feat(api): urgent reports with clinician urgent queue`.

### Task 6: Live loopback probe and local backend verification

**Files:**
- Create: `backend/scripts/enrollment-safety-live.cjs`

**Interfaces:** Consumes the HTTP contracts of Tasks 3–5 and `enrollFixture`/`unenrollFixture` from Task 2.

- [ ] **Step 1: Write the probe.** Start from the setup/cleanup scaffolding of `scripts/assigned-messages-live.cjs` (loopback checks via `require('./recovery-drill.cjs').local`, exact-identity manifest in `.local/enrollment-safety-<run>.json` with mode 0600, four accounts `patientA`, `patientB`, `clinicianA`, `clinicianB` with emails `clearaf-enrollment-${run}-${role}@example.invalid`, clinicians inserted into `dermatologists`, A→clinicianA, B→clinicianB, `ok(name)` printing `PASS <name>`, never printing credentials or free text). Default API `process.env.SECURITY_API_URL || 'http://127.0.0.1:3002/api'`. Required checks, in order:
  1. `GET /enrollment` for A → `screening_required`; `POST /photos/captures/<uuid>/upload-url` for A → 403 `ENROLLMENT_REQUIRED` (API must run with enforcement on); `PUT /urgent-reports/<uuid>` for A → 201 even before enrollment.
  2. A screens `IL`, `1990-01-01`, `none` → 201 `consent_required`; accepts the returned `consent.version`/`sha256` → 201 `enrolled`; the photo intent now → 200.
  3. B screens `NON_US` → `ineligible` with reason `state`; waitlist → 200 twice with identical timestamp; consent → 409.
  4. clinicianA `GET /enrollment/patients/<A>` → 200 `enrolled`, no consent body; clinicianB → 404.
  5. clinicianA records `refer_out` for A (with a patient message) → 201 `pending`; A `GET /care-decisions/current` shows it; refund → `issued`; clinicianB record for A → 404.
  6. Urgent: A reports twice (different categories); clinicianA acknowledges the older; queue for clinicianA lists the newer (open) before the older (acknowledged); `openCount` 1; reassign A to clinicianB in SQL → clinicianA queue empty, clinicianB queue has both; clinicianB resolves with a note; A's `GET /urgent-reports` shows the note; reassign back.
  7. Direct Data API denial: for tokens anon, A and clinicianA and each of the four new tables, `GET/POST/PATCH/DELETE ${SUPABASE_URL}/rest/v1/<table>` → 401/403; `pg_class.relrowsecurity` true and no anon/authenticated grants.
  Cleanup (always, in `finally`): delete `urgent_reports` and `care_decisions` for recorded patient IDs, `unenrollFixture`, `auth.sessions`, `user_profiles`, `dermatologists`, auth users by revalidated exact id/email; storage objects created by the photo intent (path recorded in the manifest if an upload happened — the probe only requests the intent, so none is uploaded); then remove the manifest.

- [ ] **Step 2: Run the local stack from this worktree.** From `backend/`: `npm run build`, then start the worktree API on port 3002 in the background with `PORT=3002 ENROLLMENT_ENFORCEMENT=on npm run dev` (Bash `run_in_background`). Wait until `curl -s http://127.0.0.1:3002/ready` returns `{"status":"ready"}`.

- [ ] **Step 3: Run the probes.** From `backend/`: `node scripts/enrollment-safety-live.cjs`, then the updated existing probes `node scripts/photo-capture-live.cjs`, `PHOTO_THUMBNAIL_API_URL=http://127.0.0.1:3002/api node scripts/photo-thumbnail-live.cjs`, `node scripts/routine-care-live.cjs`, `node scripts/care-support-live.cjs`, `node scripts/photo-review-live.cjs`, and from the worktree root `node scripts/assigned-messages-live.cjs`. Expect every probe to finish with its PASS lines and exact cleanup. Fix only probe wiring (enrollment helper usage, cleanup order), never loosen assertions.

- [ ] **Step 4: Recovery drill.** Stop the 3002 API (it owns that port during the drill). From the worktree root run `node scripts/recovery.cjs`. Expect `passed: true`. It temporarily stops and restarts the local Supabase stack; the main-checkout API on 3001 reconnects afterwards.

- [ ] **Step 5: Commit** `test(api): live enrollment and safety probe`.

### Task 7: Portal — enrollment status, care decisions, urgent queue

**Files:**
- Create: `web-portal/src/lib/enrollment.ts`, `web-portal/src/lib/care-decisions.ts`, `web-portal/src/lib/urgent-reports.ts`
- Create: `web-portal/src/components/patients/EnrollmentStatus.tsx`, `CareStatusCard.tsx`, `CareDecisionDialog.tsx`, `UrgentReportQueue.tsx`, `PatientUrgentReports.tsx`
- Modify: `web-portal/src/lib/api.ts`, `web-portal/src/app/patients/page.tsx`, `web-portal/src/app/patients/[id]/page.tsx`, `web-portal/src/components/patients/PatientPhotoHistory.tsx`
- Create tests: `web-portal/tests/enrollment-status.test.ts`, `web-portal/tests/care-decisions.test.ts`, `web-portal/tests/urgent-reports.test.ts`, `web-portal/tests/safety-api.test.ts`

**Interfaces:**
- Consumes HTTP contracts from Tasks 3–5.
- Produces `apiService` methods (all through `request`, so session-generation guards apply):
  - `getEnrollmentSummary(patientId): Promise<EnrollmentSummary>` → `GET /enrollment/patients/:id`
  - `getCareDecisions(patientId, page=1): Promise<PaginatedResponse<CareDecision>>` → `GET /care-decisions/patients/:id?page&limit=20`
  - `recordCareDecision(patientId, id, body: DecisionBody): Promise<CareDecision>` → `PUT .../decisions/:id`, unwraps `.decision`
  - `markRefundIssued(patientId, id): Promise<CareDecision>` → `PUT .../decisions/:id/refund` body `{refundStatus:'issued'}`
  - `getUrgentQueue(page=1): Promise<UrgentQueue>` → `GET /urgent-reports/queue?page&limit=20`
  - `getPatientUrgentReports(patientId, page=1): Promise<PaginatedResponse<UrgentReport>>`
  - `acknowledgeUrgentReport(id): Promise<UrgentReport>` → `POST /urgent-reports/:id/acknowledge` body `{}`
  - `resolveUrgentReport(id, resolutionNote: string|null): Promise<UrgentReport>` → `POST /urgent-reports/:id/resolve`

- [ ] **Step 1: Write failing tests.** `web-portal/tests/safety-api.test.ts` — same pattern as `tests/care-support-api.test.ts` (stub `supabase.auth.getSession`, record fetch URL/method/body, scoped facade throws after `acceptSession` of another account):

```ts
await api.getEnrollmentSummary('p');
await api.getCareDecisions('p',2);
await api.recordCareDecision('p','d',{decision:'refer_out',patientMessage:null,photoId:'ph'});
await api.markRefundIssued('p','d');
await api.getUrgentQueue(3);
await api.getPatientUrgentReports('p');
await api.acknowledgeUrgentReport('r');
await api.resolveUrgentReport('r','Note');
assert.deepEqual(calls.map(c=>c.method+' '+new URL(c.url).pathname+new URL(c.url).search),[
 'GET /api/enrollment/patients/p','GET /api/care-decisions/patients/p?page=2&limit=20','PUT /api/care-decisions/patients/p/decisions/d',
 'PUT /api/care-decisions/patients/p/decisions/d/refund','GET /api/urgent-reports/queue?page=3&limit=20','GET /api/urgent-reports/patients/p?page=1&limit=20',
 'POST /api/urgent-reports/r/acknowledge','POST /api/urgent-reports/r/resolve']);
assert.deepEqual(calls[3].body,{refundStatus:'issued'});assert.deepEqual(calls[7].body,{resolutionNote:'Note'});
```
Stub responses: `{decision:{id:'d'}}` for decision PUTs, `{report:{id:'r'}}` for report POSTs, `{}` otherwise.
`web-portal/tests/care-decisions.test.ts`:

```ts
import {IdempotentAction} from '../src/lib/care-decisions';
test('lost response retries the identical id and body; success clears the attempt',async()=>{
 const calls:unknown[]=[];let fail=true;
 const action=new IdempotentAction(async(id:string,body:{decision:string})=>{calls.push([id,body]);if(fail)throw new Error('lost');return {id,...body}},()=>'fixed');
 await action.submit({decision:'refer_out'});assert.equal(action.snapshot().status,'error');
 await action.submit({decision:'needs_in_person'}); // ignored: the frozen attempt is retried
 fail=false;await action.submit({decision:'needs_in_person'});
 assert.deepEqual(calls,[['fixed',{decision:'refer_out'}],['fixed',{decision:'refer_out'}],['fixed',{decision:'refer_out'}]]);
 assert.equal(action.snapshot().status,'saved');assert.equal(action.frozenBody,null);
});
test('validation rejection releases the attempt for a corrected draft',async()=>{
 let n=0;const action=new IdempotentAction(async()=>{throw {status:400}},()=>String(++n));
 await action.submit({x:1});assert.equal(action.frozenBody,null);assert.match(action.snapshot().error,/rejected/);
});
test('cancel ignores a late result',async()=>{
 let resolve!:(v:unknown)=>void;const action=new IdempotentAction(()=>new Promise(r=>{resolve=r}));
 const pending=action.submit({x:1});action.cancel();resolve({});await pending;assert.equal(action.snapshot().status,'saving');
});
test('decision labels and refund wording',()=>{
 const {decisionLabel,refundLabel}=require('../src/lib/care-decisions');
 assert.equal(decisionLabel('refer_out'),'Referred out');assert.equal(decisionLabel('needs_in_person'),'Needs in-person care');assert.equal(decisionLabel('async_care'),'Online care');
 assert.equal(refundLabel('pending'),'Refund pending');assert.equal(refundLabel('issued'),'Refund issued');assert.equal(refundLabel('not_applicable'),null);
});
```
`web-portal/tests/enrollment-status.test.ts`:

```ts
import {enrollmentLines} from '../src/lib/enrollment';
const s=(o:any)=>({status:'enrolled',screening:{eligible:true,reasons:[],flags:[],stateCode:'IL',submittedAt:'2026-09-15T00:00:00.000Z'},screeningCount:1,consent:{version:1,acceptedAt:'2026-09-15T00:00:00.000Z'},...o});
test('summaries become factual labels',()=>{
 assert.deepEqual(enrollmentLines(s({})).map(l=>l.text),['Eligible (IL)','Consent v1 accepted']);
 assert.deepEqual(enrollmentLines(s({status:'screening_required',screening:null,consent:{version:1,acceptedAt:null}})).map(l=>l.text),['Eligibility not screened','Consent v1 not accepted']);
 const inel=enrollmentLines(s({status:'ineligible',screening:{eligible:false,reasons:['state','age'],flags:[],stateCode:'NON_US'}}));
 assert.equal(inel[0].text,'Not eligible: outside licensed states, under minimum age');assert.equal(inel[0].tone,'alert');
 assert.ok(enrollmentLines(s({screening:{eligible:true,reasons:[],flags:['trying_to_conceive'],stateCode:'IL'}})).some(l=>l.text==='Reported trying to conceive'));
});
```
`web-portal/tests/urgent-reports.test.ts`:

```ts
import {categoryLabel,statusLabel} from '../src/lib/urgent-reports';
test('urgent labels are text, not colour alone',()=>{
 assert.equal(categoryLabel('reaction_to_treatment'),'Reaction to a treatment');assert.equal(categoryLabel('rapid_worsening'),'Skin getting much worse quickly');
 assert.equal(categoryLabel('pain_or_infection'),'Pain, swelling or signs of infection');assert.equal(categoryLabel('other'),'Something else');
 assert.equal(statusLabel('open'),'Open');assert.equal(statusLabel('acknowledged'),'Seen');assert.equal(statusLabel('resolved'),'Resolved');
});
```
Run `cd web-portal && npm test` — expect FAIL.

- [ ] **Step 2: Implement libraries.** `web-portal/src/lib/enrollment.ts`:

```ts
export type EnrollmentSummary={status:'screening_required'|'ineligible'|'consent_required'|'enrolled';screening:{eligible:boolean;reasons:string[];flags:string[];stateCode:string;submittedAt:string}|null;screeningCount:number;consent:{version:number;acceptedAt:string|null}};
export type StatusLine={text:string;tone:'neutral'|'alert'};
const reasonText:Record<string,string>={state:'outside licensed states',age:'under minimum age',pregnancy:'pregnant',breastfeeding:'breastfeeding'};
export function enrollmentLines(s:EnrollmentSummary):StatusLine[]{
 const lines:StatusLine[]=[];
 if(!s.screening)lines.push({text:'Eligibility not screened',tone:'alert'});
 else if(s.screening.eligible)lines.push({text:`Eligible (${s.screening.stateCode})`,tone:'neutral'});
 else lines.push({text:'Not eligible: '+s.screening.reasons.map(r=>reasonText[r]??r).join(', '),tone:'alert'});
 if(s.screening?.flags.includes('trying_to_conceive'))lines.push({text:'Reported trying to conceive',tone:'alert'});
 lines.push({text:`Consent v${s.consent.version} ${s.consent.acceptedAt?'accepted':'not accepted'}`,tone:s.consent.acceptedAt?'neutral':'alert'});
 return lines;
}
```
`web-portal/src/lib/care-decisions.ts`:

```ts
export type DecisionKind='async_care'|'refer_out'|'needs_in_person';
export type RefundStatus='not_applicable'|'pending'|'issued';
export interface CareDecision{id:string;patientId:string;clinicianId:string;clinicianName:string;decision:DecisionKind;patientMessage:string|null;photoId:string|null;refundStatus:RefundStatus;refundUpdatedAt:string|null;createdAt:string}
export type DecisionBody={decision:DecisionKind;patientMessage:string|null;photoId:string|null};
export const decisionLabel=(d:DecisionKind)=>({async_care:'Online care',refer_out:'Referred out',needs_in_person:'Needs in-person care'} as const)[d];
export const refundLabel=(r:RefundStatus)=>r==='pending'?'Refund pending':r==='issued'?'Refund issued':null;
type State<R>={status:'idle'|'saving'|'error'|'saved';error:string;result:R|null};
/** Keeps one client id and frozen body per attempt until the server accepts or rejects it (400). */
export class IdempotentAction<B,R>{
 private state:State<R>={status:'idle',error:'',result:null};
 private listeners=new Set<()=>void>();private attempt:{id:string;body:B}|null=null;private generation=0;
 constructor(private send:(id:string,body:B)=>Promise<R>,private uuid:()=>string=()=>crypto.randomUUID()){}
 snapshot=()=>this.state;
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}};
 get frozenBody(){return this.attempt?.body??null}
 private publish(next:State<R>){this.state=next;this.listeners.forEach(fn=>fn())}
 cancel(){this.generation++}
 reset(){this.attempt=null;this.publish({status:'idle',error:'',result:null})}
 async submit(body:B){
  if(this.state.status==='saving')return;
  this.attempt??={id:this.uuid(),body:structuredClone(body)};
  const attempt=this.attempt,generation=this.generation;
  this.publish({...this.state,status:'saving',error:''});
  try{const result=await this.send(attempt.id,attempt.body);if(generation!==this.generation)return;this.attempt=null;this.publish({status:'saved',error:'',result})}
  catch(cause){if(generation!==this.generation)return;const rejected=typeof cause==='object'&&cause!==null&&'status' in cause&&(cause as {status:number}).status===400;if(rejected)this.attempt=null;
   this.publish({status:'error',result:null,error:rejected?'The server rejected these fields. Review and try again.':'Not confirmed. Retry sends the same decision.'})}
 }
}
```
`web-portal/src/lib/urgent-reports.ts`:

```ts
export type UrgentCategory='reaction_to_treatment'|'rapid_worsening'|'pain_or_infection'|'other';
export type UrgentStatus='open'|'acknowledged'|'resolved';
export interface UrgentReport{id:string;patientId:string;category:UrgentCategory;description:string;status:UrgentStatus;createdAt:string;acknowledgedAt:string|null;resolvedAt:string|null;resolutionNote:string|null}
export interface UrgentQueue{data:(UrgentReport&{patientName:string|null})[];pagination:{page:number;limit:number;total:number;totalPages:number};openCount:number}
export const categoryLabel=(c:UrgentCategory)=>({reaction_to_treatment:'Reaction to a treatment',rapid_worsening:'Skin getting much worse quickly',pain_or_infection:'Pain, swelling or signs of infection',other:'Something else'} as const)[c];
export const statusLabel=(s:UrgentStatus)=>({open:'Open',acknowledged:'Seen',resolved:'Resolved'} as const)[s];
```
Add the eight API methods to `lib/api.ts` (import the types from these modules), following the style of the care-support methods. Run `npm test` — expect PASS.

- [ ] **Step 3: Components.** Use shadcn `Button`, `Dialog`, `Textarea`, `Label`, `Badge`; `useClinicalAPI()`; `useRead` and `LoadState`/`Pages` from `components/care-support/shared`; `AlertTriangle` from `lucide-react`. Urgent/alert tone classes: `border-destructive/60`, icon `text-destructive`, always paired with text.
  - `EnrollmentStatus({patientId})`: `useRead(() => api.getEnrollmentSummary(patientId))`; renders `enrollmentLines` as a `flex flex-wrap gap-2` list of `<span>` pills (`rounded-md border px-2 py-1 text-sm`; alert tone adds `border-destructive/60` and an `AlertTriangle` icon with `aria-hidden`). Loading: "Checking eligibility…". Error: `LoadState` retry.
  - `CareDecisionDialog({patientId, photoId, defaultDecision, open, onOpenChange, onSaved})`: radio group (fieldset/legend "Care decision", options Refer out / Needs in-person / Resume online care — the last only when `defaultDecision==='async_care'`), `Textarea` "Message to the patient (optional)" max 2000 with counter, helper text "Shown to the patient with next steps. A refund will be marked pending." for refer/in-person. Submit uses one `IdempotentAction` per open dialog (`useMemo` keyed on `open`); while `frozenBody` exists the fields are disabled and the button reads "Retry same decision". On `saved` call `onSaved(result)` and close.
  - `CareStatusCard({patientId, refresh})`: `useRead(() => api.getCareDecisions(patientId, page))`; shows current (first row) as `decisionLabel` with clinician and date, patient message, `refundLabel` text; buttons "Refer out", "Needs in-person" (open the dialog with no photo) and "Resume online care" when current is not `async_care`; "Mark refund issued" when current refund is pending (disabled while saving; errors inline). History list below (older rows), `Pages` pagination. `refresh` is a number prop; include it in the `useRead` dependency so a photo-linked decision refreshes the card.
  - `UrgentReportQueue({context})`: `useRead(() => api.getUrgentQueue(page))`; section `aria-label="Urgent reports"` with heading "Urgent reports" + `AlertTriangle` + `"{openCount} open"`; description "Reported by assigned patients. Open reports appear first, oldest first. This is not a live alert."; rows `<li>` with patient name, `categoryLabel`, `statusLabel`, created date/time, `line-clamp-2` description, and `<a href={`/patients/${id}?${context}#urgent`}>Open patient</a>` (Button asChild outline). Empty: "No urgent reports." Refresh button. Subscribe to `sessionBoundary` like `PhotoReviewQueue` to clear on account change.
  - `PatientUrgentReports({patientId})`: section `id="urgent" aria-label="Urgent reports"`; lists the patient's reports newest first with status/category/date/description/resolution note; for non-resolved rows: "Acknowledge" (open only) and "Resolve" (reveals a `Textarea` "Note to the patient (optional)" and "Confirm resolve"). Pending flag per row; failures show "Not saved. Try again." and keep the typed note.
- [ ] **Step 4: Wire into pages.** `app/patients/page.tsx`: render `<UrgentReportQueue context={patientListQuery(state.page, state.search)} />` directly above `<PhotoReviewQueue …/>`. `app/patients/[id]/page.tsx`: inside the header under "Shared care record" render `<EnrollmentStatus patientId={id} />`; after the "Open messages" link render `<PatientUrgentReports key={'urgent-'+id} patientId={id} />` then `<CareStatusCard key={'care-'+id} patientId={id} refresh={careRefresh} />`, with `const [careRefresh,setCareRefresh]=useState(0)`; pass `onCareDecision={() => setCareRefresh(v => v + 1)}` to `PatientPhotoHistory`. `PatientPhotoHistory`: accept optional `onCareDecision?: () => void`; next to each photo's review controls add a `Button size="sm" variant="outline"` "Refer out or in-person…" that opens `CareDecisionDialog` with `photoId={photo.id}` and `defaultDecision="refer_out"`; `onSaved` calls `onCareDecision?.()`.

- [ ] **Step 5: Verify and commit.** `cd web-portal && npm test && npm run lint && npm run typecheck && npm run build` — all PASS. Commit `feat(portal): enrollment status, care decisions and urgent queue`.

### Task 8: iOS — enrollment phase, care status and urgent reports

Invoke the `swiftui-expert` skill before editing views. iOS 17 target; native controls only.

**Files:**
- Create: `ClearAF/Services/EnrollmentModels.swift`, `ClearAF/Services/EnrollmentRepository.swift`, `ClearAF/Services/CareDecisionRepository.swift`, `ClearAF/Services/UrgentReportRepository.swift`
- Create: `ClearAF/Views/EnrollmentView.swift`, `ClearAF/Views/UrgentReportView.swift`, `ClearAF/Views/CareStatusCard.swift`
- Modify: `ClearAF/Services/APIService.swift`, `ClearAF/ContentView.swift`, `ClearAF/Views/DashboardViewEnhanced.swift`
- Create tests: `ClearAFTests/EnrollmentTests.swift`, `ClearAFTests/SafetyTests.swift`
- Modify: `ClearAFUITests/AccountFlowUITests.swift`

**Interfaces:**
- Consumes HTTP contracts of Tasks 3–5.
- Produces:
  - `EnrollmentModels.swift`: `enum EnrollmentStatus: String, Codable { case screeningRequired = "screening_required", ineligible, consentRequired = "consent_required", enrolled }`; `struct EligibilityScreening: Codable, Equatable { id: UUID; stateCode, dateOfBirth, pregnancyStatus: String; eligible: Bool; reasons, flags: [String]; rulesVersion, submittedAt: String; waitlistRequestedAt: String? }`; `struct ConsentDocument: Codable, Equatable { version: Int; title, body, sha256: String; acceptedAt: String? }`; `struct EnrollmentState: Codable, Equatable { status; rulesVersion: String; screening: EligibilityScreening?; consent: ConsentDocument }`; `struct ScreeningAnswers: Codable, Equatable { stateCode, dateOfBirth, pregnancyStatus: String }`; `enum PregnancyAnswer: String, CaseIterable { none, pregnant, tryingToConceive = "trying_to_conceive", breastfeeding }` with `title` ("None of these", "Pregnant", "Trying to conceive", "Breastfeeding"); `enum ResidenceOption` static `all: [(code: String, name: String)]` = 51 USPS entries in name order plus `("NON_US", "I live outside the United States")`; `struct CareDecision: Codable, Equatable { id, patientId, clinicianId: UUID; clinicianName, decision: String; patientMessage: String?; photoId: UUID?; refundStatus: String; refundUpdatedAt: String?; createdAt: String }`; `enum UrgentCategory: String, CaseIterable { reactionToTreatment = "reaction_to_treatment", rapidWorsening = "rapid_worsening", painOrInfection = "pain_or_infection", other }` with the portal's titles; `struct UrgentReport: Codable, Equatable, Identifiable { id, patientId: UUID; category, description, status, createdAt: String; acknowledgedAt, resolvedAt, resolutionNote: String? }`.
  - Transports (implemented by `APIService`, every method takes `ticket: AccountAccess.Ticket` and uses the existing `request`): `EnrollmentTransport { fetchEnrollment() -> EnrollmentState; submitScreening(id: UUID, answers:) -> EnrollmentStatus; joinWaitlist(screeningId: UUID) -> EligibilityScreening; acceptConsent(version: Int, sha256: String) -> EnrollmentStatus }`; `CareDecisionTransport { currentCareDecision() -> CareDecision? }`; `UrgentReportTransport { sendUrgentReport(id: UUID, category: UrgentCategory, description: String) -> UrgentReport; urgentReports() -> [UrgentReport] }`.
  - `AccountFailure` gains `case enrollmentRequired, noAssignedClinician` (descriptions: "Finish your eligibility and consent steps to continue." / "You don't have an assigned clinician yet. If this is an emergency, call 911.").

- [ ] **Step 1: Write failing repository tests.** `ClearAFTests/EnrollmentTests.swift` (Swift Testing, fake transport like `CareSupportTests`):

```swift
@MainActor struct EnrollmentTests {
    @Test func failedScreeningRetriesTheSameIdUntilAnswersChange() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        let repo = EnrollmentRepository(access: access, transport: transport)
        let answers = ScreeningAnswers(stateCode: "IL", dateOfBirth: "1990-01-01", pregnancyStatus: "none")
        transport.failSubmit = true
        await repo.submit(answers, ticket: ticket); await repo.submit(answers, ticket: ticket)
        #expect(transport.submittedIDs.count == 2 && Set(transport.submittedIDs).count == 1)
        await repo.submit(ScreeningAnswers(stateCode: "NY", dateOfBirth: "1990-01-01", pregnancyStatus: "none"), ticket: ticket)
        #expect(Set(transport.submittedIDs).count == 2)
        transport.failSubmit = false
        await repo.submit(answers, ticket: ticket)
        #expect(repo.state?.status == .consentRequired && repo.error == nil)
    }
    @Test func consentSendsTheDisplayedVersionAndHash() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        transport.state = EnrollmentFake.make(.consentRequired)
        let repo = EnrollmentRepository(access: access, transport: transport)
        await repo.load(ticket: ticket); await repo.acceptConsent(ticket: ticket)
        #expect(transport.accepted.first?.0 == 1 && transport.accepted.first?.1 == String(repeating: "a", count: 64))
        #expect(repo.state?.status == .enrolled)
    }
    @Test func lateResponseAfterAccountChangeIsDropped() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        transport.onFetch = { access.invalidate() }
        let repo = EnrollmentRepository(access: access, transport: transport)
        await repo.load(ticket: ticket)
        #expect(repo.state == nil)
    }
}
```
`EnrollmentFake` implements `EnrollmentTransport`, records `submittedIDs`, `accepted: [(Int, String)]`, returns `.consentRequired` from submit, `.enrolled` from accept (and updates `state`), supports `failSubmit` (throws `URLError(.networkConnectionLost)`) and `onFetch`; `static func make(_ status:) -> EnrollmentState` builds a state with consent version 1 and sha256 of 64 "a".
`ClearAFTests/SafetyTests.swift`:

```swift
@MainActor struct SafetyTests {
    @Test func urgentReportKeepsItsIdAcrossRetriesAndClearsAfterSuccess() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        let repo = UrgentReportRepository(access: access, transport: transport)
        transport.fail = true
        await repo.send(category: .rapidWorsening, description: " Spreading fast ", ticket: ticket)
        #expect(repo.pending != nil && repo.error != nil)
        await repo.send(category: .other, description: "Edited", ticket: ticket) // frozen: same attempt retried
        transport.fail = false
        await repo.send(category: .other, description: "Edited", ticket: ticket)
        #expect(Set(transport.sent.map(\.0)).count == 1)
        #expect(transport.sent.allSatisfy { $0.1 == .rapidWorsening && $0.2 == "Spreading fast" })
        #expect(repo.pending == nil && repo.reports.first?.status == "open")
    }
    @Test func noAssignedClinicianIsExplained() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        transport.failure = AccountFailure.noAssignedClinician
        let repo = UrgentReportRepository(access: access, transport: transport)
        await repo.send(category: .other, description: "Help", ticket: ticket)
        #expect(repo.error?.contains("911") == true && repo.pending == nil)
    }
    @Test func careDecisionWording() {
        #expect(CareStatusCopy.title(for: "refer_out") == "Online care isn't the right fit right now")
        #expect(CareStatusCopy.title(for: "needs_in_person") == "Your clinician recommends an in-person visit")
        #expect(CareStatusCopy.refund("pending") == "Refund: being processed")
        #expect(CareStatusCopy.refund("issued") == "Refund: issued")
        #expect(CareStatusCopy.refund("not_applicable") == nil)
    }
}
```
Run the iOS unit tests for these two suites (`-only-testing:ClearAFTests/EnrollmentTests -only-testing:ClearAFTests/SafetyTests`) — expect compile FAIL.

- [ ] **Step 2: Models, repositories, transports.** Implement the Interfaces above. Repository rules (mirroring `CheckInRepository`/`MessagingRepository`): `@MainActor final class … : ObservableObject`; check `access.require(ticket)` before and after every await; `cancel()` clears published state and bumps an epoch so late responses are ignored.
  - `EnrollmentRepository`: `@Published private(set) var state: EnrollmentState?`, `loading`, `error: String?`; `load(ticket:)`; `submit(_:ticket:)` keeps `private var attempt: (id: UUID, answers: ScreeningAnswers)?` — reuse the id when the answers are identical, new `UUID()` otherwise; clear the attempt on success or on `requestFailed(400)`; after a successful submit call `load` to refresh consent/status. `joinWaitlist(ticket:)` uses `state?.screening?.id`. `acceptConsent(ticket:)` sends `state!.consent.version`/`sha256`, then reloads. Error copy: "Couldn't save your answers. Check your connection and try again." / "Couldn't record your consent. Try again."
  - `CareDecisionRepository`: `@Published private(set) var current: CareDecision?`, `error`; `load(ticket:)`.
  - `UrgentReportRepository`: `@Published private(set) var reports: [UrgentReport]`, `pending: (id: UUID, category: UrgentCategory, description: String)?`, `sending`, `error`, `sent: UrgentReport?`; `send(category:description:ticket:)` trims the description (1–2000 else error "Describe what's happening (up to 2,000 characters)."), freezes the first attempt until success/400/`noAssignedClinician`; on success prepends the report and sets `sent`; `load(ticket:)` fetches recent reports. `noAssignedClinician` maps to its description.
  - `CareStatusCopy` (in `CareStatusCard.swift`): `title(for:)` and `refund(_:)` exactly as the test expects; `nextSteps` = ["Book a visit with an in-person dermatologist.", "Your photos and history stay available in ClearAF.", "You can still message your care team."].
  - `APIService`: conform to the three transports with the endpoints from Tasks 3–5 (`/enrollment`, `/enrollment/screenings/{id}`, `/enrollment/waitlist`, `/enrollment/consents/{version}`, `/care-decisions/current`, `/urgent-reports/{id}`, `/urgent-reports?limit=20`). Validate owner IDs like existing transports (reports' `patientId == ticket.accountID`). Change `request` so non-2xx responses decode `{code}` when present: `ENROLLMENT_REQUIRED` → throw `.enrollmentRequired` and, on the main actor, call `recheckEnrollment()`; `NO_ASSIGNED_CLINICIAN` → `.noAssignedClinician`; otherwise `.requestFailed(status)` as today. Add `@MainActor lazy var enrollment`, `careDecisions`, `urgentReports`; cancel them in `clearAccount()`.
  - Phase: add `case enrollment` to `APIService.Phase`. In `loadProfile`, after the store is ready and before choosing onboarding/ready, `await enrollment.load(ticket:)`; if it failed, set `accountError` and `.profileError`; if status ≠ `.enrolled`, set `.enrollment`. Add `@MainActor func enrollmentFinished()` → `phase = currentUser?.onboardingCompleted == true ? .ready : .onboarding`, and `recheckEnrollment()` → reload and switch to `.enrollment` when not enrolled. `isLoggedIn` stays `.ready || .onboarding`.
  Run the two suites — expect PASS.

- [ ] **Step 3: Views.**
  - `EnrollmentView` (ContentView `.enrollment` case, with the same top-trailing Sign out overlay as onboarding): switch on `repository.state?.status`.
    - Screener (`Form`): intro "A few questions first" (`CareJournal.display` title) and "We check eligibility before you start. Your answers are shared with your care team."; `Picker("State of residence", selection: $stateCode)` `.pickerStyle(.navigationLink)` over `ResidenceOption.all` with an initial "Choose" (`""`) tag; date of birth as a button "Date of birth: Choose" that opens a sheet with `DatePicker(..., in: ...Date.now, displayedComponents: .date).datePickerStyle(.wheel)` initialised to 25 years ago and a "Done" button — the value is only recorded when Done is tapped; `Picker("Are you currently pregnant, trying to conceive, or breastfeeding?", selection: $pregnancy)` `.pickerStyle(.inline)` over `PregnancyAnswer.allCases` with no default; "Continue" disabled until all three are chosen and while saving. Accessibility identifiers: `enrollmentState`, `enrollmentDOB`, `enrollmentDOBDone`, `enrollmentContinue`.
    - Not eligible: warning symbol + "ClearAF can't provide your care right now", one sentence per reason ("ClearAF isn't available in your state yet.", "You need to be at least 18 to use ClearAF.", "ClearAF can't treat you online during pregnancy.", "ClearAF can't treat you online while breastfeeding."), "You have not been charged.", button "Notify me if ClearAF becomes available to me" (shows "We'll keep your request on file." when `waitlistRequestedAt` is set), button "Update my answers" (returns to the screener with fields cleared), Sign out.
    - Consent: `ScrollView` with title/body (`Text(body)` preserving paragraphs), then `Button("I understand and agree")` `.buttonStyle(.borderedProminent)` tinted `CareJournal.actionPrimary`, identifier `enrollmentAgree`; caption "Version \(version)".
    - `.enrolled` → call `APIService.shared.enrollmentFinished()` in `.task(id:)`.
  - `UrgentReportView` (sheet): top `Label` in a rounded box with the exact emergency notice, `.foregroundStyle(.red)` symbol `exclamationmark.triangle.fill` plus text; `Picker("What's happening?", selection: $category)` `.pickerStyle(.inline)`; `TextField("Describe what's happening", text:, axis: .vertical)` 3...8 lines with a count "/2000"; Send button (disabled while sending; "Retry" when `pending` exists); after success show "Sent. It's flagged as urgent at the top of your care team's queue." and the recent reports list (category title, date, status "Open"/"Seen by your care team"/"Resolved", resolution note). Identifiers `urgentCategory`, `urgentDescription`, `urgentSend`, `urgentSent`.
  - `CareStatusCard`: shown on Today when `current.decision != "async_care"`; `careJournalSurface()`; title from `CareStatusCopy`, clinician name and date, patient message, next steps as a list, refund line when non-nil. Identifier `careStatusCard`.
  - Today (`DashboardViewEnhanced`): at the top of the scroll content (below the greeting) add a full-width button row `Label("Something's wrong?", systemImage: "exclamationmark.triangle")` with subtitle "Tell your care team about a reaction or sudden change" (min height 44, `careJournalSurface()`, identifier `urgentEntry`) that presents `UrgentReportView`; then `CareStatusCard` when applicable; load both repositories in `.task` using the current ticket.
- [ ] **Step 4: UI test helper.** In `AccountFlowUITests`, add and call before every `finishOnboarding` wait (inside `finishOnboarding`, first thing):

```swift
@MainActor private func completeEnrollment(_ app: XCUIApplication) {
    guard app.buttons["enrollmentContinue"].waitForExistence(timeout: 10) else { return }
    app.buttons["enrollmentState"].tap(); app.buttons["Illinois"].tap()
    app.buttons["enrollmentDOB"].tap(); app.buttons["enrollmentDOBDone"].tap()
    app.buttons["None of these"].tap()
    app.buttons["enrollmentContinue"].tap()
    XCTAssertTrue(app.buttons["enrollmentAgree"].waitForExistence(timeout: 15))
    app.buttons["enrollmentAgree"].tap()
}
```
Adjust element queries to the real hierarchy if a navigation-link picker exposes the state row differently (inspect `app.debugDescription` once); keep identifiers in the app, not coordinates.

- [ ] **Step 5: Verify.** Full unit suite (`-only-testing:ClearAFTests`) PASS; signed Debug Simulator build PASS; `AccountFlowUITests/testConfirmationOnboardingColdLaunchAndOfflineLogout` PASS against the local stack (worktree API must be the one on 3001 for the Simulator Debug build — stop the main-checkout API and run the worktree API on 3001 with `ENROLLMENT_ENFORCEMENT=on` for this step, then restore). Run `node scripts/recovery.cjs` before UI tests only if it has not already passed with the current code (Ordering rule in CLAUDE.md).

- [ ] **Step 6: Commit** `feat(ios): enrollment, care status and urgent reports`.

### Task 9: Integration, reviews and pull request

- [ ] **Step 1: Portal walkthrough (Playwright).** With the worktree API on 3001 and the worktree portal on 3000 (stop the main-checkout processes first; restore them at the end), use a retained synthetic fixture: run `node backend/scripts/enrollment-safety-live.cjs --keep-for-ui` if you add that flag (store credentials only in `.local/`), or create a clinician/patient pair with the routine UI fixture. Verify: patient workspace enrollment pills; "Refer out or in-person…" from a photo creates a pending decision and the Care status card updates; "Mark refund issued"; urgent report from the Simulator (or API) appears in "Urgent reports" above the review queue; Acknowledge then Resolve with a note. Check dark mode and 390 px width for the new sections. Clean fixtures by exact identity.
- [ ] **Step 2: Simulator walkthrough.** Using the `xcodebuildmcp-cli` skill: new account → screener with `TX` → not-eligible screen with waitlist; update answers to `IL` → consent → onboarding → Today; "Something's wrong?" sends a report; after the clinician's refer-out the Today card shows it after refresh. Screenshots stay local.
- [ ] **Step 3: Reviews.** Dispatch `care-access-reviewer` and `api-contract-checker` (subagents) on `git diff origin/main...HEAD`; run `/code-review`. Fix all Critical/Important findings in one wave; rerun only the covering tests.
- [ ] **Step 4: Docs.** Create `docs/features/enrollment-safety-verification.md` (scope, evidence with counts, limits: no payment, DRAFT consent, enforcement rollout, no notifications). Update `docs/features/client-expansion.md` status. Add a line to `docs/handoff/README.md`. In `docs/design/design-language.md` §5 add an "Urgent and ineligible states" row: destructive/error semantic colour + warning symbol + text label; never brand blue; emergency guidance text is fixed.
- [ ] **Step 5: Final checks and PR.** `backend: npm test && npm run build && npm audit --audit-level=low`; `web-portal: npm test && npm run lint && npm run typecheck && npm run build && npm audit --audit-level=low`; `node scripts/source-hygiene.cjs`; `git diff --check`. Push the branch and open a PR referencing #13 with a summary, the decisions table link and the rollout note (`ENROLLMENT_ENFORCEMENT=off` in production until the updated iOS build is installed; hosted migration required). Wait for CI green (`gh pr checks`). Do **not** merge, deploy or run hosted migrations — ask the owner.
