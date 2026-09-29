# multer advisory fix: API release, September 28, 2026

On September 28, 2026 the backend CI `npm audit --audit-level=low` gate began failing on [GHSA-3pph-fpjx-jg34](https://github.com/advisories/GHSA-3pph-fpjx-jg34). It affects multer 2.2.0–2.3.0: a denial of service through orphaned disk writes on aborted uploads. [PR #33](https://github.com/Arluigi/ClearAF/pull/33) bumps `multer` to `^2.4.0` (lockfile: 2.4.0; multer's old `concat-stream` chain dropped). It merged as `bf2d773`, and branch CI passed on every check, backend included. The photo route uses `multer.memoryStorage()`, so the disk-write path was not reachable in production. The deploy is hygiene, not an incident response. The owner explicitly approved the production deploy in-session.

| Component | Immutable deployment | Source | Verification |
|---|---|---|---|
| API | `dpl_HsmsKHh9wrHxiWW1kwy1JLU2U3F1` / `clearaf-rok7cfndt-arluigis-projects.vercel.app`, alias `clearaf-api.vercel.app` | `bf2d773`, `vercel --prod` from `backend/` on a clean `main` (`.vercelignore` excludes `.env*`) | Vercel READY; `/health` 200; `/ready` 200 `{"status":"ready"}`; unauthenticated `POST /api/photos/upload` 401; no error-level runtime logs after deploy |
| Portal | unchanged by this release (auto-deploys from `main`) | — | — |

**Rollback target**, recorded before deploying: `dpl_5MzdRPyAgutfdZBeLBycmUUKkBTf` / `clearaf-77k87ff31-arluigis-projects.vercel.app` (September 24, message limit, #28). No migration since, so it stays compatible with the database. Roll back with `vercel rollback clearaf-77k87ff31-arluigis-projects.vercel.app --yes --scope arluigis-projects`, then recheck `/health` and `/ready`.

**Checks:** `npm audit` 0 vulnerabilities; `npm test` 234/234, including the `photo-capture` and `security` upload suites; `npm run build` clean.

**Not done:** no authenticated upload against production. The live scripts refuse non-local targets, and no synthetic production account was created for a dependency bump. No migration.
