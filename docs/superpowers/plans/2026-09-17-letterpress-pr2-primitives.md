# Letterpress PR 2: Primitives Re-skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the shared primitives on both platforms to Letterpress 1.0 (portal `components/ui/*`, iOS `DesignSystem.swift` and its consumers) with no structural change to any screen, then delete the retired layers (portal shadcn aliases, iOS `CareJournal`/wellness system).

**Architecture:** Portal primitives are rewritten class-for-class against spec §4 and tested by rendering them with `react-dom/server` (Radix popovers by source assertion); a portal sweep test then forbids aliases, hues, retired radii and shadows across `web-portal/src`, which lets the alias layer be deleted. iOS gains focused Letterpress primitive files (button style, eyebrow, rule, field, picker, toggle tint, spacing/radius scales); consumers migrate in two passes (controls and hues, then tokens and type), after which `DesignSystem.swift` is deleted and a source sweep test keeps it gone.

**Tech Stack:** Next.js 15 / React 19 / Tailwind 3.4 / Radix / cva / tailwind-merge 3, Node test runner (`node --import tsx --test`); SwiftUI (deployment target 18.5, Swift 5 mode), Swift Testing, asset catalog colour sets.

**Spec:** `docs/design/letterpress/spec.md` (authority: §2 type, §3 space/shape/depth, §4.1–4.3, §4.5, §4.8, §4.9, §5, §8) and the master plan `docs/superpowers/plans/2026-09-17-letterpress-redesign.md` (Global Constraints, Owner decisions, Findings that refine the spec, Roadmap row PR 2, **PR 2 carry-ins**). Mockups `docs/design/letterpress/mobile.dc.html` and `portal.dc.html` supplied component values (`.bk`, `.bo`, `.fld`, `.lbl`, `.seg`, `.tab`); where they disagree with the spec, the spec wins.

## Global Constraints

- Everything in the master plan's Global Constraints applies: no schema/RLS/auth/API change; no score, streak, grade, celebration, emoji or promised outcome; ink is the action colour; ochre (`attention.*`) only for unread and prescription; text under 24px ≥ 4.5:1 against the composited background; radii 0 · 4 · 26 · 999 only; sentence case, no exclamation marks.
- **No structural or layout change to screens.** Only colour, type role, radius, border, button/field treatment and token names change. Screen structure belongs to PRs 3–7. Behaviour of every primitive (props, Radix wiring, event handling) is unchanged; additive props are allowed (`TabsList variant`, `TableCell numeric`, `Badge variant="attention"`, Input `data-empty`).
- iOS buttons: `.frame(minHeight: 44)` with centred content, never padding-derived. Portal row/toolbar/inline controls 32–36px; 44px (`size="lg"`) only for full-width primary actions such as Sign in.
- Field boundaries (portal and iOS) keep ≥ 3:1 against every paper tone in both appearances. Selection and focus never rely on colour alone: ink fill inversion, inset ink outline, ink rule, weight change or a 2px ink outline.
- Dark-mode forbidden pairs from PR 1 stay forbidden: `ink.future` text on `sunk`/`attention.wash`; `ink.tertiary` text on `attention.wash`.
- Portal content has no shadow. The only portal shadow is the segmented thumb `0 1px 2px rgba(18,19,18,.14)`. No glass on the portal, ever.
- Never read `.env*` (except `.env.example`), `.local/`, `handoff-*/` or `Local.generated.xcconfig`.
- iOS commands: `-derivedDataPath /tmp/clearaf-build-lp2`, `CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-`, iPhone 17 simulator, piped through `xcbeautify`. Portal build: `NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (use a second `-m`).

## Decisions made while planning

1. **Portal alias layer: removed in this PR.** Measured before planning: 226 alias-class uses in `web-portal/src`; 131 are inside `components/ui` (rewritten here anyway, 12 of them in `chart.tsx`, which is deleted); 95 are in 26 consumer files, of which 72 are `text-muted-foreground`. Every remaining use maps one-to-one to a Letterpress name (mapping table in Task 4), so a perl pass plus seven hand edits migrates them safely, and the sweep test proves nothing is left. Keeping the aliases would leave two vocabularies for PRs 3–8.
2. **Field boundary is ink at 50%, not the spec's 28%.** Ink @28% measures 1.86:1 (light) / 2.33:1 (dark); @50% measures ≥ 3.31:1 on canvas, surface, rail and sunk in both modes. Same value on both platforms (`rule-field` on the portal, `Letterpress.fieldRuleEmpty` on iOS).
3. **Portal fields.** `Input` and `Select` are the §4.2 baseline rule everywhere (the portal mockup uses `.fld` in the routine editor too). `Textarea` is the bounded-editor field (1px `rule-field` border on `surface`), because a multi-line area must show its extent and §4.2 allows it inside editors; the portal message composer mockup uses exactly this box. `Label` is the persistent mono label (`.lbl`: mono 500 10px, .16em, uppercase, `ink.tertiary`).
4. **Portal tabs get two variants.** `segmented` (default; §4.3, worklist filter) and `underline` (mockup `.tab`/`.tabon`, workspace sections). The segmented thumb measures 1.20:1 (light) / 1.06:1 (dark) against the `sunk` track, so the active trigger also gets weight 500 and an inset 1px ink@50% hairline.
5. **Portal radius scale is replaced, not extended**: `theme.borderRadius = { none, DEFAULT: var(--radius), sheet: 26px, full }`. Consumer `rounded-sm|md|lg|xl` become `rounded-none` (boxes, nav items, native selects and messages are square in the mockups); only buttons use `rounded` (4px).
6. **Portal dialogs are square with a 1px ink border**, no shadow, over a `canvas/80` scrim. Radius 26 in §3 is the iOS sheet/glass geometry; the portal has no glass.
7. **`calendar.tsx`, `tabs.tsx` and `select.tsx` are currently unused** (no imports outside `ui/`). They are re-skinned, not deleted, because PRs 4–6 need tabs, select and date cells. `chart.tsx` and its only dependency `recharts` are deleted.
8. **iOS spacing** maps the old extension values to the nearest §3 step: 2/4→4, 8→10, 12→14, 16→18, 20→22, 24→22, 32→28. Layout shifts are ±2pt, not structural.
9. **iOS toggle tint** is ink in light and `ink.tertiary` in dark: dark ink `#EFEDE4` against the native white thumb is 1.17:1; `ink.tertiary` dark is 3.33:1 against the thumb and 5.39:1 against canvas. Native switch, no hue, no new value.
10. **iOS segmented control stays native** (`UISegmentedControl.appearance()` gives the `sunk` track, `surface` thumb and Plex labels). Its corners stay system-rounded: squaring them needs custom geometry, which §4.3 forbids.
11. **System text styles (`.font(.caption)` and so on) are not migrated here.** Only the retired `Font` extensions are. Type roles on screens change in PRs 3 and 6.

## File map

| File | Task | Responsibility |
|---|---|---|
| `web-portal/tests/letterpress-rules.ts` | 1 | Shared retired-class patterns and render helpers (not a test file) |
| `web-portal/src/components/ui/button.tsx`, `badge.tsx` | 1 | §4.1 buttons (filled / outlined / underline), square mono chips |
| `web-portal/tests/ui-buttons.test.ts` | 1 | Rendered class assertions |
| `web-portal/src/components/ui/input.tsx`, `textarea.tsx`, `label.tsx`, `select.tsx`, `switch.tsx` | 2 | §4.2 fields, ink switch, outlined highlighted items |
| `web-portal/tailwind.config.js` | 2, 4 | `rule.field` token (2); alias colours removed, radius scale replaced (4) |
| `web-portal/tests/ui-fields.test.ts`, `letterpress-tokens.test.mjs` | 2, 4 | Field tests; boundary test reads `rule.field`; alias assertion removed |
| `web-portal/src/components/ui/table.tsx`, `tabs.tsx`, `card.tsx`, `alert.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `avatar.tsx`, `calendar.tsx` | 3 | §4.9 table, §4.3 tabs, square surfaces |
| `web-portal/src/components/ui/chart.tsx`, `package.json`, `package-lock.json` | 3 | Delete chart and `recharts` |
| `web-portal/tests/ui-surfaces.test.ts` | 3 | Rendered and source assertions |
| `web-portal/src/app/globals.css` | 4 | Alias variables removed; `selected-rule`, `selected-outline` utilities |
| 26 consumer files under `web-portal/src/app` and `web-portal/src/components/{layout,patients,care-support,messages}` | 4 | Alias, radius and selection migration |
| `web-portal/tests/letterpress-sweep.test.ts` | 4 | Portal retired-token sweep |
| `ClearAF/Views/LetterpressLayout.swift` | 5 | `Letterpress.Space`, `Letterpress.Radius`, `minTouch`, `letterpressSurface()` |
| `ClearAF/Views/LetterpressButtonStyle.swift` | 5 | Filled / outlined / underline, pinned 44pt |
| `ClearAF/Views/LetterpressText.swift` | 5 | Eyebrow modifier, rule divider |
| `ClearAF/Views/LetterpressControls.swift` | 5 | Field modifier, `LetterpressPicker`, `toggleOn`, segmented appearance |
| `ClearAF/ClearAFApp.swift`, `ClearAF/Assets.xcassets/AccentColor.colorset/Contents.json` | 5 | Apply appearance at launch; accent = ink |
| `ClearAFTests/LetterpressPrimitivesTests.swift` | 5 | Height, contrast, scales, appearance |
| 16 view files under `ClearAF/` | 6, 7 | Consumer migration |
| `ClearAF/Views/DesignSystem.swift` → deleted; `ClearAF/Views/InteractionHelpers.swift` | 7 | Keep `HapticManager`, `accessibleButton` |
| `ClearAFTests/LetterpressSweepTests.swift` | 6, 7 | iOS retired-token and hue sweep |
| `ClearAFTests/AccountProfileTests.swift`, `ClearAFUITests/MVPExperienceUITests.swift` | 6, 7 | Tests follow the renames |

---

### Task 1: Portal buttons and badges

**Files:**
- Create: `web-portal/tests/letterpress-rules.ts`, `web-portal/tests/ui-buttons.test.ts`
- Modify (full rewrite): `web-portal/src/components/ui/button.tsx`, `web-portal/src/components/ui/badge.tsx`

**Interfaces:**
- Produces `buttonVariants` / `Button` with unchanged variant names `default | destructive | outline | secondary | ghost | link` and sizes `default (36px) | sm (32px) | lg (44px) | icon (36px)`. `default` = filled ink; `outline` and `secondary` = outlined; `link` = text-underline; `destructive` = outlined in `error`; `ghost` = transparent ink text.
- Produces `Badge` variants `default | secondary | destructive | outline | attention` (`attention` only for unread/prescription).
- Produces from `tests/letterpress-rules.ts`: `ALIAS_CLASS`, `RETIRED_RADIUS`, `SHADOW_UTILITY`, `HUE_CLASS`, `HEX_COLOUR`, `DIMMING_OPACITY`, `REMOVED_FOCUS` (RegExp, no `g` flag); `classesOf(html: string): Set<string>` (first element's classes, entities decoded); `allClasses(html: string): Set<string>`; `has(set: Set<string>, ...names: string[]): void`; `read(path: string): string`; `sourceFiles(dir: string): string[]`; `offences(pattern: RegExp, files: string[]): string[]`. Tasks 2–4 import these.

- [ ] **Step 1: Create the shared rules helper** — `web-portal/tests/letterpress-rules.ts`

```ts
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Class and value patterns retired by Letterpress 1.0. Shared by the primitive tests and the portal sweep.
export const ALIAS_CLASS =
  /(?<![\w-])(?:bg|text|border|ring|ring-offset|outline|fill|stroke|divide|placeholder|decoration|shadow|from|via|to)-(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|input|ring|border)(?:-foreground)?(?![\w-])/;
export const RETIRED_RADIUS = /(?<![\w-])rounded-(?:[trblse]{1,2}-)?(?:sm|md|lg|xl|2xl|3xl)(?![\w-])/;
export const SHADOW_UTILITY = /(?<![\w-])shadow(?:-(?:xs|sm|md|lg|xl|2xl|inner))?(?![\w[-])/;
export const HUE_CLASS =
  /(?<![\w-])(?:bg|text|border|ring|fill|stroke|outline|divide|decoration|from|via|to|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?![\w-])/;
export const HEX_COLOUR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/;
export const DIMMING_OPACITY = /(?<![\w-])opacity-(?:50|60|70|80)(?![\w-])/;
export const REMOVED_FOCUS = /(?<![\w-])focus(?:-visible)?:(?:outline-none|ring-\d)(?![\w-])/;

const decode = (value: string) => value.replaceAll("&amp;", "&").replaceAll("&gt;", ">").replaceAll("&lt;", "<");
const split = (value: string) => decode(value).split(/\s+/).filter(Boolean);

export const classesOf = (html: string): Set<string> => new Set(split(html.match(/class="([^"]*)"/)?.[1] ?? ""));
export const allClasses = (html: string): Set<string> =>
  new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => split(match[1])));

export function has(set: Set<string>, ...names: string[]): void {
  for (const name of names) assert.ok(set.has(name), `missing ${name} in: ${[...set].join(" ")}`);
}

export const read = (path: string): string => readFileSync(path, "utf8");

export function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

