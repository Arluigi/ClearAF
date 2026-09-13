# Assigned messaging verification — September 13, 2026

Third release of the [approved expansion](expansion.md). One private text conversation connects a patient with the currently assigned clinician. Portal and native iOS Messages expose manual refresh, bounded older history, unread counts and clinician photo/routine feedback linking to exact authorized records. No attachments, instant-delivery promise or response-time promise.

## Evidence so far

- Backend: 164 tests and Prisma/TypeScript build passed. Seven live local synthetic groups passed: role/assignment, empty inbox, retry conflicts, equal-time cursor pagination, exact acknowledgements, record references, reassignment, RLS/Data API, retired legacy routes and revoked sessions.
- Portal: 84 tests, lint, typecheck and production build passed. Retry identities/body conflicts, cancellation, pair validation, cursor overlap and session-scoped API calls have focused tests.
- Portal walkthrough: current synthetic inbox; received-message acknowledgements; clinician send accepted; exact version 1 routine feedback and authorized photo opened. The original synthetic photo fixture initially stored a local HTTP legacy URL; changing the fixture to its canonical owned object path made patient and clinician original endpoints return 200. No production data involved.
- iOS signed build and seven focused tests passed. Final review identified two edge cases (non-overlapping refresh pagination and out-of-order unread responses); both were fixed in one scoped wave with regressions, and scoped re-review found both addressed without new breakage.

## Migration and compatibility

`20260913225004_assigned_messages.sql` adds a service-only table with RLS, typed member constraints and paging/unread indexes. Local and hosted additive migrations are applied under the canonical version; no direct client grants. Recovery inventory includes the table. Existing legacy messages table remains untouched. Hosted legacy count was zero at preflight; old authenticated routes return 410 after API promotion because previous clients had no active messaging interface. Recheck legacy count after promotion; do not silently omit unexpected history.

## Limits

No APNs, attachments, delivery/read receipt promise, retention policy or distribution work. Messaging fetches on explicit refresh; notifications are not implied. Tests use synthetic identities/text and a generated one-pixel image. The physical iPhone is currently disconnected and has not received this feature build. Final deployed sources follow below.

## Final local exchange

The signed Simulator app was rebuilt with `CLEARAF_LOCAL_DEVICE_HOST=Aryans-MacBook-Pro.local` for this worktree's API3002; the first unit-test build used the default old local API3001 and therefore could not open the new endpoint. This was local configuration, not an app code change. Patient sign-in, native fourth Messages tab, clinician conversation/feedback, patient reply and sign-out passed. The exact Simulator reply appeared in the portal; its count changed from one unread to zero only when the reply was displayed. iOS opened the linked immutable routine revision. Both clients signed out and the loopback-only cleanup removed the exact accounts, sessions, messages, records and generated photo object.

The full light/dark/large-text matrix and another physical-phone test were not repeated. Dark portal and native layouts were visually inspected; accessibility controls exposed message content and reference actions. Two initial CI failures exposed test-environment coupling and the legacy live-check status expectation; those are corrected before merge.
