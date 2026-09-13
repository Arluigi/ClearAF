# Assigned messaging implementation plan

Use Superpowers subagent-driven development. Execute continuously under the approved expansion goal.

## Global constraints

Exact contract: docs/superpowers/specs/2026-09-13-assigned-messaging.md. Assigned clinician only; patient text replies and clinician text plus authorized photo/routine links; no attachments/default clinical text. Current assignment locks, explicit pair, bounded cursor paging, exact displayed-recipient-ID acknowledgements, stable UUID/frozen send body, account-specific draft persistence and generation invalidation. Native iOS Messages fourth tab; Care Journal portal Messages navigation. No camera/distribution or real patient tests.

## Tasks

- [x] API: validation/service/routes, additive assigned_messages migration and recovery inventory; retire legacy routes; focused tests and loopback-only synthetic integration with retained UI fixture/cleanup. Cover wrong role/assignment/reference, cursor ties/pair binding, all-or-none recipient ack, exact retry/body conflict and legacy retirement. No schema backfill because hosted legacy count is zero; verify again after retirement.
- [x] Portal: typed API and generation-aware conversation controller; assigned inbox, chronological paginated messages/manual refresh, exact visible acknowledgements, guarded retry composer, linked photo/routine reference detail and feedback entry points; focused tests and build/lint/typecheck.
- [x] iOS: native Messages tab, account-protected pair-bound draft repository, current conversation/manual refresh/older, exact visible acknowledgements, native composer with frozen retry; linked reference detail; focused tests and signed build.
- [x] One independent review and scoped fix wave. Actual local patient/clinician exchange plus reference/unread verification using synthetic clients. Exact cleanup; no repeated camera/notification matrix.
- [x] Document evidence/limits, commit/push/green CI/merge, additive hosted migration and API/portal deployment, confirm aliases and legacy zero count, clean owned branches/services. Complete expansion goal only after all features delivered.

## Decisions

Ruling: preserve legacy table and retire unused legacy endpoints; no speculative import since hosted count is zero. Cost if unexpected records appear: import before claiming full historical availability.
