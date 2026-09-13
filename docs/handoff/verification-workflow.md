# Verification working agreement

User feedback after T4: the four-hour verification cycle was unacceptable. Subsequent phases must keep verification bounded and make progress visible.

- Define the phase's acceptance checklist before implementation. Do not expand it mid-run unless a concrete defect or changed requirement makes that necessary.
- Batch implementation and run one final integration pass. Reuse valid evidence when the covered code has not changed.
- After a fix, rerun the focused check that covers it. Do not repeat the complete device, accessibility, performance, and backend matrix for unrelated changes.
- Prefer a short user-led hardware walkthrough when camera, Photos selection, device authentication, or other human interaction is intrinsic. Repeated automation-harness failures should trigger a change of approach, not repeated password prompts and test restarts.
- Collect review findings into one fix wave and one scoped rereview. Preserve known limitations honestly instead of chasing a blanket green label.
- If new work materially expands the phase, explain the concrete defect and expected additional work promptly. Avoid repeatedly describing an unfinished check as the last check.
- Once the agreed acceptance is met, commit, push, and complete the authorized integration. Keep deployment and clinical/product decisions explicit.

This is a workflow constraint, not permission to conceal defects or skip checks required for the changed behavior.

- Finish each authorized release with a sanitized deployment/verification record and current handoff status committed and integrated into GitHub. Do not wait for the user to request routine documentation housekeeping. Keep demo credentials, account manifests, photos and signing artifacts private.
