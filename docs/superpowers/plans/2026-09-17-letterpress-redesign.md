# Letterpress 1.0 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Care Journal visual language with Letterpress 1.0 across the iOS app and clinician portal, in eight reviewable PRs, without changing data, auth or care workflows.

**Architecture:** Tokens land first on both platforms (iOS asset-catalog colour sets + bundled static fonts; portal CSS channel tokens + `next/font`). Existing role names (`CareJournal.*`, shadcn `--primary` etc.) are re-pointed at Letterpress tokens so every screen changes at once, then consumers migrate PR by PR and the aliases are deleted. Structure changes (worklist, workspace tabs, photo record, Compare) come after the skin, backed by additive read-only API where one call can't serve the screen.

**Tech Stack:** SwiftUI (iOS 17, Swift Testing), Next.js 15 / React 19 / Tailwind 3.4 / shadcn, Express + Prisma query client, Node test runner.

**Spec:** `docs/design/letterpress/spec.md` (authority). Visual ground truth: `docs/design/letterpress/mobile.dc.html`, `portal.dc.html`, `logo-directions.dc.html`; reasoning: `design-guide.dc.html`. Where a mockup and the spec disagree, the spec wins.

## Global Constraints

- Spec §0 scope fence applies to every task: no Supabase schema/RLS/table/column/RPC change; no auth/session change; routine versioning, check-in form versioning and required flags, photo share/review state machine, review-queue ordering (oldest unreviewed first), existing pagination, completion timezone handling and message reference payloads are untouched.
- Never introduce a skin score, streak, grade, adherence target line, celebration state, emoji, or outcome promise. If a number can't be sourced from real events, omit the block.
- Ink is the action colour. Ochre (`attention.*`) only for **unread** and **prescription**. Signal anything else with words.
- Text under 24px ≥ 4.5:1 against the **composited** background. `ink.future` is the only de-emphasis token.
- iOS buttons: `.frame(minHeight: 44)` with centred content, never padding-derived. Portal row/toolbar/inline controls 32–36px; 44px only for full-width primary actions like Sign in.
- Radii: 0 · 4 · 26 · 999 only.
- Copy: sentence case, no exclamation marks, patient dates written out ("2 Sep"), clinician dates mono (`02 SEP · 07:04`).
- Clinician name in copy comes from real data (the assigned clinician's display name) — "Dr. Om" in mockups is a placeholder.

## Owner decisions (2026-09-17)

1. **Controls with no backing capability are omitted**, not faked or disabled: iOS auto-share, keep originals, PDF export, "Send to Dr. Om" off switch (photos always share today), "Attach to this morning's routine" (would need a schema column); portal session timeout, audit-log export, notification toggles, practice details. Track them in `docs/design/letterpress/deferred.md`.
2. **Additive read-only API is allowed** (no schema change, both clients stay compatible; run `api-contract-checker` and `care-access-reviewer`). Candidates: worklist summary counts + per-patient 14-day adherence, three-state calendar days, Compare in-between timeline.
3. **Screens the spec doesn't cover are adapted as closely to the spec as possible**: iOS `EnrollmentView`, `UrgentReportView`, `CareStatusCard`, `PasswordRecoveryView`, `ReminderSettingsView`; portal `CareDecisionDialog`, `CareStatusCard`, `EnrollmentStatus`, `UrgentReportQueue`, `PatientUrgentReports`, and pages `dashboard`, `appointments`, `prescriptions`, `profile`, `settings`, `register`, `forgot-password`, `reset-password`. Urgent reports populate the worklist **Flagged** tab and are labelled in words (no colour).
4. **One PR per §11 step.**

## Findings that refine the spec (apply everywhere)

- **Font PostScript names.** IBM Plex Medium's PostScript names are `IBMPlexSans-Medm` and `IBMPlexMono-Medm`. The spec's `"IBMPlexMono-Medium"` / `.custom("IBMPlexSans").weight()` would silently fall back to SF. iOS resolves weights by explicit PostScript name (Task 4).
- **Body weight 450** on iOS = static `IBMPlexSans-Text`. On web, Plex Sans is variable on Google Fonts, so `font-weight: 450` works.
- **Newsreader optical sizes.** Static instances ship at 6/16/72pt. iOS uses `Newsreader72pt-Light` at ≥ 28pt and `Newsreader16pt-Light` below.
- **Dark-mode contrast gaps not in the spec's table** (computed from spec hex): `ink.future` on dark `sunk` 4.40, on dark `attention.wash` 4.06; `ink.tertiary` on dark `attention.wash` 4.28. Rule: never set `ink.future` text on `sunk` or `wash`, and never set `ink.tertiary` text on `wash`. The token tests encode this.
- **Portal dark mode stays `prefers-color-scheme`** (Tailwind `darkMode: 'media'`; there is no theme toggle). Spec's `.dark` block goes inside the media query.
- **Portal tokens are RGB channels** (`--ink: 18 19 18`), not hex, so Tailwind opacity modifiers already in use (`bg-primary/90`, `border-destructive/50`) keep working. Values are identical to spec hex, and a test asserts it.

## Roadmap — one PR each

| PR | §11 step | Branch | Detailed plan |
|---|---|---|---|
| 1 | Tokens + fonts, docs replaced | `design/letterpress-1-tokens` | **This file, Tasks 1–5** |
| 2 | Re-skin primitives: `components/ui/*`, iOS `DesignSystem.swift` consumers; delete `CareJournal`, wellness extensions, gradients, `WellnessCardModifier`; add iOS `LetterpressButtonStyle` (filled/outlined/underline, pinned 44pt), eyebrow/rule helpers | `design/letterpress-2-primitives` | Written when PR 1 merges |
| 3 | iOS Today, Routine, Photo record (month rules, four tile states, native Grid/List segmented), Notes; iOS tab bar Today·Record·Plan·Notes with fused capture; Enrollment/Urgent/CareStatus adapted | `design/letterpress-3-ios-core` | Written when PR 2 merges |
| 4 | Portal worklist (counts, Needs review · All patients · Flagged, one merged table, adherence sparkline) + additive read-only worklist API | `design/letterpress-4-worklist` | Written when PR 3 merges |
| 5 | Portal workspace tabs Photos · Routine · Check-ins · Messages · History; Compare as default; right rail; visible routine draft; question-by-question check-ins; Messages, Templates, Sign in, Account; unspecced portal pages adapted | `design/letterpress-5-workspace` | Written when PR 4 merges |
| 6 | iOS three-state calendar (+ additive API field if needed), one-question check-in, profile ruled list (pushed, no tab bar), sign in + onboarding | `design/letterpress-6-ios-secondary` | Written when PR 5 merges |
| 7 | iOS Compare (side-by-side / overlay / flip, filmstrip, in-between timeline) | `design/letterpress-7-compare` | Written when PR 6 merges |
| 8 | Identity: mark as SwiftUI Shape + portal inline SVG component, lockups, redrawn app icon (light/dark/tinted), favicon.svg, apple-touch-icon, remove Stethoscope + Next default SVGs, delete `generate_icon.py`; final retired-token sweep test | `design/letterpress-8-identity` | Written when PR 7 merges |

Each PR ends with: focused tests green, the §8 acceptance checklist run for the screens touched, `/code-review`, the required agents (`api-contract-checker` for API shapes, `care-access-reviewer` for data/photo/auth code), and one bounded integration pass (Playwright for portal, Simulator light + dark + largest text size for iOS).

---

## PR 1 file map

| File | Responsibility |
|---|---|
| `docs/design/design-language.md` | Rewritten: Letterpress 1.0 summary, pointer to spec, owner decisions, refinements above |
| `docs/design/letterpress/deferred.md` | Omitted controls and why |
| `docs/design/archive/ios-care-journal.md`, `portal-care-journal.md` | Moved, not edited |
| `CLAUDE.md`, `docs/handoff/README.md` | Point at Letterpress |
| `web-portal/src/app/globals.css` | Letterpress channel tokens, shadcn aliases, base font rules |
| `web-portal/tailwind.config.js` | `rgb(var(--x) / <alpha-value>)` colours, Letterpress colour + font families, radii; retired `clearaf`/`gray-custom` removed |
| `web-portal/src/app/layout.tsx` | `next/font/google` Newsreader, IBM Plex Sans, IBM Plex Mono with `display: 'swap'` |
| `web-portal/tests/letterpress-tokens.test.mjs` | Replaces `care-journal-colors.test.mjs`: hex parity, contrast pairs, no retired values, fonts wired |
| `ClearAF/Assets.xcassets/Letterpress/*.colorset` | 13 colour sets, Any + Dark |
| `ClearAF/Fonts/*.ttf` + `ClearAF/Fonts/OFL-*.txt` | 9 static fonts + licences |
| `ClearAF/Views/Letterpress.swift` | `Letterpress` tokens, type functions, font registration |
| `ClearAF/Views/DesignSystem.swift` | `CareJournal` roles re-pointed at `Letterpress` (deleted in PR 2) |
| `ClearAF/ClearAFApp.swift` | Register fonts at launch |
| `ClearAFTests/LetterpressTests.swift` | Colour values, contrast pairs, fonts resolve |

---

### Task 1: Replace outdated design docs

**Files:**
- Modify: `docs/design/design-language.md` (full rewrite)
- Create: `docs/design/letterpress/deferred.md`
- Move: `docs/design/ios-care-journal.md` → `docs/design/archive/ios-care-journal.md`; `docs/design/portal-care-journal.md` → `docs/design/archive/portal-care-journal.md`
- Modify: `CLAUDE.md:16,36,67`, `docs/handoff/README.md:7,128`
- Add (already in working tree, uncommitted): `docs/design/letterpress/{spec.md,mobile.dc.html,portal.dc.html,logo-directions.dc.html,design-guide.dc.html}`, this plan

**Interfaces:** Produces the doc paths later PRs and CLAUDE.md cite. Historical specs/plans under `docs/superpowers/` and `docs/features/` that mention Care Journal are records and stay unedited.

- [ ] **Step 1: Create the worktree and branch** (superpowers:using-git-worktrees), branch `design/letterpress-1-tokens` from `origin/main`. Copy the untracked `docs/design/letterpress/` folder and this plan into it.

- [ ] **Step 2: Archive the Care Journal pass notes**

```bash
mkdir -p docs/design/archive
git mv docs/design/ios-care-journal.md docs/design/archive/ios-care-journal.md
git mv docs/design/portal-care-journal.md docs/design/archive/portal-care-journal.md
```

- [ ] **Step 3: Rewrite `docs/design/design-language.md`**

```markdown
# ClearAF design language

Version: **Letterpress 1.0** · approved September 17, 2026 · supersedes Care Journal 1.0 (archived in `archive/`).

## Authority

The build document is [`letterpress/spec.md`](letterpress/spec.md). Visual ground truth: [`mobile.dc.html`](letterpress/mobile.dc.html) (12 screens), [`portal.dc.html`](letterpress/portal.dc.html) (8 screens), [`logo-directions.dc.html`](letterpress/logo-directions.dc.html) §4a. Reasoning for judgment calls: [`design-guide.dc.html`](letterpress/design-guide.dc.html). The mockups are reference renderings, not source: read values, implement idiomatically. Spec beats mockup.

## The system in six lines

1. Paper and ink. Ink is the action colour; there is no brand hue.
2. Ochre is reserved for unread and prescription. Anything else is said in words.
3. Newsreader Light for display and clinician words; IBM Plex Sans for UI; IBM Plex Mono for numbers, dates and eyebrows.
4. Rules, not cards. 1px `rule` between rows, 2px ink rule for a major break. Content has no shadow.
5. Radii 0 · 4 · 26 · 999 only. Glass only on floating iOS chrome and sheets; never on the portal.
6. No scores, streaks, grades, targets, celebrations, emoji or promised outcomes.

## Project decisions (2026-09-17)

- Controls with no backing capability are omitted until built; see [`letterpress/deferred.md`](letterpress/deferred.md).
- Additive read-only API is permitted when a re-sequenced screen needs it. Schema changes are not.
- Screens the spec does not cover (enrollment, urgent reports, care status/decisions, other portal pages) follow the spec's components and rules as closely as possible. Urgent reports fill the worklist Flagged tab and are labelled in words.

## Implementation refinements

- iOS fonts are static instances resolved by PostScript name: `Newsreader72pt-Light` (≥ 28pt), `Newsreader16pt-Light`, their italics, `IBMPlexSans-Text` (450 body), `IBMPlexSans` (400), `IBMPlexSans-Medm` (500), `IBMPlexMono`, `IBMPlexMono-Medm`. Plex Medium is named `-Medm`, not `-Medium`.
- Colours: iOS asset catalog `Letterpress/lp.*` with Any/Dark; portal RGB channel variables in `globals.css`, dark values under `prefers-color-scheme`.
- Contrast pairs to avoid in dark mode: `ink.future` text on `sunk` (4.40) or `attention.wash` (4.06); `ink.tertiary` text on `attention.wash` (4.28).
- Token tests: `web-portal/tests/letterpress-tokens.test.mjs`, `ClearAFTests/LetterpressTests.swift`.
```

- [ ] **Step 4: Write `docs/design/letterpress/deferred.md`**

```markdown
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
```

- [ ] **Step 5: Update CLAUDE.md and handoff pointers**

`CLAUDE.md` line 16: `(within the design language)` → `(within Letterpress, docs/design/design-language.md)`.
Line 36: `` `design/design-language.md` (Care Journal design, source of truth for UI) `` → `` `design/design-language.md` + `design/letterpress/` (Letterpress 1.0, source of truth for UI) ``.
Line 67 becomes:
```markdown
- **Design:** follow `docs/design/design-language.md` (Letterpress 1.0; build spec `docs/design/letterpress/spec.md`). Ink is the action colour, ochre only for unread/prescription; native iOS controls; no scores, streaks, grades, emoji or motivational copy.
```
`docs/handoff/README.md` line 7 becomes: `Design update: Letterpress 1.0 replaces Care Journal ([design language](../design/design-language.md), [plan](../superpowers/plans/2026-09-17-letterpress-redesign.md)); it lands in eight PRs.` Line 128: change the link target to `../design/archive/portal-care-journal.md` and prefix the sentence with `Archived:`.

- [ ] **Step 6: Verify no live doc points at a moved file**

Run: `grep -rn "ios-care-journal.md\|portal-care-journal.md" --include=*.md . | grep -v "archive/\|docs/superpowers\|docs/features\|.claude/worktrees"`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add docs/design CLAUDE.md docs/handoff/README.md docs/superpowers/plans/2026-09-17-letterpress-redesign.md
git commit -m "docs: adopt Letterpress 1.0 as the design language"
```

---

### Task 2: Portal tokens and fonts

**Files:**
- Delete: `web-portal/tests/care-journal-colors.test.mjs`
- Create: `web-portal/tests/letterpress-tokens.test.mjs`
- Modify: `web-portal/src/app/globals.css` (token block and base layer), `web-portal/tailwind.config.js` (`theme.extend`), `web-portal/src/app/layout.tsx`

**Interfaces:**
- Produces CSS variables `--canvas --surface --rail --sunk --ink --ink-secondary --ink-tertiary --ink-future --attention-mark --attention-text --attention-wash --error` (RGB channels), `--font-display --font-ui --font-data`, `--radius: 4px`.
- Produces Tailwind classes `bg-canvas bg-surface bg-rail bg-sunk text-ink text-ink-secondary text-ink-tertiary text-ink-future bg-attention-wash text-attention-text bg-attention-mark text-error border-rule border-rule-strong font-display font-ui font-data`. PR 2+ use these names.
- shadcn aliases keep their names (`bg-primary`, `text-muted-foreground`, …) and now resolve to Letterpress.

- [ ] **Step 1: Write the failing test** — `web-portal/tests/letterpress-tokens.test.mjs`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../src/app/globals.css');
const tailwind = read('../tailwind.config.js');
const layout = read('../src/app/layout.tsx');

const SPEC = {
  light: { canvas:'#F2EFE7', surface:'#F9F7F1', rail:'#EDEAE1', sunk:'#E8E3D6', ink:'#121312', 'ink-secondary':'#56544D', 'ink-tertiary':'#5F5D55', 'ink-future':'#64625A', 'attention-mark':'#A6701F', 'attention-text':'#6E4709', 'attention-wash':'#F0E6D2', error:'#9A2015' },
  dark:  { canvas:'#171716', surface:'#1F201E', rail:'#1C1D1B', sunk:'#24251F', ink:'#EFEDE4', 'ink-secondary':'#A8A69C', 'ink-tertiary':'#8F8D84', 'ink-future':'#8B897E', 'attention-mark':'#D9A64A', 'attention-text':'#E8C48A', 'attention-wash':'#33291A', error:'#FFB3A6' },
};

const [lightBlock, darkBlock] = css.split('@media (prefers-color-scheme: dark)');
function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(\d{1,3}) (\d{1,3}) (\d{1,3});/g)]
    .map((m) => [m[1], '#' + m.slice(2, 5).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()]));
}
const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// Text tokens allowed on each background. Dark-mode exclusions are documented in design-language.md.
const TEXT = ['ink', 'ink-secondary', 'ink-tertiary', 'ink-future', 'attention-text', 'error'];
const PAIRS = {
  canvas: TEXT, surface: TEXT, rail: TEXT,
  sunk: ['ink', 'ink-secondary', 'ink-tertiary', 'attention-text', 'error'],
  'attention-wash': ['ink', 'ink-secondary', 'attention-text', 'error'],
};

for (const [theme, block] of [['light', lightBlock], ['dark', darkBlock]]) {
  const t = tokens(block);
  test(`${theme} tokens equal the Letterpress spec values`, () => {
    for (const [name, hex] of Object.entries(SPEC[theme])) assert.equal(t[name], hex, name);
  });
  test(`${theme} permitted text pairs meet 4.5:1`, () => {
    for (const [bg, texts] of Object.entries(PAIRS)) for (const fg of texts)
      assert.ok(contrast(t[fg], t[bg]) >= 4.5, `${fg} on ${bg}: ${contrast(t[fg], t[bg]).toFixed(2)}`);
  });
}

test('retired Care Journal and wellness values are gone', () => {
  for (const src of [css, tailwind]) for (const retired of [/0B4D45/i, /C2552F/i, /8B5CF6/i, /14B8A6/i, /clearaf['"]?\s*:/, /gray-custom/, /gradient/i, /--text-primary/, /--action-primary/])
    assert.doesNotMatch(src, retired);
});

test('Tailwind colours keep opacity modifiers working', () => {
  assert.match(tailwind, /primary:\s*{\s*DEFAULT:\s*'rgb\(var\(--primary\) \/ <alpha-value>\)'/);
  assert.match(tailwind, /ink:\s*{\s*DEFAULT:\s*'rgb\(var\(--ink\) \/ <alpha-value>\)'/);
});

test('fonts load through next/font with swap', () => {
  for (const f of ['Newsreader', 'IBM_Plex_Sans', 'IBM_Plex_Mono']) assert.match(layout, new RegExp(`\\b${f}\\(`));
  assert.equal((layout.match(/display:\s*'swap'/g) ?? []).length, 3);
  assert.match(css, /--font-display:\s*var\(--font-newsreader\)/);
});

test('focus ring is a 2px ink outline and radius is 4px', () => {
  assert.match(css, /:focus-visible\s*{\s*outline:\s*2px solid rgb\(var\(--ink\)\)/);
  assert.match(css, /--radius:\s*4px/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web-portal && git rm -q tests/care-journal-colors.test.mjs && node --test tests/letterpress-tokens.test.mjs`
Expected: FAIL — `light tokens equal the Letterpress spec values` (`canvas` undefined), retired-values test fails on `--text-primary`.

- [ ] **Step 3: Replace the token block in `globals.css`**

Replace everything from `@layer base {` to the end of the `@media (prefers-color-scheme: dark)` block and the `body`/`:focus-visible` rules with:

```css
@layer base {
  :root {
    color-scheme: light;
    --canvas: 242 239 231; --surface: 249 247 241; --rail: 237 234 225; --sunk: 232 227 214;
    --ink: 18 19 18; --ink-secondary: 86 84 77; --ink-tertiary: 95 93 85; --ink-future: 100 98 90;
    --attention-mark: 166 112 31; --attention-text: 110 71 9; --attention-wash: 240 230 210;
    --error: 154 32 21;

    --font-display: var(--font-newsreader), Georgia, serif;
    --font-ui: var(--font-plex-sans), -apple-system, system-ui, sans-serif;
    --font-data: var(--font-plex-mono), ui-monospace, monospace;
    --radius: 4px;

    /* shadcn role aliases, resolved to Letterpress. Removed as primitives migrate (PR 2). */
    --background: var(--canvas);        --foreground: var(--ink);
    --card: var(--surface);             --card-foreground: var(--ink);
    --popover: var(--surface);          --popover-foreground: var(--ink);
    --primary: var(--ink);              --primary-foreground: var(--canvas);
    --secondary: var(--sunk);           --secondary-foreground: var(--ink);
    --muted: var(--sunk);               --muted-foreground: var(--ink-secondary);
    --accent: var(--rail);              --accent-foreground: var(--ink);
    --destructive: var(--error);        --destructive-foreground: var(--canvas);
    --ring: var(--ink);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --canvas: 23 23 22; --surface: 31 32 30; --rail: 28 29 27; --sunk: 36 37 31;
      --ink: 239 237 228; --ink-secondary: 168 166 156; --ink-tertiary: 143 141 132; --ink-future: 139 137 126;
      --attention-mark: 217 166 74; --attention-text: 232 196 138; --attention-wash: 51 41 26;
      --error: 255 179 166;
    }
  }
  * { @apply border-rule; }
  body {
    @apply bg-canvas text-ink;
    font-family: var(--font-ui);
    font-weight: 450;
    line-height: 1.5;
  }
  :focus-visible { outline: 2px solid rgb(var(--ink)); outline-offset: 2px; }
}
```

Replace the `.editorial-title` rule with:
```css
  .editorial-title { font-family: var(--font-display); font-weight: 300; line-height: 1.15; }
  .font-data { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Replace `theme.extend` in `tailwind.config.js`**

```js
  theme: {
    extend: {
      borderRadius: { lg: 'var(--radius)', md: 'var(--radius)', sm: '0px' },
      fontFamily: {
        display: ['var(--font-display)'],
        ui: ['var(--font-ui)'],
        data: ['var(--font-data)'],
      },
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        rail: 'rgb(var(--rail) / <alpha-value>)',
        sunk: 'rgb(var(--sunk) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--ink-tertiary) / <alpha-value>)',
          future: 'rgb(var(--ink-future) / <alpha-value>)',
        },
        attention: {
          mark: 'rgb(var(--attention-mark) / <alpha-value>)',
          text: 'rgb(var(--attention-text) / <alpha-value>)',
          wash: 'rgb(var(--attention-wash) / <alpha-value>)',
        },
        error: 'rgb(var(--error) / <alpha-value>)',
        rule: { DEFAULT: 'rgb(var(--ink) / 0.13)', strong: 'rgb(var(--ink) / <alpha-value>)' },

        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: { DEFAULT: 'rgb(var(--card) / <alpha-value>)', foreground: 'rgb(var(--card-foreground) / <alpha-value>)' },
        popover: { DEFAULT: 'rgb(var(--popover) / <alpha-value>)', foreground: 'rgb(var(--popover-foreground) / <alpha-value>)' },
        primary: { DEFAULT: 'rgb(var(--primary) / <alpha-value>)', foreground: 'rgb(var(--primary-foreground) / <alpha-value>)' },
        secondary: { DEFAULT: 'rgb(var(--secondary) / <alpha-value>)', foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)' },
        muted: { DEFAULT: 'rgb(var(--muted) / <alpha-value>)', foreground: 'rgb(var(--muted-foreground) / <alpha-value>)' },
        accent: { DEFAULT: 'rgb(var(--accent) / <alpha-value>)', foreground: 'rgb(var(--accent-foreground) / <alpha-value>)' },
        destructive: { DEFAULT: 'rgb(var(--destructive) / <alpha-value>)', foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)' },
        border: 'rgb(var(--ink) / 0.13)',
        input: 'rgb(var(--ink) / 0.28)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
      },
    },
  },
