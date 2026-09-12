# T3 Routine Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clinicians assign/edit routines and patients reliably record dated completion, with immutable history and account isolation.

**Architecture:** Versioned backend assignments and completion events replace mutable reset flags. Patient uses an account-bound atomic file cache/outbox and foreground synchronization; clinician portal edits with optimistic version checks and reviews paginated events.

**Tech Stack:** Existing Express/Prisma/Supabase Postgres, SwiftUI/Swift Testing, Next.js/React/Node tests. No new dependency required.

**Spec:** docs/superpowers/specs/2026-09-12-routine-loop-design.md

## Global Constraints

- Only local synthetic data. No production migration/deployment or private handoff content.
- Preserve legacy routines/data without promoting them to clinician assignments. No destructive reset/delete or invented clinical content.
- Only the currently assigned clinician edits definitions; patient records completion. Check permissions on server and preserve account generation boundaries on clients.
- Immutable revisions/events, stable request UUIDs, original completion instant/date/timezone, unique(patient,revision,localDate), expected prior revision for edits.
- Name/title1..120, instructions<=2000, max20steps; active requires1..20, inactive0..20. DateYYYY-MM-DD matches completedAt in supplied IANA timeZone, at most5minutes future skew. Strict schemas reject extra fields.
- Direct anon/authenticated access to new clinical tables denied; RLS and backend-only privileges follow baseline. No credentials in clients/cache/logs.
- Foreground recovery only; bounded retry, visible persistence errors, no claim of clinical review or treatment outcome.
- User delegated implementation decisions and requested autonomous work. Record routine choices in the ledger; do not repeat approval menus.

### Task 1: Versioned routine API and migration

