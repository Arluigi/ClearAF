# Task 4 report — authorized private thumbnails

Status: DONE (implementation and local verification complete; controller owns rendered CUA verification).

## Implementation

- Added `GET /api/photos/:id/thumbnail`, returning `image/jpeg` with `Cache-Control: private, no-store`. Router authentication remains the existing live Supabase user/session verification. A shared helper reloads the photo and current clinician assignment, then validates `ownedPhotoPath`, before every cache lookup. Unauthorized records return 404; invalid owned paths return 422. Overload returns recoverable 503 plus `Retry-After: 1`.
- Stream-limits input to 10 MiB regardless of Content-Length; rejects redirects and unsupported/malformed input; returns a timeout response after 15 seconds and aborts cancellable download work. The Storage SDK signing call is not cancellable per request; its job slot remains occupied until the underlying operation settles, so stalled signing cannot exceed the two-job cap. Sharp receives a 64-million-pixel limit and strict warning handling, rotates before stripping metadata, resizes inside 400×400 without enlargement, and emits JPEG. Sharp processing also has a 15-second timeout. At most two uncached jobs run; no waiting server queue. Process-local LRU is capped at 16 MiB, with 60-second TTL; expiry is enforced before reuse and stale entries are removed on access. Failed generation is never cached.
- Added validated, opt-in `view=summary` on clinician photo lists. Typed `PhotoSummary` omits `photoUrl` entirely; legacy lists and patient-only detail remain unchanged. Added separately authorized `/photos/:id/original` returning a short-lived original URL on demand.
- Portal summary grid fetches thumbnail blobs through the existing API auth/recovery/logout/account-generation checks. A two-request controller cancels stale work, owns/revokes all blob URLs at refresh/disposal, and exposes loading/error/retry rendering. Session changes synchronously dispose its work. Original URLs are requested only when detail opens (or an open detail is explicitly refreshed); direct original images retain no-referrer and bypass optimization.
- Pinned sharp 0.35.4 and lockfile; raised backend Node floor to >=20.9.0 as briefed. Local validation used Node v24.4.0.

## TDD and verification evidence

All log names below live in `.superpowers/sdd/2026-09-12-t4-mvp-experience/` in this isolated checkout. They contain no credentials or signed URLs.

RED:

1. Backend cwd: `node --import tsx --test tests/photo-thumbnail.test.ts` → missing new `../src/services/photoThumbnail` module, 0 pass/1 file failure (`task-4-backend-red.log`). Tests were written before the new service.
2. Portal cwd: `node --import tsx --test tests/private-thumbnail.test.ts` → missing new `../src/lib/private-thumbnail` module, 0 pass/1 file failure (`task-4-portal-red.log`). Tests were written before the new controller/transport.
3. Route behavior tested against the unchanged base route file, then implementation restored: `node --import tsx --test --test-name-pattern='summary photo view|original endpoint|warm thumbnail' tests/security.test.ts` → summary still contained photoUrl, and both additive endpoints returned 404 instead of 200 (`task-4-routes-red.log`).
4. Self-review regression, portal cwd: `node --import tsx --test tests/private-thumbnail.test.ts` → abort during pending session lookup still invoked fetch (`true !== false`, `task-4-cancel-red.log`). Added abort check after session lookup; verified covering tests below.

GREEN:

- Backend `node --import tsx --test tests/photo-thumbnail.test.ts tests/security.test.ts`: 50/50 passed (`task-4-backend-green.log`, repeated covering run `task-4-backend-covering.log`). Proves HTTP authorization/header behavior and service resource/cache bounds.
- Portal `node --import tsx --test tests/private-thumbnail.test.ts tests/photo-history.test.ts`: **8/8** passed (`task-4-portal-green.log`). Earlier controller message saying 7/7 was a counting typo; the artifact has 8.
- Backend `npm test`: 123/123 passed (`task-4-backend-full.log`).
- Portal `npm test`: 56/56 passed (`task-4-portal-full.log`), before the additional abort-during-session-lookup regression.
- After that small fix, portal `node --import tsx --test tests/private-thumbnail.test.ts tests/photo-history.test.ts tests/auth.test.ts tests/recovery.test.ts tests/session-boundary.test.ts`: 27/27 passed (`task-4-portal-covering.log`). This includes four thumbnail tests and all covering auth/recovery/history tests.
- After making timeout recovery test independent of JPEG encoding speed, backend `node --import tsx --test tests/photo-thumbnail.test.ts`: 7/7 passed (`task-4-thumbnail-final.log`).
- Portal `npm run typecheck`: exit 0.
- Backend `npm run build`: final exit 0 (`task-4-backend-build-final.log`). Initial build caught TS2556 on a fetch spread adapter; explicit input/init fixed it. Original failure preserved in `task-4-backend-build.log`.
- Portal `npm run build`: final exit 0, no ESLint warnings (`task-4-portal-build-final.log`). Initial successful build had an unnecessary useMemo dependency warning, corrected before final build (`task-4-portal-build.log`).
- `npm audit --json`: zero total vulnerabilities in pinned-install preflight, backend and portal (`task-4-install-audit.json`, `task-4-backend-audit.json`, `task-4-portal-audit.json`). Installation used `npm install --save-exact sharp@0.35.4 --package-lock-only --ignore-scripts`, audit, then `npm ci` (`task-4-install.log`).
- `git diff --check`: clean.

