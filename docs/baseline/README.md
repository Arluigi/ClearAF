# ClearAF development and recovery baseline

## Local setup

Verified on Node 24.4.0, npm lockfiles, Xcode 26.6 and iOS 26.5 Simulator. Supabase CLI is pinned to 2.117.0 and selects PostgreSQL 17.6.1.167 for local services. Production currently uses PostgreSQL 17.4. Production is not a development database.

1. Install Node 24, Xcode with an iOS Simulator, and Docker-compatible containers. On this Mac, `brew install colima docker libpq` and `colima start clearaf --cpu 2 --memory 3 --disk 8 --root-disk 8 --activate=false` were used. The setup scripts detect that dedicated Colima socket; Docker Desktop/CI can use their existing Docker context.
2. Run `npm ci` in `backend` and `web-portal`.
3. From the repository root, run `node scripts/local.cjs start`. It starts only the required Supabase services and writes ignored local configuration for the backend, portal and iOS. It captures credentials without printing them. Allow several GB for initial container images and Xcode builds.
4. Run `npm run dev` in `backend` and `web-portal`. The API is on port 3001 and portal on 3000; local Supabase is on 54321 and Postgres on 54322. Open the Xcode project and run Debug in Simulator.
5. Stop local Supabase with `node scripts/local.cjs stop`; data is retained.

Debug uses the distinct `com.aryansachdev.ClearAF.dev` app and local endpoints. The generated local anon key is required; there is no production fallback. Release uses production HTTPS endpoints, a production public anon key, and the original app ID. Neither client contains service-role credentials. Do not copy production `.env` files into the local checkout. The configuration generator refuses to overwrite an existing nonlocal backend configuration.

## Physical iPhone Debug connection

Keep the standard API on 3001 for Simulator and portal tests. With local setup complete and the phone on the same trusted network as this Mac, start a second API from the repository root:

```sh
node scripts/device-local.cjs Aryans-MacBook-Pro.local
```

The script verifies that the single Bonjour hostname resolves only to this Mac, checks the existing loopback development database/API configuration, and overrides only the child API's `PORT=3002` and `SUPABASE_URL=http://Aryans-MacBook-Pro.local:54321`. It retains the local keys in memory, never writes credentials or edits `.env`, and forwards termination to its child. Stop it with Ctrl-C when testing ends. Local Supabase remains on 54321; allow the Debug app's local network permission on the phone.

Build **Debug** with `CLEARAF_LOCAL_DEVICE_HOST=Aryans-MacBook-Pro.local` as an Xcode build setting (or in ignored `ClearAF/Config/Local.generated.xcconfig`). An empty value preserves Simulator loopback. For example, append that setting to the existing `xcodebuild -configuration Debug -destination 'id=<device-udid>'` command. The strict single-label `.local` grammar rejects URLs, ports, public domains, subdomains and malformed labels. Release ignores this setting and contains no local-network usage description. Do not launch Release for local acceptance. Regenerating local configuration resets the optional host; the generated anon key remains required.

Physical acceptance must separately record camera allow/deny/Settings recovery, system photo picker selection/cancel, local-network permission and authenticated sharing. Simulator camera-unavailable checks do not establish physical camera acceptance. The account signup UI test's Mailpit loopback helper runs only in Simulator; use a preconfirmed synthetic fixture for a physical device.

## Database changes

Supabase migrations are the only active migration chain. `supabase/migrations/20260910183704_application_baseline.sql` represents the verified application schema and security boundary. `supabase/baseline.json` binds the reviewed file, ledger statements and schema fingerprint. The destructive old Prisma chain is archived under `supabase/legacy-migrations` and must never be replayed.

The live application schema was compared with local columns, constraints, indexes, ownership, RLS, policies, effective grants, postgres default privileges, signup function/trigger and private photo bucket. Exact parity was verified before metadata-only reconciliation. Production now records the canonical baseline in `supabase_migrations.schema_migrations`; the historical Prisma ledger was preserved. No application DDL or patient data was changed by reconciliation.

