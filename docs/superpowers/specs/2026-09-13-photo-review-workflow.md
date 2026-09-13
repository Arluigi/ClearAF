# Photo comparison and clinician review workflow

First release of the owner-approved expansion in docs/features/expansion.md. Scope is existing shared-photo flows, not image analysis or treatment decisions.

## Behavior

Clinicians select exactly two photos from the current patient history page and open a comparison dialog. Show capture dates and equal contain-fit panels, with one shared zoom control (100–300%, reset) and independent scrolling of enlarged images. Do not stretch images, infer matching capture conditions, or label improvement. Clear selection on patient/page/refresh changes. Private original URLs remain short-lived and current-session bound; stale results cannot display after account/patient changes. Use existing photo-dialog keyboard/focus and Care Journal surfaces; narrow screens stack the panels.

Clinicians explicitly mark a photo reviewed. A stored acknowledgement records photo, clinician and server time; it is idempotent and does not edit photo content. No unreview/delete workflow. Patients can see the acknowledgement on their shared photo's detail screen, with explicit unavailable/loading/retry status; never infer review from upload. Historical reviewed status survives clinician reassignment, but only the current assigned clinician can read/write the patient's records. Portal patient list includes a separate paginated review queue (patient name, unreviewed count, oldest/latest upload) linking to the dedicated workspace. Upload timestamps, not user-entered capture dates, determine queue ordering.

## API and persistence contract

Mount authenticated `/api/photo-reviews` under the current role/session middleware. New table `photo_reviews`: `photoId` UUID primary key referencing skin_photos, `reviewerId` UUID referencing dermatologists, `reviewedAt` server timestamp; restrictive foreign keys. RLS enabled, no PUBLIC/anon/authenticated grants, backend service role access only. Do not change baseline hashes. Migrations use the installed Supabase CLI to generate the filename.

`GET /status?photoIds=uuid,uuid` accepts 1–50 unique UUIDs, rejects malformed/empty input; both roles. Verify every photo belongs to the authenticated patient or a currently assigned patient before returning anything. Response `{reviews: Array<{photoId:string,reviewerName:string,reviewedAt:string}>}` for reviewed IDs; absent means not reviewed. Never return object paths.

`PUT /photos/:photoId` clinician only, strict empty body. Transaction locks patient's profile, rechecks assignment, verifies photo belongs to patient, inserts acknowledgement if absent. Response `{review:{photoId,reviewerName,reviewedAt}}`, 201 new/200 existing. Repeated and concurrent clicks retain original author/time. No patient-write permission or client author/time fields.

`GET /queue?page=1&limit=20` clinician only, bounded pagination using existing helper. Response `{data:Array<{patientId,name,unreviewedCount,oldestUploadAt,latestUploadAt}>,pagination:{page,limit,total,totalPages}}`, grouped current assigned patients with at least one skin_photo lacking photo_reviews. Sort oldestUploadAt then patientId. Count matching patients, not photo rows. Scope query and count by current clinician; no foreign patient data or clinical scores.

## Acceptance

Meaningful tests cover authorization including unrelated patient/clinician, malformed batches, immutable repeated/concurrent acknowledgement, queue grouping/pagination and no review inference. Local migration and synthetic integration validate actual SQL and Data API denial. Portal tests cover two-photo selection limits/reset, stale results and review failure/retry. iOS checks cover account-bound review fetch/state; no need for another camera run. Portal build/lint/typecheck and iOS Simulator build; focused browser/Simulator review of changed surfaces. One review/fix wave; no unrelated matrix. Commit sanitized evidence, release and preserve demo data.

## Compatibility fix discovered during review

Existing photo deletion removed storage before deleting the database row. The new restrictive review FK exposed a broken-original risk, and remote storage deletion inside a database transaction would also risk timeout/rollback inconsistency. Reviewed-photo deletion now returns explicit 409 without touching storage. Unreviewed deletion atomically creates a service-only `photo_cleanup` intent and deletes the photo row, commits, then removes the object. Failed cleanup returns retryable 503 with the intent retained; the same owner's DELETE retry resolves it. Upload completion paths lock/recheck pending cleanup and object existence before recreating a row so they cannot race deletion. No automatic cleanup worker or new removal policy is added. This narrowly preserves the existing individual-photo deletion endpoint; it is not account removal.