export function offences(pattern: RegExp, files: string[]): string[] {
  return files.flatMap((file) =>
    read(file)
      .split("\n")
      .flatMap((text, index) => (pattern.test(text) ? [`${file}:${index + 1}: ${text.trim().slice(0, 160)}`] : [])),
  );
}
```

- [ ] **Step 2: Write the failing test** — `web-portal/tests/ui-buttons.test.ts`

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, type ButtonProps } from "../src/components/ui/button";
import { Badge, type BadgeProps } from "../src/components/ui/badge";
import { ALIAS_CLASS, DIMMING_OPACITY, REMOVED_FOCUS, RETIRED_RADIUS, SHADOW_UTILITY, classesOf, has, read } from "./letterpress-rules";

const button = (props: ButtonProps = {}) => classesOf(renderToStaticMarkup(h(Button, props, "Save")));
const badge = (props: BadgeProps = {}) => classesOf(renderToStaticMarkup(h(Badge, props, "Archived")));

test("filled is ink with canvas text, radius 4, 36px, 13px medium label", () => {
  has(button(), "bg-ink", "text-canvas", "rounded", "min-h-9", "text-[13px]", "font-medium");
});

test("outlined is a 1px ink border at 32% with ink text", () => {
  for (const variant of ["outline", "secondary"] as const) has(button({ variant }), "border", "border-ink/[0.32]", "text-ink", "bg-transparent");
});

test("link is always underlined with a 3px offset", () => {
  const c = button({ variant: "link" });
  has(c, "underline", "underline-offset-[3px]", "text-ink");
  assert.ok(!c.has("hover:underline"));
});

test("destructive is outlined in error, never a filled hue", () => {
  const c = button({ variant: "destructive" });
  has(c, "border", "border-error", "text-error");
  assert.ok(!c.has("bg-error"));
});

test("portal sizes stay in the 32–36px band; lg is the 44px full-width action", () => {
  has(button({ size: "sm" }), "min-h-8");
  has(button({ size: "default" }), "min-h-9");
  has(button({ size: "lg" }), "min-h-11");
  has(button({ size: "icon" }), "h-9", "w-9");
});

test("disabled is sunk with ink.tertiary, not reduced opacity", () => {
  has(button(), "disabled:bg-sunk", "disabled:text-ink-tertiary");
  has(button({ variant: "outline" }), "disabled:border-transparent");
  has(button({ variant: "link" }), "disabled:bg-transparent");
});

test("badges are square mono chips; attention is wash plus attention text", () => {
  has(badge(), "rounded-none", "font-data", "text-[11px]", "uppercase", "tabular-nums", "border-ink/30");
  has(badge({ variant: "secondary" }), "bg-sunk", "text-ink-secondary");
  has(badge({ variant: "destructive" }), "border-error", "text-error");
  has(badge({ variant: "attention" }), "bg-attention-wash", "text-attention-text");
});

test("button and badge sources carry no aliases, retired radii, shadows, dimming or removed focus", () => {
  for (const file of ["button", "badge"]) {
    const source = read(`src/components/ui/${file}.tsx`);
    for (const pattern of [ALIAS_CLASS, RETIRED_RADIUS, SHADOW_UTILITY, DIMMING_OPACITY, REMOVED_FOCUS]) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/ui-buttons.test.ts`
Expected: FAIL — `missing bg-ink`, and the `variant: "attention"` test fails (TS is not checked by the runner; the class is simply missing).

- [ ] **Step 4: Rewrite `web-portal/src/components/ui/button.tsx`**

```tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Letterpress §4.1: filled ink (one per screen), outlined (1px ink at 32%), text-underline. Radius 4.
// Portal density: 32–36px for row, toolbar and inline controls; lg (44px) only for a full-width primary action.
// Disabled is sunk + ink.tertiary; the screen says why in a sentence.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-normal text-center rounded text-[13px] font-medium leading-tight transition-colors disabled:pointer-events-none disabled:bg-sunk disabled:text-ink-tertiary [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-canvas hover:bg-ink/90",
        outline: "border border-ink/[0.32] bg-transparent text-ink hover:bg-sunk disabled:border-transparent",
        secondary: "border border-ink/[0.32] bg-transparent text-ink hover:bg-sunk disabled:border-transparent",
        destructive: "border border-error bg-transparent text-error hover:bg-sunk disabled:border-transparent",
        ghost: "bg-transparent text-ink hover:bg-sunk",
        link: "bg-transparent text-ink underline underline-offset-[3px] hover:decoration-2 disabled:bg-transparent",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 px-3 py-1.5",
        lg: "min-h-11 px-6 py-2.5 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

The global `:focus-visible` rule in `globals.css` (2px ink outline) now applies; the old `focus-visible:outline-none focus-visible:ring-*` classes were suppressing it.

- [ ] **Step 5: Rewrite `web-portal/src/components/ui/badge.tsx`**

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Letterpress chips: square, mono 11, tabular figures, no fill hue.
// `attention` (attention.wash + attention.text) is reserved for unread and prescription.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-none border px-2 py-0.5 font-data text-[11px] font-medium uppercase leading-4 tracking-[0.06em] tabular-nums",
  {
    variants: {
      variant: {
        default: "border-ink/30 text-ink",
        secondary: "border-transparent bg-sunk text-ink-secondary",
        destructive: "border-error text-error",
        outline: "border-ink/30 text-ink",
        attention: "border-transparent bg-attention-wash text-attention-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
```

- [ ] **Step 6: Run the test to verify it passes, then typecheck**

Run: `cd web-portal && node --import tsx --test tests/ui-buttons.test.ts && npm run typecheck`
Expected: PASS (8 tests); `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
git add web-portal/tests/letterpress-rules.ts web-portal/tests/ui-buttons.test.ts web-portal/src/components/ui/button.tsx web-portal/src/components/ui/badge.tsx
git commit -m "portal: re-skin buttons and badges to Letterpress" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 2: Portal fields, labels, select and switch

**Files:**
- Create: `web-portal/tests/ui-fields.test.ts`
- Modify (full rewrite): `web-portal/src/components/ui/input.tsx`, `textarea.tsx`, `label.tsx`, `select.tsx`, `switch.tsx`
- Modify: `web-portal/tailwind.config.js` (`colors.rule`), `web-portal/tests/letterpress-tokens.test.mjs:42-54`

**Interfaces:**
- Consumes: `tests/letterpress-rules.ts` from Task 1.
- Produces Tailwind colour `rule-field` = `rgb(var(--ink) / 0.5)` (`border-rule-field`), the field boundary on both field types. Task 4 removes the `input` alias; nothing else may use it.
- `Input` gains `data-empty="true" | "false"` when `value` is controlled (absent when uncontrolled). No prop changes.
- `Select`, `Switch`, `Label`, `Textarea` exports unchanged.

- [ ] **Step 1: Write the failing test** — `web-portal/tests/ui-fields.test.ts`

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "../src/components/ui/input";
import { Textarea } from "../src/components/ui/textarea";
import { Label } from "../src/components/ui/label";
import { Switch } from "../src/components/ui/switch";
import { ALIAS_CLASS, DIMMING_OPACITY, REMOVED_FOCUS, RETIRED_RADIUS, SHADOW_UTILITY, classesOf, has, read } from "./letterpress-rules";

const noop = () => {};

test("input is a 1.5px baseline rule, not a box", () => {
  const c = classesOf(renderToStaticMarkup(h(Input, { value: "", onChange: noop })));
  has(c, "rounded-none", "border-0", "border-b-[1.5px]", "border-rule-field", "bg-transparent", "px-0", "focus-visible:border-ink", "data-[empty=false]:border-ink", "placeholder:text-ink-tertiary");
  assert.ok(!c.has("border") && !c.has("shadow-sm"));
});

test("input derives emptiness from a controlled value only", () => {
  assert.match(renderToStaticMarkup(h(Input, { value: "", onChange: noop })), /data-empty="true"/);
  assert.match(renderToStaticMarkup(h(Input, { value: "Maya", onChange: noop })), /data-empty="false"/);
  assert.doesNotMatch(renderToStaticMarkup(h(Input, { defaultValue: "Maya" })), /data-empty/);
});

test("textarea is the bounded-editor field: square, bordered, on surface", () => {
  has(classesOf(renderToStaticMarkup(h(Textarea, {}))), "rounded-none", "border", "border-rule-field", "bg-surface", "focus-visible:border-ink");
});

test("label is the persistent mono label", () => {
  const c = classesOf(renderToStaticMarkup(h(Label, { htmlFor: "email" }, "Email")));
  has(c, "font-data", "text-[10px]", "font-medium", "uppercase", "tracking-[0.16em]", "text-ink-tertiary");
  assert.ok(!c.has("peer-disabled:opacity-70"));
});

test("switch signals state by position and fill, never hue", () => {
  const html = renderToStaticMarkup(h(Switch, { checked: true }));
  has(classesOf(html), "h-6", "w-11", "rounded-full", "border-[1.5px]", "data-[state=checked]:bg-ink", "data-[state=unchecked]:border-rule-field", "data-[state=unchecked]:bg-transparent");
  assert.match(html, /data-\[state=checked\]:bg-canvas/);
});

test("select trigger is a baseline field; highlighted items get a 2px ink outline", () => {
  const source = read("src/components/ui/select.tsx");
  for (const token of ["border-b-[1.5px]", "border-rule-field", "data-[highlighted]:bg-sunk", "data-[highlighted]:outline-2", "data-[highlighted]:outline-ink", "data-[state=checked]:font-medium"])
    assert.ok(source.includes(token), token);
  assert.doesNotMatch(source, /focus:bg-accent/);
});

test("field primitives carry no aliases, retired radii, shadows, dimming or removed focus", () => {
  for (const file of ["input", "textarea", "label", "select", "switch"]) {
    const source = read(`src/components/ui/${file}.tsx`);
    for (const pattern of [ALIAS_CLASS, RETIRED_RADIUS, SHADOW_UTILITY, DIMMING_OPACITY, REMOVED_FOCUS]) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
});
```

- [ ] **Step 2: Point the boundary test at the new token** — in `web-portal/tests/letterpress-tokens.test.mjs`, replace the whole `input boundary` test (lines 42–54) with:

```js
  test(`${theme} field boundary meets 3:1 on every paper tone`, () => {
    const m = tailwind.match(/field:\s*'rgb\(var\(--ink\)\s*\/\s*([\d.]+)\)'/);
    assert.ok(m, 'rule.field token not found in tailwind.config.js');
    const alpha = Number(m[1]);
    const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const toHex = (arr) => '#' + arr.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase();
    const inkRgb = rgbOf(t.ink);
    for (const bg of ['canvas', 'surface', 'rail', 'sunk']) {
      const bgRgb = rgbOf(t[bg]);
      const composite = toHex(inkRgb.map((c, i) => alpha * c + (1 - alpha) * bgRgb[i]));
      assert.ok(contrast(composite, t[bg]) >= 3.0, `field boundary vs ${bg}: ${contrast(composite, t[bg]).toFixed(2)}`);
    }
  });
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd web-portal && node --import tsx --test tests/ui-fields.test.ts tests/letterpress-tokens.test.mjs`
Expected: FAIL — `missing rounded-none` (input), `rule.field token not found in tailwind.config.js` (light and dark).

- [ ] **Step 4: Add the field token** — in `web-portal/tailwind.config.js` replace the `rule:` line with:

```js
        rule: {
          DEFAULT: 'rgb(var(--ink) / 0.13)',
          strong: 'rgb(var(--ink) / <alpha-value>)',
          // Field boundary: ink at 50% is the lightest value that keeps 3:1 on every paper tone in both modes.
          field: 'rgb(var(--ink) / 0.5)',
        },
```

- [ ] **Step 5: Rewrite `web-portal/src/components/ui/input.tsx`**

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

