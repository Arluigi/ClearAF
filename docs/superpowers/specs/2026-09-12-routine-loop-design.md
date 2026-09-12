# T3 clinician-assigned routine loop

The product owner explicitly chose clinician assignment/editing and patient completion, approved MVP scope, and asked to merge the photo work and begin the next goal autonomously. PR4 is merged at2a7f392 with all CI checks passing. This is an architectural change across API, persistence and both clients. Routine implementation choices are delegated; no repeat approval gate is needed. No clinical content or deletion policy is inferred.

## Selected design

Use new versioned assignments and dated completion events, preserving legacy routine tables and local records without treating them as clinician-authored. Mutating the old routine/step booleans would lose history and retain the wrong editing authority. A full scheduling/prescribing engine would exceed this MVP. The selected design keeps one latest morning and evening assignment per patient and permits archival by a new inactive revision, never destructive replacement.

Each revision is immutable: UUID, patient UUID, morning/evening, monotonically increasing version, author clinician UUID, server creation time, name, active flag, ordered JSON steps. A step has only title and instructions; clinicians enter all content. Editing creates a new revision with an expected prior revision ID. A transaction locks the patient profile, checks the currently assigned clinician after locking, and compares the latest revision before inserting. This rejects stale editor overwrites and serializes concurrent edits/reassignment. Stable client-generated revision IDs make a lost response safely retryable.

A patient records completion of the whole viewed routine, not a mutable set of forever-completed steps. An immutable event stores its UUID, patient/revision IDs, original completedAt instant, localDate (YYYY-MM-DD), IANA timezone and server receivedAt. Unique(patient,revision,localDate) prevents duplicate daily reports even across devices. Retrying the same ID returns the original event; reusing an ID for different content is409. Old revisions remain reportable as historical self-reports, including an offline event sent after a clinician edit; these do not mark a replacement revision complete. Inactive revisions themselves are not completable. No undo/delete is added in this slice.

## API contract

All paths below are under authenticated /api/routines. Existing server role/session checks remain. API response dates are ISO8601 strings; localDate remains a date string.

Types:
```ts
type RoutineStep = { title: string; instructions: string };
type RoutineRevision = { id: string; userId: string; timeOfDay: 'morning'|'evening'; version: number; createdBy: string; createdAt: string; name: string; isActive: boolean; steps: RoutineStep[] };
type RoutineCompletion = { id: string; userId: string; revisionId: string; completedAt: string; localDate: string; timeZone: string; receivedAt: string };
type RoutineSnapshot = { routines: RoutineRevision[]; completions: RoutineCompletion[] };
```

- Patient `GET /?localDate=YYYY-MM-DD` returns RoutineSnapshot: latest revision per slot (including inactive), and this patient's completion events for requested date. Missing date may use UTC current date but both clients explicitly provide a local date.
- Clinician `GET /patients/:patientId?localDate=YYYY-MM-DD` returns same snapshot, only if currently assigned.
- Clinician `PUT /patients/:patientId/:timeOfDay/revisions/:revisionId` body `{expectedRevisionId:string|null,name:string,isActive:boolean,steps:RoutineStep[]}` returns `{routine:RoutineRevision}` (201new,200retry). Expected null means no previous revision. Wrong assignment404, patient role403, stale/conflicting identity409.
- Patient `PUT /completions/:completionId` body `{revisionId,completedAt,localDate,timeZone}` returns `{completion:RoutineCompletion}` (201new,200retry/daily duplicate). Wrong owner404, clinician403. Validate actual date/time, finite timestamp, known IANA timezone and date matches instant in that timezone; allow at most5minutes future clock skew. Reject malformed/oversized fields400, no provider details.
- Clinician `GET /patients/:patientId/completions?page=1&limit=20` returns `{data:Array<RoutineCompletion & {routine:RoutineRevision}>,pagination:{page,limit,total,totalPages}}`, bounded limit1..50, newest receivedAt then ID order. Assignment check on every request.
- Legacy patient definition mutations (`POST /`, `PATCH /:id`, `DELETE /:id`) return403 without writes. Legacy step-completion/reset routes and legacy single-routine read return410 without mutation so old clients cannot reset history or create assignments.

Validation: strict bodies, UUID route IDs, timeOfDay enum; name trimmed1..120, step title trimmed1..120, instructions <=2000, maximum20steps, active revision requires1..20steps, inactive may contain0..20. Completion timestamp/zone/date immutable. Server ignores no arbitrary supplied owner/author/score fields: strict rejection.

## Persistence/security

Add care_routine_revisions and care_routine_completions using the existing local migration workflow; original tables/data remain unchanged. Enable RLS, revoke PUBLIC/anon/authenticated table privileges and grant service_role only, matching current backend-only clinical access. Add indexes for patient/slot/version and patient/history, FK ownership/revision relations and unique constraints. Verify direct anonymous/authenticated Data API denial, role/assignment checks and post-restore protections. No production migration, data inspection or reset.

## Patient client

A main-actor RoutineRepository uses the existing AccountAccess tickets. Its Codable cache/outbox file lives under the existing account-specific Application Support directory, is atomically written with file protection and contains its owning account UUID. No credentials are stored. This avoids changing or overwriting legacy Core Data routines. Write failures are visible and cannot be reported as saved. Persist a stable completion UUID/time/date/timezone before network work; retain across restart and retry after transient failures on a bounded foreground cadence. Guard every await and callback against the originating login generation; cancel and clear published state on account change. Never silently retarget a pending event to a new revision/account. Existing T2 profile-verification boundary remains.

Replace patient authoring/sample routine screens with morning/evening assigned steps, explicit loading/empty/error/retry, last refreshed/cached state, and one Record completion action. Report saved-on-device/pending/recorded/error truthfully. Existing local sample/user-created routines stay on disk but are not shown as assigned. Date changes and foreground activation update today's state without resetting history. Dashboard routine actions use the repository rather than ephemeral completion flags. No invented products, streaks, durations or success/clinical-outcome claims.

## Clinician client

Patient detail includes a routine panel with morning/evening editor, ordered text steps, archive/activate, current version and recent paginated completion history showing the actual completed revision. Existing generation-bound API facade remains. Each save attempt keeps a stable revision UUID and expected revision until resolved. Failures preserve draft/retry intent; conflict requires reload before a new edit. No patient completion editing controls. Render errors, empty/loading and refresh states.

## Acceptance/evidence

Meaningful red/green tests, real local migration and recovery drill, actual signed-in synthetic clinician/patient API checks, iOS file reopen/offline/lost-response/account-switch/day-rollover tests, portal editor/conflict/history tests, browser and Simulator smoke flows, builds/audits/secret scan and independent task/whole-branch review. Preserve original checkout/handoff. Merge authorization applies to completed photo PR4; routine work remains a reviewed development branch until its acceptance gates pass. No production clinical data or deployment is needed to verify this goal.
