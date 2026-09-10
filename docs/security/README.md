# ClearAF security foundation — 10 September 2026

## Deployment

- API: https://clearaf-api.vercel.app
- Clinician portal: https://clearaf-portal.vercel.app
- Supabase remains the authentication, database and private storage provider.
- The previous Render web service is suspended. GitHub Pages has not been enabled; reserve it for public informational content.
- Vercel projects are currently deployed with the CLI from the security worktree, not automatically from GitHub.

## Security boundary

The server verifies Supabase identity, confirmed email and an active auth session before resolving clinical roles from the database. Client roles cannot directly access the 11 application tables or photo storage. Clinician routes require the patient's current assignment. Public reassignment and arbitrary photo/attachment URLs are disabled.

Photos stay private. Authorized API responses issue five-minute download links. Larger iOS uploads go directly to a server-selected private Storage path, then finalize through the API; concurrent completion creates one record and updates scores once. Existing public-format database URLs are interpreted only when they belong to the correct owner and configured storage project.

## Verification

- 49 backend tests and 9 portal tests pass.
- Backend and portal production builds, portal type checking and lint pass; 42 existing lint warnings remain.
- Production dependency audits report zero known vulnerabilities for both services at verification time.
- Xcode Simulator build and unit tests pass: three upload-security tests plus the existing test.
- 27 live synthetic test groups pass: authenticated access, cross-account denial, direct table/storage denial, private links and expiry, 5 MB uploads, concurrent completion, revoked sessions and signup trigger.
- Browser: clinician sign-in, assigned patient gallery, logout, and logged-out route protection verified. An initial sign-in attempt during deployment transition failed; reloading and signing in succeeded.
- Old Render health endpoint returns 503; Vercel rejects the retired WebSocket endpoint.

## Credential retirement

The database password committed in old history belongs to a deleted Render database, not the active Supabase database. The old resource no longer exists and connection attempts fail. Two working publicly documented development account passwords were replaced with random passwords and their sessions revoked; the old passwords are rejected. Current secrets and dependencies are no longer tracked. Legacy account utilities now require an explicitly supplied unique password.

## Operations

`backend/scripts/security-live.cjs prepare|verify|cleanup` creates and removes its own synthetic fixtures. Use authorized backend environment variables; fixture state contains secrets and is stored outside the repository. Never commit it. The live suite deliberately exercises authorization against the configured environment and is not part of ordinary CI.

The SQL migration `20260910175558_restrict_clinical_data_access.sql` was rehearsed in a rolled-back transaction, then applied through the existing authorized database connection. The photo bucket was separately made private with the Storage API. Do not replay the legacy Prisma migration history against the existing database. Reconcile migration history before introducing the next schema change.

## Remaining work

This milestone is not release approval. Account-scoped iOS local data, complete onboarding and recovery, clinical workflow validation, UI overhaul and the remaining audit items still need work. Supabase also reports password-leak protection, MFA configuration and a database patch update as follow-up hardening. A clinician onboarding/recovery process is needed before real use; retired development passwords must not be reused.
