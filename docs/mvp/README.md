# MVP experience verification

T4 is **in progress**. This document separates measured evidence from pending acceptance. T5 pilot/release readiness is a separate phase; clinical guidance, review coverage, retention/removal policy, support ownership and pilot decisions remain unresolved.

## Retained scope and decisions

Patients use Today, Photos and Routines, with Profile opened separately. Registration collects name/email/password; onboarding requires a name and factual photo/routine usage. Omitted legacy fields are preserved. No default classification, clinical plan, scores, streaks, prescription/refill/shop, appointments or messaging is added to the retained flow.

Clinicians use assigned Patients and Account. Root and deferred dashboard/appointment/message/prescription/profile routes redirect to Patients; Settings redirects to Account. Existing authentication/verification/recovery remain. Assignment/provisioning is not a new product workflow.

Photo lists use an opt-in summary projection (`view=summary`) that omits original URLs. The authorized original endpoint loads the original only when opened; both original and transient thumbnail endpoints recheck current owner/assignment and owned storage path. Legacy clients retain their existing representation. No persistent derivative storage or migration was introduced.

The system scoped photo picker exposes only selected content, without requesting broad library access. Broad-library permission denial is therefore not a claimed acceptance check. Sharing means authenticated care-team upload, not a new OS share/export sheet.

Physical Debug uses an explicit validated single Bonjour `.local` hostname, API port 3002 and local Supabase port 54321. Simulator keeps loopback. Release ignores this Debug setting. A separate local device API is required so signed URLs resolve on the phone; no tunnel, public deployment, arbitrary hostname or production fallback is allowed.

## Local synthetic volume fixture

From the worktree with its existing local backend environment:

```sh
node backend/scripts/mvp-volume-fixture.cjs create
node backend/scripts/mvp-volume-fixture.cjs inspect
node backend/scripts/mvp-volume-fixture.cjs cleanup
```

The command rejects non-loopback/modified endpoints. `create` preserves any existing manifest, pre-records exact Auth UUIDs before creation, and generates 500 assigned synthetic patients and 1,000 generated 1600×1200 JPEG photos for one patient. It uses no personal image. Credentials and the exact resumable manifest stay in ignored `.local/mvp-volume-fixture.json` with mode 0600. `cleanup` validates all live identities before deleting exact recorded objects/rows/accounts; confirmed Auth absence permits resumption. Transient errors retain the manifest. Never replace exact cleanup with prefix-wide or global deletes.

`inspect` measures 20 warm requests per paged endpoint, response bytes, a warm 24-thumbnail page with two workers, and PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plans. Raw evidence stays in `.local/mvp-volume-api-evidence.json`. The portal itself displays 12 thumbnails/page; the measurement deliberately requests 24 to match native page capacity.

Native history reads account-scoped CoreData, so the server dataset is not native evidence. The opt-in `MVPVolumeTests.exportSyntheticAccountHistory` test-target writer takes a credential-free JSON file (`run`, `accountID`, 1000 `photoIDs`) via `CLEARAF_MVP_NATIVE_INPUT`. It uses the real `PersistenceController(accountID:directory:)`, exports an isolated `Documents/MVPVolumeExport/<run>/Accounts/<account>/ClearAF.sqlite` store and an exact manifest, closes the coordinator, and records actual bounded page/cache observations. Transfer only with the app stopped, only into the exact synthetic account path, after proving the destination absent. Do not manually edit CoreData SQL or add a production import feature. Cleanup must stop the app and remove only recorded synthetic store/export paths.

## Current measured results

On this Mac, the synthetic server fixture produced 25 patient pages at limit 20 and 42 photo pages at limit 24. Over 20 warm requests, patient p95 was 26.76 ms and photo p95 24.06 ms; a warm 24-thumbnail page took 316.59 ms using two workers. These pass the under-1-second paged API and under-5-second warm thumbnail targets. Full samples, bytes and query plans are preserved locally. The separate native fixture contains 1,000 actual CoreData photos across 42 pages. Forty measured app page changes passed: peak 149,818 kB, final absolute 131,566 kB, with memory falling after iteration 17. Page/cache bounds and all samples are in [native evidence](native-volume-evidence.json).

