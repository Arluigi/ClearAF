# ClearAF — Letterpress 1.0 · Developer Handoff Spec

**Repo:** `Arluigi/ClearAF` (`main`) · iOS app (`ClearAF/`) + Next.js clinician portal (`web-portal/`)
**Status:** design approved. This is a **re-skin plus three re-sequencings**, not a rebuild.
**Supersedes:** `docs/design/design-language.md` (Care Journal v1.0).

---

## 0. Read this first — scope boundaries

**Do not change:**

- Any Supabase schema, RLS policy, table, column or RPC.
- Auth flows, session handling, or who can see what.
- Routine **versioning semantics**: saving an edit creates a new version; the patient stays on the previous version until save completes.
- Check-in **form versioning**, required-field flags, or draft behaviour.
- Photo **share/review state machine**: local save → upload → shared → reviewed-by-clinician.
- Review-queue **ordering** (oldest unreviewed upload first) or any existing pagination.
- Timezone handling for completions.
- Message photo/routine **reference** payloads.

**Do change:** colour, type, spacing, radii, borders, component structure, copy strings, and the three screens noted in §6 as re-sequenced (portal worklist, portal patient workspace, mobile photo record).

**Never introduce:** a skin score, streak, grade, adherence target line, celebration state, emoji, or any promise about outcomes. If a number cannot be sourced from real events, omit the block rather than estimate it.

---

## 1. Design tokens

One accent, and it is the ink itself. There is no brand hue. Ochre is the only chromatic colour in the system and it is reserved for **unread** and **prescription**.

### 1.1 iOS — replace `ClearAF/Views/DesignSystem.swift`

Delete the `CareJournal` role set and every wellness/score extension (`skinPeach`, `calmBlue`, `gentleGreen`, `softLavender`, `score*`, `glowShadow`, all gradients). Replace with:

```swift
import SwiftUI

enum Letterpress {
    // Paper
    static let canvas   = Color("lp.canvas")    // light #F2EFE7  dark #171716
    static let surface  = Color("lp.surface")   // light #F9F7F1  dark #1F201E
    static let rail     = Color("lp.rail")      // light #EDEAE1  dark #1C1D1B
    static let sunk     = Color("lp.sunk")      // light #E8E3D6  dark #24251F

    // Ink — also the action colour. Do not introduce a hue.
    static let ink          = Color("lp.ink")          // light #121312  dark #EFEDE4
    static let inkSecondary = Color("lp.ink.secondary")// light #56544D  dark #A8A69C
    static let inkTertiary  = Color("lp.ink.tertiary") // light #5F5D55  dark #8F8D84
    static let inkFuture    = Color("lp.ink.future")   // light #64625A  dark #8B897E
    static var action: Color { ink }

    // Attention — unread + prescription ONLY
    static let attentionMark = Color("lp.attention.mark") // light #A6701F  dark #D9A64A  (graphics only)
    static let attentionText = Color("lp.attention.text") // light #6E4709  dark #E8C48A
    static let attentionWash = Color("lp.attention.wash") // light #F0E6D2  dark #33291A

    static let error = Color("lp.error")  // light #9A2015  dark #FFB3A6
    static let rule  = Color("lp.ink").opacity(0.13)

    // Type — ship Newsreader + IBM Plex Sans/Mono in the bundle
    static func display(_ size: CGFloat, relativeTo t: Font.TextStyle = .largeTitle) -> Font {
        .custom("Newsreader-Light", size: size, relativeTo: t)          // weight 300
    }
    static func ui(_ size: CGFloat, weight: Font.Weight = .regular,
                   relativeTo t: Font.TextStyle = .body) -> Font {
        .custom("IBMPlexSans", size: size, relativeTo: t).weight(weight)
    }
    static func data(_ size: CGFloat, relativeTo t: Font.TextStyle = .caption) -> Font {
        .custom("IBMPlexMono-Medium", size: size, relativeTo: t)
    }
}
```

Add each colour as an **asset-catalog colour set with Any/Dark appearances** using the hex pairs above — not as hardcoded `Color(hex:)`, so dark mode and Increase Contrast work for free.

### 1.2 Web — `web-portal/src/app/globals.css`

Replace the HSL token block. Keep the `:focus-visible` rule but make the ring a 2px ink outline.

