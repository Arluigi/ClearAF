# Photo comparison and review workflow verification

Scope: portal two-photo comparison and new-upload queue; explicit clinician acknowledgement; patient shared-photo detail review visibility. Uses the approved Care Journal foundations. No automated interpretation of photos, clinical defaults, or notification promises.

Implementation review checked current assignment/role/session boundaries, immutable review acknowledgement, pagination, stale-response handling and both clients. The review uncovered an older photo deletion risk: storage could be removed before the review FK rejected deleting its record. A service-only cleanup intent now makes storage cleanup retryable after authorized record deletion, and reviewed photos are explicitly protected. Upload completion is checked against pending cleanup.

## Local evidence

- Portal: 69 tests, lint, production build and typecheck passed. Synthetic browser flow: queue → patient → select two photos → comparison/zoom/reset/Escape → mark reviewed → return to empty queue. Dates and reviewer timestamp visible. Desktop dark appearance inspected; 390px document/dialog widths checked without overflow. No fresh light/VoiceOver matrix.
- iOS: signed iPhone 17 Simulator build and 11 focused review/account-boundary tests passed. One Simulator launch/preflight failure passed on retry. Shared-detail UI is code/build/test verified; no new camera or physical-device walkthrough.
- API: real loopback synthetic checks cover role/assignment and batch ownership, immutable concurrent/repeated acknowledgement, queue grouping/order/paging, reassignment, patient-visible status and Data API denial. The later deletion compatibility tests cover preserved originals for reviewed photos and owned cleanup retry. Exact fixture identities/objects are tracked privately and cleaned after use.

Detailed final test totals and hosted deployment state are recorded at release below. Retained hosted demo data is preserved. Account deletion/clinical retention, review coverage/support, and distribution remain separate pilot decisions.

Final local results: 143 backend tests passed; the three migration-chain tests also pass after adding a regression check that every Prisma application table is included in the recovery archive. The real API fixture passed seven groups including deletion/cleanup retry, then removed its exact actors and rows. Retained browser fixtures were signed out and removed with their exact storage objects. Portal 69 and iOS 11 results above remain valid; those client sources did not change during the deletion fix.

Known operational limit: pending object cleanup is retried through the existing DELETE endpoint; no background cleanup worker is included. New review/cleanup tables are included in recovery snapshots and dumps. The canonical recovery fixture requires these new tables to be empty, so this release does not claim a populated-review restore drill. Upload completion now checks cleanup and rechecks object existence under the same patient lock.

## Hosted release — September 13, 2026

PR #10 merged as `9fb3ef5e0b271c530cef9ce70ad94c1d8aacb165` after all GitHub checks passed, including recovery. API source is `68c13a70cd5ceae9235c572440a2fa43ceec5693`, built from a clean Git archive without local configuration; deployment `dpl_2mWhXKuvdsXV5YCcKqbEBN3mSRJi` (`clearaf-dvebs5ul2-arluigis-projects.vercel.app`) was promoted after checks passed. Prior rollback target is `clearaf-qktmt83ob-arluigis-projects.vercel.app`.

Both additive migrations are applied to the existing demo project: `20260913220545_photo_reviews` and `20260913221220_photo_cleanup`. MCP-generated ledger versions were normalized to the exact repository versions after successful application. RLS is enabled and anon/authenticated table privileges remain denied on both tables. Existing data was preserved; the owner had already identified hosted data as disposable.

Portal deployment `dpl_7Q67CECbM19chnnV2Wm89B5zGRfK` (`clearaf-portal-e2plb15ij-arluigis-projects.vercel.app`) is READY at merge commit `9fb3ef5`. Hosted API health/readiness pass. The retained synthetic clinician sees the existing demo upload in the new review queue. No new photo/review was added to the hosted demo by this verification. iOS source is merged and Simulator-verified; the physical iPhone is not reinstalled in this slice.
