# Letterpress PR 4: portal worklist verification

Synthetic demo only. Recorded 2026-09-17.

## Release

| Item | Value |
|---|---|
| Source | branch `design/letterpress-4-worklist` at `2180761`, merged as the "Letterpress 1.0 (4/8)" PR |
| API deployment | `dpl_7Vm3LVQ8ubkBCoA9zbVpBuVBa38N`, `https://clearaf-mihc0qyo7-arluigis-projects.vercel.app`, alias `clearaf-api.vercel.app` |
| Rollback target | `dpl_3bziJG78mEgwkqvfG3kBviagG7nc`, `https://clearaf-jl8zjegl6-arluigis-projects.vercel.app` (compatible: the release adds only a read-only endpoint) |
| Portal | auto-deploys from `main` on merge |
| Migrations | none |

The API was deployed before the portal merge so the new `/patients` worklist never meets an older API in production. If it does, the portal detects the catch-all 404 and shows the previous patient list.

## New endpoint

`GET /api/worklist?localDate&filter=needs-review|all|flagged&page&limit&search`, clinicians only. Every query is scoped to the clinician's currently assigned patients. The fixed query count doesn't grow with page size, and the response contains no message, check-in or urgent-report text.

## Checks

| Check | Result |
|---|---|
| Backend tests and build | 221/221, build clean |
| Portal tests, lint, typecheck, build | 178/178, clean |
| Local live probe (`backend/scripts/worklist-live.cjs`): assigned scope, cross-clinician denial, patient denial, validation, adherence, cleanup | 9/9 PASS, cleanup verified |
| Playwright on local stack: counts, three filters, search, keyboard, dark mode and 390px width, fake-404 fallback, workspace back-link keeps filter | pass; row attention bar defect found and fixed in `2180761` |
| Reviews: per-task (API scoping, client/controller), care-access and api-contract agents, whole-branch Opus review | findings fixed: adherence slot counting, bar CSS not generated, empty page past end, row bar selector |
| Hosted `/health`, `/ready` after deploy | 200, 200 |
| Hosted anonymous `GET /api/worklist` | 401 (was 404 before deploy) |

## Limitations

- The hosted authenticated happy path was not exercised. It was verified on the local stack with synthetic accounts; production holds no synthetic clinician for this release.
- On an older API, the new layout shows briefly in its loading state before the legacy list replaces it.
