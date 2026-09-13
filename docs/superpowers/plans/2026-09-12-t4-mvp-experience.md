# T4 MVP Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Retain a truthful, accessible and bounded photo/routine MVP and verify it on Simulator, local portal and a physical iPhone.

**Architecture:** Preserve T0–T3 account and data boundaries. Simplify existing views, refine minimal onboarding and bounded list contracts, add authenticated transient thumbnails, then verify realistic histories and accessibility.

**Tech Stack:** SwiftUI/CoreData/ImageIO, Express/Prisma/Supabase, Next.js/React, Node test runner, XCTest.

**Spec:** docs/superpowers/specs/2026-09-12-t4-mvp-experience.md

## Global Constraints

- Work only in the existing isolated worktree; preserve original checkout and private handoff.
- No production patient data, production migration/deployment, invented clinical content, or retention/privacy policy.
- Preserve T0–T3 authorization, account isolation, photo retry and immutable routine history guarantees.
- Patient tabs are Today/Photos/Routines; Profile is separate. Clinicians assign/edit routines; patients record completion.
- Legacy fields/data remain stored. Omitted profile fields must not overwrite them.
- Physical-device acceptance remains pending until actually verified; Simulator evidence is separate.
- Use explicit local Node PATH and DEVELOPER_DIR from local setup documentation. No new plugins.

---

### Task 1: Bounded API lists and minimal onboarding

**Files:** create backend/src/services/pagination.ts and backend/tests/mvp-lists.test.ts; modify backend/src/routes/users.ts, backend/src/routes/photos.ts and backend/tests/security.test.ts.

**Interfaces:** produce `parsePagination(query: Record<string, unknown>, defaultLimit: number): {page:number, limit:number, skip:number}` and `parsePatientSearch(value: unknown): string | undefined`. Throw the existing validation/error form for HTTP 400. Patient PATCH accepts `{name, onboardingCompleted:true}` without skinType; optional legacy skinType remains validated/preserved. Existing response envelopes stay compatible.

- [ ] Add parser tests before implementation, including these cases:
```ts
assert.deepEqual(parsePagination({}, 20), {page:1,limit:20,skip:0});
for (const page of ['0','-1','1.5','1x','10001',['1'], '9007199254740992']) {
  assert.throws(() => parsePagination({page},20));
}
assert.deepEqual(parsePagination({page:'2',limit:'50'},20), {page:2,limit:50,skip:50});
assert.throws(() => parsePagination({limit:'51'},20));
```
Add route-level tests proving name-only completion preserves existing skinType, missing name still rejects completion, invalid pagination rejects before querying, assigned-patient filtering remains, name search uses only an existing column and legacy `/users/patients` returns bounded results.
- [ ] Run focused tests with `node --import tsx --test tests/mvp-lists.test.ts tests/security.test.ts`, capture expected failure.
- [ ] Implement strict decimal parsing with safe integer/range checks; use it in patient/clinician photo lists, `/users/` and `/users/patients`. Use newest date plus ID ordering. Legacy patient list keeps its envelope but removes eager deferred relations and returns real total/pagination. Keep authorization before data access. Remove only the skinType requirement from onboarding superRefine, preserving explicit optional validation.
- [ ] Run focused tests, then `npm test` and `npm run build` in backend. Commit exact changes as `feat(mvp): bound lists and simplify onboarding contract`.

### Task 2: Retained iOS navigation and minimal account flow

**Files:** modify ClearAF/ContentView.swift, ClearAF/Views/DashboardViewEnhanced.swift, ClearAF/Views/ProfileView.swift, ClearAF/Views/OnboardingView.swift, ClearAF/Services/APIService.swift, ClearAF/Services/SupabaseService.swift, ClearAF/Views/DesignSystem.swift, ClearAF/Views/AuthenticationView.swift (registration exposes skin classification); update ClearAFUITests/AccountFlowUITests.swift and relevant ClearAFTests account tests. Locate actual auth view path before editing.

**Interfaces:** consume name-only PATCH. Change `finishOnboarding(name: String)` to omit skinType; keep optional stored legacy values. Preserve ProfileView/OnboardingView entry signatures used by ContentView. Retain `ProgressView` type while visible title becomes Photos, pending Task 5.

