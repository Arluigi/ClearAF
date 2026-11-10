# UNZIT 2.0 content verification — November 9, 2026

The new immutable `backend/src/content/catalogs/2.0-pending-review.json` transcribes the three owner-supplied v2 PDFs. PDFKit extraction and complete approval review stay ignored under `.local/content/v2/`; no PDF or extracted text is committed. The readable approval artifact is `.local/content/v2/wording-review-v2.md`, generated from the actual importer result, including every question, helper field, branch, consent, guidance block and inactive template.

## Approval state and source discrepancies

- Corrected sections: says Dr. Om authorized all fixes November 9. It still requires a vet pass of actual capture-screen wording before launch. Templates remain inactive drafts; this is not final legal approval.
- Intake: explicitly **DRAFT for Dr. Om review**, including dated clinical reconciliations and clinician decisions. It declares itself the patient-screen source of truth; its A7/F guidance supersedes differing corrected-section Part B text and the obsolete M6 reference becomes B8.
- Telehealth Informed Consent, Medication Consent, Privacy Notice and Subscription Terms each explicitly say **DRAFT — pending Dr. Om and Offit Kurman counsel approval. Not for use until approved.** The preamble's factual/policy confirmation does not approve the forms.
- The full consent PDF replaces the corrected-section changelog's stale placeholder claims with concrete terms. Source internal Version 1.0 and the Privacy Notice's November 30 legal date remain verbatim; numeric consent identity advances from 2 to 3, publication metadata uses November 9, and the catalog remains draft with no approval reference.
- The intake's pregnancy-safe subset names only azelaic acid, clindamycin and benzoyl peroxide, whereas its dapsone matrix omits pregnancy. The draft implementation follows that three-agent subset and exposes this discrepancy for clinician review. Sulfites have no source-supported automatic drug mapping: record and flag the reaction for ingredient review. G6PD/anemia history creates no dapsone gate.

## Structural changes

V1 remains byte-identical (SHA256 `0c75ed4c921cf8f99354ef5343f9280f624a284b0ca467f97cd783a95efe0b06`). Its installed-client/case path remains available. V2 requires explicit `X-UNZIT-Questionnaire` selection; only pristine trigger-created cases may be pinned on opt-in. Publication selection is explicit in the importer, hosted content bootstrap and local integration script.

The replacement has 10 gate entries, 47 medical/attestation/helper entries and six nested treatment-history fields, plus capture/destination data. It introduces W/A–H identities; date/NC/acne/red-flag/isotretinoin gates; conditional contraception, allergy and repeated treatment details; four-way medication preference; skin ingredients, procedures, fears, goals and complete patient voice; pregnancy/medication screening; B8 conditional chest/back photos; F2 and six H attestations; deferred Care pharmacy and mandatory NC All-In shipping. All required clinical intake/photos precede v2 payment. Existing seven check-in field/option identities remain unchanged.

Backend validation, iOS form/draft/routing/correction logic and portal full-answer/clinical summaries share the v2 shape. Additive catalog guidance/metadata and case intake/decision projections preserve the legacy envelope and contract version. Clinician hold clearance requires a personal decision note and separate later approval; screening decisions bind to the unchanged intake. Submission and approval bind selected plan and verified DOB. External prescription records remain recorded-only, with source screening and Vida product checks; legacy v2 prescription write bypasses are closed. No migration was needed.

The private approval artifact contains the complete old-to-new question mapping, every type/choice/condition, and all further structural changes. Care $39 / All-In $89 remain settings, with Stripe, Vida, NC attestation, and review within 1 to 2 business days. No new scores, streaks, emoji or motivational copy were added. No plan-decision conflict was introduced.

## Verification

- Backend: `npm test` — 528 passed; `npm run build` passed.
- Portal: `npm test` — 313 passed; `npm run typecheck` and `npm run lint` passed.
- iOS: full `ClearAFTests` — 357 passed, one existing skip, zero failures; after final routing fixes, focused intake/enrollment/photo tests — 20 passed. Both used iPhone 17, `/tmp/clearaf-unzit-int-build`, ad-hoc signing and `xcbeautify`.
- Importer dry-run: four documents, 57 top-level entries, six inactive templates, zero applied. Four exact-body SHA256 values and complete normalized-source fidelity checked; parsed publication SHA256 `99caa5d3d355bcbe6967c14ef4215d8dc94a7cb236653719c677152b4318abb9`.
- `unzit-integration-live.cjs --catalog-version 2.0-pending-review` — nine checks passed, zero failed. Real local allowlisted signup, both plans, pregnancy/conditional chest-back photos, denied premature checkout, paid correction and immutable-photo reuse, manual identity/case reviews, external prescription record, monthly Care follow-up scheduling, exactly-once full rejection refund, private photos without EXIF. Previous active settings pointer restored; synthetic evidence retained privately.
- Independent contract and care-access reviews completed. Their identified implementation defects were fixed and regression-tested. Shared authentication/role/ownership gates remain intact; additional targeted v2 denial tests cover foreign prepayment medical/capture/photo-set writes, non-designated hold clearing and legacy prescription write routes.

All execution was local. No hosted Supabase, GCP or Vercel operation or deployment occurred. Initial framework/Prisma startup loaded dotenv automatically before verification guards were installed; no protected values were opened manually or printed. Final backend/portal verification and local journey used fresh local CLI settings with protected file reads blocked. Device-camera operation, real Stripe checkout and clinical/legal approval are outside this synthetic verification.
