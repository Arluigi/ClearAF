# Letterpress PR 7: iOS photo Compare verification

Synthetic demo only. Recorded 2026-09-17.

## Release

| Item | Value |
|---|---|
| Source | branch `design/letterpress-7-compare`, merged as the "Letterpress 1.0 (7/8)" PR |
| API deployment | `dpl_8EEpjKpWDVRRwJ3EHJDF8yH5r8Cz`, `https://clearaf-45xrsat3i-arluigis-projects.vercel.app`, alias `clearaf-api.vercel.app` |
| Rollback target | `dpl_4eDj2iy9HLiigNs3HiG1Ei425Cbk` (the PR 5 workspace release; compatible, since this release only adds a read-only endpoint) |
| Portal | unchanged by this release |
| Migrations | none |

## New endpoint

`GET /api/care-support/timeline?from&to&timeZone`, patients only. The patient comes from the session and the route takes no patient parameter at all, so another patient's records are structurally unreachable. Strict validation, a bounded date range, and no writes.

## Checks

| Check | Result |
|---|---|
| Backend tests and build | 227/227, clean |
| iOS `ClearAFTests` and UI target build | 213 pass, 1 pre-existing skip |
| Endpoint against the local stack: own account 200, anonymous 401, cross-patient unreachable, clinician 403 | PASS |
| Simulator: empty states, Grid/List/Compare switching, light and dark, largest accessibility size, Reduce Motion | PASS |
| Whole-branch Opus review | Findings fixed: Compare's entry could present and dismiss in a loop; the timeline could briefly describe the previous pair; plus nine cleanups |
| Hosted `/health`, `/ready`, anonymous timeline | 200, 200, 401 |

## Limitations

- **Compare with two real photos was not exercised on this machine.** The Simulator's photo picker is broken under Xcode 27 with macOS 26.6, and photos sync device→server only, so a server fixture can't seed the device. Side by side, overlay, flip, the filmstrip and the timeline are covered by unit and source tests, and the owner is checking them on their phone.
- Deferred and recorded in `docs/design/letterpress/deferred.md`: the timeline query materialises rows to count them and doesn't cap the revision read, and `CareFormResponse.submittedAt` has no supporting index (both need changes out of scope here).