- [ ] Add/update UI assertions for exactly Today/Photos/Routines, working Profile sign-out/name save, and name-only onboarding; remove assumptions about five onboarding pages without dropping account transition coverage. Test missing/failed save remains on form and no success state publishes across account change.
```swift
XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 10))
XCTAssertTrue(app.tabBars.buttons["Photos"].exists)
XCTAssertFalse(app.tabBars.buttons["Care"].exists)
XCTAssertFalse(app.tabBars.buttons["Shop"].exists)
```
- [ ] Run focused account tests to establish failing expectations.
- [ ] Reduce TabView to three tabs. Remove dashboard prescription/clinician/no-op cards. Replace profile's reachable content with actual name/email, name editor, sign-out and existing account-removal explanation; remove reachable scores, reminders, export, undefined help/privacy promises. Keep needed shared types or references until proven unused. Onboarding is a short scrollable factual introduction/name form with persistent completion, loading and retry; no clinical guidance/default classification. Use semantic text styles, wrapping, labeled buttons and accessible dismiss controls. Replace fixed-size shared Font aliases in DesignSystem with semantic Dynamic Type equivalents so retained routine/photo views scale as well. Keep brand styling, but make primary action gradient endpoints support white text at 4.5:1; measure endpoint and text contrast in both appearances rather than trusting old comments claiming compliance. Remove the registration skin-type control entirely. Omit skinType from new registration metadata by making the SupabaseService parameter optional/default nil; do not fabricate a value. Update old tab titles in retained capture strings and deprecated onChange closures touched by this task.
- [ ] Run account unit/UI tests and Debug Simulator build with the documented synthetic setup; compile all old view references. Commit as `feat(mvp): focus patient navigation and account setup`.

### Task 3: Focused clinician portal

**Files:** modify web-portal/src/components/layout/Sidebar.tsx, Header.tsx, DashboardLayout.tsx, web-portal/src/app/patients/page.tsx, dashboard/page.tsx, appointments/page.tsx, messages/page.tsx, prescriptions/page.tsx, settings/page.tsx, profile/page.tsx, page.tsx, login/page.tsx; create web-portal/src/app/account/page.tsx, web-portal/src/lib/patient-list.ts and web-portal/tests/patient-list.test.ts; adjust API/types only for retained account/name search contracts.

**Interfaces:** consume bounded `/users/?page=&limit=&search=` with name-only search, preserve PatientPhotoHistory/PatientRoutineCare props. PatientListController owns page/search request sequencing and publishes only the latest active request, with dispose cancellation/guard. Account uses existing current profile and logout/recovery flows.

- [ ] Add delayed-request tests proving search B wins after slow A, failure can retry, disposal suppresses results and page reset happens on search change. Add direct-route/privacy checks for deferred pages redirecting and no fake activity.
```ts
// Start A, then B; resolve B followed by A and assert the visible list remains B.
assert.equal(controller.snapshot().search, 'B');
assert.deepEqual(controller.snapshot().patients.map(p => p.id), ['patient-b']);
```
- [ ] Run `npm test` focused on new tests and capture expected failures.
- [ ] Implement assigned Patients + Account navigation with working mobile menu labels, visible focus and sign-out. Replace the current raw mobile overlay with an accessible modal/dialog that traps focus, closes with Escape or a labeled Close button, restores menu-button focus, and closes after navigation. Remove fake notifications/search/badges and no-op profile buttons. Login copy describes assigned photo/routine review, omits appointment promises, and its password-visibility button has an explicit Show password/Hide password label. The root theme-demo page, dashboard and deferred direct routes use `redirect('/patients')`; settings and legacy profile redirect `/account`. This includes the legacy profile's fabricated professional details/no-op password save and root demo statistics, even though they are unlinked. Patients shows actual name/join date, total and labeled Open action; no scores/streak/derived medical status or unsupported assignment creation. Detail retains photo/routine panels with accessible scroll/dialog/focus behavior. Use controller to prevent stale search/page results. Account displays actual identity and truthful recovery/sign-out actions, no invented clinic policy.
- [ ] Run portal tests, lint and build (stop the verified local portal process before building). Verify real synthetic assigned-patient navigation, search, pagination, detail and keyboard/Escape focus in CUA. Commit as `feat(mvp): focus portal on assigned patient review`.

### Task 4: Authorized private thumbnails

