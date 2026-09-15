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
| Backend unit tests | 204/204 pass (`cd backend && npm test`) |
| Backend build | `tsc` clean, 0 errors |
| Backend `npm audit --audit-level=low` | 0 vulnerabilities |
| Portal unit tests | 98/98 pass (`cd web-portal && npm test`) |
| Portal lint | 0 warnings/errors (`eslint src`) |
| Portal typecheck | `tsc --noEmit` clean |
| Portal build | `next build` clean, 18 routes |
| Portal `npm audit --audit-level=low` | 0 vulnerabilities |
| iOS unit tests (fix wave B, full run) | 105 run, 104 pass, 1 skipped (`MVPConnectivityTests`, needs a physical-device host, pre-existing), 0 failed |
| iOS UI test (`AccountFlowUITests`) | Passed |
| Live probe (`enrollment-safety-live.cjs`) | 11 PASS checks (8 original + 3 anonymous-401 checks added in the fix wave), `{"passed":true,"cleanup":true}` |
| Recovery drill | See "Final checks" below |

Backend and portal counts above are from this task's own run against the final commit (`3f99c69`). iOS counts are from the fix-wave-B report (`d941c96`); iOS suites were not rerun in this task per the Step 5 checklist, which covers backend and web-portal only.

### Portal walkthrough (`task-9-portal-walkthrough.md`), 11/11 items PASS

Against a disposable clinician/patient pair (`@example.invalid`, cleaned up afterward): urgent reports section above the photo review queue with a destructive badge, warning icon and open count; enrollment status pills including consent version and acceptance date; refer-out/needs-in-person dialog updates the care-status card in place and offers "Mark refund issued" on the current decision and on any history row with a pending refund; acknowledging then resolving an urgent report with a note updates the workspace list and the patients-page open count; dark mode and 390px width readable with no overflow; no console errors or React warnings (one 422 traced to the fixture's synthetic 1x1 JPEG being rejected by `sharp`, not a product defect); "Resume online care" hides the message field and never implies a notification; urgent list pages past 20 reports and a stale row (resolved via the API mid-session) refreshes to its true state on the next action instead of showing stale "Open"; login inputs carry `autoComplete` hints.

### iOS walkthrough (`task-9-ios-walkthrough.md`), 7/7 steps PASS

Signup and Mailpit confirmation; not-eligible screen (state reason, "You have not been charged.", waitlist recorded once) with a working urgent entry; updating answers to an eligible state through consent, onboarding and Today; an urgent report correctly shows `NO_ASSIGNED_CLINICIAN` guidance and keeps the draft before a clinician is assigned, then sends after assignment; the clinician's refer-out decision and acknowledgment appear on Today after a foreground refresh ("Refund: being processed", "Seen by your care team"); light/dark mode and Accessibility XXXL Dynamic Type, with the emergency notice never truncated. Three layout bugs found during the walkthrough (urgent entry rendering icon-only and untinted in iOS 26+ toolbars; a clipped screener intro line; a squeezed care-card byline at XXXL) were fixed in the following commit (`d941c96`) and reverified.

### Reviews

- Per-task spec/quality review for each of Tasks 1–8, each with a scoped re-review after its fix round (Task 3: 1 round; Task 4: 1 round; Task 6: 2 rounds; Task 7: 1 round; Task 8: 1 round) — all findings addressed with no new breakage.
- `care-access-reviewer` run on Tasks 2, 3, 4, 5, 6 (2 re-review rounds) and 8, in addition to the whole-branch pass below. Findings and rulings (all fixed before the next task built on the code, or in the final fix wave): a 404-vs-409 convention for cross-patient decision/report ids; gating the legacy `PATCH /photos/:id` while leaving `DELETE` ungated with a pinning test; isolating per-step failures and revalidating identities before deletes in `enrollment-safety-live.cjs`; making a persistent urgent-report entry reachable from every signed-in iOS phase, not only `.ready`, with its draft preserved across a phase change.
- `api-contract-checker` run once both clients existed (Task 8, whole branch vs `main`): contract consistent, no field/enum/envelope/nullability drift; flagged the enforcement-default and iOS-requires-`/api/enrollment` operational risks that drove the Rollout order below.
- A whole-branch review (range `57455388`, the merge-base with `main`, through the pre-fix-wave tip) ruled "ready to merge with fixes" — no Critical findings; four Important findings (refund action stranded on history rows, the async-care message field shown when it shouldn't be, three ungated legacy patient-write routes, and the rollout order omitting the portal's auto-deploy from `main`) were fixed in one combined fix wave together with both walkthroughs' bugs and the deferred minors the reviewer chose to fix now.
- Fix wave A (backend/scripts/portal) and fix wave B (iOS) each got a scoped re-review; all items were confirmed addressed with no new breakage. A final care-access review and API contract check against the whole branch, and `/code-review`, are the last gate before this branch is offered for merge.

## Decisions and defaults

See [client-expansion.md](client-expansion.md) for the full decisions/defaults table and open questions. Relevant to this release: `LICENSED_STATES` demo default `CA,FL,IL,NY,TX`; minimum age default 18, configurable 13–120; pregnant/breastfeeding is not eligible, trying-to-conceive is eligible and flagged; consent text is a DRAFT placeholder pending client/legal copy; no payment processing exists, so a refund is a status the clinician sets (pending → issued), not a transaction; urgent reports have no coverage-hours policy and no push/SMS alert.

## Limits

- No payment processing. A refund is a clinician-set status only.
- Consent text is a DRAFT placeholder, versioned and hashed in code, pending real legal/clinical copy from the client.
- Demo licensed-state list: `CA, FL, IL, NY, TX` (`LICENSED_STATES`), configurable per environment.
- Minimum patient age defaults to 18 and is configurable from 13 to 120 (`MINIMUM_PATIENT_AGE`); the API now refuses to start if either value is invalid.
- No notifications or push. Patients see decisions and urgent-report status only when they open the app; clinicians see the queue only when they open the portal.
- Acknowledging an already-resolved urgent report returns 200 unchanged (idempotent, not an error) — a client racing another clinician's resolve sees the true current state rather than a conflict.
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