```css
:root {
  --canvas:#F2EFE7; --surface:#F9F7F1; --rail:#EDEAE1; --sunk:#E8E3D6;
  --ink:#121312; --ink-secondary:#56544D; --ink-tertiary:#5F5D55; --ink-future:#64625A;
  --action:var(--ink);
  --attention-mark:#A6701F; --attention-text:#6E4709; --attention-wash:#F0E6D2;
  --error:#9A2015;
  --rule:rgba(18,19,18,.13); --rule-strong:#121312;

  --font-display:'Newsreader',Georgia,serif;
  --font-ui:'IBM Plex Sans',-apple-system,system-ui,sans-serif;
  --font-data:'IBM Plex Mono',ui-monospace,monospace;

  --radius-flat:0px;   /* photos, chips, segmented, tables, calendar cells */
  --radius:4px;        /* buttons, step boxes */
}
.dark {
  --canvas:#171716; --surface:#1F201E; --rail:#1C1D1B; --sunk:#24251F;
  --ink:#EFEDE4; --ink-secondary:#A8A69C; --ink-tertiary:#8F8D84; --ink-future:#8B897E;
  --attention-mark:#D9A64A; --attention-text:#E8C48A; --attention-wash:#33291A;
  --error:#FFB3A6; --rule:rgba(239,237,228,.13); --rule-strong:#EFEDE4;
}
```

Load Newsreader + IBM Plex Sans/Mono with `display:swap` over a system-sans fallback.

### 1.3 Contrast — measured, and the rule that keeps being broken

Every ratio below is verified. **Measure against the *composited* background** — the `sunk`/`rail` tone or the glass result, not the page canvas. This was the single most common defect during design.

| Token | On canvas | On sunk | Dark |
|---|---|---|---|
| `ink` | 16.21 | 14.54 | 15.30 |
| `ink.secondary` | 6.60 | 5.91 | 7.35 |
| `ink.tertiary` | 5.74 | 5.15 | 5.39 |
| `ink.future` | 5.32 | 4.77 | 5.11 |
| `attention.text` | 7.12 | 6.60 (on wash) | 10.84 |
| `error` | 7.05 | — | 10.47 |

Floor: **4.5:1 for all text under 24px, mono labels included.** `ink.future` is the *only* de-emphasis token — never invent a lighter grey for "inactive" text.

---

## 2. Type

| Role | iOS | Web | Rule |
|---|---|---|---|
| Display | Newsreader 300, `.largeTitle` relative (≈40/34) | 30–46px | Greetings, patient names, screen titles, clinician words. Max 2 per screen. |
| Screen title | Newsreader 300 @ title (34) | 32–34px | Replaces the bold SF large title. |
| Section eyebrow | Mono 500, **10px**, `.16em`, uppercase | 10px | The one exception to the 11px floor. Never a sentence, never a control label. |
| Row title | Plex Sans 500, 16–17 | 15px | Sentence case. |
| Body | Plex Sans **450**, 15–17 | 14px / 24px leading | Max 74ch measure. |
| Metadata | Mono 400/500, 11–12 | 11–12px | Tabular figures always. `15 SEP · 07:12`. |
| Control label | Plex Sans 500, 13–16 | 13–15px | Never mono, never serif, never uppercase. |

Size floor: 11px, except uppercase letterspaced mono eyebrows at 10px. 13px minimum for anything a patient must read to act. All iOS type uses `Font.custom(_:relativeTo:)` so Dynamic Type scales.

---

## 3. Space, shape, depth

- **Spacing scale:** 4 · 6 · 10 · 14 · 18 · 22 · 28 · 44. iPhone gutter 22pt. Section gap 16–22. Row padding 11–14 vertical. Portal gutter 30–32px, nav rail 190–210px.
- **Radius:** `0` photos, chips, segmented, tables, calendar cells · `4` buttons and step boxes · `26` sheets and glass bars · `999` avatars, toggles, radio marks, capture button. **Nothing between 4 and 26.**
- **Rules not borders:** 1px `--rule` between rows and sections; **2px ink rule** for a major break (under the greeting, above a table head). A full border means "editable or bounded". No nested bordered boxes.
- **Depth:** content has **no shadow**. Glass chrome `0 2px 8px rgba(18,19,18,.10)` + `0 12px 30px rgba(18,19,18,.12)`. Segmented thumb `0 1px 2px rgba(18,19,18,.14)`. No glow, no coloured shadow.

