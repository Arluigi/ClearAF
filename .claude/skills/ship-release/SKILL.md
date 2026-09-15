---
name: ship-release
description: Use when asked to deploy, release or ship ClearAF, or to apply a migration to the hosted database. Covers rollback target, Vercel API deploy, portal confirmation, /health and /ready checks, focused verification and the sanitized release record. Every production action still needs explicit user approval.
argument-hint: "[feature name]"
---

# Ship a ClearAF release

Deploys what is on `main` for the feature named in `$ARGUMENTS`. Source of truth for the procedure: docs/baseline/README.md "Deployment and rollback". Every production action below needs the user's explicit go-ahead in this session. Stop and report if any check fails.

## 1. Preflight

- `git status --short` is clean and `git rev-parse HEAD` equals `origin/main`. Record the SHA.
- The feature's PR is merged and CI is green: `gh run list --branch main --limit 3`.
- Verify the Vercel scope with `vercel whoami` and the linked project in `backend/.vercel/project.json` (`clearaf-api`). Don't guess team or project IDs.

## 2. Rollback target

- `vercel ls clearaf-api --prod` and `vercel inspect <current-production-url>`. Record the deployment ID and immutable URL.
- Confirm the rollback target is compatible with the database after this release. Additive tables are fine; renamed or dropped columns are not.

## 3. Hosted migration (only if the release adds SQL)

- List pending files: compare `supabase/migrations/` with the release record of the last deploy.
- Required before applying: a recoverable database + storage backup (the Free plan has no managed backups, so ask how the user wants it taken) and the user's explicit approval for this migration.
- Prefer `npx --yes supabase@2.117.0 db push --linked --dry-run`, then without `--dry-run`. The ledger version must equal the repo filename timestamp. A past MCP-applied migration got a generated version that had to be normalized, so don't use the MCP.
- Afterwards, verify the new tables have RLS enabled and no anon/authenticated grants.

## 4. Deploy

- API: `cd backend && vercel --prod`. Record the new deployment ID/URL.
- Portal: deploys automatically from `main`. Confirm with `vercel ls clearaf-portal --prod` that the deployment's commit matches the SHA.
- Check `curl -fsS https://clearaf-api.vercel.app/health` and `/ready`. On failure, pull the errors with `vercel logs <url> --level error`, then decide with the user whether to roll back: `vercel rollback <verified-url> --yes`.

## 5. Focused verification

Run only the checks that cover this feature, following docs/handoff/verification-workflow.md: authenticated happy path, anonymous denial and cross-account denial against the hosted API. Use synthetic accounts and remove them afterwards with exact-identity cleanup. Don't repeat the full device/accessibility matrix.

## 6. Record

Write or update `docs/features/<feature>-verification.md` (or a `docs/<area>/release-<date>.md`) with: source SHA and PR, API deployment ID + immutable URL + alias, portal deployment, rollback target, migration filename + SHA-256 if any, checks run and their results, known limitations. Add a one-line pointer in docs/handoff/README.md.

Keep it sanitized: no credentials, tokens, account emails, photos or signing artifacts. Deployment IDs are fine; gitleaks may flag them, so add exact-fingerprint entries to `.gitleaksignore` only if needed.

Commit on a branch, open a PR and merge after CI passes (matching the "Record deployed ... release" commits in history).
