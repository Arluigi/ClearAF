# Launch wording publications

`1.0-pending-review.json` is the client-source draft prepared on November 9, 2026.
It contains four eligibility questions, 23 medical questions (including medication
preference after M11), four separate consent documents at numeric version 2,
photo and identity guidance, seven follow-up fields, and six routine templates.
The six source templates are clinician plan-builder starting points, not automated
prescriptions or automatically sent messages. Imported template revisions remain
inactive and are named `DRAFT: …`.

The owner-supplied `.local/content/sources.md` is a summary of unsigned source
documents, not their full text. Intake prompts and labels and routine instructions
are transcribed from that summary; consent bodies are draft adaptations of its
summaries with plan decisions applied. They are not the full original legal forms.
Clinical/legal approval, the legal effective date, retention, and the privacy
mailing address remain pending. Consent `effectiveAt` records this draft's
publication date, not an approved legal effective date. No approval is implied.

Use `backend/scripts/import-launch-content.cjs` after the backend build. Bind the
publication's `clinicianId` in a private operator JSON input to the designated
clinician UUID; it is intentionally absent from the versioned wording file.
Pass that input to the importer for validation (dry-run), then `--apply` for an
authorized local publication. The importer validates local targets and preserves
existing billing settings. Never put credentials or patient data in this catalog.

Question/choice IDs retain the existing v1 contract. Guidance is versioned in
`launch_settings.content`; the existing `/catalog` projection does not expose
these additional guidance fields to either client. Client capture-screen guidance
remains separately implemented. No response shape changes are part of this load.

Replace wording through a new versioned file and a new immutable publication;
increment each changed consent's own numeric version. Do not overwrite accepted
document identities. Current Care/All-In amounts come from launch settings, never
from this JSON. All patient review timing uses “within 1 to 2 business days.”
The private approval document is `.local/content/wording-review.md`.