---

## 4. Components

### 4.1 Buttons — height is platform-specific

Three variants: **filled ink** (one per screen; full-width on iOS), **outlined** (1px ink @32%), **text-underline** (`text-underline-offset:3px`). Radius 4.

- **iOS: 44pt minimum, pinned** — `min-height:44` with centred content, *not* derived from padding. Padding-derived heights drift below the floor when the real font resolves `line-height: normal` or Dynamic Type scales. This bug recurred three times in design; pin it.
- **Portal: 32–36px** for row, toolbar and inline controls (8–9px padding at 13px type). 44px only for a primary full-width action like Sign in. **Never apply the 44pt floor to a portal table row** — density is the portal's premise.
- Disabled = `sunk` fill + `ink.tertiary` **and a sentence saying why**.

### 4.2 Fields

Baseline rule, not a box: 1.5px ink when filled or focused, 1.5px ink @28% when empty. Persistent mono label above; placeholders are examples only. Validation sits under the field and says what to do, preserving the user's input. Portal editors may use a bordered `surface` field inside a bounded editor.

### 4.3 Segmented — native, square, ink-tinted

One family for every 2–3 mode switch: AM/PM, Grid/List/Compare, compare mode, worklist filter. iOS: native `Picker(.segmented)` with ink tint — no custom geometry, no `matchedGeometryEffect`. Track `sunk`, thumb `surface` + `0 1px 2px /.14`, square corners. At accessibility text sizes it becomes a menu.

### 4.4 Checklist row

Square 22pt checkbox (1.5px ink outline → ink fill + paper tick). Ruled rows, never cards. Title Plex 500/16–17, instruction 13. Prescription steps carry the `PRESCRIPTION` chip (`attention.wash` + `attention.text`, mono 11, square). Completed titles get a line-through at ink @32%.

Ticking a step is **local and reversible**; the filled button below is what records the completion against the routine version.

### 4.5 Photo tile — four states, in words

4:5, square corners, neutral mat, date in mono underneath, state spelled out:

| State | Label | Treatment |
|---|---|---|
| Local only | `On device` | plain tile |
| Queued | `Waiting to share` | label in `attention.text` |
| Shared | `Shared` | plain tile |
| Reviewed | `Reviewed` (+ name/date clinician-side) | plain tile |

Today's empty slot: 1.5px ink border + `sunk` fill + `TODAY`. Selection is an **inset ink outline**, never an overlay tint. Never tint, crop, filter or beautify a clinical photo; the uncropped original must always be reachable. Clinician-side thumbnails sit on near-black.

### 4.6 Adherence strip & completion calendar

Three states from real completion events: **both routines** = full-height ink bar / solid cell; **one** = 70% bar / half-split cell; **none** = 40% `sunk` bar / `sunk` cell. Today = 1.5px ink outline. Future days = `ink.future`.

No target line, no colour grading, no celebration. Label **"11 of last 14 days"** to patients; `79% / 14d` is clinician-side only.

### 4.7 Clinician note

Clinician words in the **display serif** with a 2px ink rule at the left — the one place a patient hears another person. No bubbles, no tails. Patient's own replies sit in a `sunk` block. Unread carries an `attention.mark` bar plus an `Unread · Dr. Om` eyebrow in `attention.text`; both drop to ink once read. Photo/routine references render as a labelled inline box with a thumbnail.

### 4.8 Glass contract

**Yes:** floating tab bar with the fused capture button · sheets and modals (including the post-capture review sheet) · scroll-edge effect under a large title · keyboard accessory row.

**No:** any card, row or reading surface · over a photograph being judged · **the camera** (native picker, unstyled) · a second glass layer over the system tab bar · **the portal, ever** · segmented controls.

Use standard system materials; never simulate glass with a manual blurred rectangle. Respect Reduce Transparency, Increase Contrast and Reduce Motion — the flatter result is correct, not a regression. Any text over glass must be measured against the composited result.

### 4.9 Portal table row

2px ink rule under the head, 1px rules between rows, `rail` fill on the row that needs you, `attention.mark` 4px left bar for waiting, tabular mono figures, exactly **one** filled button per row. No zebra striping, no card-per-row.

---

## 5. Required states — every feature ships all nine

