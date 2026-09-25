# Clinician quick replies, weekly message limit, reminder defaults

Synthetic demo only. Recorded 2026-09-24.

## Release

| Item | Value |
|---|---|
| Source | PR #28, merged as `8125878` |
| API deployment | `dpl_5MzdRPyAgutfdZBeLBycmUUKkBTf`, `https://clearaf-77k87ff31-arluigis-projects.vercel.app`, alias `clearaf-api.vercel.app` |
| Rollback target | `dpl_8EEpjKpWDVRRwJ3EHJDF8yH5r8Cz` (the Compare release; compatible, since this adds only an additive field and a send-time check) |
| Portal | auto-deployed from `main` on merge |
| Migrations | none |

The API was deployed before the merge, so the portal never met an API that did not know about the limit.

## What changed

**Quick replies.** Chips above the reply box in the workspace Photos tab and the Messages thread. A tap fills the textarea and never sends; the clinician still presses the existing send button. `{version}` resolves only when every active routine slot agrees on one version, and `{day}` from the latest check-in; a chip whose value cannot be resolved is not rendered, so no placeholder or guess reaches a patient.

**Weekly message limit.** A patient may start one thread per rolling 7 days, and may always reply within 7 days of the clinician's last message. Enforced inside the existing send transaction after `lock` and `authorize`, so two rapid sends cannot both pass. A blocked send returns 429 `PATIENT_MESSAGE_LIMIT` with `nextAllowedAt` and no message content; `errorHandler` forwards an explicit allow-list of detail fields rather than spreading whatever is attached. `GET /assigned-messages/current` gains an additive `limit { canSend, nextAllowedAt, reason }`, and iOS treats a missing field as can-send, so installed builds keep working.

**Reporting a reaction is untouched and unthrottled.** It is a separate path, and the patient-facing sentence names it: "You've sent this week's message. You can write again from 24 Sep — or report a reaction any time," wired to the existing urgent-report sheet.

**Reminder defaults.** The onboarding step starts with morning, evening and photo pre-ticked at their existing times, so a patient opts out rather than in. `ReminderPreferences`'s own defaults are unchanged, so Profile and existing accounts behave as before, and unticking everything is honoured.

## Checks

| Check | Result |
|---|---|
| Backend tests and build | 234/234, clean |
| Portal tests, lint, typecheck, build | 274/274, clean |
| iOS `ClearAFTests` and UI-target build | pass |
| `care-access-reviewer`, `api-contract-checker` on the API change | PASS; the reviewer's allow-list recommendation was applied before commit |
| Hosted `/health`, `/ready`, anonymous `/api/assigned-messages/current` | 200, 200, 401 |

## Limits

- No hosted authenticated pass: the limit's behaviour was verified by unit tests and the local stack, not against production data.
- The quick-reply copy is a documented exception to spec §7, recorded in `docs/design/design-language.md`. Encouragement always follows a factual clause, and the chips never assess the skin.
- No counter, streak or score was added to the patient app; the existing factual counts ("11 of the last 14 days") are unchanged.
