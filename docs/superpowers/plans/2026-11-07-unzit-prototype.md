# UNZIT proposal prototype implementation

**Goal:** Apply patient-visible UNZIT branding and capture a static, DEBUG-only patient flow in the current Letterpress visual system.

**Architecture:** Preserve existing production types and identifiers. Two false launch flags hide existing adherence and clinician forms entry points. A DEBUG argument router bypasses account startup and presents sample-only views under `ClearAF/Views/Prototype`; no API, payment, identity or photo upload integration is added.

**Implementation and acceptance**

- [x] Update copy, display name, permission prompts and wordmark; adjust string and rendering assertions.
- [x] Preserve hidden feature implementations behind launch flags.
- [x] Reuse Letterpress page, rule, toggle, button, field and progress primitives across 11 proposal screens. History supports two pages and pregnancy branching; source report supplies verbatim questions and photo instructions.
- [x] Add safe DEBUG-only argument parsing and existing sign-in / empty messaging routes.
- [x] Build Debug with the supplied command and run ClearAFTests serially; resolve failures.
- [x] Capture each route on iPhone 17 with a clean status bar, inspect every PNG, fix layout issues.
- [x] Commit on feature/unzit-launch-prep without pushing; record results and limitations in the delegated report.

**Clinical/content boundaries:** All consent documents remain draft v1.0 reader placeholders. Membership inclusions are draft; the weekly upgrade price and scoring method remain undefined. Use protocol turnaround of 1 to 2 business days (client also mentioned 48 hours). No prototype represents a reviewed patient plan.
