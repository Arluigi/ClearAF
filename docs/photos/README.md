# T3 photo foundation

The first T3 photo slice is implemented and locally verified through `eb471ce`. This is not completion of all T3 or release approval. See [verification results](verification.json).

Backend 77 tests, portal 28 tests and iOS 28 unit tests passed, along with three Simulator UI flows, the live capture/access checks, portal browser checks, Debug/Release Simulator builds and portal/backend builds. Independent review found no unresolved blockers after the retained appointment capture fix. Both dependency audits reported zero vulnerabilities; portal lint has zero errors and 43 existing warnings.

The first T3 slice follows the [design](../superpowers/specs/2026-09-12-photo-foundation-design.md) and [plan](../superpowers/plans/2026-09-12-photo-foundation.md): durable account-bound capture, retry-safe sharing and assigned-clinician photo review. The MVP defers messaging, prescribing, appointment management and commerce. Later routines are clinician-assigned/edited and patient-completed, as selected by the product owner.

Local tests use synthetic images and identities only. Hosted API currently records T1 while portal records T2 main; this slice is not deployed. Signed image URLs remain bearer URLs for up to 300 seconds after issuance. Foreground upload recovery is not a promise of background execution while iOS suspends the app.

Clinical photo/account retention and removal policy remains pending. This slice must not silently delete server records or claim that a local-only delete removes a shared photo.

## Local verification

Use the baseline setup and synthetic fixtures only. From `backend`, run `npm test`, `npm run build`, `npm audit --audit-level=low`, then `PHOTO_CAPTURE_API_URL=http://127.0.0.1:3002/api node scripts/photo-capture-live.cjs` against the isolated worktree API. The live probe rejects non-loopback API/Auth/DB destinations and removes only its own recorded identities and object paths. From `web-portal`, run `npm test`, `npm run lint`, `npm run build`, `npm run typecheck`, and `npm audit --audit-level=low`. Stop the same portal's development server before building to avoid generated `.next` conflicts.

The portal browser check used 14 labeled synthetic JPEGs under a test patient assigned to a synthetic clinician. It verified both pages, a complete uncropped image, retained date/notes, renewed private image access, and error recovery after one exact fixture object was temporarily removed and restored. Those browser fixture accounts, rows and objects were then removed by recorded identity. The controller tests separately exercise stale-response and unmount cancellation behavior.

## Remaining T3 work

The next slice is routine assignment and completion: clinicians author and edit a patient's routine; patients record completion. Permissions must be enforced by the backend, not only hidden UI controls. Clinical content and treatment choices must come from the clinician, not invented defaults. Define a bounded implementation goal with acceptance checks for authorization, persistence, retries and truthful state before implementing that slice.

Clinical retention/account removal decisions remain open. T4 simplification should remove deferred feature entry points and fabricated dashboard values; their continued presence elsewhere is not evidence that those features are ready for the MVP. Physical-device camera behavior and distribution signing remain later release checks.

## Capture behavior

A capture saves its image bytes, original ID/time and account ownership before requesting upload access. Retries use that same identity, including after a lost upload/completion response. Existing local photos remain on-device until explicitly shared. The current Core Data model adds optional synchronization fields while preserving the original model for migration.

The patient sees whether a photo is on-device, pending, shared or needs retry. Sharing means the server accepted the photo; it does not mean a clinician reviewed it. A picker opened by an old login cannot save into a new account's store. Already saved work can resume when that account is verified and the app is active again.

The standard Debug API remains `http://127.0.0.1:3001/api`. The isolated photo integration run temporarily compiled the same Debug app against the worktree API at port3002, then restored the literal and reran the unit suite before committing. No release endpoint or runtime production fallback was changed. To repeat without a temporary override, run this branch's backend on the standard local port3001.
