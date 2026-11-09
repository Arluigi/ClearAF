# UNZIT Cloud Run implementation plan

Goal: prepare container deployment and signed Supabase Auth email delivery without deploying.

Architecture: retain the existing direct-execution server listener and Vercel app export. Mount a raw-body, signature-authenticated hook before global JSON parsing; isolate templates and Paubox transport in new files. Use current shared Paubox endpoint with Bearer auth; retain requested username setting as an account reference. Reauthentication sends the OTP, since Supabase does not accept that type at GET /verify.

- [x] Write hook tests first: raw signatures, freshness, all actions, reversed secure email-change hashes, errors, deadline and log redaction.
- [x] Implement isolated hook with bounded raw parsing, HMAC SHA256 constant-time verification, five-minute timestamp tolerance, static templates, one five-second transport budget and sanitized errors.
- [x] Add Node 24 multi-stage Docker packaging and secret-safe build context; create deploy/empty-secret scripts and runtime configuration manifest.
- [x] Document first deploy, rollback, client cutover and hook setup, plus outstanding domain/egress decisions.
- [x] Docker build and dummy-environment health smoke test passed (HTTP 200, UID 1000, Node 24.22.2). Backend suite/build passed (258 tests, including 24 hook tests); stopped the stalled default Colima VM and used the existing clearaf Docker daemon for the build.
- [x] Inspect final diff and commit only authorized paths without pushing. Read-only care-access/API-contract review found no access or client-contract drift; incorporated tracking-configuration instructions and empty-email payload support.

Acceptance follows the user's deliverables. No hosted commands, real secrets, or production data are used. Existing service files remain untouched apart from the isolated route mount in server.ts.
