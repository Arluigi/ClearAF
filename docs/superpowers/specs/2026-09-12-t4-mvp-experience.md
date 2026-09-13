# T4 MVP experience

## Authority and scope

The approved MVP retains dated photos, clinician-assigned morning/evening routines, completion recording and minimal accounts. T0–T3 are the baseline; T3 ends at aa4b26f. This phase applies the recovered roadmap's T4 requirements. It does not decide clinical guidance, review coverage, retention, removal, support ownership or pilot readiness. Historical values and private handoff files are preserved.

## Retained experience

Patient tabs are **Today**, **Photos**, **Routines**. Profile opens separately and contains name editing, the signed-in email, sign-out and the existing truthful account-removal explanation. Remove reachable scores, streaks, prescriptions, refills, shop, appointments, messaging, advanced reminders and nonfunctional help/export/settings controls. Today shows the real latest photo and assigned routines/completion. Empty assignment is an empty state, never a fabricated plan.

Registration collects name, email and password only; no skin-type control is shown. Onboarding requires a trimmed name (2–100 characters), displays factual photo/routine usage and persists completion through the API. It does not request skin classification or invent a default. Optional legacy profile fields remain accepted/stored for compatibility; omitting them must not erase them. Existing accounts do not repeat completed onboarding.

The clinician portal opens assigned Patients and a minimal Account page. Patients supports name search and pagination, and opens dated photo review and existing routine assignment/history. Display only actual retained data; remove scores, statuses inferred from scores, fake activity, notification badges and no-op actions. Direct dashboard/appointments/messages/prescriptions/settings routes redirect to retained screens. Keep authentication, verification, recovery and account-bound request guards. No new clinician provisioning or patient assignment workflow.

Every retained action needs progress, recoverable failure, empty and permission states where applicable. Errors must never claim a write succeeded. Background or obsolete account requests cannot publish private state. Preserve immutable routine revisions, frozen retries, completion history, photo capture IDs, durable outboxes and access generation barriers.

## Loading and thumbnails

Server patient/photo lists validate decimal integer page 1–10000 and limit 1–50; defaults preserve current callers. Reject arrays, negative/fractional/overflow/malformed parameters with HTTP 400. Sort with an ID tie-breaker. Patient search is trimmed name-only, at most 100 characters. Do not query a nonexistent email column. The legacy patient-list endpoint is also bounded, without eager appointment/prescription graphs.

Portal thumbnails use an authenticated owner/assigned-clinician endpoint: `GET /api/photos/:id/thumbnail`. It returns a JPEG at most 400 pixels along either dimension, no enlarged small image, without EXIF. Authorization and owner-path validation occur before cached bytes are returned. Never send private originals through Next's public image optimizer. Full signed original loads only when opened. The transport must obey session generation barriers and revoke object URLs on replacement/unmount/sign-out.

Generate derivatives on demand using sharp; no database migration or persistent derivative storage. Input maximum 10 MiB, decode limit 64 million pixels, upstream timeout 15 seconds, at most two active uncached conversions and no unbounded queue. Bounded cache maximum 16 MiB, TTL 60 seconds; authorization before every hit. Stream input with byte enforcement, reject oversized content even if Content-Length is missing or false. Return recoverable errors for unavailable/unsupported originals. Responses are private/no-store and never disclose storage paths. Portal requests at most two thumbnails concurrently per history and cancels stale work.

On iOS, fetch a bounded page of 24 photo records (previous/next navigation, not indefinitely accumulating pages), newest first with stable tie-breaker. Count separately. Today fetches only the latest photo. Reload after local capture/delete and reset on account change. Downsample with ImageIO before decoding thumbnails, use a bounded cache and do not load every original into memory. Full-screen rendering should fit the display rather than decode arbitrary original dimensions. Preserve original bytes and upload behavior.

## Accessibility and physical device

Use Dynamic Type semantic fonts, wrapping layouts and scrollable content at accessibility sizes. Controls have meaningful labels, selected states and useful VoiceOver order; no color-only completion/error state. Target WCAG AA contrast (4.5:1 normal text, 3:1 large text/essential controls), portal keyboard reachability, visible focus, Escape/close behavior and focus restoration. Audit retained routine and photo detail flows, not just new navigation.

Camera access requests occur on user action. Denied/restricted access shows an explanation and Settings recovery; unavailable camera does not silently open a different source. Library selection should use the system limited-selection picker without broad library access; cancellation and decoding failure leave the capture recoverable. On a physical test iPhone prove camera grant/denial/recovery, library selection/cancellation, capture and authenticated sharing with synthetic content only. Library broad permission is not required by a scoped picker; explain and test that distinction. Simulator evidence is separate.

## Verification and completion

Run backend, portal and iOS regression suites/builds and local synthetic authorization/account-boundary checks. Measure representative 1000-photo and 500-patient synthetic histories. Record dataset generation, page counts, API p50/p95 over at least 20 requests, response bytes, thumbnail bytes, image decode bounds, process memory and query plans. Engineering targets on this Mac: paged API p95 under 1 second warm, first thumbnail page under 5 seconds warm, no more than 24 iOS photo records/page and two concurrent thumbnail conversions; memory should plateau across repeated page navigation rather than grow with total history. Investigate misses and document evidence, not invented measurements.

Record actual accessibility/device results and limitations in docs/mvp/README.md and verification.json, including independent reviews. Cleanup only exact generated fixture IDs and objects. No production data, migrations or deployment. T4 remains incomplete until physical-device checks actually pass. T5 remains a separate release/pilot phase requiring unresolved clinical/practice decisions.

## Physical Debug networking

Simulator keeps its fixed loopback endpoints. An explicit Debug build setting may name the Mac using a single validated Bonjour `.local` hostname (no URL, port, slash, credentials or production domain). Device API is port 3002 and local Supabase remains 54321; a separate local API process uses the same local database and this Mac's Supabase origin so signed URLs work on the phone. Release ignores this setting completely. Add local-network usage text for physical Debug, fail closed for malformed configuration, and document start/stop. No tunnel or public deployment is needed. Unit tests prove defaults, allowed host and rejected arbitrary/public hosts.
