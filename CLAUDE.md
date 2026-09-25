# ClearAF

Patient iOS app + clinician web portal on one Express API over Supabase (Auth, Postgres 17, private Storage). Status: synthetic demo only. It is not approved for clinical use; T5 pilot policy and App Store/TestFlight distribution are on hold. Current state: [handoff](docs/handoff/README.md) and [feature expansion](docs/features/expansion.md).

## Tooling: use it without being asked

This machine is set up with skills, plugins, agents and CLIs for this stack. Use them by default; the user should never have to ask. Before starting any task, check the available skills and invoke every one that applies. Prefer a skill, agent or CLI over doing the same work by hand.

| When | Use |
|---|---|
| Any new feature, behavior change or plan | `superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development` or `executing-plans`; `superpowers:using-git-worktrees` for isolation |
| Bug, failing test, unexpected behavior | `superpowers:systematic-debugging` first |
| Writing code | `superpowers:test-driven-development`; before claiming done, `superpowers:verification-before-completion` |
| Picking up past work or "what did we do about X" | claude-mem `mem-search` / `timeline-report` before re-investigating |
| SQL, RLS, Auth, Storage, Supabase CLI | `supabase` and `supabase-postgres-best-practices` skills; schema changes via `/new-migration` |
| Portal React/Next.js code | `vercel-react-best-practices`, `vercel-composition-patterns`; `frontend-design` for new or reshaped UI (within Letterpress, docs/design/design-language.md) |
| SwiftUI | `swiftui-expert` skill (target is iOS 17: gate iOS 26 APIs such as Liquid Glass with `#available`) |
| Build, test or run iOS; Simulator screenshots and UI taps | `xcodebuildmcp-cli` skill + `xcodebuildmcp` CLI; pipe raw `xcodebuild` through `xcbeautify` |
| Checking portal UI | Playwright plugin browser tools against http://localhost:3000 |
| Navigating code | LSP (swift-lsp, typescript-lsp) for definitions, references and diagnostics before grepping |
| Library/API docs (Next 15, React 19, Express, Prisma, supabase-js, Tailwind) | context7 |
| Change to auth, patient data, photos, messaging or migrations | `care-access-reviewer` agent before committing |
| Change to an API request/response shape | `api-contract-checker` agent before committing |
| Before a PR / merge | `/code-review`, `superpowers:requesting-code-review`, `superpowers:finishing-a-development-branch` |
| Deploy or hosted migration | `/ship-release`; `vercel logs --level error`, `vercel inspect`, or the claude.ai Vercel connector for build/runtime logs |
| CI failure | `gh run view --log-failed`, `gh pr checks` |
| End of a session with new learnings | `claude-md-management:revise-claude-md` |

## Layout

- `ClearAF/` - SwiftUI app (iOS 17+). `Services/*Repository.swift` call the API; `Config/` selects endpoints (Debug = local stack, app ID `com.aryansachdev.ClearAF.dev`; Release = production, `com.clearaf.patient`). Tests: `ClearAFTests/`, `ClearAFUITests/`.
- `backend/` - Express + TypeScript, deployed to Vercel project `clearaf-api`. `src/routes/` are thin; logic and zod validation live in `src/services/`; `src/middleware/auth.ts` verifies the Supabase session and resolves roles from the database. Prisma is used as a **query client only**.
- `web-portal/` - Next.js 15 App Router, React 19, Tailwind, shadcn/ui. Vercel project `clearaf-portal`, auto-deploys from `main`. Per-feature API code in `src/lib/*.ts`; shared types in `src/types/api.ts`.
- `supabase/migrations/` - the only active migration chain. `supabase/legacy-migrations/` is archived and must never be replayed.
- `scripts/`, `backend/scripts/*-live.cjs` - loopback-only synthetic fixtures and live checks; they refuse non-local targets.
- `docs/` - `baseline/README.md` (setup, migrations, recovery, deploy/rollback runbook), `features/*-verification.md` (release evidence), `superpowers/specs|plans/` (feature designs), `design/design-language.md` + `design/letterpress/` (Letterpress 1.0, source of truth for UI).

## Commands

```sh
node scripts/local.cjs start          # local Supabase (Colima/Docker); writes ignored backend/.env, web-portal/.env.local, Local.generated.xcconfig
cd backend && npm run dev             # API on :3001
cd web-portal && npm run dev          # portal on :3000 (Supabase :54321, Postgres :54322, Mailpit :54324)
node scripts/local.cjs stop           # data retained

cd backend && npm test && npm run build
cd web-portal && npm test && npm run lint && npm run typecheck && npm run build
node scripts/recovery.cjs             # from root, after backend build: real local security + backup/restore drill

# iOS (use an installed simulator; keep ad-hoc signing or Keychain sign-in fails)
xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
  -derivedDataPath /tmp/clearaf-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- test | xcbeautify

cd backend && npm run db:migrate      # apply migrations to the LOCAL stack only; db:status shows history
```

Tests use Node's built-in runner (`node --import tsx --test`), not Jest.

## Rules

- **Migrations:** create with `npx --yes supabase@2.117.0 migration new <name>` (keep the CLI pinned; CI uses the same version). Never edit a committed migration, `supabase/baseline.json`, or anything in `legacy-migrations`. Never run `prisma migrate`/`db push`/reset. New tables: `ENABLE ROW LEVEL SECURITY`, `REVOKE ALL ... FROM PUBLIC,anon,authenticated`, `GRANT ALL ... TO service_role`; also add them to `backend/prisma/schema.prisma` (`@@map`) and `applicationTables` in `backend/scripts/recovery-drill.cjs` (enforced by `migration-chain.test.ts`). Use `/new-migration`.
- **Access model:** clients never touch tables or Storage directly; every read/write goes through the API. Patients see only their own records; clinicians only currently assigned patients. Photos stay in the private `patient-photos` bucket and are served as 5-minute signed URLs. The service-role key exists only in the backend. Run the `care-access-reviewer` agent on auth/data changes.
- **Two clients, one contract:** response-shape changes must update the iOS Codable models and `web-portal/src/types/api.ts`, and stay compatible with installed iOS builds. Run the `api-contract-checker` agent.
- **Secrets and private data:** never read or print `.env*` (except `.env.example`), `.local/`, `handoff-*/` or `Local.generated.xcconfig`. Live scripts must not log credentials or message bodies. Synthetic accounts use `@example.invalid`. Never bring production patient data onto a dev machine.
- **Ordering:** run `scripts/recovery.cjs` before the Simulator UI suite; UI tests create `clearaf-ui-*` accounts that the recovery guard rejects.
- **Design:** follow `docs/design/design-language.md` (Letterpress 1.0; build spec `docs/design/letterpress/spec.md`). Ink is the action colour, ochre only for unread/prescription; native iOS controls; no scores, streaks, grades, emoji or motivational copy.

## Workflow

- Features: spec + plan in `docs/superpowers/`, feature branch, PR, merge to `main`.
- Verification is bounded ([agreement](docs/handoff/verification-workflow.md)): define acceptance up front, run one integration pass, rerun only the focused check after a fix, prefer a short user-led walkthrough for camera/device steps.
- Releases (`/ship-release`): record the rollback target with `vercel inspect` first, deploy the API with `vercel --prod` from `backend`, check `/health` and `/ready`, then commit a sanitized verification/release record. Production deploys and hosted migrations need explicit user approval each time.
- `.claude/hooks/guard.sh` enforces the secret, migration and deploy rules above.
