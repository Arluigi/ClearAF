# Care support verification — September 13, 2026

Second release of the [approved feature expansion](expansion.md): clinician-owned routine templates, factual completion calendar, patient-controlled local reminders and clinician-configured check-ins. No default clinical questions or inferred scores are supplied. Assigned messaging remains the next release under the active goal.

## Evidence

- Backend: 157 tests passed; TypeScript/Prisma build passed.
- Portal: 77 tests passed; lint, production build and typecheck passed. The final weekday layout refinement passed scoped lint.
- iOS: signed Simulator build and nine focused check-in/reminder tests passed. Calendar refinement also built successfully.
- Real local synthetic API checks: five groups passed, covering template ownership and immutable copy behavior, retries/conflicts, reported-date calendar grouping, form version history/answer validation, assignment changes, and direct Data API denial for all three new tables.
- One independent code review found no critical or important issues in authorization, versioning, retry persistence, account boundaries or reminder cancellation.
- Local portal/Simulator walkthrough: a patient submitted a clinician-defined choice on Simulator and the clinician portal displayed that exact version and answer. Template version 3 saved and copied into an explicitly saved patient routine version 2; older completion events retained version 1. January calendar showed one morning event on its reported local date. Profile reminders opened off without requesting permission. Both clients signed out successfully.
- Exact synthetic identities and all their test rows (including UI-created versions/responses) were removed by the loopback-only cleanup helper. Retained hosted demo was not modified.

## Database and compatibility

Additive migration `20260913222507_care_support.sql` adds immutable template revisions, form revisions and responses. Service-only access with RLS; all application tables are included in the recovery inventory. Local migration passed. Hosted migration applied under the same canonical version; all three tables have RLS enabled and no PUBLIC/anon/authenticated grants. Existing clients do not depend on these new endpoints and remain compatible.

## Limits

No new physical-camera, notification delivery timer, APNs or distribution tests were performed. Reminder scheduler behavior was exercised with an injected adapter; actual operating-system notification delivery is not claimed. This scoped walkthrough did not repeat a full VoiceOver/large-text matrix. The physical demo phone has not yet received these new iOS features. Check-ins and completion counts are patient reports, not outcome measures. Clinical response-time, retention and account-deletion policies remain separate product decisions.

## Deployed release

PR [#11](https://github.com/Arluigi/ClearAF/pull/11) merged as `aae5a8c7e16bf56ef0d344c2ebc81a725a381158` after both push/PR backend, portal, secret and database-recovery CI jobs passed. API source `0e61fed9721eaef3866ed87f4b7fe0baecf4ac30` was uploaded from a clean Git archive and promoted: `dpl_F5Mz1b1kMgzQmuiF3Y2Ho2zPJ82U`, immutable URL `https://clearaf-8n83jx2pf-arluigis-projects.vercel.app`. Portal `dpl_qWFMUEbjJT5n2o31TJmpEFjG2MVd` is READY from merge source `aae5a8c7e16bf56ef0d344c2ebc81a725a381158`, immutable URL `https://clearaf-portal-c17gq3kif-arluigis-projects.vercel.app`. API alias health and readiness returned 200 after promotion. Prior compatible API rollback target is the photo-review deployment `dpl_2mWhXKuvdsXV5YCcKqbEBN3mSRJi`; additive tables remain intact on code rollback.
