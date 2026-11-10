# Launch wording publications

Catalog files are immutable publications. Replace wording by adding a new versioned
file; never overwrite a previous publication or accepted consent identity. Both
publications below remain drafts pending clinical and legal review. Import does
not establish approval for clinical use or distribution.

## 2.2-pending-review

`2.2-pending-review.json` inherits 2.1 and incorporates the clinician's capture
wording review. Nonlegal patient copy addresses “your doctor”; historical 2.0
and 2.1 remain immutable. The four legal bodies, SHA256 digests and corrected
NC license `2022-00012` are unchanged. Consent metadata advances to numeric
version 5 and label 2.2 under the existing publication identity rules; each
acceptance remains separate. Legal wording is still pending counsel review.

## 2.1-pending-review

`2.1-pending-review.json` adds capture, review and retake copy to the API guidance
for identity and all six clinical photo slots, shared by enrollment and check-in.
The intake v2 A7 and F source wording retains precedence over the older corrected
non-intake Part B text. All existing intake questions, slot conditions and guidance
wording are unchanged. Optional typed `copy` fields preserve older client decoding.

Instructions absent from the supplied v2 sources use the preexisting Swift wording
verbatim and are individually marked **needs clinician wording** in
`docs/features/capture-catalog-verification.md`. This publication remains a draft,
not clinical approval. `2.0-pending-review.json` stays byte-for-byte immutable.

Consent bodies and SHA256 digests are unchanged. Their numeric versions advance
to 4 because their publication labels change to 2.1; existing version 3 acceptance
identities retain their original labels and text. New versions do not reuse old
acceptances. The follow-up form label advances while its question IDs remain stable.
No hosted publication or deployment is performed by this change.

## 2.0-pending-review

`2.0-pending-review.json` transcribes the complete owner-provided November 9, 2026
intake v2, complete consent drafts, and corrected non-intake wording PDFs. It
contains the W/A–H questionnaire, conditional follow-ups and treatment-history
fields, six individual final attestations, exact exit/hold copy, photo and identity
guidance, four complete standalone consents, seven unchanged follow-up fields,
and six corrected routine templates. PDF line wraps, punctuation spacing and
ligatures are normalized; patient wording is preserved.

Each consent has numeric version 3 and a SHA256 digest of its full stored UTF-8
body. Its source `Version 1.0 — DRAFT` line remains in that body; the publication
label and numeric acceptance identity are separate metadata. `effectiveAt` records
the November 9 draft publication, while the Privacy Notice's claimed November 30
legal effective date remains in its draft body. Neither date implies approval.
The concrete source policies and contacts replace the earlier summary adaptations
without independently verifying those policy claims. `approvalReference` is null.

The intake v2 document calls itself the single source of truth for its capture
screens, so its A7 identity and F photo wording controls where it differs from the
corrected non-intake PDF's older Part B guidance. Chest/back conditions reference
B8. Guidance and intake metadata are exposed additively for clients; earlier
questionnaire records retain their original identities and interpretation. Legacy
identity `items` remain a compatibility projection; v2 screens use the complete
`prompt` and individual `attestation`. The actual rendered capture screens still
require the source-requested clinical wording review before launch.

All six templates are clinician plan-builder starting points. The importer names
them `DRAFT: …` and keeps them inactive; they do not automatically prescribe or
send treatment messages. Dark marks now includes a separate hydroquinone course
and warning step. Check-in wording and stable UUIDs are carried forward because
the supplied v2 intake specifies no replacement follow-up questionnaire.

The private transcription and source-conflict record is
`.local/content/v2/catalog-report.md`. Source PDFs, extracted text, working scripts
and operator inputs stay ignored and must never be committed.

## 1.0-pending-review

`1.0-pending-review.json` is the earlier client-source draft prepared on November
9, 2026. It contains four eligibility questions, 23 medical questions (including
medication preference after M11), four separate consents at numeric version 2,
photo and identity guidance, seven follow-up fields, and six routine templates.

Its owner-supplied `.local/content/sources.md` was a summary of unsigned source
documents, not their full text. Its consent bodies are short draft adaptations,
not complete original legal forms. Clinical/legal approval, legal effective date,
retention and privacy mailing address were pending in that publication. Its
question/choice IDs retain the original v1 contract, and its guidance was not
exposed by the original `/catalog` projection. Those historical source facts are
not retroactively rewritten by v2.

## Importing a publication

After the backend build, run the importer with an explicit immutable catalog
version and designated clinician UUID:

```sh
node backend/scripts/import-launch-content.cjs \
  --catalog-version 2.0-pending-review --clinician-id UUID
```

The default validates without writing. Append `--apply` only for an authorized
local publication. The clinician ID is intentionally absent from catalog files.
The importer reads configuration from its process environment; it does not load
a dotenv file. Apply validates local targets, preserves existing billing settings
and rejects mutation of existing consent versions. Never put credentials or
patient data in a catalog.

Current Care/All-In amounts come from launch settings. Dollar amounts inside
complete draft consent wording describe the supplied source policy and do not
change billing configuration. Runtime review timing remains within 1 to 2
business days, preserving the complete source's exact patient wording where it
says `usually within 1 to 2 business days`.
