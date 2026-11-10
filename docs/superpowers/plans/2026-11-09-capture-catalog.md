# Capture catalog guidance implementation plan

**Goal:** All identity and clinical capture instructions come from the API's published catalog, including check-in, capture, review and retake.
**Architecture:** Preserve 2.0 byte-for-byte; add 2.1-pending-review with intake v2 A7/F wording (the source explicitly replaces older Part B wording) and optional `copy` dictionaries on photoGuidance and identityGuidance. Keep existing API fields and optional decode for older catalogs. Copy without v2 wording stays verbatim and is marked needs clinician wording in the verification report. No hosted services or secret-file reads.
**Tech stack:** Express/TypeScript, Zod, SwiftUI/Codable, offline DEBUG routes, simulator screenshots and PDF.

- [x] Backend/catalog: failing publication/projection/compatibility tests; additive copy validation; new version and selection/routing compatibility; portal optional types. Preserve historical consent identity and bytes.
- [x] iOS: failing decode/copy tests; catalog copy rendering on identity, photo set/capture/review; check-in loads catalog; older-catalog fallback; screenshot badge launch argument; DEBUG fixture synchronized.
- [x] Verification: backend npm test/build, portal npm test/typecheck, iOS unit tests at /tmp/clearaf-unzit-int-build, Release simulator build. No hosted services.
- [x] Evidence: regenerate screenshots/transcripts and PDF at requested Desktop path; label each catalog source or generic system string. Read-only API-contract and care-access reviews; resolve findings; commit with requested trailer.

User's detailed fix list supplies the approved scope and acceptance criteria. Work remains in the explicitly requested checkout; no worktree relocation.