**Files:** create backend/src/services/photoThumbnail.ts and backend/tests/photo-thumbnail.test.ts; modify backend/src/routes/photos.ts, backend/package.json/package-lock.json; modify web-portal/src/lib/api.ts, src/types/api.ts, src/lib/photo-history.ts and components/patients/PatientPhotoHistory.tsx; create web-portal/src/lib/private-thumbnail.ts and web-portal/tests/private-thumbnail.test.ts.

**Interfaces:** produce `GET /api/photos/:id/thumbnail` returning image/jpeg. Authorization permits owner or currently assigned clinician, otherwise 404/403 using existing role conventions. Server consumes ownedPhotoPath and trusted storage signing; portal produces `getPhotoThumbnail(id: string, signal?: AbortSignal): Promise<Blob>` with the same authentication/session guards as JSON requests. Controller owns at most two concurrent requests and object URL lifetime. Preserve legacy list/detail responses: add opt-in `?view=summary` to the clinician photo list, returning a typed `PhotoSummary` that omits `photoUrl` entirely, with a separate portal `getPatientPhotoSummaries` method and compatible history-controller summary type. Validate the new view parameter. Add `GET /api/photos/:id/original` for owner/currently assigned clinician, returning `{photoUrl: signedUrl}` only after the same current authorization/path checks; portal `getPhotoOriginal` uses existing JSON session guards on detail open. Keep existing patient-only `GET /photos/:id` and default list contracts unchanged. Do not represent absent original access with an empty required URL. Include focused tests proving summary lists do not sign URLs and both new endpoints recheck assignment.

- [ ] Test authorization before cache hits, foreign stored paths, malformed/oversized input (including absent/false Content-Length), timeout, queue/concurrency cap, output dimensions/EXIF removal, bounded TTL/bytes and retry after generation failure. Portal tests prove stale-account or disposed requests cannot expose bytes, cancellation unblocks queue, all created URLs are revoked exactly when retired.
```ts
assert.equal(result.info.width <= 400 && result.info.height <= 400, true);
assert.equal(result.info.format, 'jpeg');
assert.equal(response.headers.get('cache-control'), 'private, no-store');
```
- [ ] Run new tests for RED. Check official sharp documentation for current API/version, then install pinned sharp 0.35.4 (the existing portal-resolved version) if the audit is clean; no new plugin. Its installed package requires Node >=20.9.0, so update the backend engine floor accordingly; existing local/CI Node24 already satisfies it.
- [ ] Implement maximum input 10 MiB, pixel cap 64 million, 15-second upstream timeout, two active uncached jobs with fail-fast recoverable overload, LRU byte cap 16 MiB and TTL 60 seconds. Never trust arbitrary stored URLs, never return cache before authorization, stream-limit download. Strip metadata and do not enlarge. Portal uses transient object URLs for grid images, full signed original only on open, two-request limit, stale-work cancellation and retry/failure rendering. Preserve account barriers and referrer policy.
- [ ] Run focused then full backend/portal tests, builds and npm audits; verify an actual synthetic thumbnail request with live local authorization. Commit as `feat(photos): serve bounded private thumbnails`.

### Task 5: Bounded iOS photo display and recoverable capture

**Files:** create ClearAF/Services/PhotoPageStore.swift and PhotoImageLoader.swift, ClearAFTests/PhotoDisplayTests.swift; modify ClearAF/Views/ProgressView.swift, DashboardViewEnhanced.swift, PhotoCaptureManager.swift, ClearAF/Config/SupabaseConfig.swift, ClearAF/Config/Debug-Info.plist, ClearAF/Config/Local.generated.xcconfig.example, ClearAFTests/EnvironmentConfigurationTests.swift and project file as needed; create scripts/device-local.cjs with guarded local startup; add ClearAFUITests photo/permission coverage.

**Interfaces:** PhotoPageStore exposes current page records (24 maximum), total, hasPrevious/hasNext, loading/error and refresh/previous/next; uses active account CoreData context and clears on disposal/account replacement. PhotoImageLoader uses CGImageSourceCreateThumbnailAtIndex with transform and maximum pixel size; bounded decoded-cost cache. Original photo/upload data remains unchanged.