**Files:** backend/src/routes/routines.ts; new backend/src/services/routineCare.ts; backend/prisma/schema.prisma; a CLI-generated supabase/migrations/*_clinician_routines.sql; backend/tests/routine-care.test.ts; backend/scripts/routine-care-live.cjs; backend/scripts/recovery-drill.cjs and security-live.cjs; scripts/recovery.cjs; backend/tests/migration-chain.test.ts. Recovery checks must preserve approved baseline hashes and compare the current full migration chain and schema/security against a fresh destination built from repository migrations.

**Interfaces:** Implements all paths and exact DTOs in spec API contract. RoutineRevision.steps is ordered `{title,instructions}[]`. Patient/clinician snapshot `{routines,completions}`. PUT revision returns `{routine}`; PUT completion returns `{completion}`. New models CareRoutineRevision and CareRoutineCompletion map to care_routine_revisions and care_routine_completions. Helpers may be local to routineCare.ts; public route contract is binding.

- [ ] Add red behavior tests using current route-test harness for patient write403/no mutation, wrong clinician404, immutable edit/history, stale expected revision409, ID retry, completion owner/role/strictdate/timezone validation, old revision event identity, duplicate daily report and concurrent requests. Example assertions:
  ```ts
  assert.equal((await patientPutDefinition()).status, 403);
  assert.equal((await staleClinicianEdit()).status, 409);
  assert.equal((await retryCompletion(original)).body.completion.id, accepted.id);
  assert.equal((await completionWithNewIDSameDay()).body.completion.id, accepted.id);
  assert.equal((await readHistoricalCompletion()).body.routine.name, 'Original synthetic routine');
  ```
- [ ] Run `npm test` from backend and record real missing-contract failures, not harness errors.
- [ ] Create migration with pinned CLI `npx --yes supabase@2.117.0 migration new clinician_routines` after checking help. Add new immutable tables/constraints/indexes, RLS and grants following baseline; leave old tables unchanged. Extend Prisma schema and generate client. Core design:
  ```sql
  -- Equivalent Prisma names/types must match final migration.
  -- Revisions UNIQUE(userId,timeOfDay,version); completions UNIQUE(userId,revisionId,localDate).
  ALTER TABLE public.care_routine_revisions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.care_routine_completions ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.care_routine_revisions, public.care_routine_completions FROM PUBLIC, anon, authenticated;
  GRANT ALL ON public.care_routine_revisions, public.care_routine_completions TO service_role;
  ```
  Use FKs to patient/revision/author and database time-of-day/version/date-shape constraints. Lock patient profile within transaction before checking current assigned clinician, expected revision and inserting next version. Existing identity retries are owner/slot/content checked after authorization; return original result. Completion insert handles uniqueness race by retrieving and returning canonical existing event without changing its metadata.
- [ ] Replace legacy patient definition writes with403 and obsolete step/reset/single legacy read with410. Implement current snapshots and clinician history (limit1..50, deterministic order) with assignment checks. Validate UUIDs and strict bounded bodies; compare actual local date in IANA timezone via Intl.DateTimeFormat; reject invalid/nonfinite dates without raw provider errors.
- [ ] Add/run loopback-only live probe that creates exact synthetic patientA/B + clinicianA/B, tests assign/edit/retry/conflict/completion and retained history, denies wrong owners/clinicians and direct Data API operations, and cleans only recorded IDs in FK-safe order. Run migration/status, real migration/recovery drill and updated table security checks. Record commands/output. Recovery fixtures must include nonempty new-table records and updated protection checks. Extend the single-baseline driver to validate the full applied migration chain and source/fresh-destination schema parity; do not bypass the canonical driver or weaken the original baseline hash requirement.
- [ ] Run full backend tests/build/audit and source hygiene; commit only Task1 files and write task report with schema/API evidence and cleanup. No push/production action.

### Task 2: Patient routine repository and UI

**Files:** new ClearAF/Services/RoutineRepository.swift and RoutineModels.swift; ClearAF/Services/APIService.swift; ClearAF/ContentView.swift; ClearAF/Views/RoutineView.swift; ClearAF/Views/DashboardViewEnhanced.swift; ClearAF/Views/OnboardingView.swift and ProfileView.swift (routine copy/export labels only); new ClearAFTests/RoutineRepositoryTests.swift; ClearAFUITests/AccountFlowUITests.swift (routine synthetic flow only).

**Consumes:** Exact Task1 snapshot/revision/completion DTOs from spec. API methods use existing AccountAccess ticket guards and ISO date strategy. **Produces:** `@MainActor RoutineRepository` ObservableObject with current snapshot/pending/error state; `resume(accountID:ticket:)`, `cancel()`, `refresh()`, `recordCompletion(revision:ticket:)`, `retry()` and a derived state for current localDate. Concrete signatures may match existing app conventions but all callers change together; no old CoreData routine mutation.

- [ ] Write real temporary-directory red tests with injected network stages for atomic persistence/reopen, failed write no success, legacy CoreData untouched, sameID lost-response retry, daily dedupe/date rollover, stale account callbacks/responses and new revision preserving pending old event. Example behavior:
  ```swift
  let savedID = try repository.recordCompletion(revision: assigned, ticket: loginA).id
  let reopened = try makeRepository(directory: originalDirectory)
  #expect(reopened.pending.first?.id == savedID)
  #expect(try await retryAfterLostResponse(reopened).id == savedID)
  #expect(newAccountRepository.pending.isEmpty)
  ```
- [ ] Add Codable DTOs and atomic protected file storage under Accounts/<account UUID>/routine-care.json; validate embedded owner, bound corrupt input handling and surface read/write failure rather than inventing blank success. No tokens or signed URLs. Persist event before network; use same ID/body through bounded foreground retry. Guards before/after awaits and at originating user actions. Never discard pending old-version events during refresh.
- [ ] Implement transport on APIService using Task1 URLs and envelopes, with ticket checks. Bind/cancel repository in same verified-profile/scene boundaries as photo repository. Preserve T2 offline profile restrictions. Record date with Gregorian current timezone and recompute today on foreground/significant-time change; timestamps remain original.
- [ ] Replace RoutineView's sample/editor/timer/self-assignment with ordered clinician steps, current/cached/version/date context, loading/empty/error/refresh, and Record completion with truthful on-device/pending/recorded/error states. No new clinical defaults. Dashboard routine rows derive status/navigation from repository; remove fake routine durations/completion flags in affected rows. Keep old CoreData records/model intact. Update onboarding/help text that currently promises patient routine creation/timers. Label any retained CoreData routine export explicitly as legacy local routines so it cannot be mistaken for current clinician assignments; no new export subsystem.
- [ ] Add synthetic UI exercise against this branch local API: assigned routine appears, patient editing absent, completion becomes recorded and survives cold launch; second day is not completed from yesterday's event. Parent can prepare exact clinician assignment fixture and verify server history. Reuse existing account tests and synthetic tools; do not add production fake-success flags.
- [ ] Run focused/full Debug tests, appropriate UI flows and Release Simulator build; commit scoped Task2 files and report results/limitations. Standard Debug remains3001; coordinate local API routing with parent before live UI.

### Task 3: Clinician editor and completion review

**Files:** new web-portal/src/components/patients/PatientRoutineCare.tsx; new web-portal/src/lib/routine-care.ts; web-portal/src/lib/api.ts; web-portal/src/types/api.ts; web-portal/src/app/patients/page.tsx; web-portal/tests/routine-care.test.ts.

**Consumes:** Task1 exact clinician snapshot, PUT revision and paginated completion API. **Produces:** generation-bound facade methods `getPatientRoutines`, `savePatientRoutine`, `getPatientRoutineCompletions` and panel in patient detail. Ordered steps/title/instructions only. Stable request revision ID retained per unresolved save attempt; expectedRevisionId captured from loaded snapshot.

- [ ] Add red behavior tests for draft preservation on failure, stableID retry after lostresponse,409reload/conflict behavior, successful save advancing expectedrevision, stale patient/session response rejection, and history pagination. Example:
  ```ts
  await controller.save(); // injected transient failure
  const firstID = requests[0].revisionId;
  await controller.retry();
  assert.equal(requests[1].revisionId, firstID);
  assert.equal(controller.snapshot().draft.name, 'Synthetic morning');
  ```
- [ ] Add typed facade methods and a small controller only as needed for meaningful async-state testing. Preserve existing generation guards. Serialize saves per slot, don't generate newID on retry, prevent editing an unresolved payload into a different request with sameID. On409 offer Reload with explicit conflict text; no silent overwrite.
- [ ] Implement morning/evening forms: name, ordered step title/instructions add/remove/move, active/archive, version and Save. Preserve draft when failed, show validation/loading/error/refresh, no patient record editing. Render paginated recent completion events with actual revision name/version/local date/timezone and received time when useful; no adherence percentages or medical conclusions.
- [ ] Attach panel in patient detail. Run portal tests/lint/typecheck/build/audit and browser genuine local clinician assignment/edit/conflict/history/error flow with exact synthetic patient fixtures; coordinate API availability. Commit only Task3 files and report cleanup/evidence.

### Task 4: Integration, final review and handoff

**Files:** docs/routines/README.md and verification.json; docs/handoff only when updating known setup/merge state; necessary review fixes in owning task files.

- [ ] Package each committed task diff with Superpowers scripts and request independent spec/quality review; fix important findings through implementer and scoped re-review. Finish with whole-branch review covering cross-client/schema contracts and all ledger findings.
- [ ] Exercise real local clinician assign→patient completion→clinician dated history, edit→newrevision while oldcompletion stays unchanged, patient/wrongclinician denials, offline/restart/lost-response/accountswitch behavior, localday rollover, migration/recovery and direct Data API protection. Example end-to-end acceptance:
  ```text
  assign version1 → patient records eventE → clinician edits version2
  retry eventE → one stored event tied to version1; version2 incomplete
  patient tries edit →403; unrelated clinician tries read/write→404
  ```
- [ ] Verify full backend/portal/iOS tests and builds, relevant UI/browser evidence, audit0, secret scan/source hygiene/diffcheck. Remove only exact synthetic test accounts/records/files; retain developer setup/private handoff. Record exact reviewed source revisions, local config overrides and release limitations.
- [ ] Commit verification/handoff. Record photo PR4 merge and latest CI as facts distinct from routine release status; finish active goal only with all acceptance checks met. No clinical deletion/retention or production patient testing.
