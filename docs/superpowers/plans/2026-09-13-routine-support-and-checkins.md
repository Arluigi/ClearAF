# Routine Support and Check-ins Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute task-by-task.

**Goal:** Add reusable clinician templates, factual completion calendars, opt-in local reminders and versioned clinician-defined check-ins.
**Architecture:** One additive authenticated care-support API with immutable revisions and responses; client controllers use stable mutation IDs and account-generation boundaries. Local reminders use an injectable iOS scheduling adapter, separate from clinical records.
**Tech Stack:** Express/Prisma/Postgres, React/Next, SwiftUI/UserNotifications.
**Spec:** docs/superpowers/specs/2026-09-13-routine-support-and-checkins.md

## Global constraints

No default clinical questions/content, no scores/streaks. Exact API/DTO contracts and limits are in spec. Current patient assignment, role/session and idempotency checks apply everywhere. Immutable historical definitions; account-specific protected drafts. Care Journal controls and native tab/selector family. No physical camera or APNs/distribution work.

### Task 1: API/schema and synthetic integration
- [x] Add failing tests for template ownership/conflict/idempotency; month/date parsing and date grouping; form validation, required/choice answers, historical revisions, response dedupe and wrong assignment.
- [x] New backend/src/services/careSupport.ts + routes/care-support.ts (split validation/service modules when needed), server mount, Prisma models and CLI-generated migration. Follow routineCare.ts patient lock and repeated-write semantics.
- [x] Add loopback-only exact-fixture live script covering all endpoints and direct Data API denial. No global cleanup/reset.
- [x] Focused tests/build; parent applies migrations and runs integration.

### Task 2: Portal workflow
- [x] Add generation-bound API methods and typed controller tests before implementation.
- [x] New Templates destination with reusable existing routine field family, archive and optimistic conflict/retry. Patient routine editor can copy a template into draft, retaining explicit save.
- [x] Patient completion calendar with month/day navigation and actual event details; maintain history pagination.
- [x] Patient form assignment editor supports text/single-choice required questions and immutable version saves. Paginated submissions show exact original prompts/answers.
- [x] One portal test/lint/build/typecheck pass; parent browser smoke uses exact synthetic fixtures.

### Task 3: iOS check-ins/calendar
- [x] Test account-bound DTO validation, stale response invalidation, pending response file reopen/lost-response retry, original form snapshot and no retargeting after replacement.
- [x] Implement protected account-specific check-in draft/outbox repository; use existing RoutineRepository patterns and API request tickets. Today links to Check-in; responses accessible from check-in screen. Current inactive/no form explicit empty state.
- [x] Routine screen opens Completion history calendar; distinguish local pending events from fetched records; date details paginated.
- [x] Signed Simulator build/focused tests, no physical-device loop.

### Task 4: iOS reminders
- [x] Inject notification scheduler; failing tests for no permission request until opt-in, denied/scheduling failure, cancellation on logout/account change and schedule reconciliation.
- [x] Account-specific protected reminder preferences, morning/evening daily and weekly photo controls in Profile. Generic notification content only. Preserve preference but cancel pending notifications on logout; previous opt-in is restored on same-account login only if system permission remains authorized, without another permission prompt.
- [x] Focused scheduler tests/build; document unverified real delivery behavior if no timed system notification smoke.

### Integration and release
- [x] One review/fix wave, real local synthetic integration, focused portal/Simulator walkthrough; preserve existing photo and routine behaviors.
- [x] Sanitize verification/deployment record and handoff. Commit/push PR, wait checks, merge, deploy schema/API and confirm portal exact source. Retain demo, clean owned fixtures/temporary branch. Continue messaging goal autonomously.