Physical hardware evidence is separate from Simulator. The hosted app-process connectivity probe passed API HTTP 200 and local Auth HTTP 200. The UI-runner-only probe previously failed with DNS PolicyDenied; that runner policy result did not establish an app networking defect. The subsequent actual physical UI test passed sign-in, camera denial explanation/Settings-button reachability, scoped-picker cancellation and accessibility-size photo controls. Settings subsequently granted camera access and the actual shutter was observed. User manual scoped selection, Retry after the DNS host-case fix, camera capture and sign-out/cold reopen succeeded. Two private JPEG objects were verified: library 3,500,454 bytes at 5712×4284; camera 3,114,970 bytes at 4032×3024. Assigned clinician original/object requests returned 200, foreign patient 404 and anonymous 401 for each. Subsequent focused actual iPhone A→B test passed57.175s: generated A local image/Photos1 was visible, B Today had no A photo/status andPhotos0 both before and after cold launch, followed by sign-out. Simulator switching and API authorization remain separate evidence.

## Completion gates

The machine-readable [verification record](verification.json) records status and artifact paths. Do not claim T4 complete until all required physical, native volume/memory, accessibility, final regression, independent review and exact cleanup gates pass.

The real recovery drill owns port 3002 and temporarily stops source Supabase. Finish browser/hardware work, clean exact fixtures through their manifests, stop the exact dependent API/portal processes and coordinate the drill before running it. Never run it concurrently, bypass its source-identity guard or delete unrelated data. The drill restores source availability in `finally` and preserves failed recovery volumes for diagnosis.

## Portal and final regression evidence

The controller exercised the built portal with the synthetic clinician: 500 patients, 20 rows/page, 25 pages, next-page navigation and exact-name search. The 1,000-photo history rendered 12 authenticated blob thumbnails/page across 84 pages at 400×300. Loading was observed. Temporarily revoking only the exact fixture assignment produced recoverable photo/routine/completion errors without stale photos; exact restoration and each Retry restored normal content. At 390×844, the original-photo dialog had no horizontal overflow; Tab stayed within the dialog, Escape dismissed it and focus returned to the exact originating control. The clinician was signed out and the browser tab closed.

Final backend tests pass 134/134 and the TypeScript/Prisma build passes. Portal tests pass 61/61, with build, lint and typecheck passing. The controller's current local live probes passed accounts (6 groups), routines (12 groups), photo capture, private thumbnails and security (28 groups), with exact cleanup for each probe. The first security run correctly exposed a stale test expecting embedded patient-list originals; the revised assertion checks the approved bounded metadata representation and preserves the existing authorized-gallery download proof. Final iOS unit verification passed 55 Swift Testing tests and the actual provider-error XCTest (one opt-in connectivity diagnostic skipped). The raw accessibility commands remain failed and are detailed in the audit disposition. Whole-branch review, remaining explicit acceptance gaps and review acceptance decisions remain gates.

A user-created photograph of a plain blue wall is the approved physical picker fixture. The user selects that exact prepared synthetic image in the scoped picker and removes that generated Camera image after testing. This avoids extra Photos add-only/read permissions solely for fixture creation/cleanup; the tradeoff is an explicit user fixture step. Device capture is aimed at the same neutral subject. No personal library item is selected automatically.

Audit-driven navigation decision: Previous/Page/Next now share the existing bottom safe-area panel above Capture. A 40-change measurement attempt exposed a moving lazy-grid footer causing a rapid Next tap to open Capture; that failed attempt is preserved and is not counted as completed memory evidence. Stable controls keep capture and paging separately reachable as page contents change and at large text sizes.

## Physical cleanup and limits