```

(The unused `chart` group, `clearaf` and `gray-custom` are removed. Confirm first: `grep -rnE "chart-[1-5]|clearaf-|gray-custom" web-portal/src` → no output. If `chart-*` is used, keep that group unchanged.)

- [ ] **Step 5: Load fonts in `layout.tsx`**

```tsx
import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], display: 'swap', variable: "--font-newsreader" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], display: 'swap', variable: "--font-plex-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], display: 'swap', variable: "--font-plex-mono" });
```

and `<html lang="en" className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}>`; body className `"antialiased min-h-screen bg-canvas text-ink"`. Metadata unchanged.

- [ ] **Step 6: Run the test to verify it passes, then the full portal gate**

Run: `cd web-portal && node --test tests/letterpress-tokens.test.mjs`
Expected: PASS (all tests).
Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all green. Build downloads Google fonts; if offline, stop and report — don't swap to a CDN link.

- [ ] **Step 7: Commit**

```bash
git add web-portal/tests web-portal/src/app/globals.css web-portal/src/app/layout.tsx web-portal/tailwind.config.js
git commit -m "portal: land Letterpress tokens and fonts"
```

---

### Task 3: iOS colour sets

**Files:**
- Create: `ClearAF/Assets.xcassets/Letterpress/Contents.json` and 12 `lp.*.colorset/Contents.json`
- Create: `ClearAF/Views/Letterpress.swift` (colour part)
- Create: `ClearAFTests/LetterpressTests.swift` (colour part)

**Interfaces:**
- Produces `Letterpress.canvas surface rail sunk ink inkSecondary inkTertiary inkFuture action attentionMark attentionText attentionWash error rule` (`Color`), and `Letterpress.colorNames: [String]` (asset names, for tests).

- [ ] **Step 1: Write the failing test** — `ClearAFTests/LetterpressTests.swift`

```swift
import Testing
import UIKit
@testable import ClearAF

