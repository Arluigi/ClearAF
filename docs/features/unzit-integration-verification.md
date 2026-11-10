UNZIT integration verification — November 9, 2026

Status: code integrated locally; real content import and recovery are incomplete.
Branch/worktree: `feature/unzit-integration`, `/Users/aryansachdev/code/ClearAF-unzit-int`.

Merges, in order (`--no-ff`): iOS `5c75fea`, portal `bb4b8b1`, Cloud Run `f284b91`.
Only merge conflict: `backend/src/server.ts`; retained API startup validation and both raw-body routes before JSON parsing (Stripe billing webhook and signed email hook).
Fixes `9096a5f`: explicit assignment-authorized legacy chart selection; care access plus future paid-through and clinical/destination prerequisites; separate billing words; shrinking queue clamp/reload.
The same commit fixes two independently found iOS billing mismatches: Checkout response envelope and Customer Portal membership ID.
Content preparation `a37daa0`: immutable `1.0-pending-review` draft publications and visible DRAFT labels in both clients.
Local verification/configuration `f66dece`: loopback-only journey, scoped fake refunds, catalog restoration, and Cloud Run billing runtime inputs.
All commits include the requested co-author trailer; access, contract and final read-only reviews found no blocking defects.

Real content loaded: **none**. `.local/content/sources.md` was absent; requested restoration remains pending.
E1–E4, M1–M22, preference, four real consents, photo guidance and six real message templates therefore remain unimported.
Source-versus-plan conflicts cannot be assessed without that file. Amit must approve wording before launch.
Live evidence used explicitly synthetic DRAFT 0.9 content, not client wording. Original active catalog pointer was restored.

| Command (from repo root unless prefixed) | Result |
| --- | --- |
| `cd backend && npm test` | PASS 480; FAIL 0 |
| `cd backend && npm run build` | PASS 1; FAIL 0 |
| `cd web-portal && npm test` | PASS 309; FAIL 0 |
| `cd web-portal && npm run lint` | PASS 1; FAIL 0 |
| `cd web-portal && npm run typecheck` | PASS 1; FAIL 0 |
| `cd web-portal && npm run build` | PASS 1; FAIL 0 |
| `xcodebuild … -only-testing:ClearAFTests test \| xcbeautify` | PASS 354; FAIL 0; SKIP 1 |
| `node backend/scripts/unzit-integration-live.cjs --synthetic-catalog` | PASS 8; FAIL 0; two patients, one Rx, one full refund |
| `node scripts/recovery.cjs` | FAIL 1 preflight: 8 accounts outside known fixtures; no recovery mutations |

Xcode used CLAUDE.md's iPhone 17 command, ad-hoc signing, parallel testing disabled, and `/tmp/clearaf-unzit-int-build`. The existing physical-device connectivity XCTest was skipped because no explicit synthetic Bonjour host was configured; UI tests were excluded as requested.
The successful journey covers allowlisted signup → consents → ID/selfie → eligibility → fake Checkout → intake → photos → destination → submission → API clinician approval → monthly check-in scheduled → prescription recorded, plus second-patient rejection/full refund. Portal verification includes local login HTTP smoke and component/unit suites; no interactive browser walkthrough was performed.
An initial HTTP preflight stopped before mutations due to concurrent Next dev/build output; serving the completed build resolved it. The subsequent journey passed once.
Five pre-existing accounts were preserved; three newly owned immutable synthetic accounts and their evidence remain in private ignored `.local/integration/` manifests. No immutable triggers were disabled to erase evidence.
Contract: `GET /api/launch/patients/:patientId/chart` now returns `{careModel:'legacy'}` for an authorized legacy patient or adds `careModel:'launch'` to the existing launch payload; denied/ambiguous 404s never enable fallback. Portal union and iOS decoding models are updated; existing launch fields remain compatible.
Billing contract remains authoritative: Checkout returns `{membership,action}` (nullable action); Customer Portal requires `{membershipId}`.
No hosted Supabase, Vercel or GCP targets, deployments, pushes, or UI-test accounts were used. Live Stripe/Paubox delivery were not tested. Local services remain on API :3001 and portal :3000.