| State | Treatment | Copy |
|---|---|---|
| Loading | Layout stays stable; name what's loading; never block the page | "Loading your photos" |
| Empty | Display-serif title, one sentence, one action. No large icon, no sample data | "No photos yet — take the first one today." |
| Populated | Task first, metadata in mono below | — |
| Selected | Ink outline / ink fill / `rail` row, from the component's own family | — |
| Disabled | `sunk` + `ink.tertiary` **and a reason** | "Recorded at 7:14 am. Comes back tomorrow." |
| Saving | Button locks, label changes, duplicate submits impossible | "Saving…" |
| Success | Local save and remote completion are **different events** | "Saved on this device. Waiting to upload." |
| Error | Keep the work, name the problem, retry repeats the same action | "Couldn't share. Your photo is safe on this device." |
| Stale / offline | `attention.text` eyebrow on the affected block only | "Last checked 8:40 am" |

---

## 6. Screen-by-screen build notes

### iOS — `ClearAF/`

| # | Screen | File | Notes |
|---|---|---|---|
| 1 | Sign in | `AuthenticationView.swift` | Baseline-rule fields. Surface the magic-link path already supported by `SupabaseService.handleCallback`. |
| 2 | Onboarding 2/5 | `OnboardingView.swift` | Rule progress + `02/05` mono. Concrete promise: what you do, who reads it, what stays private. No illustration slot. |
| 3 | Today | `DashboardViewEnhanced.swift` | Rule-separated sections: greeting → photo rail → checklist → unread note → check-in row. **Remove** `AnimatedScoreDisplay`, `StreakIndicator`, `ProgressInsight`, `EnhancedProgressBar`. |
| 4 | After the camera | `PhotoCaptureManager.swift` | **Capture is the native iOS camera — no custom capture UI, no ghost overlay, no viewfinder chrome.** Style only the sheet it returns to: 4:5 preview, optional note, explicit "Send to Dr. Om" toggle, "Attach to this morning's routine" toggle, Save to record. |
| 5 | Photo record | `ProgressView.swift` | Month rules replace page-number-only paging (keep pagination). 4:5 tiles with the four named states. Native segmented Grid/List/Compare. |
| 6 | Compare | **new view** | *New capability — no equivalent today.* Side-by-side / overlay / flip, photos on near-black, filmstrip pair picker, and a "what changed in between" timeline (routine version changes, completions, check-in answers). |
| 7 | Routine AM/PM | `RoutineView.swift` | Checklist rows. Version, timezone and unsynced-queue copy demoted **under** the action. 14-day strip links to the calendar. Earlier-versions row. |
| 8 | Completion calendar | `CompletionCalendarView.swift` | Three-state cells (both / one / none) — today's calendar only knows "completed". Today outlined, future in `ink.future`, per-day event list beneath. |
| 9 | Weekly check-in | `CheckInView.swift` | One question per screen, rule progress bar, required flags preserved, local draft, submit all at the end. |
| 10 | Notes | `MessagingView.swift` | Serif clinician turns with 2px rule, `sunk` patient blocks, mono timestamps, reference boxes. No bubble tails. |
| 11 | Profile & settings | `ProfileView` / settings sheet | One ruled list: care team, reminders, auto-share, keep-originals, PDF export, sign out. **Pushed view — no tab bar, no bottom spacer.** |
| 12 | Today (dark) | — | Same tokens inverted. No new values. |

**Tab bar** (`ContentView.swift`): four destinations — **Today · Record · Plan · Notes** — with capture fused into the bar centre as an *action*, not a tab. Native `TabView`, native material, mono labels, `.tint(Letterpress.ink)`. A tab is a destination: filters and actions never get one. Pushed detail views (profile, calendar, check-in, compare) have no tab bar and no bottom spacer.

### Portal — `web-portal/`