// Letterpress §4.2: a 1.5px baseline rule, not a box. Ink at 50% while empty (3:1 or better on every paper tone),
// ink when filled or focused. `data-empty` comes from a controlled value; uncontrolled inputs rely on focus.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, value, ...props }, ref) => {
    const empty = value === undefined ? undefined : String(value).length === 0
    return (
      <input
        type={type}
        value={value}
        data-empty={empty}
        className={cn(
          "flex h-9 w-full rounded-none border-0 border-b-[1.5px] border-rule-field bg-transparent px-0 py-1 text-base text-ink transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink placeholder:text-ink-tertiary focus-visible:border-ink data-[empty=false]:border-ink disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-tertiary md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
```

- [ ] **Step 6: Rewrite `web-portal/src/components/ui/textarea.tsx`**

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

// Letterpress §4.2 bounded-editor field: a multi-line area shows its extent, so it keeps a border on `surface`.
// Border is ink at 50% (3:1 or better), ink on focus.
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-none border border-rule-field bg-surface px-3.5 py-3 text-base text-ink placeholder:text-ink-tertiary focus-visible:border-ink disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-tertiary md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
```

- [ ] **Step 7: Rewrite `web-portal/src/components/ui/label.tsx`**

```tsx
"use client"

import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Letterpress §4.2 persistent field label (mockup `.lbl`): mono 500, 10px, .16em, uppercase, ink.tertiary.
const labelVariants = cva(
  "font-data text-[10px] font-medium uppercase leading-none tracking-[0.16em] text-ink-tertiary peer-disabled:cursor-not-allowed"
)

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
```

- [ ] **Step 8: Rewrite `web-portal/src/components/ui/select.tsx`**

```tsx
"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

// Trigger is a §4.2 baseline field. Popover is square with a hairline border and no shadow.
// Highlighted items get a sunk fill plus a 2px inset ink outline; the checked item keeps its check mark and weight.
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-none border-0 border-b-[1.5px] border-rule-field bg-transparent px-0 py-2 text-sm text-ink data-[placeholder]:text-ink-tertiary focus-visible:border-ink data-[state=open]:border-ink disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-tertiary [&>span]:line-clamp-1",
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 text-ink-secondary" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 max-h-[--radix-select-content-available-height] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-none border border-ink/30 bg-surface text-ink data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-select-content-transform-origin]",
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
))
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 font-data text-[10px] font-medium uppercase tracking-[0.16em] text-ink-tertiary", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-none py-1.5 pl-2 pr-8 text-sm text-ink outline-none data-[highlighted]:bg-sunk data-[highlighted]:outline data-[highlighted]:outline-2 data-[highlighted]:outline-ink data-[highlighted]:[outline-offset:-2px] data-[state=checked]:font-medium data-[disabled]:pointer-events-none data-[disabled]:text-ink-tertiary",
      className
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
))
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-rule", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
```

- [ ] **Step 9: Rewrite `web-portal/src/components/ui/switch.tsx`**

```tsx
"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

// Ink switch (mockup 44×24). Off: outlined track in ink at 50% (3:1 or better) with an ink.tertiary thumb at the start.
// On: solid ink track with a canvas thumb at the end. Position and fill both change, so state never relies on hue.
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-[1.5px] transition-colors disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunk data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=unchecked]:border-rule-field data-[state=unchecked]:bg-transparent",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-canvas data-[state=unchecked]:translate-x-[2px] data-[state=unchecked]:bg-ink-tertiary"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
```

- [ ] **Step 10: Run the tests to verify they pass, then typecheck**

Run: `cd web-portal && node --import tsx --test tests/ui-fields.test.ts tests/letterpress-tokens.test.mjs && npm run typecheck`
Expected: PASS (7 field tests; token tests including `light field boundary meets 3:1 on every paper tone` and `dark …`); `tsc` exits 0.

- [ ] **Step 11: Commit**

```bash
git add web-portal/tests/ui-fields.test.ts web-portal/tests/letterpress-tokens.test.mjs web-portal/tailwind.config.js web-portal/src/components/ui/input.tsx web-portal/src/components/ui/textarea.tsx web-portal/src/components/ui/label.tsx web-portal/src/components/ui/select.tsx web-portal/src/components/ui/switch.tsx
git commit -m "portal: baseline-rule fields, mono labels and ink switch" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: Portal table, tabs, surfaces, menus and calendar; delete chart

**Files:**
- Create: `web-portal/tests/ui-surfaces.test.ts`
- Modify (full rewrite): `web-portal/src/components/ui/table.tsx`, `tabs.tsx`, `card.tsx`, `alert.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `avatar.tsx`, `calendar.tsx`
- Delete: `web-portal/src/components/ui/chart.tsx`; dependency `recharts` (`package.json`, `package-lock.json`)

**Interfaces:**
- Consumes: `tests/letterpress-rules.ts` (Task 1); `border-rule-field` (Task 2).
- Produces `TableCell` prop `numeric?: boolean` (mono, tabular, 12px medium; not forwarded to the DOM). `TableRow` styles `data-state="selected"` (rail + 2px ink rule on the first cell) and `data-attention="true"` (rail + 4px `attention.mark` bar); callers set the attributes, PR 4 uses them.
- Produces `TabsList` prop `variant?: "segmented" | "underline"` (default `segmented`); `TabsTrigger` reads it from context.
- `Badge`, `Button` unchanged from Task 1. All other exports unchanged.

- [ ] **Step 1: Verify `chart.tsx` is unused**

Run: `cd web-portal && grep -rn "ui/chart\|recharts" src tests | grep -v "src/components/ui/chart.tsx"`
Expected: no output. (If anything prints, stop and report; do not delete.)

- [ ] **Step 2: Write the failing test** — `web-portal/tests/ui-surfaces.test.ts`

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../src/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "../src/components/ui/tabs";
import { Card } from "../src/components/ui/card";
import { Alert } from "../src/components/ui/alert";
import { ALIAS_CLASS, DIMMING_OPACITY, HUE_CLASS, REMOVED_FOCUS, RETIRED_RADIUS, SHADOW_UTILITY, allClasses, classesOf, has, read } from "./letterpress-rules";

const table = renderToStaticMarkup(
  h(Table, null,
    h(TableHeader, null, h(TableRow, null, h(TableHead, null, "Patient"), h(TableHead, null, "Adherence"))),
    h(TableBody, null, h(TableRow, null, h(TableCell, null, "Maya"), h(TableCell, { numeric: true }, "79%")))),
);

test("table: 2px ink rule under the head, 1px rules between rows, no zebra", () => {
  const c = allClasses(table);
  has(c, "[&_tr]:border-b-2", "[&_tr]:border-ink", "border-b", "border-rule");
  for (const name of c) assert.doesNotMatch(name, /^(?:even|odd):/, name);
});

test("table head is the mono eyebrow; numeric cells are mono tabular figures", () => {
  const c = allClasses(table);
  has(c, "font-data", "text-[10px]", "uppercase", "tracking-[0.16em]", "text-ink-tertiary", "tabular-nums", "text-xs");
  assert.doesNotMatch(table, /numeric=/);
});

test("table rows mark selection and attention without relying on tone", () => {
  const source = read("src/components/ui/table.tsx");
  assert.ok(source.includes("data-[state=selected]:[&>td:first-child]:shadow-[inset_2px_0_0_rgb(var(--ink))]"));
  assert.ok(source.includes("data-[attention=true]:[&>td:first-child]:shadow-[inset_4px_0_0_rgb(var(--attention-mark))]"));
});

const tabs = (variant?: "segmented" | "underline") =>
  renderToStaticMarkup(h(Tabs, { defaultValue: "a" }, h(TabsList, { variant }, h(TabsTrigger, { value: "a" }, "Needs review"), h(TabsTrigger, { value: "b" }, "Flagged"))));

test("segmented tabs: square sunk track, surface thumb with the spec shadow and an ink hairline", () => {
  const html = tabs();
  has(allClasses(html), "bg-sunk", "rounded-none", "data-[state=active]:bg-surface", "data-[state=active]:font-medium", "data-[state=active]:shadow-[0_1px_2px_rgba(18,19,18,.14),inset_0_0_0_1px_rgb(var(--ink)/0.5)]", "min-h-8");
});

test("underline tabs: 2px ink rule under the list, active tab adds its own 2px ink rule", () => {
  has(allClasses(tabs("underline")), "border-b-2", "border-ink", "data-[state=active]:border-ink", "data-[state=active]:font-medium");
  assert.ok(!allClasses(tabs("underline")).has("bg-sunk"));
});

test("card and alert are square with no shadow", () => {
  has(classesOf(renderToStaticMarkup(h(Card, null, "x"))), "rounded-none", "bg-surface", "text-ink");
  has(classesOf(renderToStaticMarkup(h(Alert, null, "x"))), "rounded-none", "border-l-2", "border-ink");
  has(classesOf(renderToStaticMarkup(h(Alert, { variant: "destructive" }, "x"))), "border-error", "text-error");
});

test("menus: square hairline popover, highlighted items get a 2px ink outline", () => {
  const source = read("src/components/ui/dropdown-menu.tsx");
  for (const token of ["rounded-none border border-ink/30 bg-surface", "data-[highlighted]:outline-2", "data-[highlighted]:outline-ink", "data-[highlighted]:bg-sunk"]) assert.ok(source.includes(token), token);
});

test("dialog is square, bordered in ink, over a paper scrim", () => {
  const source = read("src/components/ui/dialog.tsx");
  for (const token of ["bg-canvas/80", "rounded-none border border-ink bg-surface"]) assert.ok(source.includes(token), token);
});

test("avatar fallback is an ink disc with mono initials; calendar cells are square with an outlined today", () => {
  assert.ok(read("src/components/ui/avatar.tsx").includes("rounded-full bg-ink font-data text-[11px] font-medium text-canvas"));
  const calendar = read("src/components/ui/calendar.tsx");
  for (const token of ["outline-[1.5px]", "data-[selected-single=true]:bg-ink", "text-ink-future"]) assert.ok(calendar.includes(token), token);
});

test("surface primitives carry no aliases, retired radii, shadows, hues, dimming or removed focus", () => {
  for (const file of ["table", "tabs", "card", "alert", "dialog", "dropdown-menu", "avatar", "calendar"]) {
    const source = read(`src/components/ui/${file}.tsx`);
    for (const pattern of [ALIAS_CLASS, RETIRED_RADIUS, SHADOW_UTILITY, HUE_CLASS, DIMMING_OPACITY, REMOVED_FOCUS]) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
});

test("the unused chart primitive and recharts are gone", () => {
  assert.equal(existsSync("src/components/ui/chart.tsx"), false);
  assert.doesNotMatch(read("package.json"), /"recharts"/);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/ui-surfaces.test.ts`
Expected: FAIL — `missing [&_tr]:border-b-2`, `bg-canvas/80` not found, chart still exists.

- [ ] **Step 4: Delete chart and recharts**

```bash
cd web-portal && git rm -q src/components/ui/chart.tsx && npm uninstall recharts
```
Expected: npm prints `removed N packages`; `package.json` no longer lists `recharts`.

- [ ] **Step 5: Rewrite `web-portal/src/components/ui/table.tsx`**

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

// Letterpress §4.9: 2px ink rule under the head, 1px rules between rows, no zebra, no card-per-row.
// `numeric` cells use mono tabular figures. Rows: data-state="selected" → rail + 2px ink rule;
// data-attention="true" → rail + 4px attention.mark bar (waiting). Rules sit on the first cell because
// box-shadow on <tr> is unreliable across browsers.
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b-2 [&_tr]:border-ink", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t-2 border-ink font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-rule transition-colors hover:bg-rail/60 data-[state=selected]:bg-rail data-[state=selected]:[&>td:first-child]:shadow-[inset_2px_0_0_rgb(var(--ink))] data-[attention=true]:bg-rail data-[attention=true]:[&>td:first-child]:shadow-[inset_4px_0_0_rgb(var(--attention-mark))]",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-9 px-2 pb-2 text-left align-bottom font-data text-[10px] font-medium uppercase tracking-[0.16em] text-ink-tertiary [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }
>(({ className, numeric = false, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "px-2 py-3 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      numeric && "font-data text-xs font-medium tabular-nums",
      className
    )}
    {...props}
  />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-ink-secondary", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
```

- [ ] **Step 6: Rewrite `web-portal/src/components/ui/tabs.tsx`**

```tsx
"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Letterpress §4.3. `segmented` (default) for 2–3 way filters: square sunk track, surface thumb with the spec shadow.
// `underline` for workspace sections: a 2px ink rule under the list; the active tab adds its own 2px ink rule.
// The segmented thumb is 1.2:1 against sunk, so the active trigger also changes weight and draws an inset ink hairline.
type TabsVariant = "segmented" | "underline"

const TabsVariantContext = React.createContext<TabsVariant>("segmented")

const Tabs = TabsPrimitive.Root

const tabsListVariants = cva("inline-flex items-center text-ink-secondary", {
  variants: {
    variant: {
      segmented: "gap-0.5 rounded-none bg-sunk p-0.5",
      underline: "w-full gap-6 border-b-2 border-ink",
    },
  },
  defaultVariants: { variant: "segmented" },
})

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-[13px] font-[450] transition-colors disabled:pointer-events-none disabled:text-ink-tertiary data-[state=active]:font-medium data-[state=active]:text-ink",
  {
    variants: {
      variant: {
        segmented:
          "min-h-8 rounded-none px-3 data-[state=active]:bg-surface data-[state=active]:shadow-[0_1px_2px_rgba(18,19,18,.14),inset_0_0_0_1px_rgb(var(--ink)/0.5)]",
        underline: "border-b-2 border-transparent pb-2.5 text-sm data-[state=active]:border-ink",
      },
    },
    defaultVariants: { variant: "segmented" },
  }
)

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = "segmented", ...props }, ref) => (
  <TabsVariantContext.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  </TabsVariantContext.Provider>
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-4", className)}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

- [ ] **Step 7: Rewrite `web-portal/src/components/ui/card.tsx`**

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

// Square surface block, no border (no nested bordered boxes) and no shadow. Prefer rules; PRs 4–5 remove most cards.
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-none bg-surface text-ink", className)}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-base font-medium leading-snug", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-ink-secondary", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
```

- [ ] **Step 8: Rewrite `web-portal/src/components/ui/alert.tsx`**

```tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// A 2px rule at the leading edge on surface; destructive uses the error token for rule and text, never a fill.
const alertVariants = cva(
  "relative w-full rounded-none border-0 border-l-2 bg-surface px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "border-ink text-ink [&>svg]:text-ink",
        destructive: "border-error text-error [&>svg]:text-error",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
```

- [ ] **Step 9: Rewrite `web-portal/src/components/ui/dialog.tsx`**

```tsx
"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

// Portal dialogs are square and bounded by a 1px ink rule over a paper scrim. No shadow, no glass (§4.8).
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-canvas/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 rounded-none border border-ink bg-surface p-6 text-ink duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-none text-ink-secondary transition-colors hover:text-ink disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-medium leading-snug", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-ink-secondary", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
```

- [ ] **Step 10: Rewrite `web-portal/src/components/ui/dropdown-menu.tsx`**

```tsx
"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

// Square hairline popover, no shadow. Highlighted items: sunk fill plus a 2px inset ink outline (keyboard and pointer).
const itemHighlight =
  "outline-none data-[highlighted]:bg-sunk data-[highlighted]:outline data-[highlighted]:outline-2 data-[highlighted]:outline-ink data-[highlighted]:[outline-offset:-2px]"
const popover = "rounded-none border border-ink/30 bg-surface p-1 text-ink"

const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuSub = DropdownMenuPrimitive.Sub

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center gap-2 rounded-none px-2 py-1.5 text-sm data-[state=open]:bg-sunk [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      itemHighlight,
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-none border border-ink/30 bg-surface p-1 text-ink data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
      className
    )}
    {...props}
  />
))
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden",
        popover,
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-none px-2 py-1.5 text-sm transition-colors data-[disabled]:pointer-events-none data-[disabled]:text-ink-tertiary [&>svg]:size-4 [&>svg]:shrink-0",
      itemHighlight,
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-none py-1.5 pl-8 pr-2 text-sm transition-colors data-[disabled]:pointer-events-none data-[disabled]:text-ink-tertiary",
      itemHighlight,
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-none py-1.5 pl-8 pr-2 text-sm transition-colors data-[disabled]:pointer-events-none data-[disabled]:text-ink-tertiary",
      itemHighlight,
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-medium",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-rule", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto font-data text-xs tracking-widest text-ink-secondary", className)}
      {...props}
    />
  )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}
```

The test looks for the literal `rounded-none border border-ink/30 bg-surface`, which is the `popover` constant.

- [ ] **Step 11: Rewrite `web-portal/src/components/ui/avatar.tsx`**

```tsx
"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/utils"

// Radius 999. Fallback is an ink disc with mono initials (mockup "AO").
const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-ink font-data text-[11px] font-medium text-canvas",
      className
    )}
    {...props}
  />
))
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback }
```

- [ ] **Step 12: Rewrite `web-portal/src/components/ui/calendar.tsx`**

```tsx
"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

// Letterpress calendar cells: square, mono tabular day numbers, today outlined 1.5px in ink,
// selection is an ink fill, outside and disabled days use ink.future (the only de-emphasis token).
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "bg-canvas group/calendar p-3 [--cell-size:2rem] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:text-ink-future",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "h-[--cell-size] w-[--cell-size] select-none p-0 aria-disabled:text-ink-future",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-[--cell-size] w-full items-center justify-center px-[--cell-size]",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-[--cell-size] w-full items-center justify-center gap-1.5 text-sm font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-none border-b-[1.5px] border-rule-field has-focus:border-ink",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "bg-surface absolute inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-medium",
          captionLayout === "label"
            ? "text-sm"
            : "[&>svg]:text-ink-secondary flex h-8 items-center gap-1 rounded-none pl-2 pr-1 text-sm [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 select-none rounded-none font-data text-[10px] font-medium uppercase tracking-[0.16em] text-ink-tertiary",
          defaultClassNames.weekday
        ),
        week: cn("mt-2 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "w-[--cell-size] select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "select-none font-data text-[0.8rem] tabular-nums text-ink-secondary",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center",
          defaultClassNames.day
        ),
        range_start: cn("bg-sunk", defaultClassNames.range_start),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("bg-sunk", defaultClassNames.range_end),
        today: cn(
          "rounded-none outline outline-[1.5px] outline-ink [outline-offset:-1.5px]",
          defaultClassNames.today
        ),
        outside: cn(
          "text-ink-future aria-selected:text-ink-future",
          defaultClassNames.outside
        ),
        disabled: cn("text-ink-future", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-[--cell-size] items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex aspect-square h-auto w-full min-w-[--cell-size] flex-col gap-1 rounded-none font-data font-normal leading-none tabular-nums data-[selected-single=true]:bg-ink data-[selected-single=true]:text-canvas data-[range-start=true]:bg-ink data-[range-start=true]:text-canvas data-[range-end=true]:bg-ink data-[range-end=true]:text-canvas data-[range-middle=true]:bg-sunk data-[range-middle=true]:text-ink group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:outline group-data-[focused=true]/day:outline-2 group-data-[focused=true]/day:outline-ink [&>span]:text-xs",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
```

- [ ] **Step 13: Run the test to verify it passes, then typecheck and lint**

Run: `cd web-portal && node --import tsx --test tests/ui-surfaces.test.ts && npm run typecheck && npm run lint`
Expected: PASS (11 tests); `tsc` and `eslint` exit 0.

- [ ] **Step 14: Commit**

```bash
git add -A web-portal/src/components/ui web-portal/tests/ui-surfaces.test.ts web-portal/package.json web-portal/package-lock.json
git commit -m "portal: ruled tables, square tabs and surfaces; drop unused chart" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Portal alias removal, radius scale and consumer sweep

**Files:**
- Create: `web-portal/tests/letterpress-sweep.test.ts`
- Modify (full rewrite): `web-portal/src/app/globals.css`, `web-portal/tailwind.config.js`, `web-portal/src/components/layout/Sidebar.tsx`
- Modify: `web-portal/tests/letterpress-tokens.test.mjs:62-65`; hand edits in `src/app/messages/page.tsx:69-72`, `src/components/messages/ConversationView.tsx:60-63,314`, `src/components/care-support/CompletionCalendar.tsx:88,131`, `src/components/care-support/QuestionFields.tsx:35`, `src/components/care-support/TemplatePicker.tsx:30`, `src/app/login/page.tsx:132-136`; mechanical mapping across the consumer files listed in Step 5

**Interfaces:**
- Consumes: every primitive from Tasks 1–3 (they no longer use aliases); `rule-field` (Task 2); `tests/letterpress-rules.ts` (Task 1).
- Produces: Tailwind colours are Letterpress only (`canvas surface rail sunk ink{,-secondary,-tertiary,-future} attention-{mark,text,wash} error rule{,-strong,-field}`); radius utilities are only `rounded-none`, `rounded` (4px), `rounded-sheet` (26px), `rounded-full`. Utility classes `selected-rule` (rail fill + 2px ink leading rule) and `selected-outline` (2px inset ink outline), usable with variants (`aria-pressed:selected-outline`). PRs 3–8 must use these names; the sweep test enforces it.

**Mapping table (consumer files outside `components/ui`)**

| Old | New | Notes |
|---|---|---|
| `text-muted-foreground` | `text-ink-secondary` | 72 uses |
| `bg-background` | `bg-canvas` | |
| `bg-card` | `bg-surface` | Sidebar gets `bg-rail` by hand (nav rail) |
| `bg-muted`, `hover:bg-muted` | `bg-sunk`, `hover:bg-sunk` | |
| `text-foreground`, `hover:text-foreground` | `text-ink`, `hover:text-ink` | |
| `text-primary`, `hover:text-primary` | `text-ink`, `hover:text-ink` | |
| `bg-primary/10` | `bg-sunk` | login icon disc (removed in PR 8) |
| `border-primary/20`, `border-border` | `border-rule` | |
| `text-destructive` | `text-error` | |
| `border-destructive/40`, `border-destructive/60` | `border-error` | |
| `outline-ring` | `outline-ink` | |
| `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl` | `rounded-none` | boxes, nav items, native selects, messages |
| `bg-accent` (selected conversation) | `selected-rule` + `aria-current="true"` | hand edit |
| `bg-accent` (clinician message) / `bg-card` (patient message) | `bg-surface` / `bg-sunk` | hand edit; §4.7 patient replies sit in `sunk` |
| `aria-pressed:bg-accent` (calendar day) | `aria-pressed:bg-rail aria-pressed:selected-outline` | hand edit; §4.5 inset outline |
| Sidebar active `bg-accent text-primary` | `bg-ink text-canvas` + `aria-current="page"` | mockup `.navon` inversion |
| native `<select>`/`<textarea>` `rounded-md border bg-background` | `rounded-none border border-rule-field bg-surface` | 3:1 boundary |

- [ ] **Step 1: Write the failing sweep test** — `web-portal/tests/letterpress-sweep.test.ts`

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { ALIAS_CLASS, DIMMING_OPACITY, HEX_COLOUR, HUE_CLASS, REMOVED_FOCUS, RETIRED_RADIUS, SHADOW_UTILITY, offences, read, sourceFiles } from "./letterpress-rules";

const SOURCES = sourceFiles("src");
const PRIMITIVES = sourceFiles("src/components/ui");

test("the sweep reads the portal source tree", () => {
  assert.ok(SOURCES.length > 40, `only ${SOURCES.length} files found`);
});

test("no shadcn alias classes remain anywhere in the portal", () => {
  assert.deepEqual(offences(ALIAS_CLASS, SOURCES), []);
});

test("no radius between 4 and 26", () => {
  assert.deepEqual(offences(RETIRED_RADIUS, SOURCES), []);
});

test("no hue utilities or hex colours; ochre and error come from tokens", () => {
  assert.deepEqual(offences(HUE_CLASS, SOURCES), []);
  assert.deepEqual(offences(HEX_COLOUR, SOURCES), []);
});

test("content carries no shadow utilities", () => {
  assert.deepEqual(offences(SHADOW_UTILITY, SOURCES), []);
});

test("primitives keep the visible focus outline and never dim to show state", () => {
  assert.deepEqual(offences(REMOVED_FOCUS, PRIMITIVES), []);
  assert.deepEqual(offences(DIMMING_OPACITY, PRIMITIVES), []);
});

test("the alias layer is gone from globals.css and tailwind.config.js", () => {
  const css = read("src/app/globals.css");
  const tailwind = read("tailwind.config.js");
  assert.doesNotMatch(css, /--(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|ring|input)(?:-foreground)?\s*:/);
  assert.doesNotMatch(tailwind, /(?<![\w-])(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|input|ring|border):/);
  assert.match(tailwind, /borderRadius:\s*{\s*none:\s*'0px',\s*DEFAULT:\s*'var\(--radius\)',\s*sheet:\s*'26px',\s*full:\s*'9999px'\s*}/);
});

test("selection utilities exist for rows and cells", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.selected-rule\s*{[^}]*box-shadow:\s*inset 2px 0 0 rgb\(var\(--ink\)\)/);
  assert.match(css, /\.selected-outline\s*{[^}]*outline:\s*2px solid rgb\(var\(--ink\)\)/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/letterpress-sweep.test.ts`
Expected: FAIL — alias offences list starts with `src/app/account/page.tsx:7`, radius offences include `src/app/patients/page.tsx:40`, the alias-layer and selection tests fail.

- [ ] **Step 3: Rewrite `web-portal/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

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
@layer components {
  .editorial-title { font-family: var(--font-display); font-weight: 300; line-height: 1.15; }
  .font-data { font-variant-numeric: tabular-nums; }
  .portal-page { @apply mx-auto w-full max-w-7xl space-y-8 p-5 md:p-8; }
}
@layer utilities {
  /* Selected row or list item: rail fill plus a 2px ink rule at the leading edge, so selection never relies on tone alone. */
  .selected-rule { background-color: rgb(var(--rail)); box-shadow: inset 2px 0 0 rgb(var(--ink)); }
  /* Selected cell or tile (spec §4.5): an inset ink outline, never an overlay tint. */
  .selected-outline { outline: 2px solid rgb(var(--ink)); outline-offset: -2px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
```

- [ ] **Step 4: Rewrite `web-portal/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'media',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // Letterpress radii (spec §3): 0 · 4 · 26 · 999. Replaces Tailwind's scale so nothing in between can be used.
    borderRadius: { none: '0px', DEFAULT: 'var(--radius)', sheet: '26px', full: '9999px' },
    extend: {
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
        rule: {
          DEFAULT: 'rgb(var(--ink) / 0.13)',
          strong: 'rgb(var(--ink) / <alpha-value>)',
          // Field boundary: ink at 50% is the lightest value that keeps 3:1 on every paper tone in both modes.
          field: 'rgb(var(--ink) / 0.5)',
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

- [ ] **Step 5: Update the token test's opacity assertion** — in `web-portal/tests/letterpress-tokens.test.mjs` replace lines 62–65 with:

```js
test('Tailwind colours keep opacity modifiers working', () => {
  assert.match(tailwind, /ink:\s*{\s*DEFAULT:\s*'rgb\(var\(--ink\) \/ <alpha-value>\)'/);
  assert.match(tailwind, /canvas:\s*'rgb\(var\(--canvas\) \/ <alpha-value>\)'/);
});
```

- [ ] **Step 6: Hand edits (do these before the mechanical pass)**

6a. Replace `web-portal/src/components/layout/Sidebar.tsx` entirely:

```tsx
'use client';
import { usePathname } from 'next/navigation';
import { MessageSquare, LogOut, Stethoscope, UserRound, Users } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
const navigation = [{ name: 'Assigned patients', href: '/patients', icon: Users }, { name: 'Messages', href: '/messages', icon: MessageSquare }, { name: 'Templates', href: '/templates', icon: Stethoscope }, { name: 'Account', href: '/account', icon: UserRound }];
export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname(); const { user, logout } = useAuth();
  return <div className="flex h-full w-64 flex-col border-r border-rule bg-rail">
    <div className="flex h-16 items-center gap-3 border-b px-6"><Stethoscope aria-hidden className="h-6 w-6 text-ink" /><div><p className="font-semibold">ClearAF</p><p className="text-xs text-ink-secondary">Clinician portal</p></div></div>
    <div className="flex items-center gap-3 border-b p-6"><Avatar><AvatarFallback>{user?.name?.charAt(0) || 'C'}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-medium">{user?.name}</p><p className="truncate text-xs text-ink-secondary">{user?.email}</p></div></div>
    <nav aria-label="Portal" className="flex-1 space-y-1 p-4">{navigation.map(item => { const current = pathname === item.href || pathname.startsWith(item.href + '/'); return <a key={item.href} href={item.href} onClick={onNavigate} aria-current={current ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-none px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink', current ? 'bg-ink text-canvas' : 'text-ink-secondary hover:bg-sunk hover:text-ink')}><item.icon className="h-5 w-5" />{item.name}</a>; })}</nav>
    <div className="border-t p-4"><Button variant="ghost" className="w-full justify-start gap-3" onClick={() => void logout()}><LogOut className="h-5 w-5" />Sign out</Button></div>
  </div>;
}
```

6b. `web-portal/src/app/messages/page.tsx` lines 69–72. Replace

```tsx
                  className={
                    "block space-y-1 rounded-md border p-3 " +
                    (patientId === c.patientId ? "bg-accent" : "")
                  }
```
with
```tsx
                  aria-current={patientId === c.patientId ? "true" : undefined}
                  className={
                    "block space-y-1 rounded-none border p-3 " +
                    (patientId === c.patientId ? "selected-rule" : "")
                  }
```

6c. `web-portal/src/components/messages/ConversationView.tsx` lines 60–63. Replace

```tsx
        "max-w-2xl space-y-2 rounded-lg border p-4 " +
        (message.senderType === "dermatologist"
          ? "ml-auto bg-accent"
          : "mr-auto bg-card")
```
with
```tsx
        "max-w-2xl space-y-2 rounded-none border p-4 " +
        (message.senderType === "dermatologist"
          ? "ml-auto bg-surface"
          : "mr-auto bg-sunk")
```
and on line 314 replace `rounded-md border bg-background p-3` with `rounded-none border border-rule-field bg-surface p-3`.

6d. `web-portal/src/components/care-support/CompletionCalendar.tsx` line 131. Replace

```tsx
                className="min-h-24 min-w-0 rounded-md border p-2 text-left focus-visible:outline focus-visible:outline-ring aria-pressed:bg-accent"
```
with
```tsx
                className="min-h-24 min-w-0 rounded-none border p-2 text-left focus-visible:outline focus-visible:outline-ink aria-pressed:bg-rail aria-pressed:selected-outline"
```

6e. Native selects (3:1 boundary). Run:

```bash
cd web-portal && perl -pi -e 's/rounded-md border bg-background p-2/rounded-none border border-rule-field bg-surface p-2/g' \
  src/components/care-support/CompletionCalendar.tsx src/components/care-support/QuestionFields.tsx src/components/care-support/TemplatePicker.tsx
```

6f. `web-portal/src/app/login/page.tsx` lines 132–136. Replace

```tsx
              <Button
                type="submit"
                className="w-full h-11"
```
with
```tsx
              <Button
                type="submit"
                size="lg"
                className="w-full"
```

- [ ] **Step 7: Mechanical pass over the remaining consumers**

```bash
cd web-portal
FILES=$(grep -rlE "muted-foreground|bg-background|bg-card|bg-muted|text-foreground|text-primary|bg-primary/10|border-primary/20|border-border|text-destructive|border-destructive/|outline-ring|rounded-(sm|md|lg|xl)" src --include='*.tsx' | grep -v '^src/components/ui/')
echo "$FILES"
perl -pi -e '
  s/(?<![\w-])text-muted-foreground(?![\w-])/text-ink-secondary/g;
  s/(?<![\w-])bg-background(?![\w-])/bg-canvas/g;
  s/(?<![\w-])bg-card(?![\w-])/bg-surface/g;
  s/(?<![\w-])bg-muted(?![\w-])/bg-sunk/g;
  s/(?<![\w-])text-foreground(?![\w-])/text-ink/g;
  s/(?<![\w-])text-primary(?![\w-])/text-ink/g;
  s{(?<![\w-])bg-primary/10(?![\w-])}{bg-sunk}g;
  s{(?<![\w-])border-primary/20(?![\w-])}{border-rule}g;
  s/(?<![\w-])border-border(?![\w-])/border-rule/g;
  s/(?<![\w-])text-destructive(?![\w-])/text-error/g;
  s{(?<![\w-])border-destructive/(?:40|60)(?![\w-])}{border-error}g;
  s/(?<![\w-])outline-ring(?![\w-])/outline-ink/g;
  s/(?<![\w-])rounded-(?:sm|md|lg|xl)(?![\w-])/rounded-none/g;
' $FILES
```

Expected `echo` output: the consumer files still holding old names, among them `src/app/{account,login,messages,templates}/page.tsx`, `src/app/patients/page.tsx`, `src/app/patients/[id]/page.tsx`, `src/components/layout/{DashboardLayout,Header}.tsx`, every file under `src/components/patients/`, `src/components/care-support/{CompletionCalendar,FormEditor,PatientCheckIns,QuestionFields,TemplateEditor,TemplatePicker,shared}.tsx` and `src/components/messages/ConversationView.tsx`.

- [ ] **Step 8: Confirm nothing old remains**

Run:
```bash
cd web-portal && grep -rnE "bg-accent|muted-foreground|bg-background|bg-card\b|bg-muted|text-foreground|text-primary|border-border|destructive|outline-ring|ring-offset|rounded-(sm|md|lg|xl)\b" src
```
Expected: the only lines printed contain `destructive` as a variant value (`variant="destructive"` in `login/page.tsx`, or `'destructive'` inside a `variant={…}` ternary in `UrgentReportQueue.tsx`, `CareStatusCard.tsx`, `PatientUrgentReports.tsx`). Any other line is a missed migration: fix it with the mapping table.

- [ ] **Step 9: Run the sweep and the full portal gate**

Run: `cd web-portal && node --import tsx --test tests/letterpress-sweep.test.ts && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: sweep PASS (8 tests); full suite green; lint and typecheck exit 0; build succeeds.

- [ ] **Step 10: Commit**

```bash
git add -A web-portal/src web-portal/tailwind.config.js web-portal/tests
git commit -m "portal: remove shadcn aliases and migrate consumers to Letterpress names" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: iOS Letterpress primitives

**Files:**
- Create: `ClearAF/Views/LetterpressLayout.swift`, `ClearAF/Views/LetterpressButtonStyle.swift`, `ClearAF/Views/LetterpressText.swift`, `ClearAF/Views/LetterpressControls.swift`, `ClearAFTests/LetterpressPrimitivesTests.swift`
- Modify: `ClearAF/ClearAFApp.swift:12`, `ClearAF/Assets.xcassets/AccentColor.colorset/Contents.json` (full rewrite)

**Interfaces:**
- Consumes: `Letterpress` colours and `Letterpress.ui/data/display`, `Letterpress.UIWeight`, `Letterpress.registerFonts()` (PR 1); test helpers `LetterpressTests.resolved(_:_:)`, `.hex(_:)`, `.contrast(_:_:)` (PR 1, `ClearAFTests/LetterpressTests.swift`).
- Produces (Tasks 6–7 and PRs 3–8 rely on these exact names):
  - `Letterpress.Space.s4, s6, s10, s14, s18, s22, s28, s44: CGFloat`, `Letterpress.Space.scale: [CGFloat]`
  - `Letterpress.Radius.flat (0), control (4), sheet (26), pill (999): CGFloat`, `Letterpress.Radius.allowed: [CGFloat]`
  - `Letterpress.minTouch: CGFloat` (44), `Letterpress.fieldRuleEmptyOpacity: Double` (0.5), `Letterpress.fieldRuleEmpty: Color`
  - `View.letterpressSurface() -> some View`
  - `struct LetterpressButtonStyle: ButtonStyle` with `enum Variant: CaseIterable { case filled, outlined, underline }`, `init(variant: Variant = .filled, fullWidth: Bool = false)`, `static let minHeight: CGFloat`, `static let cornerRadius: CGFloat`, `static let outlineOpacity: Double`, `static func foreground(_: Variant, isEnabled: Bool) -> Color`, `static func background(_: Variant, isEnabled: Bool) -> Color`; `ButtonStyle.letterpress(_ variant: = .filled, fullWidth: = false)` for `.buttonStyle(.letterpress(.filled))`
  - `struct LetterpressEyebrow: ViewModifier` (`static let size = 10`, `static let trackingEm = 0.16`, `static var tracking`), `View.letterpressEyebrow(color: Color = Letterpress.inkTertiary)`
  - `struct LetterpressRule: View` with `enum Weight { case hairline, major; var thickness: CGFloat }`, `init(weight: Weight = .hairline)`
  - `struct LetterpressFieldModifier: ViewModifier` (`static let ruleWidth = 1.5`), `View.letterpressField(isEmpty: Bool)`
  - `struct LetterpressPicker<Selection: Hashable, Options: View>: View` — same initialiser as `CareJournalPicker(title:selection:options:)`
  - `Letterpress.toggleOn: Color`, `@MainActor Letterpress.applyControlAppearance()`

- [ ] **Step 1: Write the failing test** — `ClearAFTests/LetterpressPrimitivesTests.swift`

```swift
import Testing
import SwiftUI
import UIKit
@testable import ClearAF

@MainActor struct LetterpressPrimitivesTests {
    private let styles: [UIUserInterfaceStyle] = [.light, .dark]

    private func resolve(_ color: Color, _ style: UIUserInterfaceStyle) -> UIColor {
        UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
    }

    private func composite(_ foreground: UIColor, opacity: CGFloat, over background: UIColor) -> UIColor {
        var fr: CGFloat = 0, fg: CGFloat = 0, fb: CGFloat = 0, fa: CGFloat = 0
        var br: CGFloat = 0, bg: CGFloat = 0, bb: CGFloat = 0, ba: CGFloat = 0
        foreground.getRed(&fr, green: &fg, blue: &fb, alpha: &fa)
        background.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
        return UIColor(red: fr * opacity + br * (1 - opacity), green: fg * opacity + bg * (1 - opacity),
                       blue: fb * opacity + bb * (1 - opacity), alpha: 1)
    }

    @Test func buttonHeightIsPinnedNotDerivedFromPadding() {
        let plain = UIHostingController(rootView: Button("OK") {}.buttonStyle(.plain).environment(\.dynamicTypeSize, .xSmall))
            .sizeThatFits(in: CGSize(width: 320, height: 1000))
        #expect(plain.height < 44, "control: an unpinned button must measure under 44 for this test to mean anything")
        for variant in LetterpressButtonStyle.Variant.allCases {
            let size = UIHostingController(rootView: Button("OK") {}.buttonStyle(.letterpress(variant)).environment(\.dynamicTypeSize, .xSmall))
                .sizeThatFits(in: CGSize(width: 320, height: 1000))
            #expect(size.height >= 44, "\(variant) measured \(size.height)")
        }
        #expect(LetterpressButtonStyle.minHeight == 44)
    }

    @Test func buttonTextMeetsContrastEnabledAndDisabledInBothAppearances() {
        for style in styles {
            let canvas = LetterpressTests.resolved("lp.canvas", style)
            let filledText = resolve(LetterpressButtonStyle.foreground(.filled, isEnabled: true), style)
            let filledFill = resolve(LetterpressButtonStyle.background(.filled, isEnabled: true), style)
            #expect(LetterpressTests.contrast(filledText, filledFill) >= 4.5)
            #expect(LetterpressTests.contrast(resolve(LetterpressButtonStyle.foreground(.outlined, isEnabled: true), style), canvas) >= 4.5)
            let disabledText = resolve(LetterpressButtonStyle.foreground(.filled, isEnabled: false), style)
            let disabledFill = resolve(LetterpressButtonStyle.background(.filled, isEnabled: false), style)
            #expect(LetterpressTests.contrast(disabledText, disabledFill) >= 4.5, "disabled \(style.rawValue)")
            #expect(LetterpressTests.hex(disabledFill) == LetterpressTests.hex(LetterpressTests.resolved("lp.sunk", style)))
        }
    }

    @Test func scalesUseOnlySpecValues() {
        #expect(Letterpress.Space.scale == [4, 6, 10, 14, 18, 22, 28, 44])
        #expect(Letterpress.Radius.allowed == [0, 4, 26, 999])
        #expect(LetterpressButtonStyle.cornerRadius == Letterpress.Radius.control)
        #expect(Letterpress.minTouch == 44)
    }

    @Test func eyebrowAndRuleMatchTheSpec() {
        #expect(LetterpressEyebrow.size == 10)
        #expect(abs(LetterpressEyebrow.tracking - 1.6) < 0.001)
        #expect(LetterpressRule.Weight.hairline.thickness == 1)
        #expect(LetterpressRule.Weight.major.thickness == 2)
        #expect(LetterpressFieldModifier.ruleWidth == 1.5)
    }

    @Test func emptyFieldRuleKeepsThreeToOneOnEveryPaperTone() {
        for style in styles {
            let ink = LetterpressTests.resolved("lp.ink", style)
            for paper in ["lp.canvas", "lp.surface", "lp.rail", "lp.sunk"] {
                let background = LetterpressTests.resolved(paper, style)
                let rule = composite(ink, opacity: Letterpress.fieldRuleEmptyOpacity, over: background)
                #expect(LetterpressTests.contrast(rule, background) >= 3, "\(paper) \(style.rawValue)")
            }
        }
    }

    @Test func toggleOnTrackIsVisibleAgainstTheThumbAndThePaper() {
        for style in styles {
            let track = resolve(Letterpress.toggleOn, style)
            #expect(LetterpressTests.contrast(track, .white) >= 3, "thumb \(style.rawValue)")
            for paper in ["lp.canvas", "lp.surface"] {
                #expect(LetterpressTests.contrast(track, LetterpressTests.resolved(paper, style)) >= 3, "\(paper) \(style.rawValue)")
            }
        }
    }

    @Test func accentColorIsInk() {
        #expect(LetterpressTests.hex(LetterpressTests.resolved("AccentColor", .light)) == 0x121312)
        #expect(LetterpressTests.hex(LetterpressTests.resolved("AccentColor", .dark)) == 0xEFEDE4)
    }

    @Test func segmentedControlsUseSunkTrackSurfaceThumbAndPlexLabels() throws {
        Letterpress.registerFonts()
        Letterpress.applyControlAppearance()
        let proxy = UISegmentedControl.appearance()
        for style in styles {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let thumb = try #require(proxy.selectedSegmentTintColor).resolvedColor(with: traits)
            let track = try #require(proxy.backgroundColor).resolvedColor(with: traits)
            #expect(LetterpressTests.hex(thumb) == LetterpressTests.hex(LetterpressTests.resolved("lp.surface", style)))
            #expect(LetterpressTests.hex(track) == LetterpressTests.hex(LetterpressTests.resolved("lp.sunk", style)))
        }
        let selectedFont = try #require(proxy.titleTextAttributes(for: .selected)?[.font] as? UIFont)
        #expect(selectedFont.fontName == "IBMPlexSans-Medm")
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
  -derivedDataPath /tmp/clearaf-build-lp2 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  -only-testing:ClearAFTests/LetterpressPrimitivesTests test | xcbeautify
```
Expected: build FAIL — `cannot find 'LetterpressButtonStyle' in scope`.

- [ ] **Step 3: Create `ClearAF/Views/LetterpressLayout.swift`**

```swift
import SwiftUI

extension Letterpress {
    /// Spacing scale (spec §3). Nothing off-scale.
    enum Space {
        static let s4: CGFloat = 4
        static let s6: CGFloat = 6
        static let s10: CGFloat = 10
        static let s14: CGFloat = 14
        static let s18: CGFloat = 18
        static let s22: CGFloat = 22
        static let s28: CGFloat = 28
        static let s44: CGFloat = 44
        static let scale: [CGFloat] = [s4, s6, s10, s14, s18, s22, s28, s44]
    }

    /// Radii (spec §3): 0 photos, chips, segmented, tables, calendar cells · 4 buttons and step boxes ·
    /// 26 sheets and glass bars · 999 avatars, toggles, capture button. Nothing between 4 and 26.
    enum Radius {
        static let flat: CGFloat = 0
        static let control: CGFloat = 4
        static let sheet: CGFloat = 26
        static let pill: CGFloat = 999
        static let allowed: [CGFloat] = [flat, control, sheet, pill]
    }

    /// Minimum touch target and button height.
    static let minTouch: CGFloat = 44

    /// Empty field baseline. Ink at 50% is the lightest value that keeps a 3:1 boundary on every paper tone in both
    /// appearances; the spec's 28% measures 1.9:1.
    static let fieldRuleEmptyOpacity: Double = 0.5
    static var fieldRuleEmpty: Color { ink.opacity(fieldRuleEmptyOpacity) }
}

extension View {
    /// Square surface block for content a screen still groups. Rules replace most of these in PRs 3 and 6.
    func letterpressSurface() -> some View {
        padding(Letterpress.Space.s18).background(Letterpress.surface)
    }
}
```

- [ ] **Step 4: Create `ClearAF/Views/LetterpressButtonStyle.swift`**

```swift
import SwiftUI

/// Letterpress buttons (spec §4.1): filled ink, outlined (1pt ink at 32%), text-underline. Radius 4.
/// Height is pinned with `minHeight`, never derived from padding, so Dynamic Type and font metrics cannot shrink it
/// below 44pt. Disabled is `sunk` + `ink.tertiary`; the screen states why in a sentence.
struct LetterpressButtonStyle: ButtonStyle {
    enum Variant: CaseIterable { case filled, outlined, underline }

    static let minHeight: CGFloat = Letterpress.minTouch
    static let cornerRadius: CGFloat = Letterpress.Radius.control
    static let outlineOpacity: Double = 0.32

    var variant: Variant = .filled
    var fullWidth = false

    func makeBody(configuration: Configuration) -> some View {
        LetterpressButtonBody(configuration: configuration, variant: variant, fullWidth: fullWidth)
    }

    static func foreground(_ variant: Variant, isEnabled: Bool) -> Color {
        guard isEnabled else { return Letterpress.inkTertiary }
        return variant == .filled ? Letterpress.canvas : Letterpress.ink
    }

    static func background(_ variant: Variant, isEnabled: Bool) -> Color {
        guard isEnabled else { return variant == .underline ? Color.clear : Letterpress.sunk }
        return variant == .filled ? Letterpress.ink : Color.clear
    }
}

private struct LetterpressButtonBody: View {
    let configuration: ButtonStyleConfiguration
    let variant: LetterpressButtonStyle.Variant
    let fullWidth: Bool
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: LetterpressButtonStyle.cornerRadius)
        configuration.label
            .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
            .underline(variant == .underline)
            .multilineTextAlignment(.center)
            .foregroundStyle(LetterpressButtonStyle.foreground(variant, isEnabled: isEnabled))
            .padding(.horizontal, variant == .underline ? 0 : Letterpress.Space.s18)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: LetterpressButtonStyle.minHeight)
            .background(LetterpressButtonStyle.background(variant, isEnabled: isEnabled), in: shape)
            .overlay {
                if variant == .outlined && isEnabled {
                    shape.strokeBorder(Letterpress.ink.opacity(LetterpressButtonStyle.outlineOpacity), lineWidth: 1)
                }
            }
            .contentShape(shape)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

extension ButtonStyle where Self == LetterpressButtonStyle {
    static func letterpress(_ variant: LetterpressButtonStyle.Variant = .filled, fullWidth: Bool = false) -> LetterpressButtonStyle {
        LetterpressButtonStyle(variant: variant, fullWidth: fullWidth)
    }
}
```

SwiftUI has no underline-offset control; the underline variant uses the system offset (spec's 3px is web-only).

- [ ] **Step 5: Create `ClearAF/Views/LetterpressText.swift`**

```swift
import SwiftUI

/// Section eyebrow and persistent field label (spec §2, §4.2): mono 500, 10pt, 0.16em tracking, uppercase.
/// Never a sentence, never a button label.
struct LetterpressEyebrow: ViewModifier {
    static let size: CGFloat = 10
    static let trackingEm: CGFloat = 0.16
    static var tracking: CGFloat { size * trackingEm }

    var color: Color = Letterpress.inkTertiary

    func body(content: Content) -> some View {
        content
            .font(Letterpress.data(Self.size, weight: .medium, relativeTo: .caption2))
            .tracking(Self.tracking)
            .textCase(.uppercase)
            .foregroundStyle(color)
    }
}

extension View {
    func letterpressEyebrow(color: Color = Letterpress.inkTertiary) -> some View {
        modifier(LetterpressEyebrow(color: color))
    }
}

/// Rules, not borders (spec §3): 1pt `rule` between rows and sections; 2pt ink for a major break.
struct LetterpressRule: View {
    enum Weight {
        case hairline, major
        var thickness: CGFloat { self == .major ? 2 : 1 }
    }

    var weight: Weight = .hairline

    var body: some View {
        Rectangle()
            .fill(weight == .major ? Letterpress.ink : Letterpress.rule)
            .frame(height: weight.thickness)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
    }
}
```

- [ ] **Step 6: Create `ClearAF/Views/LetterpressControls.swift`**

```swift
import SwiftUI
import UIKit

/// Baseline-rule field (spec §4.2): 1.5pt ink when filled or focused, ink at 50% when empty.
struct LetterpressFieldModifier: ViewModifier {
    static let ruleWidth: CGFloat = 1.5

    let isEmpty: Bool
    @FocusState private var focused: Bool

    func body(content: Content) -> some View {
        content
            .font(Letterpress.ui(17, relativeTo: .body))
            .focused($focused)
            .padding(.vertical, Letterpress.Space.s10)
            .frame(minHeight: Letterpress.minTouch)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(isEmpty && !focused ? Letterpress.fieldRuleEmpty : Letterpress.ink)
                    .frame(height: Self.ruleWidth)
                    .accessibilityHidden(true)
            }
    }
}

extension View {
    func letterpressField(isEmpty: Bool) -> some View {
        modifier(LetterpressFieldModifier(isEmpty: isEmpty))
    }
}

/// Two-to-three-way mode switch (spec §4.3): native segmented Picker, becoming a menu at accessibility text sizes.
struct LetterpressPicker<Selection: Hashable, Options: View>: View {
    let title: String
    @Binding var selection: Selection
    @ViewBuilder let options: () -> Options
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            Picker(title, selection: $selection, content: options).pickerStyle(.menu)
                .frame(minHeight: Letterpress.minTouch)
        } else {
            Picker(title, selection: $selection, content: options).pickerStyle(.segmented)
        }
    }
}

extension Letterpress {
    /// Native switch on-track. Ink in light; ink.tertiary in dark, because dark ink (#EFEDE4) against the white thumb
    /// is 1.17:1 while ink.tertiary is 3.33:1 against the thumb and 5.39:1 against canvas.
    static let toggleOn = Color(UIColor { traits in
        UIColor(named: traits.userInterfaceStyle == .dark ? "lp.ink.tertiary" : "lp.ink", in: .main, compatibleWith: traits)!
    })

    /// Segmented controls stay native (spec §4.3); the appearance proxy supplies the sunk track, surface thumb and
    /// Plex labels (weight changes on selection). Corners stay system-rounded: squaring them needs custom geometry.
    @MainActor static func applyControlAppearance() {
        let control = UISegmentedControl.appearance()
        control.backgroundColor = UIColor(named: "lp.sunk")
        control.selectedSegmentTintColor = UIColor(named: "lp.surface")
        let metrics = UIFontMetrics(forTextStyle: .footnote)
        func font(_ weight: UIWeight) -> UIFont {
            metrics.scaledFont(for: UIFont(name: weight.fontName, size: 13) ?? UIFont.preferredFont(forTextStyle: .footnote))
        }
        control.setTitleTextAttributes([.font: font(.body), .foregroundColor: UIColor(named: "lp.ink.secondary")!], for: .normal)
        control.setTitleTextAttributes([.font: font(.medium), .foregroundColor: UIColor(named: "lp.ink")!], for: .selected)
    }
}
```

- [ ] **Step 7: Apply the appearance at launch** — in `ClearAF/ClearAFApp.swift` replace line 12 with:

```swift
    init() {
        Letterpress.registerFonts()
        Letterpress.applyControlAppearance()
    }
```

- [ ] **Step 8: Point `AccentColor` at ink** — replace `ClearAF/Assets.xcassets/AccentColor.colorset/Contents.json`:

```json
{
  "colors" : [
    {
      "color" : {
        "color-space" : "srgb",
        "components" : { "alpha" : "1.000", "blue" : "0x12", "green" : "0x13", "red" : "0x12" }
      },
      "idiom" : "universal"
    },
    {
      "appearances" : [ { "appearance" : "luminosity", "value" : "dark" } ],
      "color" : {
        "color-space" : "srgb",
        "components" : { "alpha" : "1.000", "blue" : "0xE4", "green" : "0xED", "red" : "0xEF" }
      },
      "idiom" : "universal"
    }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run the Step 2 command with `-only-testing:ClearAFTests/LetterpressPrimitivesTests -only-testing:ClearAFTests/LetterpressTests`.
Expected: PASS (8 primitives tests, 4 token tests). If `buttonHeightIsPinnedNotDerivedFromPadding` reports the control measuring ≥ 44, the hosting controller is not applying `.xSmall`; replace the control's `.environment` with `.font(.system(size: 8))` and rerun only that test.

- [ ] **Step 10: Commit**

```bash
git add ClearAF/Views/LetterpressLayout.swift ClearAF/Views/LetterpressButtonStyle.swift ClearAF/Views/LetterpressText.swift ClearAF/Views/LetterpressControls.swift ClearAF/ClearAFApp.swift ClearAF/Assets.xcassets/AccentColor.colorset/Contents.json ClearAFTests/LetterpressPrimitivesTests.swift
git commit -m "ios: add Letterpress button, eyebrow, rule, field, picker and toggle primitives" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: iOS consumers — buttons, fields, toggles, hues and radii

**Files:**
- Create: `ClearAFTests/LetterpressSweepTests.swift`
- Modify (full rewrite): `ClearAF/Views/AuthenticationView.swift`, `ClearAF/Views/PasswordRecoveryView.swift`
- Modify: `ClearAF/ContentView.swift:109`, `ClearAF/Views/DashboardViewEnhanced.swift:195-199,214-221,233`, `RoutineView.swift:1-7,20,100,115,126-128`, `CheckInView.swift:15`, `EnrollmentView.swift:153,158-160,227,246-248,255,291,296-298`, `UrgentReportView.swift:32,41,58,79,83,143,148-150`, `ProgressView.swift:18,51-62,75-76,190,216,281`, `PhotoCaptureManager.swift:65-68,79,86-89`, `MessagingView.swift:18,21,29,33-34,50-51,54,60-61,97`, `ProfileView.swift:19,23,27`, `OnboardingView.swift:23,35,39,43,48,53`, `ReminderSettingsView.swift:56`, `CompletionCalendarView.swift:61`, `ClearAFTests/AccountProfileTests.swift:14-27`

**Interfaces:**
- Consumes: everything Task 5 produces.
- Removes: `TodayPhotoActionAppearance` (DashboardViewEnhanced) and `RoutineActionAppearance` (RoutineView); their contrast tests are replaced by `LetterpressPrimitivesTests.buttonTextMeetsContrastEnabledAndDisabledInBothAppearances`.
- `CareJournal.*`, `Color.textSecondary` and the other token names are left for Task 7. `DesignSystem.swift` is untouched here.

**Control mapping**

| Old | New |
|---|---|
| `.buttonStyle(.borderedProminent)` (+ `.tint(action)` + `.foregroundStyle(onPrimary)`) | `.buttonStyle(.letterpress(.filled))` |
| `.buttonStyle(PrimaryButtonStyle())` | `.buttonStyle(.letterpress(.filled, fullWidth: true))` |
| `.buttonStyle(.bordered)` | `.buttonStyle(.letterpress(.outlined))` (`fullWidth: true` where the label spanned the width) |
| `.standardTextField()`, `.textFieldStyle(.roundedBorder)`, `CustomTextField` box | `.letterpressField(isEmpty:)` |
| spinner `.tint(.white)` / `.tint(CareJournal.onPrimary)` inside a filled button | `.tint(Letterpress.inkTertiary)` (the button is disabled while it spins, so it sits on `sunk`) |
| `.foregroundStyle(.secondary)`, `.foregroundColor(.secondary)` | `Letterpress.inkSecondary` |
| `.foregroundColor(.primary)`, `.foregroundColor(.blue)` | `Letterpress.ink` |
| `.foregroundStyle(.red)` (warning icons, error text) | `Letterpress.error` |
| `Color.red.opacity(0.12)` emergency row | `Letterpress.sunk` |
| `.tint(Letterpress.inkSecondary)` on Toggle | `.tint(Letterpress.toggleOn)` |
| `CareJournalPicker(` | `LetterpressPicker(` |
| photo `RoundedRectangle(cornerRadius: .radiusMedium)`, calendar cell radius 8, message radius 14 | `Rectangle()` / removed (radius 0) |
| routine step box radius 12 | `Letterpress.Radius.control` |
| `.regularMaterial` banner `.cornerRadius(12)` | `RoundedRectangle(cornerRadius: Letterpress.Radius.sheet)` |
| `.font(.system(.title2, design: .serif))` | `.font(Letterpress.display(22, relativeTo: .title2))` |

- [ ] **Step 1: Write the failing sweep test** — `ClearAFTests/LetterpressSweepTests.swift`

```swift
import Foundation
import Testing

/// Scans the Swift source tree (via #filePath) for design values Letterpress retired.
struct LetterpressSweepTests {
    static let repoRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    /// DesignSystem.swift is deleted in the next task; until then it is the one file allowed to hold retired values.
    static let excluded: Set<String> = ["LetterpressSweepTests.swift", "DesignSystem.swift"]

    static func sources(in folders: [String]) throws -> [(path: String, text: String)] {
        var files: [(path: String, text: String)] = []
        for folder in folders {
            let root = repoRoot.appendingPathComponent(folder)
            guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { continue }
            for case let url as URL in walker where url.pathExtension == "swift" && !excluded.contains(url.lastPathComponent) {
                files.append((url.path.replacingOccurrences(of: repoRoot.path + "/", with: ""), try String(contentsOf: url, encoding: .utf8)))
            }
        }
        return files
    }

    static func offences(_ pattern: String, in folders: [String]) throws -> [String] {
        let regex = try NSRegularExpression(pattern: pattern)
        return try sources(in: folders).flatMap { file in
            file.text.components(separatedBy: "\n").enumerated().compactMap { index, line in
                regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) == nil
                    ? nil : "\(file.path):\(index + 1): \(line.trimmingCharacters(in: .whitespaces))"
            }
        }
    }

    @Test func sweepReadsTheSourceTree() throws {
        #expect(try Self.sources(in: ["ClearAF"]).count > 30)
    }

    @Test func appHasNoHardcodedHuesOrSystemControlStyles() throws {
        let hues = #"\.(red|blue|green|orange|purple|pink|yellow|teal|mint|cyan|indigo|brown|gray|white|black)\b|Color\((red|hue|white):|UIColor\((red|white|hue):|Color\(\.system|UIColor\.system|\.foreground(Style|Color)\(\.(primary|secondary|tertiary)\)|LinearGradient|RadialGradient|AngularGradient"#
        let controls = #"\.buttonStyle\(\.bordered(Prominent)?\)|\.textFieldStyle\(\.roundedBorder\)|\.cornerRadius\(|cornerRadius:\s*[0-9.]|PrimaryButtonStyle|SecondaryButtonStyle|GhostButtonStyle|standardTextField|design:\s*\.serif|\.tint\(Letterpress\.inkSecondary\)|CareJournalPicker"#
        #expect(try Self.offences(hues, in: ["ClearAF"]) == [])
        #expect(try Self.offences(controls, in: ["ClearAF"]) == [])
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run the Task 5 Step 2 command with `-only-testing:ClearAFTests/LetterpressSweepTests`.
Expected: FAIL — `appHasNoHardcodedHuesOrSystemControlStyles` lists offences starting with `ClearAF/ContentView.swift:109` and including `ClearAF/Views/AuthenticationView.swift:27: .foregroundColor(.blue)`.

- [ ] **Step 3: Multi-line button replacements (run from the repo root)**

```bash
perl -0pi -e 's/\.buttonStyle\(\.borderedProminent\)\s*\n\s*\.tint\(CareJournal\.actionPrimary\)\s*\n\s*\.foregroundStyle\(CareJournal\.onPrimary\)/.buttonStyle(.letterpress(.filled))/g' \
  ClearAF/Views/EnrollmentView.swift ClearAF/Views/UrgentReportView.swift
perl -0pi -e 's/\.buttonStyle\(\.borderedProminent\)\s*\n\s*\.tint\(RoutineActionAppearance\.tint\)\s*\n\s*\.foregroundStyle\(RoutineActionAppearance\.foreground\)/.buttonStyle(.letterpress(.filled))/' \
  ClearAF/Views/RoutineView.swift
perl -0pi -e 's/^enum RoutineActionAppearance \{\n.*?\n\}\n\n//ms' ClearAF/Views/RoutineView.swift
perl -0pi -e 's{// The prominent Today action uses the same white-on-action pairing as Photos and Capture\.\nenum TodayPhotoActionAppearance \{\n.*?\n\}\n\n}{}ms' ClearAF/Views/DashboardViewEnhanced.swift
```
Check: `grep -n "borderedProminent\|ActionAppearance" ClearAF/Views/{EnrollmentView,UrgentReportView,RoutineView,DashboardViewEnhanced}.swift` prints only `DashboardViewEnhanced.swift` lines of the Today photo button (handled next).

- [ ] **Step 4: Hand edits (exact old → new)**

`ClearAF/Views/DashboardViewEnhanced.swift` (Today photo button):
```swift
            Button { showingCamera = true } label: {
                Label(todayPhoto == nil ? "Take a photo" : "Take another photo", systemImage: "camera")
                    .foregroundStyle(TodayPhotoActionAppearance.foreground)
            }
            .accessibilityLabel("Take daily progress photo")
            .buttonStyle(.borderedProminent)
            .tint(TodayPhotoActionAppearance.tint)
```
→
```swift
            Button { showingCamera = true } label: {
                Label(todayPhoto == nil ? "Take a photo" : "Take another photo", systemImage: "camera")
            }
            .accessibilityLabel("Take daily progress photo")
            .buttonStyle(.letterpress(.filled))
```

`ClearAF/Views/ProgressView.swift` (`photoActions`, lines 51–62):
```swift
    private var photoActions: some View {
        VStack(spacing: 12) {
            pagination
            Button { showingCamera = true } label: {
                Label("Take a photo", systemImage: "camera")
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent).tint(CareJournal.actionPrimary)
            .foregroundStyle(CareJournal.onPrimary)
            .accessibilityLabel("Capture photo")
        }
    }
```
→
```swift
    private var photoActions: some View {
        VStack(spacing: 12) {
            pagination
            Button { showingCamera = true } label: {
                Label("Take a photo", systemImage: "camera")
            }
            .buttonStyle(.letterpress(.filled, fullWidth: true))
            .accessibilityLabel("Capture photo")
        }
    }
```
and in `pagination`:
```swift
        .buttonStyle(.bordered)
        .fixedSize(horizontal: false, vertical: true)
```
→
```swift
        .buttonStyle(.letterpress(.outlined, fullWidth: true))
        .fixedSize(horizontal: false, vertical: true)
```

`ClearAF/Views/PhotoCaptureManager.swift`:
```swift
                    Button(action: requestCamera) {
                        Label("Take Photo", systemImage: "camera").frame(maxWidth: .infinity).padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent).tint(.primaryActionPurple)
```
→
```swift
                    Button(action: requestCamera) {
                        Label("Take Photo", systemImage: "camera")
                    }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
```
and
```swift
                    Button { pickerError = nil; showingPhotoLibrary = true } label: {
                        Label("Choose from Library", systemImage: "photo.on.rectangle")
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                    }.buttonStyle(.bordered)
```
→
```swift
                    Button { pickerError = nil; showingPhotoLibrary = true } label: {
                        Label("Choose from Library", systemImage: "photo.on.rectangle")
                    }.buttonStyle(.letterpress(.outlined, fullWidth: true))
```

`ClearAF/Views/MessagingView.swift`:
```swift
                                    .background(message.senderType == "patient" ? CareJournal.actionPrimary.opacity(0.10) : Color.cardBackground)
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
```
→
```swift
                                    .background(message.senderType == "patient" ? Letterpress.sunk : Letterpress.surface)
```
and `.textFieldStyle(.roundedBorder).lineLimit(2...5).disabled(repository.sending)` → `.lineLimit(2...5).letterpressField(isEmpty: (repository.draft?.content ?? "").isEmpty).disabled(repository.sending)`
and `.buttonStyle(.borderedProminent).disabled(` → `.buttonStyle(.letterpress(.filled)).disabled(`.

`ClearAF/Views/ProfileView.swift`: `.standardTextField()` → `.letterpressField(isEmpty: name.isEmpty)`.
`ClearAF/Views/OnboardingView.swift`: `.standardTextField()` → `.letterpressField(isEmpty: userName.isEmpty)`.

`ClearAF/ContentView.swift:109`:
`Text(error).font(.callout).padding().background(.regularMaterial).cornerRadius(12).padding()` →
`Text(error).font(.callout).padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: Letterpress.Radius.sheet)).padding()`

`ClearAF/Views/RoutineView.swift`: `.background(CareJournal.surface, in: RoundedRectangle(cornerRadius: 12))` → `.background(CareJournal.surface, in: RoundedRectangle(cornerRadius: Letterpress.Radius.control))`.
`ClearAF/Views/CompletionCalendarView.swift:61`: `.background(CareJournal.surface, in: RoundedRectangle(cornerRadius: 8))` → `.background(CareJournal.surface, in: Rectangle())`.
`ClearAF/Views/UrgentReportView.swift`: `.contentShape(RoundedRectangle(cornerRadius: 12))` → `.contentShape(Rectangle())`; `.listRowBackground(Color.red.opacity(0.12))` → `.listRowBackground(Letterpress.sunk)`.

- [ ] **Step 5: Single-line mechanical pass**

```bash
perl -pi -e '
  s/\.buttonStyle\(PrimaryButtonStyle\(\)\)/.buttonStyle(.letterpress(.filled, fullWidth: true))/g;
  s/\.buttonStyle\(\.bordered\)/.buttonStyle(.letterpress(.outlined))/g;
  s/\.tint\(\.white\)/.tint(Letterpress.inkTertiary)/g;
  s/\.tint\(CareJournal\.onPrimary\)/.tint(Letterpress.inkTertiary)/g;
  s/\.foregroundStyle\(\.secondary\)/.foregroundStyle(Letterpress.inkSecondary)/g;
  s/\.foregroundColor\(\.secondary\)/.foregroundColor(Letterpress.inkSecondary)/g;
  s/\.foregroundStyle\(\.red\)/.foregroundStyle(Letterpress.error)/g;
  s/\.tint\(Letterpress\.inkSecondary\)/.tint(Letterpress.toggleOn)/g;
  s/\bCareJournalPicker\(/LetterpressPicker(/g;
  s/\.clipShape\(RoundedRectangle\(cornerRadius: \.radiusMedium\)\)/.clipShape(Rectangle())/g;
  s/\.font\(\.system\(\.title2, design: \.serif\)\)/.font(Letterpress.display(22, relativeTo: .title2))/g;
' ClearAF/Views/EnrollmentView.swift ClearAF/Views/UrgentReportView.swift ClearAF/Views/ProgressView.swift \
  ClearAF/Views/PhotoCaptureManager.swift ClearAF/Views/MessagingView.swift ClearAF/Views/ProfileView.swift \
  ClearAF/Views/OnboardingView.swift ClearAF/Views/ReminderSettingsView.swift ClearAF/Views/RoutineView.swift \
  ClearAF/Views/CheckInView.swift ClearAF/Views/DashboardViewEnhanced.swift
```

- [ ] **Step 6: Replace `ClearAF/Views/PasswordRecoveryView.swift`**

```swift
import SwiftUI

struct PasswordRecoveryView: View {
    @State private var password = ""
    @State private var confirmation = ""
    @State private var saving = false
    @State private var error = ""
    var body: some View {
        VStack(spacing: 20) {
            Text("Choose a new password").font(.title)
            SecureField("New password (at least 8 characters)", text: $password).textContentType(.newPassword)
                .letterpressField(isEmpty: password.isEmpty)
            SecureField("Confirm new password", text: $confirmation).textContentType(.newPassword)
                .letterpressField(isEmpty: confirmation.isEmpty)
            if !error.isEmpty { Text(error) }
            Button(saving ? "Saving…" : "Update password") {
                saving = true
                Task { @MainActor in
                    defer { saving = false }
                    do { try await APIService.shared.updateRecoveredPassword(password) }
                    catch { self.error = "Password could not be updated. Try again or request a new reset email." }
                }
            }.disabled(saving || password.count < 8 || password != confirmation)
            Button("Cancel and sign out") { APIService.shared.logout() }.disabled(saving)
        }.padding()
    }
}
```

- [ ] **Step 7: Replace `ClearAF/Views/AuthenticationView.swift`** (colours, button and fields only; layout and copy unchanged — sign-in structure is PR 6)

```swift
import SwiftUI
import Combine

struct AuthenticationView: View {
    @StateObject private var supabaseService = SupabaseService.shared
    @State private var information = ""
    @State private var isRegistering = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var isLoading = false
    @State private var errorMessage = ""
    @State private var showError = false

    let onAuthenticationSuccess: () -> Void

    var body: some View {
        ZStack {
            Letterpress.canvas.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 32) {
                    // Header
                    VStack(spacing: 16) {
                        Image(systemName: "cross.case.fill")
                            .font(.system(size: 60))
                            .foregroundColor(Letterpress.ink)

                        Text("Clear AF")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(Letterpress.ink)

                        Text(isRegistering ? "Create your account" : "Welcome back")
                            .font(.title2)
                            .foregroundColor(Letterpress.inkSecondary)
                    }
                    .padding(.top, 50)

                    // Form
                    VStack(spacing: 20) {
                        if isRegistering {
                            CustomTextField(
                                title: "Full Name",
                                text: $name,
                                placeholder: "Enter your full name"
                            )
                        }

                        CustomTextField(
                            title: "Email",
                            text: $email,
                            placeholder: "Enter your email", keyboardType: .emailAddress, autocapitalization: .never
                        )
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)

                        CustomTextField(
                            title: "Password",
                            text: $password,
                            placeholder: "Enter your password",
                            isSecure: true
                        )
                    }
                    .padding(.horizontal, 24)

                    // Action Button
                    Button(action: {
                        if isRegistering {
                            registerUser()
                        } else {
                            loginUser()
                        }
                    }) {
                        HStack {
                            if isLoading {
                                SwiftUI.ProgressView()
                                    .tint(Letterpress.inkTertiary)
                            } else {
                                Text(isRegistering ? "Create Account" : "Sign In")
                            }
                        }
                    }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .accessibilityIdentifier("authSubmit")
                    .disabled(!isFormValid || isLoading)
                    .padding(.horizontal, 24)

                    if !information.isEmpty { Text(information).padding(.horizontal, 24).accessibilityIdentifier("authInformation") }
                    if !APIService.shared.accountError.isEmpty { Text(APIService.shared.accountError).padding(.horizontal, 24) }
                    if !isRegistering {
                        Button("Forgot password?", action: recoverPassword)
                            .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)
                    }
                    // Toggle Authentication Mode
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            isRegistering.toggle()
                            clearForm()
                        }
                    }) {
                        HStack(spacing: 4) {
                            Text(isRegistering ? "Already have an account?" : "Don't have an account?")
                                .foregroundColor(Letterpress.inkSecondary)
                            Text(isRegistering ? "Sign In" : "Sign Up")
                                .foregroundColor(Letterpress.ink)
                                .fontWeight(.semibold)
                                .underline()
                        }
                    }

                    .accessibilityIdentifier("authMode")
                    .disabled(isLoading)

                    Spacer(minLength: 50)
                }
            }
        }
        .alert("Error", isPresented: $showError) {
            Button("OK") { }
        } message: {
            Text(errorMessage)
        }
    }

    private var isFormValid: Bool {
        if isRegistering {
            return name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 && email.contains("@") && password.count >= 8
        } else {
            return !email.isEmpty && !password.isEmpty
        }
    }

    private func registerUser() {
        isLoading = true
        Task { @MainActor in
            defer { isLoading = false }
            do {
                let hasSession = try await supabaseService.signUp(email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password, name: name.trimmingCharacters(in: .whitespacesAndNewlines))
                if !hasSession {
                    information = "Check your email to confirm your account, then sign in."
                    isRegistering = false
                    password = ""
                }
            } catch { handleError(error) }
        }
    }
    private func loginUser() {
        isLoading = true
        Task { @MainActor in
            defer { isLoading = false }
            do { try await supabaseService.signIn(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password) }
            catch { handleError(error) }
        }
    }
    private func recoverPassword() {
        isLoading = true
        Task { @MainActor in
            defer { isLoading = false }
            do {
                try await supabaseService.requestRecovery(email: email.trimmingCharacters(in: .whitespacesAndNewlines))
                information = "If an account exists, a password reset email is on its way. Open the link on this device."
            } catch { handleError(error) }
        }
    }

    private func handleError(_ error: Error) {
        errorMessage = "Unable to continue. Check your details and connection, then try again."
        showError = true
    }

    private func clearForm() {
        email = ""
        password = ""
        name = ""
        errorMessage = ""
    }
}

// MARK: - Custom Text Field
struct CustomTextField: View {
    let title: String
    @Binding var text: String
    let placeholder: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .words

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .letterpressEyebrow()

            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .keyboardType(keyboardType)
                        .textInputAutocapitalization(autocapitalization)
                }
            }
            .letterpressField(isEmpty: text.isEmpty)
        }
    }
}

// MARK: - Preview
struct AuthenticationView_Previews: PreviewProvider {
    static var previews: some View {
        AuthenticationView {
            print("Authentication successful")
        }
    }
}
```

The UI tests find these fields by placeholder (`Enter your email`, `Enter your password`, `Enter your full name`), which are unchanged.

- [ ] **Step 8: Remove the two retired appearance tests** — in `ClearAFTests/AccountProfileTests.swift` delete `actualTodayPhotoActionMeetsTextContrastInBothAppearances` and `actualRoutineRecordActionMeetsTextContrastInBothAppearances` (lines 14–27, including the blank line after each).

- [ ] **Step 9: Confirm the control and hue sweep is empty**

Run:
```bash
grep -rnE "\.(red|blue|green|orange|purple|pink|yellow|teal|mint|cyan|indigo|brown|gray|white|black)\b|Color\(\.system|UIColor\.system|\.foreground(Style|Color)\(\.(primary|secondary|tertiary)\)|\.buttonStyle\(\.bordered|\.textFieldStyle\(\.roundedBorder\)|\.cornerRadius\(|cornerRadius:\s*[0-9.]|PrimaryButtonStyle|standardTextField|design:\s*\.serif|CareJournalPicker|ActionAppearance" ClearAF --include='*.swift' | grep -v "ClearAF/Views/DesignSystem.swift"
grep -rn "ActionAppearance" ClearAFTests
```
Expected: no output from either command.

- [ ] **Step 10: Run the tests**

Run the Task 5 Step 2 command with `-only-testing:ClearAFTests/LetterpressSweepTests -only-testing:ClearAFTests/LetterpressPrimitivesTests -only-testing:ClearAFTests/AccountProfileTests`.
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add ClearAF ClearAFTests/LetterpressSweepTests.swift ClearAFTests/AccountProfileTests.swift
git commit -m "ios: move buttons, fields, toggles and hues onto Letterpress primitives" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 7: iOS token and type migration; delete DesignSystem.swift

**Files:**
- Create: `ClearAF/Views/InteractionHelpers.swift`
- Delete: `ClearAF/Views/DesignSystem.swift`
- Modify: consumers of `CareJournal.*`, `Color.*` wellness extensions, `Font` extensions and spacing extensions — `ClearAF/ContentView.swift`, `ClearAF/Views/{DashboardViewEnhanced,ReminderSettingsView,CompletionCalendarView,EnrollmentView,PhotoCaptureManager,ProgressView,ProfileView,UrgentReportView,OnboardingView,CareStatusCard,RoutineView,MessagingView,CheckInView}.swift`
- Modify: `ClearAFTests/LetterpressSweepTests.swift`, `ClearAFTests/AccountProfileTests.swift`, `ClearAFUITests/MVPExperienceUITests.swift:28`

**Interfaces:**
- Consumes: Task 5 names (`Letterpress.Space.*`, `Letterpress.minTouch`, `letterpressSurface()`), Task 6 state (no control/hue offences left).
- Produces: `HapticManager` (unchanged API: `light() medium() heavy() success() warning() error() selection()`) and `View.accessibleButton(label:hint:value:)` in `InteractionHelpers.swift`. Everything else in `DesignSystem.swift` is gone: `CareJournal`, `careJournalSurface`, `CareJournalPicker`, all `Color` and `Font` extensions, spacing/radius `CGFloat` extensions, shadow modifiers, button styles, `StandardTextFieldModifier`, `ClickableBackgroundModifier`, `WellnessCardModifier`, `accessibleImage`, `Animation` presets (the last three have no consumers).

**Token mapping**

| Old | New |
|---|---|
| `CareJournal.canvas` / `.surface` | `Letterpress.canvas` / `Letterpress.surface` |
| `CareJournal.textPrimary` | `Letterpress.ink` |
| `CareJournal.textSecondary`, `Color.textSecondary`, `.textSecondary` | `Letterpress.inkSecondary` |
| `CareJournal.actionPrimary` | `Letterpress.action` |
| `CareJournal.onPrimary` | `Letterpress.canvas` |
| `CareJournal.display` | `Letterpress.display(34)` |
| `.careJournalSurface()` | `.letterpressSurface()` |
| `Color.primaryPurple` | `Letterpress.ink` |
| `Color.retainedErrorText`, `.retainedErrorText` | `Letterpress.error` |
| `Color.backgroundPrimary` | `Letterpress.canvas` |
| `.font(.headlineLarge)` | `.font(Letterpress.ui(17, weight: .medium, relativeTo: .headline))` (row title) |
| `.font(.headlineSmall)` | `.font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline))` |
| `.font(.captionLarge)` | `.font(Letterpress.data(12, relativeTo: .footnote))` (a count: mono) |
| `.font(.bodyMedium)` | `.font(Letterpress.ui(16, relativeTo: .callout))` |
| `.spaceXXS` (2), `.spaceXS` (4) | `Letterpress.Space.s4` |
| `.spaceSM` (8) | `Letterpress.Space.s10` |
| `.spaceMD` (12) | `Letterpress.Space.s14` |
| `.spaceLG` (16) | `Letterpress.Space.s18` |
| `.spaceXL` (20), `.spaceXXL` (24) | `Letterpress.Space.s22` |
| `.spaceHuge` (32) | `Letterpress.Space.s28` |
| `.touchTarget` | `Letterpress.minTouch` |

- [ ] **Step 1: Extend the sweep with the retired names (failing)**

In `ClearAFTests/LetterpressSweepTests.swift` replace the `excluded` line with:

```swift
    static let excluded: Set<String> = ["LetterpressSweepTests.swift"]
```

and add these tests inside the struct:

```swift
    @Test func designSystemFileIsGone() {
        #expect(!FileManager.default.fileExists(atPath: Self.repoRoot.appendingPathComponent("ClearAF/Views/DesignSystem.swift").path))
    }

    @Test func noRetiredDesignSystemNamesRemain() throws {
        let retired = #"\b(CareJournal\w*|careJournal\w*|primaryPurple|primaryActionPurple|primaryActionTeal|primaryTeal|skinPeach|calmBlue|gentleGreen|warmBeige|softLavender|retainedErrorText|textPrimary|textSecondary|textTertiary|backgroundPrimary|backgroundSecondary|backgroundTertiary|borderSubtle|cardBackground|buttonPrimary|buttonSecondary|buttonDisabled|primaryGradient|glowShadow|softShadow|mediumShadow|strongShadow|wellnessCard|WellnessCardModifier|clickableBackground|ClickableBackgroundModifier|StandardTextFieldModifier|score[A-Z]\w*|space(XXS|XS|SM|MD|LG|XL|XXL|Huge|Giant|Massive)|radius(Small|Medium|Large|XL|XXL|Pill)|display(Large|Medium|Small)|headline(Large|Medium|Small)|body(Large|Medium|Small)|caption(Large|Medium|Small)|dynamic(Title|Headline|Body)|touchTarget|TodayPhotoActionAppearance|RoutineActionAppearance)\b"#
        #expect(try Self.offences(retired, in: ["ClearAF", "ClearAFTests", "ClearAFUITests"]) == [])
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run the Task 5 Step 2 command with `-only-testing:ClearAFTests/LetterpressSweepTests`.
Expected: FAIL — `designSystemFileIsGone`, `noRetiredDesignSystemNamesRemain` (first offences in `ClearAF/ContentView.swift:30: HStack(spacing: .spaceLG) {`), and `appHasNoHardcodedHuesOrSystemControlStyles` now also reports `DesignSystem.swift` lines.

- [ ] **Step 3: Mechanical token pass (repo root)**

```bash
FILES=$(grep -rlE "CareJournal\.|careJournalSurface|primaryPurple|retainedErrorText|textSecondary|backgroundPrimary|headlineLarge|headlineSmall|captionLarge|bodyMedium|\.space(XXS|XS|SM|MD|LG|XL|XXL|Huge)\b|\.touchTarget\b" ClearAF --include='*.swift' | grep -v 'ClearAF/Views/DesignSystem.swift')
echo "$FILES"
perl -pi -e '
  s/\bCareJournal\.textPrimary\b/Letterpress.ink/g;
  s/\bCareJournal\.textSecondary\b/Letterpress.inkSecondary/g;
  s/\bCareJournal\.actionPrimary\b/Letterpress.action/g;
  s/\bCareJournal\.onPrimary\b/Letterpress.canvas/g;
  s/\bCareJournal\.canvas\b/Letterpress.canvas/g;
  s/\bCareJournal\.surface\b/Letterpress.surface/g;
  s/\bCareJournal\.display\b/Letterpress.display(34)/g;
  s/\.careJournalSurface\(\)/.letterpressSurface()/g;
  s/\bColor\.primaryPurple\b/Letterpress.ink/g;
  s/\bColor\.retainedErrorText\b/Letterpress.error/g;
  s/\bColor\.textSecondary\b/Letterpress.inkSecondary/g;
  s/\bColor\.backgroundPrimary\b/Letterpress.canvas/g;
  s/\? \.retainedErrorText : \.textSecondary\b/? Letterpress.error : Letterpress.inkSecondary/g;
  s/\.font\(\.headlineLarge\)/.font(Letterpress.ui(17, weight: .medium, relativeTo: .headline))/g;
  s/\.font\(\.headlineSmall\)/.font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline))/g;
  s/\.font\(\.captionLarge\)/.font(Letterpress.data(12, relativeTo: .footnote))/g;
  s/\.font\(\.bodyMedium\)/.font(Letterpress.ui(16, relativeTo: .callout))/g;
  s/\.spaceXXS\b/Letterpress.Space.s4/g;
  s/\.spaceXS\b/Letterpress.Space.s4/g;
  s/\.spaceSM\b/Letterpress.Space.s10/g;
  s/\.spaceMD\b/Letterpress.Space.s14/g;
  s/\.spaceLG\b/Letterpress.Space.s18/g;
  s/\.spaceXXL\b/Letterpress.Space.s22/g;
  s/\.spaceXL\b/Letterpress.Space.s22/g;
  s/\.spaceHuge\b/Letterpress.Space.s28/g;
  s/\.touchTarget\b/Letterpress.minTouch/g;
' $FILES
```

Expected `echo`: `ClearAF/ContentView.swift` and the 13 view files listed under **Files**.

- [ ] **Step 4: Create `ClearAF/Views/InteractionHelpers.swift`** (the neutral helpers that survive)

```swift
import SwiftUI
import UIKit

/// Haptic feedback used by Today and photo capture.
struct HapticManager {
    static func light() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func medium() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    static func heavy() {
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }

    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }

    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }
}

extension View {
    func accessibleButton(label: String, hint: String? = nil, value: String? = nil) -> some View {
        self
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(label)
            .accessibilityHint(hint ?? "")
            .accessibilityValue(value ?? "")
    }
}
```

- [ ] **Step 5: Delete `DesignSystem.swift`**

```bash
git rm -q ClearAF/Views/DesignSystem.swift
```

- [ ] **Step 6: Update `ClearAFTests/AccountProfileTests.swift`**

Replace the whole `careJournalReadingColorsMeetContrastInBothAppearances` test with:

```swift
    @Test func letterpressReadingColorsMeetContrastInBothAppearances() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            for surface in [Letterpress.canvas, Letterpress.surface] {
                for text in [Letterpress.ink, Letterpress.inkSecondary, Letterpress.action] {
                    #expect(contrast(UIColor(text).resolvedColor(with: traits), UIColor(surface).resolvedColor(with: traits)) >= 4.5)
                }
            }
        }
    }
```

Replace both `brandForegroundAndActionColorsMeetNormalTextContrastInBothAppearances` and `retainedSecondaryAndErrorTextMeetContrastAcrossBothAppearances` with this one test (Forms and sheets still sit on system backgrounds until PRs 3 and 6):

```swift
    @Test func secondaryAndErrorTextMeetContrastOnSystemFormBackgrounds() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            for background in [UIColor.systemBackground, .secondarySystemBackground, .tertiarySystemBackground, .systemGroupedBackground, .secondarySystemGroupedBackground] {
                for (label, color) in [("secondary", Letterpress.inkSecondary), ("error", Letterpress.error)] {
                    let ratio = contrast(UIColor(color).resolvedColor(with: traits), background.resolvedColor(with: traits))
                    #expect(ratio >= 4.5, "\(label) \(style.rawValue): \(ratio)")
                }
            }
        }
    }
```

- [ ] **Step 7: Rename the UI screenshot prefix** — `ClearAFUITests/MVPExperienceUITests.swift:28`:
`shot.name = "CareJournal-\(screen)-\(theme)-\(size)"` → `shot.name = "Letterpress-\(screen)-\(theme)-\(size)"`

- [ ] **Step 8: Confirm nothing retired remains**

Run:
```bash
grep -rnE "\b(CareJournal\w*|careJournal\w*|primaryPurple|primaryAction(Purple|Teal)|skinPeach|calmBlue|gentleGreen|softLavender|retainedErrorText|textPrimary|textSecondary|backgroundPrimary|cardBackground|primaryGradient|glowShadow|wellnessCard|score[A-Z]\w*|space(XXS|XS|SM|MD|LG|XL|XXL|Huge)|radius(Small|Medium|Large|XL|XXL|Pill)|headline(Large|Small)|captionLarge|bodyMedium|touchTarget)\b" ClearAF ClearAFTests ClearAFUITests --include='*.swift' | grep -v "ClearAFTests/LetterpressSweepTests.swift"
```
Expected: no output.

- [ ] **Step 9: Build and run the iOS unit tests**

Run:
```bash
xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
  -derivedDataPath /tmp/clearaf-build-lp2 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  -only-testing:ClearAFTests test | xcbeautify
```
Expected: build succeeds (the UI test target compiles too); all `ClearAFTests` pass, including `LetterpressSweepTests` (4 tests).

- [ ] **Step 10: Commit**

```bash
git add -A ClearAF ClearAFTests ClearAFUITests
git commit -m "ios: migrate to Letterpress tokens and delete DesignSystem.swift" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: PR 2 verification

**Files:** none, unless a check fails (fix, then rerun only that check).

- [ ] **Step 1: Portal gates**

Run: `cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`
Expected: all green; the suite includes `ui-buttons`, `ui-fields`, `ui-surfaces`, `letterpress-sweep`, `letterpress-tokens`.

- [ ] **Step 2: iOS unit tests**

Run the Task 7 Step 9 command.
Expected: all `ClearAFTests` pass.

- [ ] **Step 3: Bounded visual pass, portal** (one pass; fix regressions only, not PR 4/5 structure)

Start the local stack (`node scripts/local.cjs start`, `cd backend && npm run dev`, `cd web-portal && npm run dev`). With the Playwright browser tools on `http://localhost:3000`:
- `/login` in light and dark (`browser_run_code_unsafe` with `page.emulateMedia({ colorScheme: 'dark' })`): mono uppercase field labels over baseline-rule inputs, one filled ink 44px Sign in button, underlined links, no rounded boxes, no hue.
- Sign in with a local synthetic clinician, then `/patients` and one `/patients/[id]` in light and dark: 2px ink rule under the table head, 1px row rules, square surfaces, outlined 36px buttons, square badges, sidebar nav item inverted to ink with `aria-current="page"`.
- Keyboard: Tab through the header and open the account menu with Enter; every focused control shows the 2px ink outline and highlighted menu items show the inset ink outline.
- Record findings as pass/fail per bullet in the PR description.

- [ ] **Step 4: Bounded visual pass, iOS**

Using the `xcodebuildmcp-cli` skill, build and run on the iPhone 17 simulator and take screenshots of Sign in, Today, Routines and Photos in light and dark, plus Routines at the largest accessibility text size:
- Filled ink and outlined buttons are at least 44pt with centred labels; disabled buttons are `sunk` with `ink.tertiary` text.
- Fields show a baseline rule (ink at 50% empty, ink when focused).
- AM/PM and Grid/List segmented controls show the sunk track and surface thumb; at the largest text size they become menus.
- No purple, blue, teal or red anywhere; warning icons use `error`.
- Reminders toggles (Profile → Reminders) show an ink track in light and an `ink.tertiary` track in dark, with the thumb clearly visible.
- Record findings as pass/fail per bullet in the PR description.

- [ ] **Step 5: Review agents**

`care-access-reviewer` and `api-contract-checker` are not required: no auth, data, photo or API-shape change. State this in the PR description. Run `/code-review` on the branch.
