# Client expansion (September 2026)

Source: [client brief](client-brief-2026-09-14.md), [treatment-history spec](intake-treatment-history-spec.md) and GitHub issue #13 (same content). The brief also mentions a "flow gap checklist" that was not attached.

The owner chose to go straight to working features and delegated implementation decisions. Out of scope per the client: e-prescribing, pharmacy integration, HIPAA infrastructure and licensing. The app remains a synthetic demo, not approved for clinical use.

## Releases

| Release | Client priority | Scope | Spec | Status |
|---|---|---|---|---|
| 1. Enrollment and safety | P1 | Eligibility + consent, refer-out / needs-in-person with refund status, urgent flag; legacy cleanup | [spec](../superpowers/specs/2026-09-15-enrollment-and-safety.md), [verification](enrollment-safety-verification.md) | Built and verified, awaiting release |
| 2. Intake and orders | P2 | Structured intake with treatment history and provider rollup; manual order/shipment tracker | — | Planned |
| 3. Follow-up and renewal | P3 | Clinician 3-month comparison with better/same/worse marker; renewal choice | — | Planned |

## Decisions and defaults (confirm with the client)

| Question | Default in the app | Why | Cost if the client wants otherwise |
|---|---|---|---|
| Licensed states | `LICENSED_STATES` env; demo list CA, FL, IL, NY, TX | No list supplied | Change one setting |
| Minimum age | 18 (`MINIMUM_PATIENT_AGE`) | Minors need guardian consent, which is not built | Setting, plus a guardian flow if under-18s are allowed |
| Pregnancy | Pregnant or breastfeeding: not eligible; trying to conceive: eligible, flagged to clinician | Common acne medications are unsafe in pregnancy | Edit the rules module; add a rules version |
| When screening happens | Right after first verified sign-in, before onboarding | Storing sensitive answers before an account exists would need an anonymous data store | A pre-account screener with its own retention rules |
| Consent text | DRAFT placeholder, versioned in code with a hash recorded per acceptance | Legal text must come from the client | Add a version with the real text; patients re-accept |
| Payment and refunds | No payment exists; refund is a status the practice sets (pending → issued) | Payment processing is out of scope | A payment provider integration |
| Monthly message limit | None exists, so urgent reports trivially don't count | Not built | Add a limit to messaging only |
| Urgent reports | Flagged at the top of the clinician queue; emergency 911 notice; no response-time promise | No coverage policy yet | Coverage policy and optional alerts |
| Enforcement rollout | `ENROLLMENT_ENFORCEMENT=off` in production until the updated iOS app is installed | Older installed builds would otherwise fail on gated writes | Turn on after install |

## Questions for the client

1. Which states is the practice licensed in, and should under-18 patients be accepted with a guardian?
2. Confirm the pregnancy rule above, and who handles isotretinoin (iPLEDGE) patients.
3. Consent wording, refund policy wording, and the monthly message limit (if any).
4. Who watches urgent reports, and during which hours?
5. Please send the "flow gap checklist" mentioned in the treatment-history spec.
6. When a clinician changes a "refer out" decision to "needs in-person" (or back), is one refund owed or two? The app currently creates a separate pending refund per decision recorded, so changing the decision twice creates two pending refunds.
7. Please confirm the licensed-state list. The demo default (`LICENSED_STATES`) is `CA, FL, IL, NY, TX`; TX is included only as a placeholder.