struct LetterpressTests {
    static let spec: [String: (light: UInt32, dark: UInt32)] = [
        "lp.canvas": (0xF2EFE7, 0x171716), "lp.surface": (0xF9F7F1, 0x1F201E),
        "lp.rail": (0xEDEAE1, 0x1C1D1B), "lp.sunk": (0xE8E3D6, 0x24251F),
        "lp.ink": (0x121312, 0xEFEDE4), "lp.ink.secondary": (0x56544D, 0xA8A69C),
        "lp.ink.tertiary": (0x5F5D55, 0x8F8D84), "lp.ink.future": (0x64625A, 0x8B897E),
        "lp.attention.mark": (0xA6701F, 0xD9A64A), "lp.attention.text": (0x6E4709, 0xE8C48A),
        "lp.attention.wash": (0xF0E6D2, 0x33291A), "lp.error": (0x9A2015, 0xFFB3A6),
    ]

    static func resolved(_ name: String, _ style: UIUserInterfaceStyle) -> UIColor {
        UIColor(named: name, in: .main, compatibleWith: UITraitCollection(userInterfaceStyle: style))!
            .resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
    }

    static func hex(_ c: UIColor) -> UInt32 {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return UInt32((r * 255).rounded()) << 16 | UInt32((g * 255).rounded()) << 8 | UInt32((b * 255).rounded())
    }

