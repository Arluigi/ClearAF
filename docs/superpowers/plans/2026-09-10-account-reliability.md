# T2 — Account reliability

Use the subagent-driven-development skill for bounded implementation and independent reviews. The user authorizes autonomous implementation and verification.

## Outcome
A confirmed patient can sign in, complete the existing onboarding fields, reopen the app, recover access and sign out reliably. Two accounts sharing a device cannot see or submit each other's local records, cached profile or pending requests. Clinician access is decided by the backend. All verification uses synthetic local data.

## Design
- One session coordinator owns restoration, profile readiness and logout. The app shows loading, authentication, profile retry, onboarding or the account interface explicitly.
- Use a separate Core Data store per authenticated UUID. Signed-out state is an empty memory store; legacy unowned stores are never adopted. Recreate the view tree when the account changes.
- Bind requests and multi-step uploads to an account generation. Reject late responses and continuation work after logout or account change. Read refreshed tokens from the Auth SDK; remove the old defaults token.
- Persist onboarding on the backend, including the entered name, and hydrate the scoped local profile only after validating the profile's account ID. Retain form errors and retry.
- Support confirmation and password recovery with local email/OTP testing. Never treat a signup without a session as logged in.
- Add visible sign-out and explicit account-removal status. Clinical record retention and deletion policy is not approved: do not destroy server records or imply deletion is implemented. This remains a release gate.

## Work and acceptance checks
1. Isolated persistence and preferences: A/B disk stores, cold reopen, signed-out empty store, legacy quarantine, all entity types isolated.
2. Session and request lifecycle: cold restoration, rejected expired/revoked session, offline logout, late-response suppression, account-bound upload continuations.
3. Signup/onboarding/recovery: confirmation required, retryable profile failures, completed onboarding survives cold launch, recovery invalidates old access as supported and returns to ordinary sign-in.
4. Portal/backend: authoritative clinician access on restoration, no patient self-promotion, safe profile validation and explicit unsupported deletion behavior.
5. Verify: meaningful Simulator account tests, real local Supabase email/recovery checks, backend and portal tests/builds, security/recovery regression checks, independent review, concise result report and reviewable PR.

No production patient data mutations or new clinical policy. T1 draft PR #2 is the base of this branch; integration will preserve it.
