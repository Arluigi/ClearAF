# T2 — Account reliability

September 11, 2026. Branch: `codex/account-reliability`, based on T1 (`ead5ef3`, PR #2). This phase changes local account handling, onboarding, recovery and clinician access. It does not ship a clinical account-deletion policy or deploy to production.

## What changed

- Patients must confirm their email before signing in. Onboarding saves the entered name, skin type and completion to the backend and survives a cold launch.
- Each authenticated iOS account has a separate Core Data store and preferences. Signed-out state uses an empty memory store. Existing unowned legacy data is left untouched and is never assigned to a new login.
- Old requests, responses and upload continuations cannot proceed under another account. Logout takes effect locally even without a network connection and stays effective after restarting.
- Password recovery has a dedicated screen and returns to ordinary sign-in. Portal recovery uses an isolated PKCE client, including a separate cross-tab channel; cancelled or late exchanges cannot replace a newer session.
- The portal requires a backend-verified clinician account. Patients cannot grant themselves clinician access. Network failure during profile verification offers retry without displaying clinical content.
- Account removal explicitly reports that it is unavailable. No clinical records are deleted; retention and removal remain a release decision for the clinical lead.

## Verification

Final results and review disposition are recorded in `verification.json`. Meaningful checks include:

| Area | Evidence |
| --- | --- |
| iOS unit tests | Separate stores for all entity types, cold reopening, preferences, generation-bound requests, secure storage and shared Core Data model lookup |
| iPhone Simulator UI | Confirmed signup → onboarding → cold restoration; offline failure/sign-out/restart; A → B → A; emailed reset callback → new password → fresh sign-in |
| Backend | 62 tests and TypeScript build |
| Portal | 23 tests, typecheck, production build; lint has zero errors and 45 existing warnings |
| Real local Supabase | Six account-flow groups: confirmation, profile creation, onboarding, revocation, recovery and unsupported deletion |
| Recovery drill | Fresh database/auth/storage restore and 27 authorization checks after restore; 36 seconds |
| Browser | Synthetic clinician login/restoration/logout; patient denied with clear message; real local PKCE reset callback and cancellation |
| Dependencies | Backend and portal npm audits report zero vulnerabilities |

Tests use local synthetic identities and captured local email, never production patient records. Simulator test users are cleaned up after verification. The UI tests require the local stack and API; the CI workflow runs backend, portal, source hygiene and the real local recovery drill. Simulator results are local evidence, not a claim that GitHub runs iOS tests.

## Reproduce and continue

See the [new-laptop handoff](../handoff/README.md) for installation, authentication, test commands, private-file preservation and deployment instructions. The [implementation plan](../superpowers/plans/2026-09-10-account-reliability.md) defines the acceptance boundary. The [baseline procedure](../baseline/README.md) describes database recovery.

Before release, verify hosted email confirmation and redirect allowlists for `clearaf://auth` and `https://clearaf-portal.vercel.app/reset-password`, deploy the reviewed API/portal changes, and exercise an authorized hosted test account. Local success does not establish hosted configuration or App Store readiness. Physical-device signing and distribution remain separate checks.
