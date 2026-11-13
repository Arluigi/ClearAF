# Enrollment and email confirmation repair — local verification

Verified on `feature/unzit-integration`, November 12, 2026. All service access was
local. No hosted Supabase, GCP or Vercel operations, deployments or migrations
were performed. Consent publications and password-reset deep links are unchanged.

## Root causes and separate fixes

| Commit | Defect and repair |
| --- | --- |
| `3da16a3` | SwiftUI cancels `.task(id: answers)` when an answer changes. A dispatched autosave could commit but lose its response, leaving the client at the old revision. Finish dispatched mutation acknowledgements independently of the debounce task; retain account/epoch and genuine conflict checks. |
| `7599ced` | Signup redirected to the recovery deep link with no useful confirmation landing. Use a public static `/confirmed` page, bypass portal auth initialization, and select the signup redirect at compile time. Hook tests verify the exact redirect is preserved. |
| `998c87e` | Signup silently returned to sign-in, and unconfirmed sign-in had a generic error. Show a confirmation screen with the submitted address, Supabase resend and back-to-sign-in. Capture the submitted address before awaiting. |
| `4a08d92` | Legacy cases with no pinned settings version caused a Prisma `findUnique(version: null)` error during payment settlement. Fall back to the membership's immutable checkout publication. |
| `231a6c0` | Portal headers read legacy screening and v1 consent records for launch patients, producing false missing-record warnings. Select the summary using the existing authorized care-model discriminator. |
| `6ddbdbd` | Calling native browser fetch as `this.fetchBytes()` supplied an invalid receiver, preventing protected identity images from loading. Invoke the detached fetch function. |
| `d0ef6f9` | The pushed final-review screen remained after a successful submission. Dismiss only after acknowledged success; retain the review and retry after failure. |

Each code fix has a regression verified failing before its implementation and
passing afterward. Access and contract reviews found no remaining findings.
No API response shape or database schema changed.

## Live reproduction and journey

- Fresh allowlisted `@example.invalid` signup through local Auth and Mailpit:
  case starts at revision 0; progress save commits revision 1; stale submission
  returns 409; acknowledged-revision submission succeeds. Cancellation regression
  reproduces the lost acknowledgement in iOS.
- Booted iPhone 17, iOS 27, signed Debug app: signup, confirmation guidance,
  resend, unconfirmed sign-in guidance, Mailpit confirmation, sign-in, eligibility,
  all four consents on one screen, All-In selection, paid identity, NC attestation,
  all six medical topics, photos, delivery, review and submission.
- Quit/relaunch verified after partial eligibility and again at Photos after
  medical completion. The server step and prior answers were retained.
- Local portal: assigned clinician opened both protected identity images,
  approved identity, reviewed the submitted package, approved the case, and
  recorded one synthetic external-prescription entry through the form.
- Final API assertions: approved identity and case, active membership, four
  consent receipts, three clinical photos, NC delivery, no missing required
  answers and one prescription record.

The simulator Photos picker remained on Loading, and Simulator has no live
camera. Synthetic identity drafts and three labeled clinical images were uploaded
through the real local API to continue the UI journey. The fake invoice was
resolved through the development-only API; the app's Stripe-only URL guard
rejects the fake browser handoff. Native capture/library selection and a real
Stripe browser payment are not established by this run.

## Final checks

- Backend: `npm test` **556 passed**; `npm run build` passed.
- Portal: `npm test` **322 passed**; typecheck, lint and production build passed.
- iOS: **388 unit tests passed**, one physical-connectivity test skipped because
  no explicit synthetic Bonjour host was supplied; both submission UI tests passed.
  Derived data: `/tmp/clearaf-unzit-int-build`; output piped through `xcbeautify`.
- Release simulator build passed; it was never launched against hosted endpoints.
- Isolated local recovery: fresh schema/security/ledger parity, database/auth/
  storage restore and complete API journeys passed. Task-owned stacks stopped;
  retained volumes and private reports remain under `.local/`.

Screenshots are in the requested scratchpad `e2e/` directory, including signup,
resume checkpoints, each intake topic, submission, protected identity, clinical
review and saved prescription. `submission-regression/` contains the success and
failure navigation screenshots exported from the final passing XCTest result.

## Hosted redirect allowlist — owner action only

Add these exact URLs to Supabase Auth's redirect allowlist:

- `https://unzit-portal.vercel.app/confirmed`
- `http://localhost:3000/confirmed`

The Debug URL is already in the repository's local Supabase configuration.
The existing `clearaf://auth` password-reset callback remains unchanged.
