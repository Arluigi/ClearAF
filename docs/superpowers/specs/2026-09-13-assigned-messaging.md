# Assigned-clinician messaging and linked feedback

Third release of docs/features/expansion.md. The owner explicitly approved one private text conversation between patient and their currently assigned clinician, unread counts and manual refresh, with photo/routine feedback in the same conversation linked to its source. No file attachments.

## User flow

Add Messages as fourth native iOS tab and a portal navigation destination. A patient opens their current assigned conversation; an unassigned patient sees an accurate unavailable state. Clinician inbox lists current assigned patients with recent message and unread count, supports selecting an assigned patient with no existing messages, and opens one conversation. Patient workspace has a Messages link carrying patient context.

Newest messages appear first in retrieval but are rendered in chronological order within the loaded page; Older loads stable cursor pages without losing drafts. Explicit refresh retrieves new items; no claim of instant push delivery. A visible “Sent” state means accepted by server. Keep composer text/stable UUID through transient/lost-response failure; explicit retry cannot duplicate a message. No automatic retry to a newly assigned clinician. Bound content to trimmed 1–4000 characters, plain text only; render as text, never HTML.

Unread state changes only for received messages actually displayed, via an explicit authenticated acknowledgement of bounded exact message IDs. Fetching a page must not mark unloaded history read. Marking is idempotent, recipient-only and current-assignment checked. No typing indicator, delivery/read promises or response-time guarantee.

## Linked feedback

A clinician can start feedback from a shared photo or routine revision. The message contains a typed optional reference to that exact authorized record, never an arbitrary URL or user-supplied owner. Server verifies referenced record belongs to the conversation's patient and current clinician has access. Display a contextual link/date/name without embedding a signed photo URL into message storage. Opening reauthorizes at that moment; unavailable references show a truthful state. Patient replies use the same conversation. Existing historical records and review status are separate from message read state.

## Persistence and safety

Review the legacy messages API before reuse: it currently has unbounded lists, incomplete pagination, and a patient GET that marks all received messages read. Replace these behaviors for the active feature; do not expose legacy attachment URL fields or manufacture messages. Choose additive schema supporting typed UUID sender/recipient pair, server sent time, stable client ID/idempotency conflict, exact read acknowledgements and optional authorized record reference. Existing message records remain preserved; migration compatibility must be explicitly documented rather than silently dropping history.

Every read/write requires server-verified role/session and current assignment. Clinician A loses access after reassignment; old messages are not silently transferred to clinician B. Writes serialize against assignment changes via the patient-profile lock. Client account generation scopes requests, drafts and histories, rejecting late responses after sign-out. New tables have RLS and no direct public/anon/authenticated grants. No hard delete, retention policy, external notification provider, attachments or clinical response promise added.

## Acceptance

Focused tests: unrelated-role/assignment access denial; no cross-conversation reference; bounded stable pagination including equal timestamps; current recipient-only exact read acknowledgement; lost-response retry dedupe/body-conflict; revoked session/reassignment; account-switch stale response and preserved same-account retry draft. Real local synthetic patient-to-clinician and reply flow in both clients; unread count matches actual displayed messages. Care Journal light/dark/large-text and native tab behavior on changed surfaces. One integration/review wave; no camera test. Document hosted migration/API/client compatibility and remaining notification/response-policy limits.
