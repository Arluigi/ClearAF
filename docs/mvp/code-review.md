# T4 final code review

Final verdict: approved after one consolidated fix wave and scoped rereview. The two findings in the original review below are resolved by c7ae5b6. No further review round is required.

# T4 whole-branch review

Reviewed `aa4b26f..db7eaa6` in the existing isolated worktree, using the requesting-code-review rubric and approved T4 spec/plan. Source, index and HEAD remained unchanged. No broad suites, service changes, fixture mutations or subagents were used.

## Strengths

- The integrated retained scope is coherent: Today/Photos/Routines plus separate Profile, and assigned Patients/Account in the portal. Deferred portal routes redirect and account writes preserve omitted legacy fields.
- Backend pagination validates inputs before queries and preserves assignment boundaries. Thumbnail and original access share current owner/assignment and owned-path authorization; cache hits repeat authorization. Streaming byte limits, decode bounds, bounded active jobs/cache and private/no-store responses are explicit.
- Portal thumbnails have account-generation guards, cancellation and object-URL retirement. Original access begins on opening detail, summary/original failures terminate truthfully, and dialog focus restoration is implemented.
- Native history uses bounded CoreData pages and downsampled display caches. Account-generation view identity, request tickets, durable capture IDs and existing routine repository boundaries remain intact. Provider teardown prevents late library callbacks from saving after dismissal.
- Evidence distinguishes actual hardware from Simulator, local isolation from server sharing, and raw audit failures from functional acceptance. The physical A→B test and final exact hosted cleanup close the prior physical-isolation gap. Volume/memory, recovery and final regression evidence are substantial and preserved.

## Critical

None identified.

## Important — fix before acceptance

### Today capture action still inherits the light dark-mode accent as its prominent fill

**Location:** `ClearAF/Views/DashboardViewEnhanced.swift:303-307`, especially line 307.

`PhotoDisplaySection` applies `.buttonStyle(.borderedProminent)` to both “Take a photo” and “Take another photo” but supplies no action tint. It therefore inherits `.tint(.primaryPurple)` from `ClearAF/ContentView.swift:50`. That color resolves to RGB(0.714, 0.612, 1.0) in dark appearance (`ClearAF/Views/DesignSystem.swift:15-19`). Against a white prominent-action label, its calculated WCAG contrast is **2.284:1**, below even the 3:1 large-text target and the required 4.5:1 normal-action target.

This is the same adaptive-accent/filled-control mismatch already corrected for Routine completion; Photos and Capture also explicitly use the fixed action tint. The retained Today entry point was missed. Existing color tests cover the fixed action colors and actual Routine tint, not this inherited Today pairing; the recorded Today action audit crop is offscreen and does not establish a passing visible dark-mode pairing.

**Fix:** Apply `.tint(.primaryActionPurple)` to this actual prominent button (and an explicit white label if needed to make the intended pairing deterministic). Add one focused assertion of the actual Today action color pairing in both appearances or a focused rendered dark-mode check. A broad test/device matrix is unnecessary.

## Minor

### Patient-list controller cannot survive React effect cleanup/setup replay

**Location:** `web-portal/src/lib/patient-list.ts:26`, consumed by `web-portal/src/app/patients/page.tsx:21-23`.

The page memoizes one controller and its effect cleanup permanently sets `disposed = true`. A subsequent setup calling `load(1)` on that same instance never reactivates it, so all later publications are suppressed. This affects development StrictMode effect replay; it does not invalidate the verified production-built portal flow.

A focused, network-free reproduction using the actual controller executed `load(1) → dispose() → load(1)` and awaited both successful synthetic responses. The resulting snapshot remained `status: "loading", patients: []`. The first reproduction attempt hit a CJS/ESM import mismatch; the corrected require-based invocation produced the stated result.

**Fix:** Give effect ownership a replay-safe activation/cancellation lifecycle, or use nonterminal request cancellation for effect cleanup while subscription cleanup owns listeners. Preserve suppression of old in-flight results. Add one focused setup/cleanup/setup lifecycle regression, retaining the existing disposal/account-generation behavior. Do not disable StrictMode to hide the lifecycle problem.

### Final evidence bookkeeping remains pending

**Location:** `docs/mvp/verification.json:4` and its `independentWholeBranchReview`/`secretScan` entries; `docs/mvp/README.md` completion status.

These intentionally describe the pre-final-review checkpoint. After the focused fixes/checks, record this verdict and the final range scan, and update final status consistently. Preserve raw accessibility failure/partial toolbar scaling and historical whole Debug-container reset caveats; neither should become a green audit or narrow historical cleanup claim.

## Evidence and review limits

Reviewed the changed production paths in bounded passes, approved requirements, task reports/reviews/rereviews, durable MVP results and relevant behavioral tests. Checked existing final backend and physical cleanup log summaries and the built-plist check artifact. Inspected account-bound portal auth composition and native generation identity where needed to assess cross-layer races. No new cross-account data leak, immutable-history regression, unbounded native history retention or new production/private-data exposure was identified.

The accepted physical proof includes actual camera/library sharing plus 57.175-second generated-local-history A→B isolation; these are separate claims. The documented 18 raw accessibility findings and reduced Done/Cancel scaling remain limitations, not full accessibility certification. The focused contrast defect above is independent of those documented dispositions. Final secret scanning is controller-owned.

## Assessment

**Ready to merge: With fixes.** One remaining retained-action contrast mismatch should be corrected before T4 acceptance. The development lifecycle issue is concrete and small enough for the same focused fix wave. After those fixes, focused verification and final documentation/scan, this review found no other Critical or Important blocker; no repeated broad review or test matrix is requested.


## Scoped fix verification

# Final scoped rereview — c7ae5b6

**Approved. Both final-review code findings are addressed. No new Critical or Important issue found.**

- **Today action contrast:** `ClearAF/Views/DashboardViewEnhanced.swift:308-312` now binds the actual prominent capture button to `TodayPhotoActionAppearance.tint` (`primaryActionPurple`) and explicitly supplies white foreground. It no longer inherits the adaptive dark-mode accent. The focused test resolves that actual shared tint in light and dark appearances and requires white contrast ≥4.5:1. The report records exactly one executed Swift Testing test passing in 0.001 seconds; the earlier zero-selected invocation is explicitly excluded.
- **Patient-list effect replay:** `web-portal/src/app/patients/page.tsx:23` now uses nonterminal `cancelPending()` during effect cleanup. `web-portal/src/lib/patient-list.ts:27` advances request generation without permanently disposing the memoized controller or clearing fresh subscriptions. Old continuations remain suppressed; `useSyncExternalStore` retains responsibility for subscription cleanup, and terminal `dispose()` remains intact. The focused regression exercises cleanup/setup, fresh subscription, fresh response followed by stale response, and verifies ready state, only fresh patients and exactly two publications. The report records all five focused controller tests passing, including existing terminal-disposal suppression.

Read only the supplied `review-277d102..c7ae5b6.diff` and `final-fix-report.md`. No source/index/HEAD mutation, broad checks, repeated tests, service changes, new code crawl or subagents. The fixes are bounded and do not alter the established account, photo upload or routine history contracts.

**Ready to merge: Yes, from code review.** The prior whole-branch review and this scoped fix review leave no unresolved Critical/Important code findings. Controller-owned final evidence bookkeeping, final range secret scan and required CI remain the integration gates. Preserve the existing raw accessibility/partial toolbar scaling and historical cleanup caveats; this approval does not relabel them green or claim full accessibility certification. No further review or repeated test matrix is requested.
