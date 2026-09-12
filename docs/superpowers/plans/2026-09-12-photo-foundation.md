# T3 Photo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make synthetic patient photo capture durable and exactly-once by capture identity, with truthful status and usable assigned-clinician photo review.

**Architecture:** Existing account-scoped Core Data stores own image bytes and durable state. Deterministic server capture routes reuse private Storage; an account-generation-bound foreground worker retries safely. The portal paginates and opens full photos without relying on score timelines.

**Tech Stack:** SwiftUI/Core Data/Swift Testing, Express/Prisma/Supabase, Next.js/React/Node tests; existing pinned toolchains.

**Spec:** docs/superpowers/specs/2026-09-12-photo-foundation-design.md

## Global Constraints

- No production patient data or production deployments. Only local synthetic fixtures.
- Preserve existing account generation/session boundaries, private Storage and 300-second bearer URL lifetime.
- Capture JPEG size 1..10MB; persist original capture ID/date before network work.
- Do not upload legacy rows automatically, persist signed URLs/tokens, add invented scores or implement clinical deletion rules.
- No new dependencies unless existing tools cannot satisfy the design.
- User delegated implementation choices and asked for autonomous progress; accepted scope is recorded in the spec. No repeat design/worktree permission gate.

### Task 1: Idempotent server capture contract

**Files:** backend/src/routes/photos.ts; new backend/src/services/photoCapture.ts if useful; backend/tests/security.test.ts and/or new backend/tests/photo-capture.test.ts; backend/scripts/photo-capture-live.cjs.

**Produces:** POST /photos/captures/:captureId/upload-url -> `{storagePath,signedUrl}` OR `{storagePath,uploaded:true}` OR `{photo}`. POST /photos/captures/:captureId/complete body `{captureDate,notes}` -> `{photo}`. Photo envelope uses existing fields id,photoUrl,captureDate,notes,userId and skinScore=0. Derive UUID v5(captureId, verified owner UUID); path `<owner>/<id>.jpg`.

- [ ] Add failing tests for repeat intent identity, owner isolation, lost-response retry, already uploaded object, original capture date, concurrent completion, invalid UUID/date/bytes and no score/streak mutation. Example meaningful assertion:
  ```ts
  const first = await complete(owner, capture, {captureDate: original, notes: 'synthetic'});
  const retry = await complete(owner, capture, {captureDate: later, notes: 'changed'});
  assert.equal(first.photo.id, retry.photo.id);
  assert.equal(retry.photo.captureDate, original);
  assert.equal(rowsForCapture.length, 1);
  ```
- [ ] Run `npm test` in backend and record the expected missing-contract failure before implementing.
- [ ] Implement deterministic owner-derived identity, no-upsert URL, validated object info, existing-record fast path and transaction/concurrent-conflict recovery. Keep old photo API compatible. Do not emit sensitive error details.
- [ ] Add an identity-scoped local live script exercising actual signed upload, repeated completion, separate owner and assigned/wrong clinician access, capture time and cleanup of exactly its fixtures. Enforce loopback URL and no query overrides; never permit production override.
- [ ] Run backend tests/build and local live check; commit only backend task files. Record results/limitations.

### Task 2: Durable iOS capture and shared patient UI

**Files:** ClearAF/Services/PhotoRepository.swift (new); ClearAF/Services/APIService.swift; ClearAF/Services/AccountNetwork.swift only if needed; ClearAF/ContentView.swift; versioned ClearAF/ClearAF.xcdatamodeld; ClearAF/Views/DashboardViewEnhanced.swift; ProgressView.swift; PhotoCaptureManager.swift; ClearAFTests/PhotoRepositoryTests.swift; ClearAFUITests photo flow test.

**Consumes:** Task 1 exact contract. Existing APIService.access ticket, account persistence context and authenticated request facilities. **Produces:** single main-actor repository for capture(Data,date,notes), share/retry(SkinPhoto), resume(context,ticket), cancel; observed/persisted photo status and serverID. Concrete Swift signature can follow repository conventions; update callers together.

- [ ] Write failing unit tests using real temporary Core Data stores and an injectable transport for offline save/reopen, legacy no-auto-share, transient retry/lost response, exactly-once identity and account-switch cancellation. Reuse existing AccountAccess testing seams; no production test flags to fabricate success.
- [ ] Preserve the original model version, add current optional synchronization fields, and verify old-store migration preserves IDs/bytes. Use model versioning rather than overwriting the only source model.
- [ ] Implement account-bound durable capture with validation and a single foreground worker. Network transport returns existing record or uploads/finalizes the same ID; check ticket around awaits. Local persistence failures remain visible. New/reopened active scenes trigger retries with bounded cadence; logout cancels.
- [ ] Route every retained photo entry point through repository, observe mutable Core Data photo objects, expose local/pending/shared/error labels and Share/Retry. Remove photo score editing/fabricated visit markers; do not allow misleading local-only deletion of synchronized photos.
- [ ] Add synthetic Simulator UI coverage for capture/share status using a test-owned image and local stack, preserving genuine persistence/network behavior. Verify Debug build/unit tests and both existing account flows. Commit task files with red/green evidence.

### Task 3: Complete clinician photo review

**Files:** new web-portal/src/components/patients/PatientPhotoHistory.tsx; web-portal/src/app/patients/page.tsx; web-portal/src/lib/api.ts only for required bounded photo contract corrections; new focused behavior tests using existing toolchain.

**Consumes:** existing getPatientPhotos(patientId,page,limit), returns `{data,pagination}`; useClinicalAPI() binds requests to login generation. **Produces:** paginated photo review with full-image dialog, visible errors and refresh.

- [ ] Add a failing behavior test for page replacement, retry after failure and stale result rejection using a small tested controller if needed; assertions must observe emitted view state/data, not implementation text.
- [ ] Implement bounded photo pages independent of timeline. Full-image dialog uses object-contain and date/notes; explicit Previous/Next, Retry and Refresh images. Broken images display useful error and reauthorization action; no auto-refresh infinite loop. Never send signed URLs to external image optimizers.
- [ ] Replace patient card's six-image preview/inert View All and swallowed errors with component; remove fabricated score/timeline content from this photo-review surface.
- [ ] Run portal tests/lint/typecheck/build and browser verification with synthetic assigned clinician/photos (including full image, pagination and network failure). Commit task files.

### Task 4: Integrated verification and handoff

**Files:** docs/accounts or new docs/photos/README.md and verification.json; only necessary fixes from independent reviews.

- [ ] Review each task's committed diff for spec compliance and correctness; resolve meaningful findings before completion.
- [ ] Run the real local capture script against worktree API, fresh iOS photo/unit/account test run, portal behavior tests/browser and builds. Existing baseline passes are not proof of new flow correctness.
- [ ] Verify owner/clinician authorization remains intact and no signed URL or private backup is staged. Run source hygiene, diff check, audits and relevant recovery check if schema/migration infrastructure changes.
- [ ] Record exact commands/results, synthetic cleanup, reviewed commit, no-deployment boundary, background-upload limitation and pending T3 routine/lifecycle decisions. Keep branch reviewable; no merge or production push.
