# Clinician routines — T3 verification

Clinicians assign and edit morning/evening routines. Patients read the assigned steps and record completion. This is the product decision approved for the MVP; no sample routine is clinical guidance.

The [design](../superpowers/specs/2026-09-12-routine-loop-design.md) defines the API and account/offline behavior. The [implementation plan](../superpowers/plans/2026-09-12-routine-loop.md) tracks backend, patient app, clinician portal and integrated verification. This branch is not deployed; photo PR4 remains the released baseline.

## Backend evidence

Task1 implementation `22c462b` received independent spec and code-quality approval. Its local evidence includes 95 passing tests, a successful TypeScript/Prisma build, 12 real API probe groups and a fresh-destination recovery with 28 postrestore security groups. The additive migration preserves the legacy routine tables and protects the new tables with RLS and explicit client privilege revocation. Patient definition writes and retired reset operations cannot mutate stored data.

Revision edits use the expected prior revision and a stable request ID. Completion reports preserve their original revision, instant, local date and timezone; retries return the canonical event. Historical completion of a previously active revision remains possible after an edit, and never completes the replacement revision.

## Remaining acceptance gates

Patient implementation `89bbde8` received independent spec and code-quality approval. All 37 Debug unit tests (including nine routine repository tests), the dedicated routine UI flow, both account-regression UI flows and the Release Simulator build passed. The clinician editor and history panel passed 44 tests, typecheck, production build and dependency audit. Real browser verification covered conflict reload, preserved failed-save retry, step validation/order, archive, immutable history and pagination. The portal review fix passed scoped re-review. Whole-branch review remains pending; the goal is not yet complete.

All verification uses local synthetic identities. No production migration, hosted patient testing, clinical content, retention policy or treatment interpretation is part of this work. Local recovery does not prove hosted provider configuration or production disaster recovery.

## Acceptance evidence map

| Requirement | Evidence required | Current status |
| --- | --- | --- |
| Only current clinician edits | Role/assignment denial tests, concurrent reassignment probe, portal controls | Backend and portal verified |
| Patients cannot edit definitions | Legacy/new API denial tests and absence of authoring UI | Backend and patient UI verified |
| Immutable definitions and dated history | Version/edit/retry tests, stored prior revision, portal history | Backend and cross-client integration verified |
| Durable, duplicate-safe completion | Real file reopen/write-failure tests, lost-response retry, API uniqueness probe | API and patient persistence verified |
| Account isolation | Stale callback/write and account-switch tests on clients | Patient and portal verified |
| Local-day truthfulness | Date/timezone validation, day rollover, yesterday fixture versus today's UI | API and patient UI verified |
| Clinician assignment and review | Real browser assign/edit/archive/conflict/history flow | Verified locally |
| Legacy preservation | Additive migration and untouched CoreData, no automatic promotion | Database and patient client verified |
| Migration/security/recovery | Full chain parity, restored nonempty history, direct Data API denial | Backend verified |
| Full verification and independent review | Backend/portal/iOS builds and tests, UI flows, whole-branch review, cleanup | All task reviews complete; whole-branch review pending |

## Patient verification details

The repository tests use real temporary files and cover original request identity through restart and a lost response, atomic write failure, stale account callbacks, date rollover, pending older revisions and continued processing after a rejected older event. The Simulator flow verified assigned ordered steps, absence of patient editing, recording and cold-launch restoration. An independent database query found exactly one morning event for the current test date and one evening event for the previous date.

Simulator does not expose the physical-device file-protection attributes. Writes explicitly request Data Protection, but real locked-device behavior remains a separate device verification gate. Existing compiler/AppIntents warnings are documented; successful build/test output is not claimed to be warning-free.

## Reproduce the local UI fixture

Start the local backend on port3001 using the documented baseline setup, with the current migration chain applied. From the repository root:

```sh
node backend/scripts/routine-ui-fixture.cjs create
node backend/scripts/routine-ui-fixture.cjs inspect
```

The helper refuses non-loopback database/Auth endpoints and refuses to replace existing fixture state. It creates a confirmed, onboarded synthetic patient and assigned synthetic clinician, two routines with ordered synthetic steps, and only yesterday's evening completion. Credentials and exact account IDs are kept in ignored `.local/routine-ui-fixture.json` with mode0600; do not print or commit this file.

For the dedicated `AccountFlowUITests.testAssignedRoutineCompletionSurvivesColdLaunchAndYesterdayDoesNotCount` test, load the patient's credentials into `TEST_RUNNER_CLEARAF_ROUTINE_UI_EMAIL` and `TEST_RUNNER_CLEARAF_ROUTINE_UI_PASSWORD` in the xcodebuild process environment. Use the normal Debug configuration and local API3001. The test requires a morning revision with no completion today; after a successful run, create a new morning revision or clean and recreate the fixture before repeating it. Use the clinician's fixture credentials for the local portal browser flow.

After all cross-client checks, sign out both clients and run:

```sh
node backend/scripts/routine-ui-fixture.cjs cleanup
```

Cleanup revalidates each recorded ID/email pair before removing only those synthetic accounts and their routine rows. It preserves unrelated local data. Retain any failed-run state until inspected and cleaned through the same helper.

## Cross-client and cleanup evidence

A browser edit created morning version2 without changing version1. The patient Simulator recorded version2 and restored its recorded state after relaunch. The portal displayed both completion events with their actual versions and original local dates/timezones. A second browser tab received a conflict and reloaded the accepted edit. During a real local API outage, the editor retained its frozen save payload; retry created one version after service restoration. Step validation/movement/removal and archive preserved history. Eighteen additional synthetic reports exercised real pagination with20 events on the first page and1 on the second.

The clean local production build passed login, panel rendering and logout. A prior development-server logout observation was invalidated by missing generated Next.js manifests after a concurrent production build; development and production builds were separated before the successful recheck.

The fixture helper passed explicit-mode, loopback-only and existing-state preservation checks, followed by a full cleanup/create/inspect/cleanup rehearsal. Both browser tabs closed and the Simulator test signed out. Final local counts were zero Auth users, routine revisions, routine completions and storage objects. No unrelated local data was deleted. See [verification.json](verification.json) for the evidence inventory and remaining review status.
