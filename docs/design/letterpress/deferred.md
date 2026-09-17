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
| iOS Routine | PRESCRIPTION chip on steps | Routine steps carry no prescription flag |
| iOS Routine | "Earlier versions of this routine" row | No patient API lists previous routine versions |
| iOS Routine | "Assigned by Dr. Om" byline | Revisions store the author's ID, not a name; the byline reads "Assigned on 2 Sep" |
| iOS Today | Check-in "4 questions · due today" | No check-in schedule; the form loads only inside Check-in |
| iOS Notes | "Attach a photo" | Patient notes carry no photo reference; the client rejects a patient message with one |
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
| iOS Check-in | "due today" in the eyebrow | No check-in schedule; forms carry no due date |
| iOS Check-in | "Save draft" button | Not needed: the draft file is written on every answer; the header says "Draft saved on this device" |
| iOS Sign in | "Use a magic link" | `SupabaseService` exchanges callback codes (confirmation, recovery) but has no send side (`signInWithOTP`); adding one is an auth-flow change (spec §0) |
| iOS Sign in | "Invited by a practice?" line | No invitation flow; patients create their own account |
| iOS Onboarding | Clinician credentials ("MD · Medical & cosmetic dermatology") | No credentials field; only the assigned clinician's name is available |
| iOS Onboarding | "We hold the last one up as a guide" | No capture overlay (spec §6 #4: native camera, no ghost) |
| iOS Onboarding | "Everything you record is private until you share it" | Photos share with the assigned clinician after upload; the copy says so |
| iOS Compare | "Share" | No way to share clinical photos outside the record; adding one is a data-handling change |
| iOS Compare | "by Dr. Om" on routine changes | Revisions store the author's ID, not a name |