For a new change, create a migration with `npx --yes supabase@2.117.0 migration new descriptive_name`, review its SQL and apply locally with `npm run db:migrate` in `backend`. `db:deploy` is deliberately local-only too. Run `npm run db:status` to inspect local history. Production schema changes require a reviewed SQL change, a recoverable backup, local data-preservation tests and an explicit production deployment procedure. Do not use Prisma migrate reset/deploy against this database.

`backend/scripts/schema-baseline.cjs` is a one-time, guarded baseline reconciliation utility, not a general production migrator. The reference configuration is explicitly supplied via `SCHEMA_REFERENCE_ENV`; its default mode is read-only. It verifies approved fingerprints before any metadata mutation and checks the exact ledger and unchanged schema inside the transaction. New migrations require a new reviewed comparison strategy rather than bypassing its immutable-baseline check.

## Verification

From `backend`: `npm test`, `npm run build`, `npm audit`.
From `web-portal`: `npm test`, `npm run lint`, `npm run build`, `npm run typecheck`, `npm audit`.
From root after local setup and backend build: `node scripts/recovery.cjs`.

The recovery command creates only named synthetic accounts. It tests real local Auth/Storage/API authorization, commits and reverses a test schema change, captures a quiescent backup, starts a fresh disposable destination, restores and compares records/bytes, verifies sign-in and access restrictions, then restores the original local stack and removes its synthetic fixtures. Failure paths retain volumes for investigation and attempt to restart the original stack. All destructive utilities reject nonloopback targets and connection-string query overrides. Docker database tools must prove they address the same database instance as the checked connection.

GitHub Actions runs backend and portal checks, full npm dependency audits, pinned secret scanning for commits after the audited T0 baseline, source hygiene, and the real local database/recovery drill. Historical public anon keys are not server secrets. The known historical database credential was already retired in T0. Generated `.local` files, `.env` files and iOS local key configuration must never be committed or uploaded as CI artifacts.

## Backup and restore boundaries

The verified drill backs up synthetic application rows, auth users/identities and actual private storage bytes. A checksummed manifest binds the archive, fixture credentials, row snapshots and object files. Missing or corrupt files fail before mutation. Restore requires a fresh empty destination with the same baseline. PostgreSQL data restoration uses one transaction, stops on errors and sets replication-role behavior only in that restore connection; it does not weaken persistent trigger settings.

For hosted disaster recovery, coordinate a maintenance window/write quiescence and take encrypted, access-restricted database and object backups. A database backup alone does not include photo bytes. Preserve the migration ledger, custom signup trigger/function, security policies and private bucket configuration. Provider-managed configuration, encryption keys, external integrations, environment secrets and auth sessions need separate handling; this synthetic drill does not prove recovery of those hosted resources. Restore identities, require fresh sessions, restore object bytes to their original paths, then verify constraints, fingerprints, sign-in and authorization before reopening writes. Never restore production patient records into an ordinary development machine.

References: [Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Vercel rollback](https://vercel.com/docs/instant-rollback).

## Deployment and rollback

Vercel projects are `clearaf-api` and `clearaf-portal`. Production environment settings remain in Vercel. Local dotenv files are excluded from uploads. The API is deployed explicitly from `backend` using `vercel --prod`. The portal is Git-connected with root directory `web-portal` and deploys automatically when `main` changes. Hosted portal previews are disabled until a separate hosted test backend exists; local testing remains available. For a manual portal deployment, run the CLI from the repository root with the portal project/team IDs in VERCEL_PROJECT_ID and VERCEL_ORG_ID. The root .vercelignore excludes local data, credentials, iOS sources and internal documents.

Before deployment, save the immutable current deployment ID/URL with `vercel inspect`. Verify the rollback target includes the security boundary and is compatible with the existing database. Roll back with `vercel rollback <verified-deployment-url> --yes`, then verify health and authenticated authorization. Restore the new deployment with `vercel promote <new-deployment-url> --yes` and check `/ready`. A code rollback does not restore database state; never roll back the T0 access restrictions. If recovery checks fail, stop further releases and return to the last verified secure version.

The API exposes `/health` for process liveness and `/ready` for actual database/Auth/private-storage readiness. Readiness has bounded connections, safe minimal responses and short instance caching; it never reads clinical records. These endpoints are a starting point, not a complete monitoring/on-call service.