    static func contrast(_ a: UIColor, _ b: UIColor) -> Double {
        func lum(_ c: UIColor) -> Double {
            var r: CGFloat = 0, g: CGFloat = 0, bl: CGFloat = 0, al: CGFloat = 0
            c.getRed(&r, green: &g, blue: &bl, alpha: &al)
            let f = { (v: CGFloat) -> Double in let d = Double(v); return d <= 0.04045 ? d / 12.92 : pow((d + 0.055) / 1.055, 2.4) }
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl)
        }
        let (x, y) = (lum(a), lum(b))
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }

    @Test func everyColorSetMatchesSpecInBothAppearances() {
        #expect(Set(Letterpress.colorNames) == Set(Self.spec.keys))
        for (name, pair) in Self.spec {
            #expect(Self.hex(Self.resolved(name, .light)) == pair.light, "\(name) light")
            #expect(Self.hex(Self.resolved(name, .dark)) == pair.dark, "\(name) dark")
        }
    }

    @Test func permittedTextPairsMeetContrastInBothAppearances() {
        let text = ["lp.ink", "lp.ink.secondary", "lp.ink.tertiary", "lp.ink.future", "lp.attention.text", "lp.error"]
        let pairs: [String: [String]] = [
            "lp.canvas": text, "lp.surface": text, "lp.rail": text,
            "lp.sunk": ["lp.ink", "lp.ink.secondary", "lp.ink.tertiary", "lp.attention.text", "lp.error"],
            "lp.attention.wash": ["lp.ink", "lp.ink.secondary", "lp.attention.text", "lp.error"],
        ]
        for style in [UIUserInterfaceStyle.light, .dark] {
            for (bg, fgs) in pairs {
                for fg in fgs {
                    let ratio = Self.contrast(Self.resolved(fg, style), Self.resolved(bg, style))
                    #expect(ratio >= 4.5, "\(fg) on \(bg) \(style == .dark ? "dark" : "light"): \(ratio)")
                }
            }
        }
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
  -derivedDataPath /tmp/clearaf-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  -only-testing:ClearAFTests/LetterpressTests test | xcbeautify
```
Expected: build FAIL — `cannot find 'Letterpress' in scope`.

- [ ] **Step 3: Generate the colour sets** (one-off script in the session scratchpad, not committed)

```js
// gen-colorsets.mjs — run from repo root: node <scratchpad>/gen-colorsets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
const root = 'ClearAF/Assets.xcassets/Letterpress';
const sets = {
  'lp.canvas': ['F2EFE7', '171716'], 'lp.surface': ['F9F7F1', '1F201E'], 'lp.rail': ['EDEAE1', '1C1D1B'], 'lp.sunk': ['E8E3D6', '24251F'],
  'lp.ink': ['121312', 'EFEDE4'], 'lp.ink.secondary': ['56544D', 'A8A69C'], 'lp.ink.tertiary': ['5F5D55', '8F8D84'], 'lp.ink.future': ['64625A', '8B897E'],
  'lp.attention.mark': ['A6701F', 'D9A64A'], 'lp.attention.text': ['6E4709', 'E8C48A'], 'lp.attention.wash': ['F0E6D2', '33291A'], 'lp.error': ['9A2015', 'FFB3A6'],
};
const info = { author: 'xcode', version: 1 };
const color = (hex) => ({ 'color-space': 'srgb', components: { red: `0x${hex.slice(0, 2)}`, green: `0x${hex.slice(2, 4)}`, blue: `0x${hex.slice(4, 6)}`, alpha: '1.000' } });
mkdirSync(root, { recursive: true });
writeFileSync(`${root}/Contents.json`, JSON.stringify({ info }, null, 2) + '\n');
for (const [name, [light, dark]] of Object.entries(sets)) {
  mkdirSync(`${root}/${name}.colorset`, { recursive: true });
  writeFileSync(`${root}/${name}.colorset/Contents.json`, JSON.stringify({ colors: [
    { color: color(light), idiom: 'universal' },
    { appearances: [{ appearance: 'luminosity', value: 'dark' }], color: color(dark), idiom: 'universal' },
  ], info }, null, 2) + '\n');
}
```

The folder `Contents.json` has no `provides-namespace`, so names stay `lp.canvas`, not `Letterpress/lp.canvas`.

- [ ] **Step 4: Create `ClearAF/Views/Letterpress.swift` (colours)**

```swift
import SwiftUI

/// Letterpress 1.0 tokens (docs/design/letterpress/spec.md §1). Ink is the action colour; ochre is only for unread and prescription.
enum Letterpress {
    // Paper
    static let canvas = Color("lp.canvas")
    static let surface = Color("lp.surface")
    static let rail = Color("lp.rail")
    static let sunk = Color("lp.sunk")

    // Ink
    static let ink = Color("lp.ink")
    static let inkSecondary = Color("lp.ink.secondary")
    static let inkTertiary = Color("lp.ink.tertiary")
    /// The only de-emphasis token. Never on `sunk` or `attentionWash`.
    static let inkFuture = Color("lp.ink.future")
    static var action: Color { ink }

    // Attention: unread and prescription only
    static let attentionMark = Color("lp.attention.mark")
    static let attentionText = Color("lp.attention.text")
    static let attentionWash = Color("lp.attention.wash")

    static let error = Color("lp.error")
    static let rule = Color("lp.ink").opacity(0.13)

    static let colorNames = ["lp.canvas", "lp.surface", "lp.rail", "lp.sunk", "lp.ink", "lp.ink.secondary", "lp.ink.tertiary",
                             "lp.ink.future", "lp.attention.mark", "lp.attention.text", "lp.attention.wash", "lp.error"]
}
```

- [ ] **Step 5: Re-point `CareJournal` roles** in `ClearAF/Views/DesignSystem.swift` (the enum body only; `adaptive` helper removed):

```swift
// Care Journal role names, resolved to Letterpress until consumers migrate (deleted in PR 2).
enum CareJournal {
    static let canvas = Letterpress.canvas
    static let surface = Letterpress.surface
    static let textPrimary = Letterpress.ink
    static let textSecondary = Letterpress.inkSecondary
    static let actionPrimary = Letterpress.action
    static let onPrimary = Letterpress.canvas
    static let accentSubtle = Letterpress.sunk
    static let separator = Letterpress.rule
    static let display = Font.system(.largeTitle, design: .serif)
}
```

(`display` switches to Newsreader in Task 4.)

- [ ] **Step 6: Run the tests to verify they pass**

Run the Step 2 command with `-only-testing:ClearAFTests/LetterpressTests -only-testing:ClearAFTests/AccountProfileTests`.
Expected: PASS, including the existing Care Journal and action-contrast tests (now resolving to ink/canvas).

- [ ] **Step 7: Commit**

```bash
git add ClearAF/Assets.xcassets/Letterpress ClearAF/Views/Letterpress.swift ClearAF/Views/DesignSystem.swift ClearAFTests/LetterpressTests.swift
git commit -m "ios: add Letterpress colour sets with light and dark appearances"
```

---

### Task 4: iOS fonts and type functions

**Files:**
- Create: `ClearAF/Fonts/` with `Newsreader16pt-Light.ttf`, `Newsreader16pt-LightItalic.ttf`, `Newsreader72pt-Light.ttf`, `Newsreader72pt-LightItalic.ttf`, `IBMPlexSans-Regular.ttf`, `IBMPlexSans-Text.ttf`, `IBMPlexSans-Medium.ttf`, `IBMPlexMono-Regular.ttf`, `IBMPlexMono-Medium.ttf`, `OFL-Newsreader.txt`, `OFL-IBMPlex.txt`
- Modify: `ClearAF/Views/Letterpress.swift`, `ClearAF/ClearAFApp.swift`, `ClearAF/Views/DesignSystem.swift` (`CareJournal.display`)
- Modify: `ClearAFTests/LetterpressTests.swift`

**Interfaces:**
- Consumes: `Letterpress` enum from Task 3.
- Produces: `Letterpress.registerFonts()`, `Letterpress.fontNames: [String]`, `Letterpress.display(_ size: CGFloat, italic: Bool = false, relativeTo: Font.TextStyle = .largeTitle) -> Font`, `Letterpress.ui(_ size: CGFloat, weight: Letterpress.UIWeight = .body, relativeTo: Font.TextStyle = .body) -> Font` with `enum UIWeight { case regular /*400*/, body /*450*/, medium /*500*/ }`, `Letterpress.data(_ size: CGFloat, weight: Letterpress.DataWeight = .medium, relativeTo: Font.TextStyle = .caption) -> Font` with `enum DataWeight { case regular, medium }`.

- [ ] **Step 1: Write the failing test** — append to `LetterpressTests`:

```swift
    @Test func everyBundledFontResolvesByPostScriptName() {
        Letterpress.registerFonts()
        #expect(Letterpress.fontNames.count == 9)
        for name in Letterpress.fontNames {
            #expect(UIFont(name: name, size: 17) != nil, "\(name) did not resolve; SwiftUI would silently fall back to SF")
        }
    }

    @Test func typeRolesMapToTheIntendedFaces() {
        #expect(Letterpress.displayFontName(size: 34, italic: false) == "Newsreader72pt-Light")
        #expect(Letterpress.displayFontName(size: 20, italic: true) == "Newsreader16pt-LightItalic")
        #expect(Letterpress.UIWeight.body.fontName == "IBMPlexSans-Text")
        #expect(Letterpress.UIWeight.medium.fontName == "IBMPlexSans-Medm")
        #expect(Letterpress.DataWeight.medium.fontName == "IBMPlexMono-Medm")
    }
```

- [ ] **Step 2: Run to verify it fails**

Run the Task 3 Step 2 command with `-only-testing:ClearAFTests/LetterpressTests`.
Expected: build FAIL — `type 'Letterpress' has no member 'registerFonts'`.

- [ ] **Step 3: Add the font files**

```bash
mkdir -p ClearAF/Fonts && cd ClearAF/Fonts
for n in Newsreader16pt-Light Newsreader16pt-LightItalic Newsreader72pt-Light Newsreader72pt-LightItalic; do
  curl -fsSL -o "$n.ttf" "https://raw.githubusercontent.com/productiontype/Newsreader/master/fonts/static/ttf/$n.ttf"; done
curl -fsSL -o OFL-Newsreader.txt https://raw.githubusercontent.com/productiontype/Newsreader/master/OFL.txt
T=$(mktemp -d)
curl -fsSL -o $T/sans.zip "https://github.com/IBM/plex/releases/download/%40ibm/plex-sans%401.1.0/ibm-plex-sans.zip"
curl -fsSL -o $T/mono.zip "https://github.com/IBM/plex/releases/download/%40ibm/plex-mono%402.5.0/ibm-plex-mono.zip"
shasum -a 256 $T/sans.zip $T/mono.zip   # expect fb365d91…9200 and 6d23f012…c81c
unzip -oqj $T/sans.zip 'ibm-plex-sans/fonts/complete/ttf/IBMPlexSans-Regular.ttf' 'ibm-plex-sans/fonts/complete/ttf/IBMPlexSans-Text.ttf' 'ibm-plex-sans/fonts/complete/ttf/IBMPlexSans-Medium.ttf' 'ibm-plex-sans/LICENSE.txt' -d .
mv LICENSE.txt OFL-IBMPlex.txt
unzip -oqj $T/mono.zip 'ibm-plex-mono/fonts/complete/ttf/IBMPlexMono-Regular.ttf' 'ibm-plex-mono/fonts/complete/ttf/IBMPlexMono-Medium.ttf' -d .
ls
```

Expected `ls`: the 9 `.ttf` files and 2 `.txt` licences. If `ibm-plex-sans/LICENSE.txt` isn't in the zip (`unzip -l` to check), fetch `https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt` instead. The `ClearAF/` group is file-system synchronized, so the files join the app target automatically and land at the bundle root.

- [ ] **Step 4: Add type functions and registration to `Letterpress.swift`**

Add `import CoreText` at the top, then inside `enum Letterpress`:

```swift
    // Type (spec §2). Static faces resolved by PostScript name; Plex Medium is "-Medm".
    enum UIWeight {
        case regular, body, medium
        var fontName: String {
            switch self {
            case .regular: "IBMPlexSans"
            case .body: "IBMPlexSans-Text"
            case .medium: "IBMPlexSans-Medm"
            }
        }
    }

    enum DataWeight {
        case regular, medium
        var fontName: String { self == .regular ? "IBMPlexMono" : "IBMPlexMono-Medm" }
    }

    static let fontNames = ["Newsreader16pt-Light", "Newsreader16pt-LightItalic", "Newsreader72pt-Light", "Newsreader72pt-LightItalic",
                            "IBMPlexSans", "IBMPlexSans-Text", "IBMPlexSans-Medm", "IBMPlexMono", "IBMPlexMono-Medm"]

    static func displayFontName(size: CGFloat, italic: Bool) -> String {
        "Newsreader\(size >= 28 ? "72pt" : "16pt")-Light\(italic ? "Italic" : "")"
    }

    static func display(_ size: CGFloat, italic: Bool = false, relativeTo style: Font.TextStyle = .largeTitle) -> Font {
        .custom(displayFontName(size: size, italic: italic), size: size, relativeTo: style)
    }

    static func ui(_ size: CGFloat, weight: UIWeight = .body, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(weight.fontName, size: size, relativeTo: style)
    }

    /// Metadata, numbers and eyebrows. Tabular figures always.
    static func data(_ size: CGFloat, weight: DataWeight = .medium, relativeTo style: Font.TextStyle = .caption) -> Font {
        Font.custom(weight.fontName, size: size, relativeTo: style).monospacedDigit()
    }

    /// Registers bundled fonts once per process. Safe to call repeatedly.
    static func registerFonts() {
        _ = fontRegistration
    }

    private static let fontRegistration: Void = {
        let urls = Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? []
        CTFontManagerRegisterFontURLs(urls as CFArray, .process, true, nil)
    }()
```

- [ ] **Step 5: Register at launch** — `ClearAFApp.swift`:

```swift
@main
struct ClearAFApp: App {
    init() { Letterpress.registerFonts() }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
```

In `DesignSystem.swift`, set `static let display = Letterpress.display(34)` in `CareJournal`.

- [ ] **Step 6: Run to verify it passes**

Run the Task 3 Step 2 command with `-only-testing:ClearAFTests/LetterpressTests`.
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add ClearAF/Fonts ClearAF/Views/Letterpress.swift ClearAF/ClearAFApp.swift ClearAF/Views/DesignSystem.swift ClearAFTests/LetterpressTests.swift
git commit -m "ios: bundle Newsreader and IBM Plex with Letterpress type roles"
```

---

### Task 5: PR 1 verification and pull request

**Files:** none modified unless a check fails (fix, rerun only that check).

- [ ] **Step 1: Full unit gates**

Run: `cd backend && npm test && npm run build` (untouched, confirms nothing leaked) · `cd web-portal && npm test && npm run lint && npm run typecheck && npm run build` · the full iOS test command from CLAUDE.md with `-only-testing:ClearAFTests`.
Expected: all green.

- [ ] **Step 2: One visual pass per platform** (bounded; not the full §8 checklist, which applies from PR 2 onwards)

Portal: start the local stack, `npm run dev`, then use Playwright on `http://localhost:3000/login` and one signed-in page, light and dark (`browser_evaluate` with `matchMedia` emulation or `page.emulateMedia({ colorScheme: 'dark' })` via `browser_run_code_unsafe`). Confirm canvas paper background, ink text, Plex Sans loaded (`document.fonts.check('14px "IBM Plex Sans"')` → true).
iOS: `xcodebuildmcp` build and run on the iPhone 17 simulator, screenshot Today in light and dark. Confirm paper canvas, ink actions, serif title in Newsreader (not New York).

- [ ] **Step 3: Review**

Run `/code-review`. `care-access-reviewer` and `api-contract-checker` are not required: no auth, data, photo or API shape changes. State that in the PR.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin design/letterpress-1-tokens
gh pr create --title "Letterpress 1.0 (1/8): tokens, fonts and design docs" --body "$(cat <<'EOF'
## Summary
- Adopts Letterpress 1.0 as the design language; Care Journal notes archived; build spec and mockups in docs/design/letterpress/.
- Portal: spec tokens as RGB channel variables, shadcn roles resolved to them, Newsreader + IBM Plex via next/font (swap), 2px ink focus ring, radius 4px.
- iOS: 12 asset-catalog colour sets (Any/Dark), static Newsreader + IBM Plex bundled and registered at launch, Letterpress type roles. CareJournal roles temporarily resolve to Letterpress.
- No schema, auth, data or API-shape change.

## Spec refinements
- Plex Medium PostScript name is `-Medm`; weights resolve by name, not `.weight()`.
- Dark-mode pairs below 4.5:1 that the spec table omits: ink.future on sunk/wash, ink.tertiary on wash — encoded as forbidden pairs in tests.

## Verification
- Token parity + contrast tests on both platforms; portal test/lint/typecheck/build; iOS unit tests; one light/dark visual pass per platform.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Write the PR 2 detailed plan** as a new section in this file once PR 1 merges (primitives re-skin, per the roadmap row).
