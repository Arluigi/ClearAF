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
