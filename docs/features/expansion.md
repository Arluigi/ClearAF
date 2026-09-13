# Approved feature expansion

The owner approved all seven proposed additions plus a Messaging tab on September 13, 2026. They explicitly confirmed assigned-clinician text messaging with linked photo/routine feedback, and clinician-configured check-ins with no default clinical questions. Implementation, testing and routine integration are delegated; repeated approval is not needed for those decisions.

Deliver as bounded releases:
1. Photo comparison and review workflow: compare two dated photos, factual reviewed/not-reviewed state, clinician new-upload queue.
2. Routine support and check-ins: clinician-owned reusable routine templates copied into versioned patient assignments; factual dated completion calendar; optional patient-controlled local reminders; versioned clinician-authored questions/choices and patient responses.
3. Messaging and linked feedback: native iOS Messages tab and portal Messages destination; current assigned clinician only; private text conversation, paginated history, unread counts, explicit refresh; photo/routine feedback links reference authorized records. No attachments in this first version.

No automated outcomes, default clinical advice, response-time promises, prescribing or commerce. Clinical review/support coverage and retention/account-removal policy remain pilot decisions. No distribution work. Existing hosted synthetic demo retained; development fixtures are exact owned local identities. Each release gets a scoped regression/integration pass, review, GitHub integration and a sanitized verification/release record.

## Delivered September 13, 2026

All three bounded releases are merged: [photo review/comparison PR #10](https://github.com/Arluigi/ClearAF/pull/10), [routine support/check-ins PR #11](https://github.com/Arluigi/ClearAF/pull/11), and [assigned messaging PR #12](https://github.com/Arluigi/ClearAF/pull/12). API and portal deployments are verified; iOS features are signed-build/Simulator verified. The disconnected physical iPhone still needs the updated app installed. See [photo review evidence](photo-review-verification.md), [care support evidence](care-support-verification.md), and [messaging evidence](messaging-verification.md). Pilot policy and distribution remain separate; no additional feature phase begins automatically.