The initial missing-module RED runs prove the new modules were absent; route and cancellation regressions also have direct behavioral assertion failures. Full suites ran once; small corrections were followed by covering tests and final builds rather than repeating unrelated suites.

## Live local evidence

Root cwd: `node backend/scripts/photo-thumbnail-live.cjs` → exit 0, artifact `task-4-live.log`:

```text
PASS live summary returns metadata without original URL
PASS live patientOwner thumbnail 300x400 JPEG 981 bytes, EXIF absent, private no-store
PASS live clinicianAssigned thumbnail 300x400 JPEG 981 bytes, EXIF absent, private no-store
PASS live original authorized on demand; foreign patient/clinician and anonymous denied for both endpoints
PASS live warm thumbnail and original deny former clinician and allow newly assigned clinician
PASS live warm cache cannot bypass foreign stored-path rejection
PASS exact fixture cleanup: photo rows, objects, accounts and clinician records removed
```

The committed script refuses non-loopback API/Auth/DB URLs, creates four uniquely named synthetic accounts, uses real authenticated requests against API3001/local Supabase, reassigns only its fixture patient, and cleans only recorded exact IDs and paths. It does not print identities, credentials or signed URLs. Cache-hit reuse/download count, TTL/LRU bytes, timeout, concurrency and malformed/oversized input are proven in focused service/HTTP tests; live checks prove actual Storage bytes and authorization. Fixtures were already cleaned when the controller requested temporary rendered-fixture preservation; none were recreated. Original `.local/routine-ui-fixture.json` remains mode0600 and untouched.

## Build handoff

The final portal artifact is `/Users/aryansachdev/code/ClearAF/.worktrees/t3-photo/web-portal/.next`, BUILD_ID `yQWlAjt1LrFpLgamKlKLK`. Before builds, `/usr/sbin/lsof -nP -iTCP:3003 -sTCP:LISTEN` returned no listener and curl confirmed connection refused. I did not stop a running listener. Per the controller's later instruction, 3003 remains stopped for the controller to start/own; no restart session was created. Backend3001, controller physical DebugAPI3002, Xcode and Simulator were not stopped. CUA is unavailable to this subagent; no alternate browser automation was used.

## Files

- New: `backend/src/services/photoThumbnail.ts`, `backend/tests/photo-thumbnail.test.ts`, `backend/scripts/photo-thumbnail-live.cjs`.
- Modified: `backend/src/routes/photos.ts`, `backend/tests/security.test.ts`, `backend/package.json`, `backend/package-lock.json`.
- New: `web-portal/src/lib/private-thumbnail.ts`, `web-portal/tests/private-thumbnail.test.ts`.
- Modified: `web-portal/src/lib/api.ts`, `web-portal/src/lib/photo-history.ts`, `web-portal/src/types/api.ts`, `web-portal/src/components/patients/PatientPhotoHistory.tsx`.
- This report; logs retained locally in the SDD folder.

## Documentation and self-review

