# Photo Review Workflow Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Compare existing private photos and expose explicit clinician review acknowledgements and queue.
**Architecture:** Add an authenticated review service/table; reuse original-photo transport and session boundaries. Backend contract in the spec permits independent client implementation.
**Tech Stack:** Express/Prisma/Postgres, Next/React, SwiftUI.
**Spec:** docs/superpowers/specs/2026-09-13-photo-review-workflow.md

## Global constraints

Current assignment/session authorization; no invented outcomes; no public table access; current Care Journal; exact local fixtures only; no camera/distribution work. Owner-approved API contract in spec is authoritative.

### Task 1: Review API, migration and integration fixture
Files: backend/src/services/photoReview.ts (new), backend/src/routes/photo-reviews.ts (new), backend/src/server.ts, backend/prisma/schema.prisma, Supabase CLI generated migration, backend/tests/photo-review.test.ts, backend/scripts/photo-review-live.cjs.
- [ ] Add failing cases for the spec's batch validation, wrong assignment, repeat mark retaining author/time and paginated queue.
- [ ] Implement exact three endpoints in the spec; serialize assignment-sensitive writes by locking patient profile as in routineCare.ts. Do not weaken middleware or photo access.
- [ ] Generate Prisma client; run focused tests and backend build.
- [ ] Add loopback-only fixture exercising patient/assigned/unassigned roles, queue before/after acknowledgement, Data API denial and cleanup by exact owned UUIDs. Coordinate migration execution with parent; do not deploy.

### Task 2: Portal comparison and review queue
Files: web-portal/src/lib/api.ts, types/api.ts, components/patients/PatientPhotoHistory.tsx; new photo-comparison controller/component and PhotoReviewQueue component; app/patients/page.tsx.
- [ ] Failing controller tests: third selection rejected, deselection works, refresh/page resets, stale original responses ignored.
- [ ] Implement two-photo dialog with dates, shared zoom/reset and bounded image loading using existing authorized API. Preserve original one-photo dialog.
- [ ] Read batched review status; show mark reviewed with pending/error/retry and original server timestamp. Use a separate queue with its own pagination.
- [ ] Run focused portal tests/lint/build/typecheck. Parent owns browser test and integration.

### Task 3: Patient review visibility
Files: ClearAF/Services/PhotoReviewRepository.swift (new), ClearAF/Services/APIService.swift as needed, ClearAF/Views/ProgressView.swift, ClearAFTests/PhotoReviewTests.swift.
- [ ] Failing tests for batch decode/status, failed lookup not falsely not-reviewed, account-generation invalidation.
- [ ] Display server review acknowledgement in shared-photo detail, fetch only within existing access ticket and cancel/reset on logout. Local-only images show not shared, never review claims.
- [ ] Signed Simulator build and focused tests; parent owns final visual smoke.

### Integration
- [ ] Review changes against spec; one fix wave and scoped rereview.
- [ ] Run local synthetic integration, portal focused browser and signed Simulator checks, relevant build/test suites once.
- [ ] Record results/limits and exact migration/deployment state; commit, push PR, await CI, merge, deploy compatible API and portal, verify retained demo read-only, clean branch/fixtures.