- [ ] Add CoreData tests creating more than two pages, tied timestamps, refresh after deletion/capture, correct count and account replacement. Add image tests using a large generated image to prove output size and bounded cache eviction. Capture tests cover denied/restricted/unavailable/cancel/decoding failure without creating duplicate photos.
```swift
XCTAssertLessThanOrEqual(store.photos.count, 24)
XCTAssertLessThanOrEqual(thumbnail.cgImage!.width, 400)
XCTAssertLessThanOrEqual(thumbnail.cgImage!.height, 400)
```
- [ ] Run focused tests for RED.
- [ ] Replace unbounded FetchRequest and Array conversions with page store, explicit Previous/Next and count. Today fetch limit is one. Downsample thumbnails and screen images without decoding original full resolution; cache with byte/count bounds and clear at account change. Preserve photo notes, stable capture identities and durable retries. Use AVFoundation authorization on camera tap; denied/restricted explanatory state and Settings recovery, unavailable camera explanatory state. Replace broad library UIImagePicker with PHPicker limited selection, async decode/error/cancel handling. Do not request library-wide access. Prevent duplicate picker callbacks/saves through existing PhotoCaptureSession. Ensure controls remain reachable at accessibility sizes.
- [ ] Add Debug-only `CLEARAF_LOCAL_DEVICE_HOST` via Info.plist; empty uses existing loopback, otherwise validate a single Bonjour `.local` hostname with a strict label grammar and use API port 3002/Supabase 54321. Reject arbitrary URLs, ports, public domains and malformed labels. Release ignores it. Add NSLocalNetworkUsageDescription only to Debug. The device-local startup script reads existing loopback-only backend configuration, verifies the host resolves to this Mac, overrides only PORT=3002 and SUPABASE_URL for its child API process, and forwards termination; never writes credentials or changes baseline .env. Unit tests cover allowed/rejected host and Release isolation. Document command/build setting in local setup.
- [ ] Run iOS unit/account/photo/routine tests and Simulator UI checks, Debug and Release builds. Commit as `feat(photos): bound local history and recover capture permissions`.

### Task 6: Integrated experience evidence and final review

**Files:** create docs/mvp/README.md, docs/mvp/verification.json and backend/scripts/mvp-volume-fixture.cjs with backend/tests/mvp-volume-fixture.test.ts and ClearAFUITests/MVPExperienceUITests.swift; update handoff links only in worktree. Use ignored .local artifacts for credentials and exact cleanup manifest.

**Interfaces:** fixture command `create|inspect|cleanup` guards loopback and owns exact IDs. Dataset is 500 assigned synthetic patients and 1000 synthetic photos for one patient; image content is generated, never personal. Reuse routine fixture conventions for resumable cleanup and authenticated credentials without printing secrets.

- [ ] Test unsafe endpoint rejection, exact-ID cleanup, partial cleanup resumption and preservation of unrelated fixtures before implementing fixture script.
- [ ] Create local dataset, record API p50/p95 over 20 warm requests, response and thumbnail bytes, process memory across repeated navigation and EXPLAIN plans for assigned-patient/photo queries. Measure actual iOS page count/cache bounds and process memory across at least 20 page changes; no fabricated extrapolation. Compare targets from spec, fix material regressions through the task fix/review flow.
- [ ] CUA verify retained portal actions, loading/error/empty behavior, keyboard/focus and mobile layout. Run iOS large text/accessibility audit and VoiceOver semantics checks for Today, Photos, Routines, Profile and capture/detail. The installed Xcode SDK exposes `try app.performAccessibilityAudit(for: [.contrast, .dynamicType, .textClipped, .sufficientElementDescription, .hitRegion, .trait])`; run it on retained screens, investigate each finding and preserve result attachments. Do not filter out app defects merely to pass. Use largest accessibility content size and verify scrolling/action reachability in addition to audit. Measure colors for contrast and fix failed retained controls.
- [ ] Add a focused test of the actual PHPicker provider-error/corrupt-byte conversion and verify it reaches the recoverable failure state without saving; Task 5 review identified that its current failure test exercises the terminal gate rather than this conversion path. Preserve cancellation/late-callback coverage.
- [ ] On connected physical iPhone, build/sign synthetic local configuration, verify camera grant/denial/Settings recovery, scoped library selection/cancel, capture/retry/share and account isolation. Request only necessary signing/device actions. Record evidence separately from Simulator. Never install/launch with production configuration for these tests.
- [ ] Run relevant final suites/builds/security regression/live integration and range secret scan. Produce independent whole-branch review using task reports as evidence, resolve findings, exact fixture cleanup and document results/remaining clinical T5 decisions. Commit as `test(mvp): record accessibility device and volume evidence`. Do not claim T4 complete until all acceptance evidence, including physical testing, exists.
