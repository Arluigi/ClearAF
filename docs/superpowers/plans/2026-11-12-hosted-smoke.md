# Guarded hosted patient smoke implementation plan

**Goal/spec:** Implement the operator's requested single synthetic patient journey and exact cleanup against UNZIT, on `feature/unzit-integration` in this existing isolated worktree. The user has authorized implementation, commit, one hosted run, and final status; no deployments or hosted fixes.

**Architecture:** Reuse hosted-bootstrap environment and verified TLS guards. Inject database, Auth, Stripe, API and clock dependencies so unit tests never use a network. Keep credentials, patient token and generated password in memory. Public journey uses only the patient bearer token. Finally cleans exact owned provider resources, storage prefix, public rows, Auth user and allowlist identity, then checks counts against baseline.

**Constraints:** Fixed project `lhaqeeitxiynzcpqbwpb`, fixed HTTPS API, environment-only credentials, Stripe `sk_test_` plus resource livemode checks, no protected configuration reads or raw errors. Generate plain PNGs and convert to JPEG for the documented upload contract. Do not manufacture a subscription to bypass Checkout: stop at payment if the actual session has no payable invoice.

## Tasks

- [x] Write guard and cleanup-selection tests with injected fakes; run focused test and observe failure.
- [x] Implement `backend/scripts/hosted-smoke.cjs`: CLI/env validation, exact cleanup selectors discovered from public column/FK metadata, child ordering, Stripe/session ownership checks, recursive storage cleanup, bounded public API journey, counts-only reporting.
- [x] Run focused tests, then care-access reviewer; resolve findings. Run `cd backend && npm test && npm run build`, commit script/tests with requested trailer.
- [x] Load the five specified Secret Manager values without logging; normalize DATABASE_URL query to `sslmode=require`. Capture status baseline, execute the single-patient journey, always cleanup, run hosted-bootstrap status again and compare clinician/allowlist counts.
- [x] If a hosted bug blocks progress, diagnose, write regression test, fix and commit on this branch; no deployment. Report each step and cleanup in at most 20 lines.

## Review focus

Partial setup/network failures must still find only the exact created identity. Cleanup must inspect every patientId/userId table and indirect children without touching shared publications/clinician rows. Stripe live or mismatched resources must be refused. Missing subscription/invoice must stop cleanly. Provider errors and denial response bodies must never reach output.

## Implementation evidence

19 focused tests passed after observing red tests. Full backend: 575 passed, zero failed; build succeeded. Existing tests need synthetic Supabase environment placeholders when private config reads are blocked. A temporary filesystem preload prevented tooling from opening protected configuration files.

Care-access review findings fixed with regression tests: nested cleanup selector aliases, storage deletion verification, lost allowlist-batch recovery, tableoid plus ctid selection with row locks, and provider-ID recovery failures retaining billing correlation. Immutable snapshots require a transaction-local replication-role bypass, checked before account creation; no schema changes or global trigger changes. Incoming FK references to unselected rows abort cleanup. Exact selectors are materialized before child-first deletion, so nullable cyclic references need no updates with that transaction-local bypass.

## Hosted evidence (2026-11-12)

The first preflight refused catalog metadata before creating any synthetic data: pg leaves PostgreSQL `name[]` unparsed. Regression reproduced with pg's actual type parsers; cast catalog attribute names to `text[]` in commit `0e099e1`. Baseline remained clinicianCount 1, allowlistCount 4. This was a runner defect; no hosted application change or deployment was made.

The resumed attempt created exactly one synthetic patient. Passed: allowlist, Admin creation and patient sign-in, anonymous 401, forbidden patient-read route, quick eligibility, four current hash-verified consents, Care Checkout. The actual TEST Checkout session had no subscription or invoice, so headless payment was impossible through the public Stripe API and execution stopped at the paid boundary. Identity/NC, intake, photos, destination and submit/queue were not executed.

Finally cleanup: 8 public rows, 1 Auth user, 1 allowlist row removed; 1 Checkout session expired; 0 storage objects, subscriptions or customers existed to remove; 0 cleanup failures. Final hosted-bootstrap status: content `2.2-pending-review`, settings 3, clinicianCount 1, allowlistCount 4, migrationCount 13. Both baseline counts restored. The paid-path webhook drain remains bounded; the actual run created no subscription/invoice or payment webhooks.
