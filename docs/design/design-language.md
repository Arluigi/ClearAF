# ClearAF design language

Version 1.0 · September 13, 2026 · Approved direction: Care Journal

## Purpose and authority

Use this guide when redesigning existing screens or developing new features in the patient iOS app and clinician web portal. It defines the product’s visual and interaction language, not a frozen set of screen compositions or a feature roadmap.

The approved direction is **Care Journal with native iOS controls**. The user explicitly wants to retain the existing Liquid Glass bottom tab bar and morning/evening switcher, and bring the Photos Grid/List switcher into the same native family. These decisions override the flat navigation and switcher approximations in the exploratory browser mockup.

The mockup established an aesthetic direction; its fictional data, copy, abbreviated forms, and simulated interactions are not implementation requirements. This document is the source of truth for subsequent design work. Existing data integrity, privacy, accessibility, and workflow requirements continue to apply. Do not infer authorization for new product features from examples here.

## 1. The character of ClearAF

ClearAF should feel like a well-kept personal care record connected to a capable clinical workspace: calm, clear, personal, and credible.

Give identity to the content through restrained blue, thoughtful typography, generous spacing, and factual, human language. On iOS, let the operating system supply recognizable navigation, controls, gestures, and material behavior. On the web, use familiar browser interaction and a productive desktop layout.

Five principles govern every new feature:

1. **A clear next action.** Establish what the person needs to understand and do before choosing a layout. A screen may have several actions, but only one should dominate a local task area.
2. **Native interaction is part of the brand.** A bespoke switcher is not an improvement if it breaks the visual or behavioral consistency of an existing system control.
3. **Content stays quiet; controls remain recognizable.** Use opaque reading surfaces and reserve special materials for navigation and controls where the platform supports them.
4. **Consistency follows meaning.** The same kind of selection, action, status, or record uses the same component family everywhere.
5. **Warmth without performance.** Use direct, supportive language. Do not decorate routine care with arbitrary scores, streaks, confetti, motivational slogans, or claims of improvement.

## 2. Shared foundations

### Color roles

Use semantic tokens shared by name and purpose across platforms. Hex values below are the starting implementation targets for ordinary app content, not overrides for Apple’s system materials. Check actual foreground/background pairings during implementation; a palette alone is not proof of accessible contrast.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `canvas` | `#F4F6F8` | `#18232D` | Main content background |
| `surface` | `#FFFFFF` | `#202D39` | Reading, editing, grouped content |
| `text.primary` | `#213B50` | `#E7EFF6` | Titles, body, essential information |
| `text.secondary` | `#536779` | `#AEC0CF` | Supporting context |
| `action.primary` | `#265579` | `#B0D5F2` | Primary action, links, selected emphasis |
| `action.onPrimary` | `#FFFFFF` | `#172C3D` | Content on a filled primary action |
| `accent.subtle` | `#E3EDF5` | `#2B4356` | Quiet selected or contextual surface |
| `separator` | `#C8D4DF` | `#435564` | Structural separators; not an all-purpose outline |

Use platform semantic colors for destructive, error, warning, and success states on iOS. On the web, provide explicit semantic equivalents validated in both themes. Never use the brand blue as an error color. Never communicate status through color alone.

Default to the system appearance on both platforms. If a product appearance preference exists, respect it consistently. Do not force the portal into black while the app follows system appearance.

Avoid decorative purple-to-teal gradients, glowing primary actions, rainbow categories, and different accent colors for otherwise equivalent sections. Photos retain their original color; never tint, beautify, or filter clinical images to match the palette.

### Typography

The Care Journal identity comes from a small amount of serif display typography surrounded by highly legible native sans serif UI.

| Role | iOS | Web |
| --- | --- | --- |
| Editorial display | System serif design at a Dynamic Type title style | Georgia, serif fallback; 30–36px, regular |
| Navigation title | Native navigation title | System sans serif; 24–28px, semibold |
| Section heading | System headline/title style appropriate to hierarchy | System sans serif; 17–20px, semibold |
| Body and controls | System body/callout styles | System sans serif; 16px body, 14–16px controls |
| Supporting text | System footnote/caption, scalable | 13–14px; essential information must remain readily legible |
| Aligned numbers | System tabular figures where useful | Tabular figures for table values, dates, counts |

