UNZIT integration verification — November 9, 2026

Status: client-source draft content loaded and verified locally; clinical/legal wording approval and recovery remain incomplete.
Branch/worktree: `feature/unzit-integration`, `/Users/aryansachdev/code/ClearAF-unzit-int`.

## Client-source content load — November 9, 2026

Versioned source: `backend/src/content/catalogs/1.0-pending-review.json`.
Local immutable settings publication: version **3**, status **draft**, no approval reference.
Four separate consent documents use numeric version **2** and label `1.0-pending-review`;
the draft publication date is not an approved legal effective date. All six imported
clinician template revisions are inactive and named DRAFT. Identical replay created
zero settings/template versions. The integration journey restored publication 3 as active.

Loaded: E1–E4 (**4**), M1–M22 plus medication preference (**23**, preference immediately
after M11), **4** separately hashed consents, **6** photo slots (front/left/right required;
chest/back each conditional on M6; close-up optional), **3** identity/location guidance
items, **6** source routine templates, and **7** follow-up fields (five required topics
plus two detail fields, conditionally required by the submission validator; no adherence).
The owner restored `.local/content/sources.md`; it remains ignored and uncommitted.

The provided file is a summary of unsigned PDFs, not complete original consent forms.
The loaded consent bodies adapt those summaries with the launch decisions applied.
Client, Dr. Om and counsel approval is still required, including effective dates,
privacy mailing address, HIPAA status and proposed retention. The six source templates
are routine starting points, not separately supplied canned messages or automated prescribing.
Photo/identity guidance is retained in server-side publication content; the current
catalog API projection does not expose these fields to either client. Existing client
capture-screen instructions remain separate; this run verifies storage, not their display.
The clean approval document is `.local/content/wording-review.md` (ignored).

### Source conflicts resolved in favor of the plan/client decisions

1. Source $55 single bundle and undefined weekly upgrade → configurable Care $39 / All-In $89 settings. Consent prose binds price to Checkout rather than freezing a number.
2. Source follow-up at 8–12 weeks then every three months, or website weekly upgrade → Care monthly; All-In weekly for eight weeks, then monthly, from approval.
3. Source follow-up adherence topic → excluded; five topics plus side-effect/new-medicine detail fields only.
4. Source score promises and open subscription inclusions → removed; no scores, streaks, emoji or motivational wording loaded.
5. Source IP-region check and NC shipping at identity → NC attestation only; no IP geolocation. NC shipping is required for All-In, while Care may use any US pharmacy.
6. Source partner prescriptions included for everyone / Vida as the single bundle's default → Vida for All-In; Care pays its chosen pharmacy directly.
7. Source pending first-month referral refund → rejection refunds the latest paid invoice in full and cancels immediately. Billing starts at payment; cadence starts at approval.
8. Source pregnancy reply within one business day → review wording uses within 1 to 2 business days; immediate emergency guidance remains immediate.
9. Source marketing three-photo claim → front/left/right plus chest/back individually when selected in M6.
10. Source pregnancy-question ambiguity → M2 unless male; M3/M4 only for M2 yes/not_sure; M8 female/intersex.

Stripe Checkout/Customer Portal (not IAP) and recorded-only external TreatRx remain the
plan's authority; the source contains no contrary IAP or automated-transmission instruction.
Source-internal urgent-care timing and BPO-strength inconsistencies remain clinical
review items; routine strengths follow their respective source template wording.
The user's requested `1.0-pending-review` label supersedes the plan's earlier `0.9-draft`.

### Verification for this load

| Command | Result |
| --- | --- |
| `cd backend && npm test && npm run build` | PASS 483 tests; build PASS |
| `cd web-portal && npm test && npm run typecheck` | PASS 309 tests; typecheck PASS |
| `node backend/scripts/unzit-integration-live.cjs` (no synthetic flag) | PASS 8; FAIL 0; two patients, one external Rx record, one full refund; `syntheticCatalog:false` |
| Import and identical replay through existing importer | Published 1 settings version / 6 template revisions; replay 0 / 0 |

The first live attempt stopped before patient creation because its portal smoke check
expected the UNZIT brand on the ClearAF clinician login. The harness now checks the actual
clinician sign-in markers, with a regression test verified failing then passing.
The subsequent journey passed once. The first sandboxed backend suite could not bind
its local HTTP sockets and was stopped; the authorized run with local socket access passed.
Read-only care-access and API-contract review found no blocking defects or contract drift.
No secret files were inspected, no source bodies were copied into tests, no migrations
were changed, and no hosted targets, pushes or deployments were used. API and portal
were started locally with fake billing; their synthetic immutable evidence is retained.

## Earlier integration evidence (before source restoration)

Merges, in order (`--no-ff`): iOS `5c75fea`, portal `bb4b8b1`, Cloud Run `f284b91`.
Only merge conflict: `backend/src/server.ts`; retained API startup validation and both raw-body routes before JSON parsing (Stripe billing webhook and signed email hook).
Fixes `9096a5f`: explicit assignment-authorized legacy chart selection; care access plus future paid-through and clinical/destination prerequisites; separate billing words; shrinking queue clamp/reload.
The same commit fixes two independently found iOS billing mismatches: Checkout response envelope and Customer Portal membership ID.
Content preparation `a37daa0`: immutable `1.0-pending-review` draft publications and visible DRAFT labels in both clients.
Local verification/configuration `f66dece`: loopback-only journey, scoped fake refunds, catalog restoration, and Cloud Run billing runtime inputs.
All commits include the requested co-author trailer; access, contract and final read-only reviews found no blocking defects.

At that earlier checkpoint, real content loaded: **none**. `.local/content/sources.md` was absent; requested restoration remains pending.
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
