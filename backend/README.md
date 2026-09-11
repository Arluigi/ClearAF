# ClearAF API

Express API deployed to Vercel, with Supabase Auth, PostgreSQL and private photo storage.

Follow the [development and recovery runbook](../docs/baseline/README.md) for local setup, canonical migrations, testing and deployment. The historical Prisma migration chain is archived and must not be replayed.

- `npm ci` — install pinned dependencies and generate Prisma client.
- `npm run dev` — local server after root local setup.
- `npm test` — backend regression tests.
- `npm run build` — production compile.
- `npm audit` — all dependency audit.
- `npm run db:status` — local Supabase migration status.
- `npm run db:migrate` / `npm run db:deploy` — apply reviewed migrations locally only.

`/health` is liveness; `/ready` checks database, auth and private storage. Clinical routes require a confirmed active session and enforce patient ownership/current clinician assignment. Environment variables belong in ignored local configuration or the hosting provider, never source control.