| # | Page | Files | Notes |
|---|---|---|---|
| 1 | **Worklist** | `app/patients/page.tsx`, `components/patients/PhotoReviewQueue.tsx` | *Re-sequenced.* Today: 14-row alphabetical table + separately-paginated review queue stacked above. Becomes: four counts (photos to review / unread messages / check-ins submitted / adherence under 60%), tab filter (Needs review · All patients · Flagged), **one** ruled table merging queue and list, adherence sparkline from real completion events, one filled button per row, sorted oldest-unreviewed-first. |
| 2 | Workspace · Photos | `app/patients/[id]/page.tsx`, `components/patients/PatientPhotoHistory.tsx` | *Re-sequenced.* Today the workspace is ~4,000px of single column with three paginations. Split into tabs: **Photos · Routine · Check-ins · Messages · History**. Compare becomes the **default view**, not a dialog. Right rail keeps current routine + latest check-in visible while writing feedback. "Send & mark reviewed" as one action. |
| 3 | Workspace · Routine | `components/patients/PatientRoutineCare.tsx` | Two panes (morning/evening). Make the draft visible: edited step tinted `attention.wash` with its previous value spelled out ("EDITED · WAS 'EVERY NIGHT'"), `V4 ACTIVE` + `DRAFT V5` badges, and copy stating the patient stays on v4 until save. Version history and template-copy sit beside the editor. |
| 4 | Workspace · Check-ins | `components/care-support/PatientCheckIns.tsx` | Question-by-question with required flags. Ordered-choice answers plot **as given** — never averaged into a score. Form version, schedule and response rate in the rail. |
| 5 | Messages | `app/messages/page.tsx` | Thread list + thread. Serif clinician turns, `sunk` patient replies, attach-photo-reference. |
| 6 | Templates | `app/templates/page.tsx` | Ruled table (name / version / in use / updated) replacing stacked raw links, plus inline editor with "Save as v4" and archive. |
| 7 | Sign in | `app/login/page.tsx` | Split layout, baseline-rule fields, ink quote panel. Session-policy line in mono. |
| 8 | Account | `app/account/page.tsx` | Profile + practice + notification toggles + session timeout + audit-log export. |

`components/ui/*` (button, input, badge, table, tabs): re-skin only — radius 4, square tables, hairline rules, mono numerals. **Behaviour untouched.**

---

## 7. Copy rules

Sentence case everywhere. No emoji, no exclamation marks. Never promise an outcome, never imply improvement from photo order, never grade adherence. Patient-facing dates written out ("2 Sep"); clinician-facing mono-stamped (`02 SEP · 07:04`).

| Write | Not |
|---|---|
| Record this morning | Complete your routine to keep your streak! |
| No completion recorded for Sunday | You missed your routine 😔 |
| Saved on this device. Waiting to upload. | Sync queued (pending state: 1) |
| Assigned by Dr. Om on 2 Sep · v4 | Your personalised skincare journey ✨ |
| 11 of the last 14 days | Skin score 82 · +3 this week |

---

## 8. Acceptance checklist — per screen

- [ ] Exactly one filled ink button
- [ ] No hue anywhere except reserved ochre (unread, prescription)
- [ ] No card a hairline could have done; no nested bordered boxes
- [ ] Glass only on floating chrome; camera is the native picker
- [ ] Every number in mono with tabular figures
- [ ] 4.5:1 for all text under 24px, mono labels included, measured against the **composited** background (glass and `sunk` tones included)
- [ ] Light and dark checked on device
- [ ] Largest accessibility text size doesn't clip; Reduce Transparency/Motion sane
- [ ] Keyboard focus visible on web (2px ink ring)
- [ ] All nine states from §5 implemented
- [ ] Buttons: iOS ≥44pt **computed** (pinned via min-height), portal 32–36px
- [ ] No bottom spacer on a pushed view
- [ ] No score, streak, grade or promised outcome
- [ ] Photos untinted and uncropped; original reachable
- [ ] No reference anywhere to retired tokens: `#0B4D45`, `#C2552F`, `skinPeach`, `calmBlue`, `gentleGreen`, `softLavender`, `score*`, `glowShadow`, any gradient

---

## 10. Identity — the mark

Approved direction: **the 4:5 frame with a tucked italic monogram** ("4a" in `ClearAF Logo - Directions.dc.html`).

### 10.1 What it is

A hairline rectangle at **4:5** — the exact aspect ratio of every photograph in the product — with a lowercase italic **af** tucked into its bottom-right corner. Newsreader Light (300), italic. The frame is the container; the photograph is the content. No illustration, no face, no gradient, no second colour.

### 10.2 Construction

Let **H** = frame height. Everything else derives from it:

| Measure | Value |
|---|---|
| Frame width | `0.80 × H` (4:5) |
| Stroke weight | `H ≥ 48`: `0.028 × H` (2px at 72) · `H 24–47`: `0.05 × H` (1.2–1.5px) · `H < 24`: 0.75px hairline |
| Monogram size | `0.39 × H` |
| Inset from **right** rule | `0.19 × frame width` — pulled deliberately left so the **f**'s terminal never touches or crowds the rule |
| Inset from **bottom** rule | `0.08 × H` — clears the **f**'s descender |
| Corner radius | **0 on all four corners.** Never round the frame. |

