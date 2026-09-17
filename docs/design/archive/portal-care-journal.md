# Care Journal — clinician portal pass

Implements the portal portion of [the approved guide](design-language.md): semantic light/dark colors following system appearance, system sans typography with a serif patient identity heading, quiet opaque surfaces, visible control boundaries, restrained navigation and clear routine save state. Sign-in, account, patient list, shared photos and routine editing use the same foundations. No API, database, clinical guidance or iPhone installation changes.

Patient review now opens `/patients/[id]` as a dedicated workspace. The fixed header retains patient identity. Back to patients preserves the name filter and page in the URL; direct/reloaded links restore the same list context. Existing authorized API calls, request cancellation, routine versions, pending-save retry behavior and photo-detail dialog remain in use.

Routine editors explicitly show unsaved changes. Patient/workspace navigation uses ordinary page links so the browser's page-unload warning also covers browser Back. This is not persistent draft storage; explicit sign-out clears the session and drafts. Existing failed-save draft/retry behavior remains unchanged.

## Verification

All 66 portal tests pass, including URL context restoration and numeric contrast checks against both actual CSS palettes. Lint, TypeScript and production build pass. Text/action/error pairings meet 4.5:1 and control boundaries meet 3:1 in both themes.

Focused local browser review used exact owned synthetic accounts on local Supabase and an isolated API port. Checked sign-in, filtered list to patient workspace, saving a morning routine (version 1), returning to the retained filter, and dark desktop/narrow (390 × 844) layouts. Canceling the initial unsaved-change warning retained the draft; the native dialog stalled browser automation and the user dismissed it. Review then replaced SPA links with document navigation to cover browser Back through beforeunload; that final warning was reviewed in code, not retested interactively. Light appearance was checked numerically, not with a separate browser screenshot. No full screen-reader or backend/device matrix was rerun locally.

The hosted synthetic demo is retained. Local review fixtures are temporary; private credentials and screenshots are excluded from Git. The iPhone remains on its previously installed demo build.