Use the serif treatment for a welcome, a patient identity heading, or another meaningful editorial moment. Do not apply it to tab labels, switchers, form labels, dense tables, buttons, or every section heading. Usually one prominent serif heading per screen is enough. Keep functional screen titles short and native.

On iOS, do not bundle imitations of SF fonts or freeze text at mockup pixel sizes. Use system font styles and Dynamic Type. On the web, use a system sans stack such as `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Do not depend on custom font downloads for a usable first render.

Use sentence case. Avoid all-caps eyebrow labels, excessive tracking, and repeated headings. Use actual names and useful dates instead of slogans repeated on every visit.

### Space, shape, and depth

- Shared spacing scale: 4, 8, 12, 16, 20, 24, 32, 48. Values map to points on iOS and CSS pixels on web; platform components own their internal geometry.
- iPhone content gutters: normally 20pt, adapting to available width and native container behavior. Section gaps: 24–32pt. Related row content: 8–12pt.
- Web gutters: 24–32px desktop, 16–20px narrow screens. Keep reading measures around 60–75 characters and avoid stretching forms across a wide monitor.
- Let whitespace and alignment establish groups before adding a card. Use containers for a distinct task, editable form, or bounded record—not every paragraph.
- Custom content surfaces generally use 8–12px/pt radii. Images can use 8–12. Do not apply these values to native controls; system curvature wins there.
- Use separators sparingly between rows or sections. Avoid nested bordered cards and equal-sized boxes for unrelated information.
- Reserve shadows for genuine elevation such as an overlay. Ordinary content needs little or no shadow. No glow shadows.

## 3. Native iOS control contract

### Bottom navigation: retain the existing native Liquid Glass tab bar

Keep the native `TabView` for top-level destinations. Current destinations are Today, Photos, and Routines. Preserve native tab selection, labels, SF Symbols, safe areas, accessibility, and OS-managed appearance.

Do not replace it with an HTML-like footer, custom `HStack` capsule, opaque mockup bar, manually blurred rectangle, or hand-built sliding selection indicator. Do not add a second glass background over the system tab bar. Avoid background overrides that mask its material.

Do not add a new tab for every feature. A tab is a stable top-level destination, not a filter, action, or minor workflow. New destination proposals must justify their place in the product’s information architecture.

### Local switchers: one native family

Use the same native segmented-selection pattern for short sets of mutually exclusive modes within a screen.

| Existing control | Required treatment |
| --- | --- |
| Routines: Morning / Evening | Retain the native segmented `Picker`; preserve its OS-supplied Liquid Glass behavior |
| Photos: Grid / List | Replace the custom `EnhancedSegmentedControl` with the same native segmented `Picker` family |
| Future equivalent two- or three-mode control | Reuse that family, including its selection semantics and accessibility |

The match is not merely a rounded shape. Match native material behavior, selected-state treatment, animation, text sizing, interaction feedback, and accessibility. Content and labels may differ; control identity must not.

Implementation pattern:

```swift
Picker("Photo layout", selection: $selectedViewMode) {
    Text("Grid").tag(0)
    Text("List").tag(1)
}
.pickerStyle(.segmented)
```

Keep state typing compatible with the existing feature. This example illustrates component choice; it does not prescribe replacing the feature’s state model.

Do not layer a brand gradient, custom `matchedGeometryEffect`, bespoke spring, thick border, or custom shadow over the native selected segment. Do not tint controls so aggressively that their material and selection become indistinct.

Use a menu or another appropriate native picker when options no longer fit. At large accessibility sizes, prefer a labeled native selection presentation that keeps all choices readable over shrinking labels or clipping segments. Reuse the same adaptation policy for equivalent switchers.

### Liquid Glass boundaries and compatibility

Apple describes Liquid Glass as a functional layer for controls and navigation above content. Use that distinction: reading surfaces, routine instructions, photo grids, and records should not all become glass. See [Apple’s materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials).

Native appearance depends on the running OS, linked SDK, control context, and system settings. Preserve the current native behavior on the supported modern OS, and verify Photos against Routines on the same OS and settings. On older supported systems, accept the corresponding native segmented and tab appearance. Do not raise the minimum deployment target solely to obtain glass or use private APIs to simulate it.

Respect Reduce Transparency, Increase Contrast, Reduce Motion, and the user’s material preferences. The resulting less-transparent appearance is correct behavior. Standard controls should be the first choice; any truly necessary custom glass control needs a specific rationale and availability handling. See [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass).

### Other iOS patterns

- Use native navigation stacks, back behavior, sheets, alerts, menus, switches, date controls, and system photo selection where appropriate.
- Use SF Symbols for iOS UI. Prefer familiar semantic symbols with visible labels for important actions.
- Keep primary tasks reachable with comfortable touch targets, generally at least 44pt. Respect keyboard and bottom safe areas.
- Place persistent actions and paging so they do not collide with the tab bar or change position unexpectedly as content loads.
- Use native feedback and transitions. Custom animation must explain a user action, remain brief, and respect Reduce Motion. Avoid repeated ambient animation.
- Preserve scroll position, selected mode, and sensible back navigation when switching views within a task.

## 4. Web translation

The portal shares the Care Journal palette, editorial restraint, vocabulary, content hierarchy, and semantic state meanings. It should feel like the professional counterpart of the app.

Do not imitate iPhone hardware, floating mobile tab bars, or optical glass refraction in the portal. Use browser-native expectations: visible keyboard focus, predictable links, accessible forms, responsive layouts, and conventional dialogs.

| Shared purpose | iOS expression | Web expression |
| --- | --- | --- |
| Top-level navigation | Native tab bar | Clear top navigation or sidebar chosen for destination count |
| Local exclusive modes | Native segmented Picker | Accessible segmented radio group or tabs, depending on semantics |
| Patient identity | Native/detail heading with restrained serif moment | Serif identity heading in a dedicated workspace |
| Routine instructions | Comfortable vertical reading flow | Structured rows with appropriately denser editing |
| Primary action | Native button style with brand tint | Filled brand button with visible focus/disabled states |
| Record selection | Native list/grid navigation | Accessible table/list and detail navigation |

For web selection, use a radio group for choosing one value and tabs for switching labeled content panels. Implement the corresponding keyboard interaction and selected state. Reuse the existing accessible primitives where suitable; visual restyling must not discard their behavior.

Use a dedicated patient workspace for sustained review and editing. Reserve dialogs for bounded tasks such as confirmation or an image viewer. Preserve the clinician’s patient-list search, pagination, and return context.

Keep patient context visible while editing. Give each page one clear heading; avoid repeating the same title in the global header and main content. At narrower widths, collapse navigation and reflow forms rather than shrinking everything. Preserve meaningful table structure where horizontal scrolling is necessary.

## 5. Reusable content and state patterns

### Actions and forms

Use concrete verbs: “Take a photo,” “Save routine,” “Try again.” Distinguish navigation from committing a change. Show the scope of destructive actions and use the established confirmation pattern when needed.

Use persistent field labels; placeholders are examples, not labels. Group related fields. Put validation next to the relevant input and provide a useful correction. Preserve drafts after failure and make unsaved state clear.

Keep versioning and other clinically relevant provenance available to clinicians. Present it as secondary metadata unless it affects the current decision. For patients, move routine version and ordinary sync timestamps into details; elevate stale or failed state when it changes what the person can safely understand or do.

### Photos and records

Use neutral backgrounds for images. Preserve aspect ratio and offer an uncropped original view. Label capture dates clearly. Differentiate on-device, uploading, shared, and failed states in plain language, using the actual data state.

Do not imply that a photo was shared merely because it was captured. Do not imply clinical improvement from image order, colors, or decorative charts. Empty states should explain the next useful step without large decorative icons or invented sample outcomes.

### Required states for every feature

| State | Design requirement |
| --- | --- |
| Loading | Keep layout stable; identify what is loading without blocking unrelated content |
| Empty | Explain what belongs here and provide an available next action |
| Populated | Prioritize the actual task; keep metadata secondary |
| Selected | Use the component family’s normal selected treatment and semantics |
| Disabled | Make unavailability understandable; never communicate it through low opacity alone |
| Saving/uploading | Prevent accidental duplicate actions and show truthful progress/state |
| Success | Confirm the actual result briefly; distinguish local save from remote completion |
| Error | Preserve recoverable work; describe the problem and a useful recovery action |
| Offline/stale | Identify saved or outdated content when relevant; never falsely label it current |
| Permission/access denied | Explain the available recovery without exposing another person’s data |

Use everyday language. Prefer “Saved on this device. Waiting to upload.” over internal queue terminology. Avoid unearned reassurance, diagnosis, promised outcomes, and moral judgments about adherence. “No completion recorded” is different from “You missed your routine.”

## 6. Applying the language to a new feature

Before implementation, answer these questions in the feature design:

1. Who is using it, what are they trying to do, and what is the primary action?
2. Where does it belong in the current navigation? Can an existing destination contain it?
3. Which existing component families cover navigation, selection, input, records, and feedback?
4. Which information is primary, supporting, and optional detail?
5. How will the feature appear in light/dark mode, at large text sizes, and in loading/empty/error states?
6. Which foundations are shared across iOS and web, and which interactions should remain platform-specific?

Examples of applying the rules to hypothetical future work:

- A record view with “Recent / All” modes uses the established local selector family. Do not invent a third switcher style.
- A new care-note detail uses the existing type hierarchy and reading surface. It does not need a new accent color, bespoke card family, or glass body panel.
- A multi-option filter uses an appropriate native picker/menu on iOS and an accessible form control on web. It does not stretch a segmented control beyond readable capacity.
- A new clinician editor reuses field, validation, save, and unsaved-change patterns, while the patient counterpart prioritizes reading and the patient’s own action.

Create a new component only when an existing family cannot express the interaction. Document its purpose, states, accessibility, platform mapping, and reuse rules here before copying it into multiple screens. A visual novelty alone is not a reason for a new family.

## 7. Current code migration map

These are implementation entry points, not authorization to change unrelated functionality.

| Location | Design responsibility |
| --- | --- |
| `ClearAF/Views/DesignSystem.swift` | Introduce semantic Care Journal roles; retire decorative gradient/glow usage in active flows; retain adaptive typography |
| `ClearAF/ContentView.swift` | Preserve native `TabView` and navigation behavior; apply restrained brand tint |
| `ClearAF/Views/RoutineView.swift` | Preserve segmented Picker; simplify hierarchy while retaining actionable state and provenance |
| `ClearAF/Views/ProgressView.swift` | Replace Grid/List custom switcher with native segmented Picker; retain history, paging, capture, and state behavior |
| `ClearAF/Views/DashboardViewEnhanced.swift` | Apply Care Journal hierarchy and clearer task priority without inventing outcomes |
| `web-portal/src/app/globals.css` | Map semantic tokens consistently and support both appearances |
| `web-portal/src/components/ui/` | Centralize reusable web control and state treatments |
| `web-portal/src/components/layout/` | Align navigation, headings, responsive behavior, and account access |
| `web-portal/src/app/patients/page.tsx` | Patient list and dedicated patient-workspace composition |
| `web-portal/src/components/patients/` | Routine editing, photo review, and status hierarchy |

The source currently confirms a native `TabView`, a native segmented Morning/Evening Picker, and a custom gradient `EnhancedSegmentedControl` for Photos. The user’s observed current native glass appearance is the preservation reference; the browser concept is not evidence of native material fidelity.

## 8. Bounded design acceptance

For a design implementation, agree on the affected screens first and perform one focused review covering:

- Bottom navigation remains native and preserves the desired glass behavior on the target iOS version.
- Photos Grid/List and Routines Morning/Evening belong to the same native control family under identical OS/settings conditions.
- No custom backgrounds hide system materials, and content surfaces remain readable and restrained.
- Shared color/type/spacing roles are consistent across the affected patient and clinician screens.
- The primary action, secondary metadata, and feedback states are clear; controls behave consistently.
- Light and dark appearances, large text, reduced transparency/motion, keyboard focus, and screen-reader labels are checked where relevant.
- Photos, forms, pagination, and bottom actions do not overlap or clip at the affected narrow layouts.
- Existing feature behavior and truthfulness of save/share/sync states remain intact.

Use focused functional checks for changed behavior and a short visual walkthrough of the affected surfaces. A token or typography change alone does not justify rerunning an unrelated full backend/device matrix. Record any unverified native behavior explicitly; do not claim a browser screenshot validates Liquid Glass.

## Agent handoff prompt

> Read `docs/design/design-language.md` before designing or implementing UI. Apply Care Journal across iOS and web, using its semantic foundations and platform-specific patterns. Preserve the native Liquid Glass iOS tab bar and Morning/Evening segmented Picker; use that same native selector family for Photos Grid/List and equivalent future controls. The guide supersedes the exploratory mockup’s flat control approximations. Reuse component families, design all relevant states, preserve existing workflow and data semantics, and keep verification scoped to the affected work. Do not add features or redesign unrelated flows without task authorization.
