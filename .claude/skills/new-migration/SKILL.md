---
name: new-migration
description: Use for any ClearAF database schema change (new table, column, index, constraint). Creates and locally applies a Supabase SQL migration following the project's RLS, Prisma-mapping and recovery-drill rules.
argument-hint: "<descriptive_snake_case_name>"
---

# New Supabase migration

Creates a migration named `$ARGUMENTS`. Rules come from docs/baseline/README.md "Database changes". This skill only touches the local stack; hosted application goes through `/ship-release`.

## 1. Preconditions

- Local stack running (`node scripts/local.cjs start`) and `cd backend && npm run db:status` shows every committed migration applied.
- Never edit a committed migration, `supabase/baseline.json` or `supabase/legacy-migrations/`. Never run `prisma migrate`, `prisma db push` or a reset. The guard hook blocks these.

## 2. Create

```sh
npx --yes supabase@2.117.0 migration new $ARGUMENTS
```

Keep the CLI pinned to 2.117.0 (CI and the recovery drill use it).

## 3. Write the SQL

Changes are additive and data-preserving. Existing data belongs to the hosted demo and must survive. Match the style of `supabase/migrations/20260913225004_assigned_messages.sql`:

- `uuid` primary keys; camelCase columns are double-quoted (`"patientId"`), matching the Prisma-mapped schema; `timestamp(3)` with `DEFAULT CURRENT_TIMESTAMP`.
- Foreign keys to `public.user_profiles(id)` / `public.dermatologists(id)` with `ON DELETE RESTRICT` (clinical records are not cascade-deleted; retention policy is unapproved).
- Encode invariants as `CHECK` constraints (lengths, enums, sender/recipient consistency) rather than trusting the API alone.
- Add indexes for the API's actual pagination order (for example `(... "sentAt" DESC, id DESC)`).
- Every new table ends with:

```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.<table> FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.<table> TO service_role;
```

Clients never access tables directly; all access goes through the API.

## 4. Wire it into the backend

For each new table:
- Add a Prisma model with `@@map("<table>")` in `backend/prisma/schema.prisma`, then `cd backend && npx prisma generate`. Services query through Prisma transactions.
- Add the table to the `tables` list exported as `applicationTables` in `backend/scripts/recovery-drill.cjs`. `backend/tests/migration-chain.test.ts` fails if a mapped table is missing from recovery.

## 5. Apply and verify locally

```sh
cd backend && npm run db:migrate && npm run db:status
npm test          # includes migration-chain.test.ts
npm run build
```

Confirm RLS and grants on the local database:

```sh
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -XAt -c "select relname, relrowsecurity from pg_class where relname='<table>'" -c "select grantee, privilege_type from information_schema.role_table_grants where table_name='<table>' and grantee in ('anon','authenticated')"
```

Expect `relrowsecurity = t` and no anon/authenticated grants.

If the change touches existing tables or data, run `node scripts/recovery.cjs` from the root (after `npm run build`) to prove backup/restore still round-trips.

## 6. Hand off

Report the migration filename, its SHA-256 (`shasum -a 256 <file>`), and what it adds. Commit it with the feature. Hosted application needs a backup and the user's explicit approval; use `/ship-release`.
