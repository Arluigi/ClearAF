# Capture catalog verification

## Publication and source priority

- New immutable draft: `backend/src/content/catalogs/2.1-pending-review.json`.
- Historical 2.0 SHA256: `0a2492ecb515f0f7a50bd6e9b23e8b985472cf8a3cd136d5e0009e2d25be7830` (unchanged).
- `identityGuidance.prompt` and `.attestation`: intake v2 A7. Identity items: corrected non-intake Part B, unchanged where nonconflicting. `photoGuidance.instructions` and `.slots`: intake v2 F, which explicitly supersedes the older Part B photo wording. `.copy.zoomLabel`: corrected non-intake Part B, exact sentence.
- The optional `copy` blocks are versioned API content, validated as bounded nonempty strings with known keys. Older catalogs can omit them; 2.1 publication requires both complete blocks. Existing contractVersion remains 1 and fields retain their prior names/types.
- Consent bodies/digests remain unchanged; numeric versions become 4 and labels become 2.1, avoiding mutation of the version-3 legal identity. Existing acceptances remain tied to version 3.
- Published 2.1 to the existing loopback database only; projection returned 2.1 for new clients, preserved explicit 2.0, and returned 1.0 for installed clients without a header. No hosted services or migrations were used. Screenshot routes use synchronized offline API-model fixtures; they do not upload photos.

## Needs clinician wording

These exact preexisting Swift strings have no matching patient-facing wording in the supplied v2 sources. Each is retained verbatim in the new catalog pending clinician review. Generic labels are included in this conservative inventory because they are now catalog-controlled too.

| Catalog field | Status | Exact wording |
|---|---|---|
| `identityGuidance.copy.fullNameLabel` | needs clinician wording | Full legal name |
| `identityGuidance.copy.dateOfBirthLabel` | needs clinician wording | Date of birth |
| `identityGuidance.copy.birthConfirmation` | needs clinician wording | I confirm this is my date of birth. |
| `identityGuidance.copy.idTitle` | needs clinician wording | Government photo ID |
| `identityGuidance.copy.selfieTitle` | needs clinician wording | Live selfie |
| `identityGuidance.copy.idInstructions` | needs clinician wording | Keep the full name, date of birth and face readable. Your ID is kept separately from your skin photos. |
| `identityGuidance.copy.selfieInstructions` | needs clinician wording | Use the camera now, with your face clearly visible. A saved library image cannot be used as your selfie. |
| `identityGuidance.copy.ncWarning` | needs clinician wording | You must be physically in North Carolina for this care. If you are elsewhere, seek local care. |
| `identityGuidance.copy.completionHint` | needs clinician wording | Add both readable photos, confirm your date of birth, and attest your current location to continue. UNZIT is for adults 18+. |
| `identityGuidance.copy.idPreviewLabel` | needs clinician wording | Government photo ID preview. Check that it is readable. |
| `identityGuidance.copy.selfiePreviewLabel` | needs clinician wording | Live selfie preview. Check that it is readable. |
| `identityGuidance.copy.prepareFailure` | needs clinician wording | The photo could not be prepared within the upload limit. Retake it in good light and check the text and face are sharp. |
| `photoGuidance.copy.setReviewHint` | needs clinician wording | Zoom in and check it is sharp. These photos are shared with your clinician as a set. |
| `photoGuidance.copy.completionHint` | needs clinician wording | Share every required angle before continuing. A photo saved only on this device is not yet part of your clinical photo set. |
| `photoGuidance.copy.reviewAdvice` | needs clinician wording | Check the angle, lighting and focus before sharing. Retake a blurred photo. |
| `photoGuidance.copy.afterSave` | needs clinician wording | Saved privately on this device, then shared with this clinical photo set. Continue only after sharing is confirmed. |
| `photoGuidance.copy.discardMessage` | needs clinician wording | It hasn't been saved to your record. |
| `photoGuidance.copy.prepareFailure` | needs clinician wording | The photo could not be prepared within the upload limit. Retake it in good light, using a different photo for each angle. |
| `identityGuidance.copy.safetyTitle` | needs clinician wording | Something's wrong? |
| `identityGuidance.copy.safetyMessage` | needs clinician wording | Tell your care team about a reaction or sudden change |
| `photoGuidance.copy.safetyTitle` | needs clinician wording | Something's wrong? |
| `photoGuidance.copy.safetyMessage` | needs clinician wording | Tell your care team about a reaction or sudden change |

## Verification evidence

Backend/catalog and portal commands run with a filesystem guard that refuses protected config reads and with dotenv disabled. Synthetic loopback config supplies unit-test dependencies; no API/DB/service connection is needed by these suites. Backend `npm test`: 532 passed, 0 failed. Backend `npm run build`: passed. Portal `npm test`: 313 passed, 0 failed. Portal `npm run typecheck`: passed. Backend tests required approved loopback-listener access outside the sandbox; the guard and disabled dotenv remained active. Logs are ignored under `.local/capture-review/`. iOS and screenshot evidence follows after verification.

- Backend final `npm test`: 532 passed; final `npm run build`: passed, including reviewed current-catalog validation.
- Portal final `npm test`: 314 passed; final `npm run typecheck`: passed (includes the 2.1 header regression).
- Final iOS unit tests: 374 passed, 1 skipped. Derived data: `/tmp/clearaf-unzit-int-build`. Current-catalog guards and both known v2 routes are included.
- Release simulator build: passed. Release binary contains no launch-mock argument, screenshot-badge argument, or synthetic-fixture marker.
- Builds/tests used an ignored sanitized project copy excluding the generated xcconfig, a synthetic offline public-key placeholder, and the original source paths. Node verification preloaded a filesystem guard refusing protected config reads; no `.env*` or `Local.generated.xcconfig` was read.
- API contract and care-access reviewers: initial portal header/fallback findings fixed and scoped re-reviews clean. Upload/auth paths remain unchanged; late catalog responses are checked against account and repository epoch.
- DEBUG screenshot argument: `-UNZITHideReviewBadge`. Production capture components and catalog fixtures share identical guidance fields; `UNZITLaunchTests` checks exact fixture equality.
- Unit tests cover new/old decoding and copy precedence, current-catalog completeness, check-in API guidance, unavailable-version fallback, offline failure, late account switch, and draft routing for both v2 publications.
- Review pack regenerated: `/Users/aryansachdev/Desktop/unzit-capture-screens-review.pdf` (62 pages, 57 native 1206 x 2622 screenshots plus cover and four wording-inventory pages). Screenshots, full UI snapshots, source manifest and HTML are in `.local/capture-review/`. All capture instructions have exact catalog-field captions; generic controls/status/permissions are labeled `system`. No `Not from catalog` text remains. Covered form nodes are excluded from camera/zoom transcripts.
- PDF visual QA checked identity, chest review, native camera and wording-inventory pages; no caption overflow or badge obstruction. Simulator cannot verify physical capture or identity matching.
