# Letterpress PR 5: portal patient workspace verification

Synthetic demo only. Recorded 2026-09-17.

## Release

| Item | Value |
|---|---|
| Source | branch `design/letterpress-5-workspace`, merged as the "Letterpress 1.0 (5/8)" PR |
| API deployment | `dpl_4eDj2iy9HLiigNs3HiG1Ei425Cbk`, `https://clearaf-6fzpx3igl-arluigis-projects.vercel.app`, alias `clearaf-api.vercel.app` |
| Rollback target | `dpl_7Vm3LVQ8ubkBCoA9zbVpBuVBa38N` (the PR 4 worklist release; compatible, since this release only adds a read-only endpoint) |
| Portal | auto-deploys from `main` on merge |
| Migrations | none |

The API was deployed before the portal merge. If the order ever slips, the workspace shows "Earlier versions are not available from this server yet." instead of an error.

## New endpoint

`GET /api/routines/patients/:patientId/revisions?timeOfDay&page&limit`, clinicians only. It reuses the same patient lock and assignment check as the existing completions route, returns the existing revision shape newest-first, and writes nothing.

## Checks

| Check | Result |
|---|---|
| Backend tests and build | 223/223, build clean |
| Portal tests, lint, typecheck, build | 236/236, clean, 18/18 pages |
| Reviews: per-task (tabs and photos, routine and check-ins), whole-branch Opus review, `care-access-reviewer` on the full diff, `api-contract-checker` on the endpoint | PASS; the review's findings were fixed before merge |
| Browser pass on the local stack, light and dark, 1280px and 390px: five workspace tabs, tab URLs with reload and back/forward, messages, templates with archive, sign-in and password pages, account, dashboard, appointments, prescriptions, settings | PASS, no product defects, 30 screenshots |
| Behaviour checks: message draft survives a tab switch, send-and-mark partial failure retries only the failed half, Compare recovers from a failed original, template copy asks before replacing unsaved edits, older-API fallback | PASS |
| Keyboard focus visible (2px ink ring) | PASS |
| Hosted `/health`, `/ready` after deploy | 200, 200 |
| Hosted anonymous requests to both new endpoints | 401 |

## Limitations

- The hosted authenticated path was not exercised; it was verified against the local stack with synthetic accounts.
- A failed "Send & mark reviewed" shows both the mark-failed sentence and the standalone review error. Consistent, but wordier than needed.
- Deferred and recorded in `docs/design/letterpress/deferred.md`: check-in response rate and schedule, template "in use", message search, overlay and grid compare, bulk mark reviewed, and account profile editing.