Verified official [sharp constructor](https://sharp.pixelplumbing.com/api-constructor/), [resize](https://sharp.pixelplumbing.com/api-resize/) and [output](https://sharp.pixelplumbing.com/api-output/) documentation, including v0.35.4 release listing, input pixel limit, no-enlargement and metadata removal. Installed package confirms version and Node floor. Verified current [Supabase signing reference](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl) after its old URL returned 404. Downloaded/scanned [Supabase changelog](https://supabase.com/changelog.md); Node20 support deprecation does not affect this Node24 validation, and no Supabase upgrade/config/schema change was made.

Self-review checked the full changed diff, fresh authorization before warm hits, no raw path/URL return in summaries, no expansion of legacy patient-only access, failure slot cleanup, URL retirement, and additive API account guards. Fixed the TypeScript adapter, lint warning and pending-session cancellation issue described above. No persistent derivative, schema/migration, production data/access, policy/clinical content or deployment changes. Remaining work belongs to the controller: independent review and rendered CUA check against the production build.


## Review fix round 1 — base 86b257f

Addressed the Important and Minor findings from `task-4-review.md`.

**Resource-bound fix:** The actual generation promise now owns the active-job slot through its final settlement. The separate 15-second response deadline returns 504 and aborts cancellable download work, but cannot decrement the job count while the SDK signer is still pending. Subsequent uncached requests receive recoverable 503 while both slots are held. Once signing actually settles, the aborted job stops before fetching image bytes and releases capacity. Late work also cannot populate the cache. The deadline now covers the complete generation response; native sharp work remains independently bounded by its processing timeout and retains its slot until settlement. No global fetch mutation, new signer/client, TLS change or path/auth relaxation was introduced.

This explicitly corrects the original report: the SDK signing request itself is **not** aborted. Two indefinitely stalled signers keep the two slots occupied and cause further misses to fail fast until the upstream operations settle; this is the reviewer-approved bounded-capacity alternative.

**Dialog fix:** `photoDetailState` in the existing history module resolves independent summary/original outcomes. A successful original plus a failed summary yields the summary error; a completed summary without the selected record yields an unavailable message. Only pending work displays Loading photo. The dialog consumes that tested state, including matching the selected ID before exposing an original.

RED commands (same Node24 PATH as the original run):

- Backend cwd: `node --import tsx --test tests/photo-thumbnail.test.ts` → new real-loopback signing regression failed: second batch returned status504 instead of expected503 (`task-4-fix1-backend-red.log`). Unlike the old download mock, this opens real HTTP signing requests against a synthetic loopback server and holds its responses pending.
- Portal cwd: `node --import tsx --test tests/photo-history.test.ts` → 5 pass, 1 fail: new detail state resolver was absent (`photoDetailState is not a function`, `task-4-fix1-portal-red.log`). Test exercises successful original with both an independently failed refresh and a replacement page lacking the selected photo.

GREEN commands/results:

- Backend cwd: `node --import tsx --test tests/photo-thumbnail.test.ts tests/security.test.ts` → 51/51 passed, 0 failures (`task-4-fix1-backend-green.log`).
- Portal cwd: `node --import tsx --test tests/private-thumbnail.test.ts tests/photo-history.test.ts` → 10/10 passed, 0 failures (`task-4-fix1-portal-green.log`).
- After replacing the sign-settlement test's timing sleep with explicit upstream settlement plus a microtask drain: backend `node --import tsx --test tests/photo-thumbnail.test.ts` → 8/8 passed (`task-4-fix1-thumbnail-final.log`). The new test asserts two outstanding real HTTP requests after the initial two504 responses; the next two requests return503 without starting more work; maximum outstanding equals2; then both server responses finish, outstanding becomes0, expired jobs fetch zero images, and a new request succeeds.
- Backend `npm run build` → exit0 (`task-4-fix1-backend-build.log`).
- Portal `npm run build` → exit0, no lint warnings (`task-4-fix1-portal-build.log`).
- `git diff --check` → clean. No unrelated full-suite/audit repeats; dependencies are unchanged.

Self-review checked that slot decrement is attached only to actual work settlement, the timeout race does not release that slot, abort is checked before image fetch and cache publication, cache hits still reauthorize, and the dialog's terminal states precede its loading fallback. Test cleanup closes only its loopback server/connections. Root-owned `.local/t4-portal-photos.json`, its thirteen photos and the original private routine fixture were untouched.

Root confirmed listener78989/root session97900 stopped before the build. API3001, physicalAPI3002, Xcode and Simulator were untouched. Portal3003 remains stopped for root's restart/CUA. New production artifact remains `web-portal/.next`, BUILD_ID `Q5W0gs5RLu2_-2N-SU71F`. Independent review and rendered verification remain controller-owned.
