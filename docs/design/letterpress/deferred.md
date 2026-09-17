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
| iOS Check-in | "due today" in the eyebrow | No check-in schedule; forms carry no due date |
| iOS Check-in | "Save draft" button | Not needed: the draft file is written on every answer; the header says "Draft saved on this device" |
