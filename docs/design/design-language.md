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

## Clinician quick replies — exception to spec §7

The quick-reply chips above the photo-reply box and the message composer (`web-portal/src/lib/quick-replies.ts`) are the one place spec §7 (sentence case, no exclamation marks, no motivational copy) is deliberately not followed: their approved copy may carry brief encouragement, but only after a factual clause ("Reviewed — no change to your routine. Keep it up!"). They never assess the skin — no "looking great," no grading — an assessment stays something the clinician types by hand. This exception is scoped to those five approved strings only; every other screen keeps §7 as written.

## Project decisions (2026-09-17)

- Controls with no backing capability are omitted until built; see [`letterpress/deferred.md`](letterpress/deferred.md).
- Additive read-only API is permitted when a re-sequenced screen needs it. Schema changes are not.
- Screens the spec does not cover (enrollment, urgent reports, care status/decisions, other portal pages) follow the spec's components and rules as closely as possible. Urgent reports fill the worklist Flagged tab and are labelled in words.

## Implementation refinements

- iOS fonts are static instances resolved by PostScript name: `Newsreader72pt-Light` (≥ 28pt), `Newsreader16pt-Light`, their italics, `IBMPlexSans-Text` (450 body), `IBMPlexSans` (400), `IBMPlexSans-Medm` (500), `IBMPlexMono`, `IBMPlexMono-Medm`. Plex Medium is named `-Medm`, not `-Medium`.
- Colours: iOS asset catalog `Letterpress/lp.*` with Any/Dark; portal RGB channel variables in `globals.css`, dark values under `prefers-color-scheme`.
- Contrast pairs to avoid in dark mode: `ink.future` text on `sunk` (4.40) or `attention.wash` (4.06); `ink.tertiary` text on `attention.wash` (4.28).
- Token tests: `web-portal/tests/letterpress-tokens.test.mjs`, `ClearAFTests/LetterpressTests.swift`.

## Identity

- The mark (spec §10) is drawn from code, not a font. `ClearAF/Views/Brand/LetterpressMarkGeometry.swift` and `web-portal/src/components/brand/geometry.ts` hold the construction; `web-portal/tests/brand-mark.test.ts` keeps them equal. The "af" is an outline extracted from `Newsreader16pt-LightItalic` by `swift scripts/brand/extract-glyphs.swift` (`--check` detects drift, but this is a macOS-only manual step — it isn't run in CI, so a font change could land without the outline being re-extracted; re-run it by hand after any Newsreader update).
- Insets follow the approved specimen: measured from the inner edge of each rule, to the end of the "af" advance and the bottom of its line box. The 24–47 stroke band is capped at 1.5. Below H=20 the letters become a solid block (raised from 16 so there's no dead band above the §4a 18px specimen where the monogram is mush). `LetterpressMarkGeometry.path(height:origin:usesBlock:)` also takes an explicit `usesBlock` override for cases whose frame height clears H=20 but still must show the block specimen — the 32px favicon `.ico` is the only current user, since its ~23px frame would otherwise draw the letters.
- App icon (light, dark, tinted), `apple-touch-icon.png`, `favicon.ico` and `favicon.svg` are rendered by `scripts/brand/render-icons.sh` from the same geometry. Re-render rather than editing the PNGs. The `.ico`'s ICONDIRENTRY bit count is derived from the embedded PNG's actual colour type (24bpp for RGB, 32bpp for RGBA) — a mismatched header 500s Turbopack's `next dev` even though `next build`/`next start` and non-Turbopack `next dev` don't decode it.
- Placements: portal rail H=25, portal sign-in H=27, iOS sign-in H=28, each with 0.5 × H clear. Components: `Mark`/`Lockup` (portal), `LetterpressMark`/`LetterpressLockup` (iOS).
- Colour is the foreground (`currentColor`, `Letterpress.ink`), which reverses in dark mode. No ochre variant ships until something sets the mark on `attention.wash`.
- `web-portal/tests/retired-tokens-repo.test.ts` enforces the §8 retired list across the repository. Records under `docs/design/letterpress`, `docs/design/archive`, `docs/superpowers`, `docs/features` and `docs/handoff` are exempt.
