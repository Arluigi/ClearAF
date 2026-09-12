# T3 photo foundation design

The user approved the MVP scope: photos, routines and clinician photo review, deferring messaging, prescribing, appointments and commerce. This slice implements reliable photo capture/sharing and clinician review. Later T3 routines will be clinician-assigned/edited and patient-completed, as selected during execution; clinical deletion policies remain undecided. No production deployment or private transfer content is included.

## Selected approach

Add an account-bound durable upload state to the existing Core Data photo model and deterministic capture endpoints to the existing API. Keep private Storage and current assignment authorization. A standalone duplicate image store would complicate atomic persistence; a background transfer subsystem adds lifecycle complexity beyond this MVP. Use the existing Core Data bytes, a foreground worker, explicit retry and restart/resume recovery. No promise of background uploading while iOS suspends the app.

## Contract

- Client creates a UUID capture ID, original capture date and JPEG bytes locally before network work, all in its active account's Core Data store. Status is `pending`, `shared`, or `error`; missing status on existing rows means `local` and never silently uploads legacy captures. Explicit Share can enqueue a local photo.
- Server derives the object/record ID deterministically from verified owner UUID and capture UUID using UUID v5. The path is always `<owner>/<derived-id>.jpg`. No schema change is required. Upload URL issuance is idempotent by capture identity; if the row already exists, return its authorized `photo` instead of requesting another upload.
- `POST /api/photos/captures/:captureId/upload-url` with no clinical metadata returns `{ storagePath, signedUrl }` or `{ photo }`. Validate captureId as UUID and patient role. Only image/jpeg for this flow. A URL never permits overwrite. If bytes already exist but the record does not, return `{ storagePath, uploaded: true }` after checking object metadata, so the client can finalize without overwriting.
- `POST /api/photos/captures/:captureId/complete` with `{ captureDate: ISO8601, notes: string }` derives the same owner path, verifies stored JPEG size (1..10MB), and creates one photo with original date, zero score, no streak side effect. Repeats/concurrent completion return the existing owner-bound row and do not rewrite capture metadata. Errors must not expose signed URLs or credentials. Existing endpoints remain compatible.
- Storage-upload error does not prove upload failed. Retry the whole intent/complete flow with the same capture ID; never allocate another ID. After lost completion response, intent returns the existing record. Foreground retries use bounded cadence, not tight loops.
- Client checks the current AccountAccess ticket before and after every network await. Logout/account switch cancels workers and prevents new work with another user's token. Old completion cannot mutate the new store. Existing account generation protections remain authoritative.

## Patient UI

Dashboard and Progress capture call the same repository. Captures remain visible after restart with original date. Every photo shows Saved on device, Waiting to share, Shared, or Couldn't share with a deliberate Share/Retry action where appropriate. Success means bytes and photo row are accepted by the API, not clinician review. Remove score editing and visit markers from retained photo presentation; do not add clinical interpretations. In this slice avoid ambiguous local-only deletion of shared/pending photos: explain that removal is unavailable until its clinical policy is defined. Do not automatically queue legacy photos.

## Clinician UI

Replace the incomplete card gallery with a focused reusable photo-history viewer. Fetch bounded pages from existing assigned-patient endpoint; do not require the score timeline. Show original capture dates/notes, un-cropped full images in an accessible dialog, Next/Previous pages, empty/loading/failure with Retry. Refresh requests obtain new signed URLs. On expired/broken image show an explicit refresh action rather than hide content. Generation-bound API prevents stale results crossing accounts. No claims of instantaneous revocation: an issued bearer URL works for its 300-second lifetime.

## Persistence and failure handling

Preserve the existing model version and add a new current version with optional upload state/server ID fields for lightweight migration. Existing IDs/bytes remain untouched. No destructive reset. Keep upload states/bytes together in the same context save. A single worker drains eligible captures; terminal errors permit manual retry; foreground resumption retries transient pending/error work at a controlled interval. Do not persist tokens or signed URLs in the outbox. Limit image bytes to 10MB and visibly reject unsavable/oversized input before claiming success.

## Acceptance

1. Offline synthetic capture -> persistent pending record -> restart -> reconnect -> exactly one API row/object with original timestamp -> authorized clinician full-image viewing.
2. Lost intent/upload/complete responses, repeat retries and concurrent completion do not duplicate the capture or overwrite bytes/metadata.
3. Account A -> B -> A cannot send A work under B, expose A bytes to B or accept stale A-generation callbacks. Unassigned clinician and anonymous requests fail.
4. Legacy rows retain bytes/IDs and remain on device until explicit sharing. Migration and upload status updates survive store reopen.
5. Portal pagination/full-image/error/refresh behavior is covered by behavior tests and browser verification with synthetic fixtures.
6. Backend/portal tests/builds/typecheck/lint/audits and iOS unit/account/photo checks pass; targeted independent review finds no unresolved acceptance blockers.

## Boundaries

No production patient data, deployments, new provider credentials, clinical policy invention or automatic legacy record ownership assignment. No new dependencies unless existing tools cannot satisfy the design. Scope is the first T3 slice, not completion of all T3 or release readiness.

## Product decision recorded during execution

September 12: the user selected clinician-owned routines: clinicians assign and edit; patients record completion. This defines the next T3 routine slice, not extra functionality in the current photo slice. Clinical deletion/retention rules remain pending.
