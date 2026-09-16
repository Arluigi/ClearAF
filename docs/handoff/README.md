# New-laptop handoff

September 13 update: PRs #1–5 are merged; T0–T4 are complete with the documented T4 limitations. The hosted routine migration and API are deployed, and the physical Release app passed the synthetic phone/portal demo. See [demo release and reinstall instructions](../mvp/release-2026-09-13.md), [MVP verification](../mvp/README.md), and [new-Mac verification](2026-09-12-new-mac.md). T5 pilot readiness remains separate; distribution is on hold. Historical stacked-branch and no-deployment statements below describe the September 11 transfer snapshot.

Prepared September 11, 2026. T2 implementation and verification are recorded in the [account reliability report](../accounts/README.md). No T2 production deployment occurred. See the [T2 plan](../superpowers/plans/2026-09-10-account-reliability.md), [baseline and recovery procedure](../baseline/README.md), and [security notes](../security/README.md).

Design update: the first [Care Journal iPhone pass](../design/ios-care-journal.md) applies the [approved design language](../design/design-language.md) to Today, Photos and Routines. Portal migration is a separate follow-up. The demo iPhone runs the current build (confirmed by the owner on September 15, 2026).

Client expansion: see [client expansion](../features/client-expansion.md) for the September 2026 release plan (enrollment and safety, intake and orders, follow-up and renewal).

## Preserve the old laptop first

The original `/Users/aryansachdev/code/ClearAF` checkout has user work and private documents that are not represented by a fresh Git clone. Preserve them in an encrypted, access-controlled backup before replacing or wiping the laptop. A Git bundle or pushed branch does not preserve untracked/ignored files or uncommitted edits. Keep private documents out of GitHub and deployment uploads. Do not reset, clean, stash indiscriminately, delete worktrees, or copy production secrets into development configuration.

At preparation time, the worktree inventory was:

| Old location | Branch | HEAD at inspection | Purpose |
| --- | --- | --- | --- |
| `ClearAF` | `main` | `2ac409f` | Original checkout; preserve user changes/private documents |
| `ClearAF-security` | `codex/security-foundation` | `ab7861d` | T0 security work |
| `ClearAF-baseline` | `codex/reproducible-baseline` | `ead5ef3` | T1, draft PR #2 |
| `ClearAF-accounts` | `codex/account-reliability` | `ead5ef3` | T2 branch based on T1 |

These locations share Git metadata. Copying a linked worktree alone does not create a portable repository: its `.git` file points back to the original checkout. Prefer a fresh clone plus published branches for committed code, and separately preserve the original checkout's uncommitted/private material. The published branch is `codex/account-reliability`; verify its tip with `git rev-parse HEAD` after checkout. The protected transfer manifest records the final commit and review URL. Retain a protected backup of any remaining uncommitted work. Recheck `git status --short` and `git worktree list`; this table is a snapshot.

## Fresh setup

1. Install Git, Node 24 with npm, Xcode and an iOS Simulator runtime, and a Docker-compatible runtime. The baseline used Node 24.4.0, Xcode 26.6 and iOS 26.5 Simulator. Supabase CLI is pinned by the scripts to 2.117.0. Open Xcode once to finish installation and choose its command-line tools.
2. Authenticate GitHub, clone `https://github.com/Arluigi/ClearAF.git`, and use the latest `main`. For an existing checkout, preserve local work before fetching and updating; do not reset or clean it indiscriminately.
3. Install dependencies separately:

   ```sh
   cd backend
   npm ci
   cd ../web-portal
   npm ci
   cd ..
   ```

4. For the dedicated Colima setup used here:

   ```sh
   brew install colima docker libpq
   colima start clearaf --cpu 2 --memory 3 --disk 8 --root-disk 8 --activate=false
   node scripts/local.cjs start
   ```

   The script detects `~/.colima/clearaf/docker.sock`; Docker Desktop can use its existing context instead. Only run one checkout's local stack at a time because the ports overlap. The VM disk flags are capacities, not a promise that the entire toolchain fits in 12 GB. With approximately 8 GB free at the end of verification on the old laptop, avoid duplicate dependency installations, simulator runtimes and container images. Move protected backups to external storage and check available space before builds. Do not reclaim space by deleting unreviewed work, private files, or database volumes.

