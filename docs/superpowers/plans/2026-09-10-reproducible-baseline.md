# ClearAF T1 Reproducible Baseline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. The user authorized autonomous execution of this phase; no additional design approval is required.

**Goal:** Build, test, deploy and recover ClearAF repeatably without using production as the development database.

**Architecture:** Use a pinned local Supabase stack containing real Postgres/Auth/Storage/REST, populated only with synthetic fixtures. Derive an application baseline from read-only production schema metadata; archive destructive legacy migrations and maintain one active migration chain. Explicit environment settings select local or production services. Separate liveness from dependency readiness and demonstrate deployment rollback using only verified secure releases.

**Tech Stack:** Swift/Xcode, Node 24, Prisma 5, Supabase CLI 2.117.0, PostgreSQL 17, Colima/Docker, Vercel, GitHub Actions.

## Chunk 1: Isolation and observability

- [ ] Establish fresh worktree from merged main; clean npm installs and existing tests.
- [ ] Install local container/Postgres tools within available disk space; configure minimal Supabase stack, excluding unused UI/logging/realtime components.
- [ ] Add checked-in local configuration and ignored generated local credentials. Never copy production secrets into local defaults.
- [ ] Configure iOS local Debug/production Release endpoints with a distinct development bundle ID. Upload URL validation follows the configured origin; loopback HTTP is allowed only in Debug. Add environment and origin regression tests.
- [ ] Implement `/health` liveness and `/ready` dependency readiness with bounded database/auth/private-storage probes, cache/no-store behavior, safe public output and timeout/failure tests. No clinical reads or writes in probes.

Files: `supabase/config.toml`, `scripts/`, `ClearAF/Config/`, `ClearAF/Services/APIService.swift`, `ClearAF.xcodeproj/project.pbxproj`, `ClearAFTests/`, `backend/src/services/readiness.ts`, `backend/src/server.ts`, `backend/tests/readiness.test.ts`.

## Chunk 2: Database baseline and recovery

- [ ] Read production schema, constraints, trigger definitions and migration metadata only. Compare Prisma native types and defaults to real schema.
- [ ] Generate a reviewed baseline migration from schema-only export. Preserve auth signup trigger and deny-by-default clinical permissions; configure private storage bucket for local setup.
- [ ] Archive unsafe legacy Prisma migrations outside active migration directories and replace deployment scripts with the canonical guarded workflow.
- [ ] Apply the baseline to disposable local Supabase. Verify schema parity, signup, assignment and the prior live authorization suite on local services.
- [ ] Reconcile existing production migration history only after verifying its schema matches the baseline; no replay or data changes.
- [ ] Implement guarded local backup/restore drill covering synthetic clinical rows, auth identities, private storage object bytes and migration metadata. Back up, make a controlled change, restore and compare digests/access. Refuse nonlocal destructive targets.
- [ ] Exercise a forward migration with seeded data and rollback of that migration in a disposable database. Record preserved row counts and constraints.

Files: `supabase/migrations/`, `supabase/legacy-migrations/`, `backend/prisma/schema.prisma`, `backend/package.json`, `backend/scripts/`, `scripts/`, `docs/baseline/`.

## Chunk 3: Clean builds, deployments and handoff

- [ ] Verify clean backend/portal installs, tests, type checks, production builds and audits without production credentials.
- [ ] Build/test iOS from this clean checkout using local configuration and verify Release configuration points only to production.
- [ ] Extend CI with pinned supported actions, secret scan and repeatable database verification where practical. Keep secrets out of logs and artifacts.
- [ ] Deploy readiness changes to Vercel and verify dependencies. Demonstrate rollback to a known secure deployment, then restore the new deployment; do not roll back the database security boundary.
- [ ] Write local setup, migration, backup/restore and deployment rollback runbooks with observed results and limitations.
- [ ] Review, run final checks, push a tested branch and create a draft PR. Preserve the original user's checkout and prior reports.

Acceptance: all items above have evidence. No real patient data is copied into the local test stack. Hosted disaster recovery requires the documented full database/auth/storage backup process; distinguish the synthetic drill from a restoration of actual production data. If machine capacity prevents a complete local stack, use the available isolation alternative and document the exact remaining gate rather than claiming full verification.

### Review gates adopted

- Canonical future ledger is Supabase; preserve the historical Prisma ledger/table as evidence. Archive every old executable migration. Baseline reconciliation must compare columns, constraints, indexes, RLS/policies, effective grants, postgres default ACLs, function ownership/security/search path, auth trigger and private bucket; compare fingerprints before/after metadata-only reconciliation. Fail closed on drift.
- Recovery destination is fresh and disposable, including fresh Auth/Storage services. Verify login/signup, relationships, object bytes, ledger and authorization after restore. Use a manifest and refuse missing/corrupted objects; no writes during backup drill. Document managed secrets/configuration and sessions separately from identities.
- Rollback only to the immutable secure T0 deployment; record IDs, check dependency/auth behavior on both versions, then restore T1. Database rollback must never revert access restrictions.
- CI must apply the baseline on disposable services and test its authorization/restore behavior. Record exact tools, distinguish executable results from documented hosted recovery procedures, and scan generated config/artifacts without printing secrets.