The controller removed exactly the two recorded physical server rows and two Storage objects, verified zero targets, and verified all 1,000 unrelated volume photo IDs unchanged. The phone was signed out and its Debug process stopped. A devicectl copy with `--remove-existing-content true` unexpectedly reset the entire Debug data container despite a targeted destination and returned a path error. Post-inventory showed the whole Debug container empty. The pre-inventory contained only the exact routine fixture account store, but this is a Debug-container reset, **not** proof that unrelated preferences were preserved. Do not reuse that cleanup technique. No production bundle was touched. The user confirmed deletion of the blue-wall test image from the Photos library on 2026-09-13.

The remaining raw accessibility findings, measured color evidence, functional reachability and acceptance limitations are tracked in [accessibility disposition](accessibility-disposition.md). No failing audit is relabeled green.

Final controller cleanup verified503 volume/routine plus2 final UI Auth identities removed; server accounts/photos/Storage objects/routine revisions/completions all0. Second stopped Simulator pass removed the one recreated routine directory;12unrelated directories preserved. Private `.local/t4-final-cleanup.json` retains proof. Exact APIs/portal were stopped for coordinated recovery. The recovery rehearsal passed on 2026-09-13 at 05:22:26 UTC in 37 seconds: fresh database/Auth/Storage restore, row digests, password sign-in and all 28 authorization groups passed. The source local stack was restored and post-recovery Auth/photo/object counts were zero. Evidence: `/private/tmp/clearaf-t4-final-recovery.log` and `.local/recovery-verification.json`.

Gitleaks scanned the 23-commit T4 range `aa4b26f..f070f65` (306,386 bytes) with zero leaks; redacted log `/private/tmp/clearaf-t4-secret-scan.log`. Subsequent changes require an updated range scan before completion.

## Focused physical account-isolation fixture

`MVPVolumeTests.exportPhysicalIsolationFixture` takes `CLEARAF_MVP_ISOLATION_INPUT`, a credential-free local JSON file containing UUID `run`, `accountID`, `photoID`. It writes one generated640×480JPEG through the real account persistence API into `Documents/MVPIsolationExport/<run>`, closes the coordinator and writes its exact manifest. The local terminal upload state prevents network upload; this is local-isolation evidence, not additional sharing evidence. With both apps stopped, the controller verifies the phone account destination absent, then copies only the exact exported account directory without replacement/reset flags.

Run the hosted writer with `xcodebuild test-without-building -xctestrun <writer.xctestrun> -only-testing:ClearAFTests/MVPVolumeTests` and the explicit Simulator destination. Do not count zero-selected xctestrun filtering attempts as execution. The physical UI selection is `ClearAFUITests/MVPExperienceUITests/testPhysicalGeneratedHistoryIsolatedAcrossAccountSwitch`; runner environment contains A credentials in `CLEARAF_MVP_UI_EMAIL/PASSWORD` and B credentials in `CLEARAF_MVP_OTHER_EMAIL/PASSWORD`. It checks A Today image/Photos1, signs out, checks B Today absence/Photos0 before and after cold launch, and signs out again.

After physical UI termination, rebuild/run only the hosted `ClearAFTests/MVPVolumeTests` suite with writer environments absent and `CLEARAF_MVP_ISOLATION_CLEANUP` set to a credential-free JSON **string** containing UUID `run` and exactly two `accountIDs`. Cleanup refuses active account/session/persistence state, deletes only those account directories and exact export, verifies unrelated directory names unchanged and writes `Documents/MVPIsolationCleanup.json`. It does not reset the Debug container. Exact Auth fixture cleanup remains controller-owned.

The final isolation cleanup passed on the physical phone with the final compiled source (`/private/tmp/clearaf-t4-device-isolation-cleanup-final.log`): both exact account directories absent, unrelated directory names preserved, no active session and export absent. The two exact Auth accounts were removed, all server Auth accounts returned to zero, and the exact Simulator export was removed. The focused UI proof passed in57.175 seconds.