5. In separate terminals run `npm run dev` from `backend` and `web-portal`. API: `http://127.0.0.1:3001`; portal: `http://localhost:3000`; local Supabase: port 54321; Postgres: 54322; captured local confirmation/recovery email: `http://127.0.0.1:54324`.
6. Open `ClearAF.xcodeproj`, select the ClearAF scheme, Debug configuration and an available iPhone Simulator. Local setup generates `ClearAF/Config/Local.generated.xcconfig`; it must exist before running Debug. Debug has a separate `com.aryansachdev.ClearAF.dev` app identity and local endpoints. Release uses production endpoints and must not be used for synthetic local tests. Device signing may require selecting the authorized Apple development team on the new Mac.
7. Stop services with `node scripts/local.cjs stop`; local data is retained. If the runtime is already running and only configuration needs regeneration, use `node scripts/local.cjs configure`.

`local.cjs` writes ignored `backend/.env`, `web-portal/.env.local`, and the generated Xcode configuration without printing credentials. It rejects an existing nonlocal backend configuration. Resolve that conflict by protecting the existing configuration separately, not by bypassing the check. Never print dotenv files in support logs.

## Accounts and secrets to restore separately

Reauthenticate GitHub/Git CLI, Vercel's authorized team, Supabase dashboard/CLI when hosted administration is needed, and the Apple ID/developer team used by Xcode. Browser sessions, Keychain items, SSH keys and signing private keys are not restored by cloning. Use the organization's password manager and authorized certificate export/import process; do not place credentials in this document or repository. Verify access before the old laptop is unavailable.

Production environment settings remain in Vercel. Server service-role/database credentials must never enter portal or iOS configuration. A local anon key is generated from the new local stack; do not reuse the old laptop's local secrets. Hosted auth redirect settings and provider configuration require separate verification and are not established by starting local Supabase.

Recreate `node_modules`, backend `dist`, portal `.next`, Xcode DerivedData/build products, simulator installations, generated local configurations, `.vercel` linkage and container caches on the new laptop. They are not portable source deliverables. Preserve local volumes only if specific synthetic data is needed; normal setup can recreate synthetic data. Never copy production clinical records onto the development laptop. Protected private documents are distinct from disposable caches.

## Run verification before relying on T2

From `backend`:

```sh
npm test
npm run build
npm audit
```

From `web-portal`:

```sh
npm test
npm run lint
npm run build
npm run typecheck
npm audit
```

With the local stack and API running, from `backend` run `node scripts/accounts-live.cjs`. It is a local-only synthetic signup/confirmation/onboarding/password-recovery check; it is not a production test. From repository root, after building the backend, run `node scripts/recovery.cjs` for the baseline's real local security and backup/restore regression drill. Read the baseline document for its disposable-destination and failure-volume behavior.

Run the recovery drill before the Simulator UI suite: the UI suite creates synthetic `clearaf-ui-…@example.invalid` accounts, and the recovery safety guard intentionally rejects those extra identities. Before a later recovery run, have Codex remove only the exact local UI test identities after verifying the local endpoint; never bypass the guard or apply that cleanup to hosted data.

In Xcode, run the account unit and UI tests through Product → Test with an installed Simulator. Also verify confirmed signup, profile-error retry, onboarding persistence after closing/reopening, password recovery, offline sign-out, and A → sign-out → B isolation for records, preferences and pending uploads. Confirm portal clinician authorization comes from the backend and patients cannot self-promote. Record actual test results and outstanding failures; test files alone do not establish acceptance. Fresh machine verification remains required even if the old machine passed.

Database changes use `supabase/migrations`; `npm run db:migrate` and `npm run db:deploy` in `backend` are intentionally local-only. Never replay archived Prisma migrations or run a reset against hosted data. A production migration requires its own reviewed procedure and recoverable database plus storage-object backups.

## Deployment and rollback

The API and portal deploy independently:

