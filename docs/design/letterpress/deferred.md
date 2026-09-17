# Letterpress: controls deferred until the capability exists

Drawn in the mockups, omitted from the build (owner decision 2026-09-17). Add each only when the behaviour behind it ships.

| Surface | Control | Missing capability |
|---|---|---|
| iOS After the camera | "Send to Dr. Om" off switch | Photos always share after upload; no local-only mode |
| iOS After the camera | "Attach to this morning's routine" | No photo↔routine link; needs a schema column (spec §0 forbids) |
| iOS Profile | Auto-share | No preference or behaviour |
| iOS Profile | Keep originals | No preference or behaviour |
| iOS Profile | PDF export | No export |
| Portal Account | Practice details | No practice model |
| Portal Account | Notification toggles | No clinician notification preferences |
| Portal Account | Session timeout | No configurable session policy |
| Portal Account | Audit-log export | No audit log |
| Portal nav rail | Worklist count, Messages unread dot, "Check-in forms" item | The rail loads no worklist or inbox data; there is no standalone forms page |
| Portal Workspace header | Age, sex and diagnosis line | No such patient fields |
| Portal Workspace header | "Adherence 79% / 14d", "2 of 4" position, tab counts | Worklist-only data; the workspace does not load the worklist or every tab's totals |
| Portal Workspace · Photos | Overlay and Grid compare modes | Not built; side-by-side comparison with zoom ships first |
| Portal Workspace · Photos | "Mark 3 reviewed" header action | Reviews are recorded one photo at a time; a bulk action would be a new flow |
| Portal Workspace · Photos | "Save draft" for a photo reply | Replies are not stored until sent |
| Portal Workspace · Routine | One-line change summary per version ("Adapalene reduced to 3 nights") | Revisions store no change note |
| Portal Workspace · Check-ins | Form schedule ("sent Sundays 18:00") and "Send now" | Forms have no schedule or send action |
| Portal Workspace · Check-ins | Response rate ("6 / 8") | Without a schedule there is no expected-response count to divide by |
| Portal Messages | Search patients | The inbox API has no search |
| Portal Templates | "In use" column ("9 patients") | No link from a patient routine to the template it was copied from |
| Portal Sign in | "HIPAA-aligned handling · sessions expire after 30 min idle" | No verified compliance claim and no idle timeout; the page states the real session behaviour instead |
| Portal Account | Save profile (display name, credentials shown to patients) | The portal has never edited clinician profiles; adding a write flow is outside the redesign |
