# Hosted bootstrap implementation plan

Use the supplied workspace and `feature/unzit-integration` branch; the user explicitly prohibits another workspace. Design: `docs/superpowers/specs/2026-11-09-hosted-bootstrap-design.md`.

1. Write `backend/tests/hosted-bootstrap.test.ts` first. Cover environment requirements, CLI flags, ref/host/user matching, local refusal, test Stripe key, CA verification and error redaction. Run the focused test and confirm failure because the module is absent.
2. Implement pure parsing/guards and injectable command orchestration in `backend/scripts/hosted-bootstrap.cjs`. Reuse the exported content, settings and waitlist functions. Resolve the sole clinician for content, preserve fixtures and Auth trigger requirements, and make clinician reruns safe.
3. Exercise commands with in-memory DB/Admin/Stripe fakes, checking previews never write and status never returns addresses or content. Include partial invitation recovery and rollback paths. Run the focused tests.
4. Add the Hosted bootstrap runbook section with Secret Manager environment setup, ordering, previews, all five exact commands, invitation redirect prerequisites and pending-review limitations.
5. Review access/security with the repository care-access-reviewer instructions. Run `cd backend && npm test && npm run build` with dotenv reads disabled, inspect the final diff and commit with `Co-Authored-By: GPT-6.1 Sol via Codex <noreply@openai.com>`.
