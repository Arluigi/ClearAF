# Enrollment and safety verification — September 15, 2026

First release of the [client expansion](client-expansion.md): [enrollment and safety](../superpowers/specs/2026-09-15-enrollment-and-safety.md). Patients screen for state licensing, age and pregnancy status; a versioned DRAFT consent gates clinical use; clinicians can refer a patient out or to in-person care with a refund status; patients and clinicians can raise and track urgent reports, always with a fixed 911 emergency notice ahead of the form.

## Scope

- Backend: `eligibilityScreening`, `consentAcceptance`, `careDecision` and `urgentReport` Prisma models and RLS-protected tables (migration `20260915185139_enrollment_and_safety`); `GET/PUT /api/enrollment` and consent routes; `GET/PUT /api/care-decisions/...`; `GET/PUT/POST /api/urgent-reports/...`; an `enrollmentGate` middleware (`ENROLLMENT_ENFORCEMENT`) applied to patient clinical writes, including the pre-existing `photos`, `appointments` and `users/skin-score` routes; a startup check that validates `LICENSED_STATES`/`MINIMUM_PATIENT_AGE` and logs the effective enforcement mode.
- Portal: enrollment status pills (state, pregnancy flag, consent version/date) on the patient workspace; an urgent-reports section above the photo review queue on the patients list, and a full urgent list with acknowledge/resolve on the workspace; a care-status card with a refer-out/needs-in-person/resume-online-care decision dialog and a per-decision "Mark refund issued" action.
- iOS: screener → not-eligible/waitlist or consent → onboarding → Today; a persistent "Something's wrong?" urgent-report entry in every signed-in phase (screener, not-eligible, consent, onboarding, Today), never only in a toolbar; a care-status card on Today reflecting the clinician's decision.
- Fixtures/scripts: `enrollment-safety-live.cjs` probe; enrollment/care-decision/urgent-report cleanup added to `routine-ui-fixture.cjs`, `mvp-volume-fixture.cjs` and `security-live.cjs`; `recovery-drill.cjs`'s `applicationTables`.

## Evidence

| Area | Result |
|---|---|
| Backend unit tests | 205/205 pass (`cd backend && npm test`) — includes the `5ad0b32` photo/care-decision conflict test |
| Backend build | `tsc` clean, 0 errors |
| Backend `npm audit --audit-level=low` | 0 vulnerabilities |
| Portal unit tests | 102/102 pass (`cd web-portal && npm test`) — includes the `cf25f58` urgent-errors tests |
| Portal lint | 0 warnings/errors (`eslint src`) |
| Portal typecheck | `tsc --noEmit` clean |
| Portal build | `next build` clean, 18 routes |
| Portal `npm audit --audit-level=low` | 0 vulnerabilities |
| iOS unit tests (full run after `d7043dd`) | 106 run, 105 pass, 1 skipped (`MVPConnectivityTests`, needs a physical-device host, environment-only), 0 failed |
| iOS Debug build (signed, after `d7043dd`) | Clean, 0 warnings |
| iOS UI test (`AccountFlowUITests`) | Last passed at `d941c96` (fix wave B); not rerun after `d7043dd` (iOS unit-level fix, no UI-affecting change) or the portal fix (portal-only) |
| Live probe (`enrollment-safety-live.cjs`) | 11 PASS checks (8 original + 3 anonymous-401 checks added in the fix wave), `{"passed":true,"cleanup":true}` |
| Recovery drill (`node scripts/recovery.cjs`) | Passed at `4ae3d51` (code state `3f99c69`); not rerun since — see "Final checks" below |
| Source hygiene / diff-check / audits | See "Final checks" below |

Backend counts are from a run against `5ad0b32` (the last backend-affecting commit). Portal counts are from a run against `cf25f58` (`fix(portal): keep urgent errors until the attempted change is confirmed`, the final code commit on this branch). iOS unit-test and Debug-build counts are from the run after `d7043dd` (the last iOS commit); the iOS UI test was not rerun after that commit — see the UI test row above.

### Final checks