The right inset is the one measurement not to "optically improve": the **f** in Newsreader italic has a wide terminal, and at anything under 0.15 × width it reads as touching the rule.

### 10.3 Lockups

- **Primary (horizontal):** mark + wordmark `clearaf` in Newsreader 300, letter-spacing `.18–.20em`, lowercase, italic on the `af`. Gap between mark and wordmark = `0.4 × H`. Mark and wordmark are vertically centred on each other.
- **Mark alone:** app icon, favicon, avatar, any space under 120px wide.
- **Wordmark alone:** permitted in running text and legal footers only.
- **Clear space:** `0.5 × H` on all four sides of the mark, measured from the frame's outer edge. Nothing enters it — not a rule, not a nav item.
- **Minimum sizes:** mark 16px tall (favicon floor); primary lockup 96px wide. Below 96px, drop to the mark alone rather than shrinking the lockup.

### 10.4 Colour

Single-colour glyph, no knockout — so one asset serves every use:

| Context | Frame + letters | On |
|---|---|---|
| Default | `ink` #121312 | canvas / surface |
| Reversed | `ink` dark #EFEDE4 | ink, near-black, or a photo (with a ≥50% ink scrim behind it) |
| Ochre (sparing) | `attention.text` #6E4709 | `attention.wash` #F0E6D2 |

Never: two colours inside the mark, a fill behind the frame, a gradient, a drop shadow, or ochre on canvas.

### 10.5 iOS app icon — must be redrawn

The current asset is a single 1024 PNG, `AppIcon.appiconset/ChatGPT Image Jul 15, 2025, 11_40_24 PM (1).png`, with **corner radius and dark plate baked into the pixels** (iOS then masks an already-rounded image) and no variants. Replace it:

- **Light:** ink mark on `canvas` #F2EFE7, **full-bleed square, no corner radius in the artwork** — iOS applies the mask.
- **Dark:** #EFEDE4 mark on #171716.
- **Tinted:** monochrome mark on transparent, per iOS 18 specs.
- Frame height = **52% of the icon's height**, optically centred (the monogram's mass sits low, so the frame centres about 1.5% above true centre).
- Update `Contents.json` to declare all three appearances.
- **Delete `generate_icon.py`** — it still generates the retired `#6B46C1 → #06B6D4` gradient face and must not be run again.

### 10.6 Portal

The portal currently has **no brand asset**: `web-portal/public/` holds only Next.js defaults (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`) and `components/layout/Sidebar.tsx` renders lucide's `Stethoscope` glyph as the logo. Ship the mark as an inline SVG component (not a PNG) so it inherits `currentColor`, and:

- Place the **primary lockup** in the nav rail head (mark at H=25) and on sign-in (H=27).
- Remove the `Stethoscope` import and the unused Next.js default SVGs.
- Add `favicon.svg` (mark alone, ink) plus a 180px `apple-touch-icon.png` (ink mark on canvas, full-bleed).

### 10.7 Where it appears in the mockups

`ClearAF 2a - Mobile` → screen 1 (Sign in). `ClearAF 2a - Portal` → nav rail on Worklist / Workspace Photos / Workspace Routine / Workspace Check-ins, and the Sign in page. `ClearAF Logo - Directions` → §4a for construction and specimen sizes, and the "In place" row for rail / sign-in / home-screen renderings.

---

## 11. Suggested order of work

1. Tokens + fonts on both platforms (§1), with the colour sets wired for dark mode. Nothing else until this lands.
2. Re-skin `components/ui/*` and `DesignSystem.swift` consumers — no structural change. This alone changes the look of every screen.
3. iOS Today, Routine, Photo record, Notes (highest-traffic screens).
4. Portal worklist (§6 #1) — the one re-sequencing with the biggest payoff.
5. Portal workspace tabs (§6 #2–4).
6. Calendar three-state cells, check-in one-question flow, profile list.
7. iOS Compare (§6 #6) — the only genuinely new capability; ship last.
8. Identity (§10): mark as an inline SVG on both platforms, redrawn app icon with all three appearances, favicon, and delete `generate_icon.py`.