- API project: `clearaf-api`. Deploy explicitly from `backend` using `vercel --prod` after selecting/verifying the authorized team and project.
- Portal project: `clearaf-portal`, Git-connected with root directory `web-portal`. Changes to `main` trigger deployment automatically. For manual portal deployment, invoke Vercel from the **repository root**, supplying the correct `VERCEL_PROJECT_ID` and `VERCEL_ORG_ID` from the authorized project settings. Do not run that manual portal upload from `web-portal` and assume the configured root will resolve correctly.
- Hosted portal previews remain disabled until a separate hosted test backend exists. Keep synthetic tests local.

Before any release, inspect and record the immutable current deployment ID/URL with `vercel inspect`, verify project/team and database compatibility, and confirm the rollback target retains the T0 security boundary. After API deployment, check `/health`, `/ready` and authenticated authorization. Roll back code with `vercel rollback <verified-deployment-url> --yes`; verify again. Promotion uses `vercel promote <new-deployment-url> --yes`. A code rollback cannot restore database state. See the baseline document for hosted recovery requirements and upload exclusions.

## Release gates and final handoff record

Clinical retention and account-deletion policy is not approved. T2 must show an explicit unsupported-removal status; it must not destroy clinical server records or imply that deletion is implemented. Resolve the policy and implementation before a release that promises account removal.

See [verification.json](../accounts/verification.json) for dated test outcomes and [the T2 report](../accounts/README.md) for scope and remaining release gates. T2 is stacked on T1 PR #2. Find its review under the repository pull requests with head `codex/account-reliability`. The final transfer manifest in the protected snapshot records the exact published commit and PR. No T2 production deployment occurred.

## Private preservation snapshot

The old laptop has a protected snapshot at `/Users/aryansachdev/.codex/private/clearaf/handoff-2026-09-11/`: the original checkout's binary patch against its recorded HEAD, its untracked files, and a manifest. The snapshot is about 25 MB and may contain private audit material or credentials. Transfer it through Migration Assistant or another secure local transfer; never add it to the public repository. The archive was checked for safe relative paths and file checksums were saved. Private verification logs and a final Git bundle/transfer manifest accompany it. Original files were not changed. This snapshot supplements the final published T2 branch; it is not a replacement for that branch.

For this machine's Simulator runs, local ad-hoc signing and a single test worker avoid cloned-device runner failures:

```sh
xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -parallel-testing-enabled NO -derivedDataPath /tmp/clearaf-build \
  -only-testing:ClearAFTests -only-testing:ClearAFUITests/AccountFlowUITests \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- test
```

Use an installed device name on the new machine. The UI suite requires the local API and Supabase/Mailpit to be running. Local ad-hoc signing does not require distribution credentials or authorize an App Store upload.

T4 integrated MVP evidence, commands and remaining gates: [MVP verification](../mvp/README.md).

Verification pacing and scope after T4: [working agreement](verification-workflow.md).

Care Journal portal scope and focused verification: [portal design pass](../design/portal-care-journal.md).

Feature expansion is tracked in [approved scope](../features/expansion.md). First slice: [photo comparison/review verification](../features/photo-review-verification.md); templates, calendars, reminders, check-ins and assigned messaging follow under the same active goal.

Routine templates, calendars, local reminders and clinician-configured check-ins: [care support verification](../features/care-support-verification.md). Assigned-clinician messaging and linked feedback are next.

Assigned-clinician text messaging and linked photo/routine feedback: [verification and compatibility](../features/messaging-verification.md).

Eligibility/consent enrollment, refer-out/needs-in-person care decisions with refund status, and urgent reports (Release 1 of the [client expansion](../features/client-expansion.md)): [enrollment and safety verification](../features/enrollment-safety-verification.md).

Release 1 (enrollment and safety) is deployed: hosted migration applied, API and portal live with `ENROLLMENT_ENFORCEMENT=off` until the new iPhone build is installed. Deployment IDs, rollback target and two rollout incidents (database password reset, API Git auto-deploy) are recorded in [enrollment and safety verification](../features/enrollment-safety-verification.md).