- Recovery drill (`node scripts/recovery.cjs`): `{"passed":true}`, ~41s, 28 live checks after restore, at commit `4ae3d51` (code state `3f99c69`). Pre-drill `auth.users` count: 0.
- Not rerun since: `5ad0b32` (backend photo-delete/care-decision conflict), `d7043dd` (iOS-only) and `cf25f58` (portal fix) came after the drill and don't touch anything it exercises — it backs up/restores synthetic application rows, auth users/identities and private storage bytes, and does not call the API's photo-delete route, run any iOS code, or drive the portal UI.
- Backend `npm audit --audit-level=low`: 0 vulnerabilities (rerun after `cf25f58`).
- Portal `npm audit --audit-level=low`: 0 vulnerabilities (rerun after `cf25f58`).
- `node scripts/source-hygiene.cjs`: passed (rerun after `cf25f58`).
- `git diff --check 57455388..HEAD`: clean (rerun after `cf25f58`).

### Portal walkthrough (`task-9-portal-walkthrough.md`), 11/11 items PASS

Against a disposable clinician/patient pair (`@example.invalid`, cleaned up afterward): urgent reports section above the photo review queue with a destructive badge, warning icon and open count; enrollment status pills including consent version and acceptance date; refer-out/needs-in-person dialog updates the care-status card in place and offers "Mark refund issued" on the current decision and on any history row with a pending refund; acknowledging then resolving an urgent report with a note updates the workspace list and the patients-page open count; dark mode and 390px width readable with no overflow; no console errors or React warnings (one 422 traced to the fixture's synthetic 1x1 JPEG being rejected by `sharp`, not a product defect); "Resume online care" hides the message field and never implies a notification; urgent list pages past 20 reports and a stale row (resolved via the API mid-session) refreshes to its true state on the next action instead of showing stale "Open"; login inputs carry `autoComplete` hints.

### iOS walkthrough (`task-9-ios-walkthrough.md`), 7/7 steps PASS

Signup and Mailpit confirmation; not-eligible screen (state reason, "You have not been charged.", waitlist recorded once) with a working urgent entry; updating answers to an eligible state through consent, onboarding and Today; an urgent report correctly shows `NO_ASSIGNED_CLINICIAN` guidance and keeps the draft before a clinician is assigned, then sends after assignment; the clinician's refer-out decision and acknowledgment appear on Today after a foreground refresh ("Refund: being processed", "Seen by your care team"); light/dark mode and Accessibility XXXL Dynamic Type, with the emergency notice never truncated. Three layout bugs found during the walkthrough (urgent entry rendering icon-only and untinted in iOS 26+ toolbars; a clipped screener intro line; a squeezed care-card byline at XXXL) were fixed in the following commit (`d941c96`) and reverified.

### Reviews

- Per-task spec/quality review for each of Tasks 1–8, each with a scoped re-review after its fix round (Task 3: 1 round; Task 4: 1 round; Task 6: 2 rounds; Task 7: 1 round; Task 8: 1 round) — all findings addressed with no new breakage.
- `care-access-reviewer` run on Tasks 2, 3, 4, 5, 6 (2 re-review rounds) and 8, in addition to the whole-branch pass below. Findings and rulings (all fixed before the next task built on the code, or in the final fix wave): a 404-vs-409 convention for cross-patient decision/report ids; gating the legacy `PATCH /photos/:id` while leaving `DELETE` ungated with a pinning test; isolating per-step failures and revalidating identities before deletes in `enrollment-safety-live.cjs`; making a persistent urgent-report entry reachable from every signed-in iOS phase, not only `.ready`, with its draft preserved across a phase change.
- `api-contract-checker` run once both clients existed (Task 8, whole branch vs `main`): contract consistent, no field/enum/envelope/nullability drift; flagged the enforcement-default and iOS-requires-`/api/enrollment` operational risks that drove the Rollout order below.
- A whole-branch review (range `57455388`, the merge-base with `main`, through the pre-fix-wave tip) ruled "ready to merge with fixes" — no Critical findings; four Important findings (refund action stranded on history rows, the async-care message field shown when it shouldn't be, three ungated legacy patient-write routes, and the rollout order omitting the portal's auto-deploy from `main`) were fixed in one combined fix wave together with both walkthroughs' bugs and the deferred minors the reviewer chose to fix now.
- Fix wave A (backend/scripts/portal) and fix wave B (iOS) each got a scoped re-review; all items were confirmed addressed with no new breakage.
- The final pre-PR code review (`/code-review` against the whole branch) found three issues, each fixed and confirmed with no new breakage: photos still deletable while referenced by a care decision, fixed in `5ad0b32` (see Limits, below); an ambiguous urgent-report confirmation and a missing urgent entry point, fixed in `d7043dd` (see "iOS fixes after the whole-branch review" below); and the urgent-errors row-clearing bug, fixed in `cf25f58` (see "Portal urgent-report error handling" below). This was the last gate before the branch was offered for merge.

### Portal urgent-report error handling (`cf25f58`)

`clearStaleErrors` previously cleared a row's "Not saved" warning whenever the refetched report was resolved, regardless of which attempt had failed. That hid a real failure: if clinician A resolves a report with no note, and in an older tab clinician B types a resolution note and clicks Confirm resolve, the server returns 409 `REPORT_RESOLVED` (the notes differ) so B's note is never saved — but the refetch showed "Resolved" with no note and no warning, so B believed the note reached the patient. `clearStaleErrors` now takes the failed attempt (acknowledge, or resolve with its normalized note) per row and only clears the error once the refetched row shows that exact attempt took effect (acknowledged/resolved for acknowledge; resolved with a matching `resolutionNote` for resolve). Covered by new cases in `web-portal/tests/urgent-reports.test.ts`.

### iOS fixes after the whole-branch review (`d7043dd`)

An account-changed error from the urgent report confirmation (mismatched report id or patient id) is ambiguous, not a refusal — the server may already have stored the report. It is now treated like a decoding failure and the attempt is kept frozen so a retry reuses the same report id instead of risking a duplicate; a genuine account change is still handled safely by the existing `cancel()` path. The always-available "Something's wrong?" urgent-report entry point is now also shown during the "Opening your account…" enrollment sub-state, the one signed-in phase it was previously missing from.

## Decisions and defaults

See [client-expansion.md](client-expansion.md) for the full decisions/defaults table and open questions. Relevant to this release: `LICENSED_STATES` demo default `CA,FL,IL,NY,TX`; minimum age default 18, configurable 13–120; pregnant/breastfeeding is not eligible, trying-to-conceive is eligible and flagged; consent text is a DRAFT placeholder pending client/legal copy; no payment processing exists, so a refund is a status the clinician sets (pending → issued), not a transaction; urgent reports have no coverage-hours policy and no push/SMS alert.

## Limits

- No payment processing. A refund is a clinician-set status only.
- Consent text is a DRAFT placeholder, versioned and hashed in code, pending real legal/clinical copy from the client.
- Demo licensed-state list: `CA, FL, IL, NY, TX` (`LICENSED_STATES`), configurable per environment.
- Minimum patient age defaults to 18 and is configurable from 13 to 120 (`MINIMUM_PATIENT_AGE`); the API now refuses to start if either value is invalid.
- No notifications or push. Patients see decisions and urgent-report status only when they open the app; clinicians see the queue only when they open the portal.
- Acknowledging an already-resolved urgent report returns 200 unchanged (idempotent, not an error) — a client racing another clinician's resolve sees the true current state rather than a conflict.
- A photo referenced by a clinician's care decision cannot be deleted (`DELETE /photos/:id` now returns 409 `PHOTO_IN_CARE_DECISION`, `5ad0b32`), mirroring the existing review-lock (`PHOTO_REVIEWED`), so a care decision never ends up pointing at a deleted photo. Neither client calls photo delete, so this needed no iOS or portal change (confirmed in the final code review).
- iOS tests use protocol doubles (fake repositories/services), not raw-JSON decode fixtures, so they do not independently catch a JSON shape drift the way a fixture-based decode test would; the API contract check covers that gap by diffing DTOs against both clients' models directly.

## Rollout

0. Merge to `main` only after steps 1–2 are live. The portal auto-deploys from `main`; merging first shows "Urgent reports unavailable" and failing enrollment/care/urgent sections in the portal until the API ships. If a merge-before-deploy window is unavoidable, record the accepted window here.
1. Apply the hosted migration `20260915185139_enrollment_and_safety` (owner approval required).
2. Deploy the API with `ENROLLMENT_ENFORCEMENT=off`. Before deploying, confirm production `LICENSED_STATES` and `MINIMUM_PATIENT_AGE` are unset or valid — the API now refuses to start on invalid values. After deploying, check `/health`, `/ready`, the startup log line `enrollment enforcement: off`, and that `GET /api/enrollment` returns 401 without a token.
3. Install the new iOS build. It calls `GET /api/enrollment` at every sign-in and screens even with server enforcement off, so it must never be installed before step 2.
4. Only then set `ENROLLMENT_ENFORCEMENT=on` and redeploy. Older installed builds will then get 403 `ENROLLMENT_REQUIRED` on clinical writes (`POST /appointments`, `PATCH /appointments/:id`, `POST /users/skin-score`, plus the new enrollment-gated routes).

## Follow-ups for the owner

- `PATCH /appointments/:id` has no role check. This is pre-existing and unrelated to this release's gating change; retiring or fixing legacy appointment routes is a separate API decision.
- Client questions carried into [client-expansion.md](client-expansion.md): whether a clinician changing "refer out" to "needs in-person" (or back) owes one refund or two (the app currently creates a separate pending refund per decision), and confirmation of the licensed-state list (the demo default includes TX).

## Deployed — September 15, 2026

Release 1 is live. [PR #15](https://github.com/Arluigi/ClearAF/pull/15) squash-merged to `main` as `f8bd522` (branch tip `f12f6a5`).

- **Migration**: `20260915185139_enrollment_and_safety.sql`, SHA-256 `c399e3cf6cb2beb9bbf64f61293ae45e4535d2cf1456dea32ffba610f9d2db64`, applied with Supabase CLI 2.117.0 `db push --linked`. Dry run listed only this file; the ledger version equals the repository filename. Verified afterwards: RLS enabled on all four tables, zero `anon`/`authenticated` grants, and the public anon key denied (401, `42501`) on each table from outside.
- **API**: `dpl_41eh1VXiQANVgtV4tQkPX4awXFa4`, immutable `https://clearaf-6p7k7gnhd-arluigis-projects.vercel.app`, alias https://clearaf-api.vercel.app. `ENROLLMENT_ENFORCEMENT=off` set in production before deploying; startup log line `enrollment enforcement: off` confirmed.
- **Portal**: `clearaf-portal-kheh58g1h-arluigis-projects.vercel.app`, Ready, built from `main` after the merge.
- **Rollback target** (production before this release): `https://clearaf-2tg6jpwcx-arluigis-projects.vercel.app`. The migration is additive only, so that build runs unchanged against the new schema.
- **Checks**: `/health` 200, `/ready` 200 and `GET /api/enrollment` 401 across four consecutive rounds after the final promotion; the owner signed in to the hosted portal successfully.

### Two incidents during rollout

1. **Database password reset invalidated the stored connection strings.** The owner reset the Supabase database password while retrieving it for the migration. `DATABASE_URL` and `DIRECT_URL` in Vercel still held the old password, so the API threw on every database query: `/ready` returned 503 and authenticated requests returned 500 `Authentication error` (middleware/auth.ts catch-all). This affected **every** deployment, including the untouched prior production build, which is what identified it as environmental rather than a regression. Fixed by setting `DATABASE_URL` to the transaction pooler (`:6543`, `pgbouncer=true&connection_limit=1`) and `DIRECT_URL` to the session pooler (`:5432`) with the new password, then redeploying. **After any Supabase password reset, update both variables in Vercel and redeploy; existing deployments do not pick up new values on their own.**
2. **Merging replaced the API with a repo-root build.** The `clearaf-api` Vercel project still had the GitHub integration enabled with Root Directory `.`, so merging PR #15 triggered a 4-second deployment of the repository root over the working API; every route returned 404 for roughly two minutes. Restored with `vercel promote` back to `dpl_41eh1VXiQANVgtV4tQkPX4awXFa4`, then the Git connection was disconnected (`vercel git disconnect`). The API is CLI-deployed from `backend/` per the baseline runbook; only the portal is Git-connected.

### Still outstanding

`ENROLLMENT_ENFORCEMENT` stays `off` until the new iOS build is installed on the owner's phone (rollout steps 3–4 above). Only then set it to `on` and redeploy.
