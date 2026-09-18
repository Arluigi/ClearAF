# Letterpress PR 8: Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved ClearAF mark (4:5 frame, tucked italic "af") as code on iOS and the portal, place the lockup where PR 5 and PR 6 left text placeholders, redraw the app icon in light, dark and tinted, add the portal favicon and touch icon, and enforce the §8 retired-token list across the whole repository.

**Architecture:** One construction, written twice and tested for parity. `LetterpressMarkGeometry.swift` (CoreGraphics only) and `web-portal/src/components/brand/geometry.ts` hold the §10.2–10.5 numbers. The "af" is not set in a font. It is an outline path extracted from the bundled `Newsreader16pt-LightItalic.ttf` by a committed CoreText script, written to one generated Swift file and one generated TS file. SwiftUI draws the mark as a `Shape` and the portal draws it as inline SVG with `currentColor`. The icon renderer is compiled from the app's own geometry files, so the app icon, `apple-touch-icon.png`, `favicon.ico` and `favicon.svg` can't drift from the in-app mark.

**Tech Stack:** Swift 5 mode, SwiftUI, CoreText and CoreGraphics (macOS `swift`/`swiftc`), Swift Testing; Next.js 15 metadata, React 19 server rendering in Node's built-in test runner.

**Spec:** `docs/design/letterpress/spec.md` §10 (all of it), §8 last line (retired tokens). Visual ground truth: `docs/design/letterpress/logo-directions.dc.html` §4a (construction, specimens at 76/36/18, "In place" row), `portal.dc.html` (rail and sign-in lockups), `mobile.dc.html` screen 1. Master plan: `docs/superpowers/plans/2026-09-17-letterpress-redesign.md` (Global Constraints, PR 8 roadmap row). Placeholders being replaced: PR 5 plan (`2026-09-17-letterpress-pr5-workspace.md`: `Sidebar.tsx` Stethoscope head, `AuthShell.tsx` `data-placeholder="wordmark"`) and PR 6 plan (`2026-09-17-letterpress-pr6-ios-secondary.md` Task 3: `ClearAFWordmark`).

## Global Constraints

- Master plan constraints apply: no schema, RLS, auth or API change; no score, streak, grade, emoji or promised outcome; radii 0 · 4 · 26 · 999 only (the mark uses 0); sentence case.
- **§10.1:** single colour, no illustration, no gradient, no second colour, no fill behind the frame, no drop shadow.
- **§10.2 construction** (H = frame outer height): width `0.80 × H`; stroke `H ≥ 48: 0.028 × H`, `H 24–47: 0.05 × H (1.2–1.5px)`, `H < 24: 0.75px`; monogram `0.39 × H`; right inset `0.19 × frame width`; bottom inset `0.08 × H`; corner radius 0.
- **§10.3:** wordmark `clearaf`, Newsreader 300, letter-spacing `.18–.20em`, lowercase, italic `af`; gap `0.4 × H`; clear space `0.5 × H` on all sides; mark minimum 16px tall; lockup minimum 96px wide, below that the mark alone.
- **§10.4:** default ink #121312 on canvas/surface; reversed #EFEDE4 on ink or near-black; ochre #6E4709 on wash only. Never two colours, a fill behind the frame, a gradient, a shadow, or ochre on canvas.
- **§10.5:** light = ink mark on #F2EFE7, full-bleed, no radius in the artwork; dark = #EFEDE4 on #171716; tinted = monochrome on transparent; frame height 52% of the icon, optically 1.5% above centre; `Contents.json` declares all three; delete `generate_icon.py`.
- **§10.6:** inline SVG with `currentColor`; primary lockup in the nav rail head (H=25) and on sign-in (H=27); remove `Stethoscope` and the Next.js default SVGs; add `favicon.svg` (mark alone, ink) and a 180px `apple-touch-icon.png` (ink mark on canvas, full-bleed).
- **§8:** no reference anywhere to `#0B4D45`, `#C2552F`, `skinPeach`, `calmBlue`, `gentleGreen`, `softLavender`, `score*`, `glowShadow`, or any gradient.
- The portal is built by Vercel from `web-portal/` alone (`.vercelignore` drops `/ClearAF` and `/scripts`). Portal source must never import from outside `web-portal/`. Tests may read `../ClearAF` because CI checks out the whole repo.
- Don't add npm dependencies (CI runs `npm audit --audit-level=low`). Glyph extraction and icon rendering use the macOS toolchain only.
- Never read `.env*` (except `.env.example`), `.local/`, `handoff-*/` or `Local.generated.xcconfig`.
- iOS test command (called **TEST** below; append `-only-testing:ClearAFTests/<Suite>`, repeatable):
  ```bash
  xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
    -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
    -derivedDataPath /tmp/clearaf-build-lp8 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
    -only-testing:ClearAFTests/<Suite> test | xcbeautify
  ```
- Portal single test: `cd web-portal && node --import tsx --test tests/<file>`. Portal build: `NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build`.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (use a second `-m`).

## Decisions made while planning

1. **The "af" is outline paths, not live text, on both platforms.** The monogram sits a precise distance from a rule. With live text a font swap or fallback (`display: 'swap'`, a blocked Google Fonts request, a missing iOS registration) moves or reshapes the glyph and breaks the "no letterform touches a rule" guarantee. Outlines also serve the favicon, icon and touch icon, where no font is available. The wordmark `clearaf` stays live text: it's running type, it's selectable, and a fallback there only changes type, not construction. Outlines come from `ClearAF/Fonts/Newsreader16pt-LightItalic.ttf` via CoreText (`swift scripts/brand/extract-glyphs.swift`), which applies the font's kerning. The output is 4-decimal em coordinates, byte-identical on every run, and `--check` detects drift.
2. **One optical size (16pt) for every rendering.** The mark lives mostly at 10–20px monogram sizes, where the 16pt instance's sturdier hairlines hold. A single outline keeps the icon and the in-app mark identical (§10.4 "one asset serves every use").
3. **Where insets are measured, from the 4a specimen CSS.** The frame is `box-sizing: border-box` with the stroke inside H. The right and bottom insets are padding, so they are measured from the rule's **inner** edge. The letters are a line box at `line-height: 1`, so the right inset runs to the end of the "af" **advance** and the bottom inset to the bottom of the **line box**. The f's terminal ink overhangs the advance by 0.231em, which is why §10.2 asks for 0.19. The generator bakes this in: glyph origin = bottom-right of the line box, y down. Measured result at every H: right air 0.062 × H, descender exactly 0.08 × H above the inner rule.
4. **Stroke mid band is clamped:** `min(0.05 × H, 1.5)`. The literal `0.05 × H` reaches 2.35px at H=47, above the 1.34px the `H ≥ 48` rule gives. The spec's own parenthetical "(1.2–1.5px)" is the intent.
5. **Below H=16 the letters become a solid block**, as in the 4a 18px specimen: side `0.31 × H`, right inset `0.10 × width`, bottom inset `0.08 × H`. Only the favicon uses it, as a 13px frame in an 18-unit square, reproducing the specimen tile. §10.2 is silent on this. The specimen is the approved rendering.
6. **Wordmark size is `0.78 × H`.** The spec doesn't give one. The mockups use 19/25, 21/27 and 22/28. Weight is 300 per spec (mockups use 400), tracking 0.18em, italic "af".
7. **Lockup minimum width is computed, not measured.** `lockupWidth(H) = 0.8H + 0.4H + 0.78H × (advance("clear"+"af") + 7 × 0.18)`, with the advance (2.558em) emitted by the generator. The lockup drops to the mark alone below 96px, which happens at H ≤ 22. §10.3 also says "any space under 120px wide" for the mark alone. This PR follows the explicit 96px minimum.
8. **Placement heights:** portal rail H=25, portal sign-in H=27 (§10.6), iOS sign-in H=28 (the frame in `mobile.dc.html` screen 1, which matches PR 6's 22pt wordmark placeholder). The lockup is fixed-size on iOS: it's an image and doesn't follow Dynamic Type.
9. **Clear space is honoured by placement, not padding inside the component,** so layouts align to the frame edge. Rail: `px-4 pt-6` (16/24px) and the "Clinician" eyebrow moves from `mt-2` to `mt-3.5` (14px ≥ 12.5). The mockup's 7px gap breaks §10.3, and the spec wins. `AuthShell`: `px-6 py-8` and the `py-10` content column already clear 13.5px.
10. **Colour:** the mark takes the foreground (`currentColor` / `.foregroundStyle`). Placements use `text-ink` / `Letterpress.ink`, which already resolves to #EFEDE4 in dark mode, so "reversed" needs no variant. **No ochre variant ships.** Nothing in the product sets the mark on `attention.wash`. The favicon is the one asset outside the token system: `favicon.svg` fills #121312 and switches to #EFEDE4 under `prefers-color-scheme: dark` (reversed on near-black browser chrome, §10.4). `favicon.ico` and `apple-touch-icon.png` are ink on canvas, full-bleed.
11. **Icon rasters:** light and dark are opaque RGB (PNG colour type 2, no alpha, as App Store icons require). Tinted is a white mark on transparent (colour type 6); iOS derives the tint from luminance. The frame is 532.48px tall at (299.008, 230.4) in 1024. The appiconset stays in the asset-catalog format (no Icon Composer `.icon`).
12. **Retired-token sweep scope:** repo-wide over tracked and untracked-not-ignored text files. Exempt: records that name retired values on purpose (`docs/design/letterpress/`, `docs/design/archive/`, `docs/superpowers/`, `docs/features/`, `docs/handoff/`, `.superpowers/`), generated lockfiles, and the sweep files themselves. `score*` means design-token names (`\bscore[A-Z]\w*`) and exempts `backend/`, whose skin-score columns and response fields (`scoreHistory`, `recentScores`) are fenced by §0.

## File map

| File | Task | Responsibility |
|---|---|---|
| `scripts/brand/extract-glyphs.swift` | 1 | CoreText outline extraction → two generated files; `--check` |
| `ClearAF/Views/Brand/LetterpressMarkGlyphs.swift` | 1 | Generated: `path`, `wordmarkAdvanceEm` |
| `web-portal/src/components/brand/mark-glyphs.ts` | 1 | Generated: `MARK_GLYPH_PATH`, `WORDMARK_ADVANCE_EM` |
| `ClearAF/Views/Brand/LetterpressMarkGeometry.swift` | 1 | Construction constants, layout, one non-zero path, icon placement, path parser |
| `ClearAFTests/LetterpressMarkTests.swift` | 1 | Geometry unit tests |
| `web-portal/src/components/brand/geometry.ts` | 2 | Portal construction, `LOCKUP_HEIGHT` |
| `web-portal/src/components/brand/Mark.tsx`, `Lockup.tsx` | 2 | Inline SVG mark; horizontal lockup |
| `web-portal/tests/brand-mark.test.ts` | 2 | Geometry, Swift parity, markup |
| `ClearAF/Views/Brand/LetterpressMark.swift` | 3 | `LetterpressMark: Shape`, `LetterpressLockup: View` |
| `ClearAF/Views/AuthenticationView.swift`, `PasswordRecoveryView.swift` | 3 | Replace `ClearAFWordmark` |
| `ClearAFTests/PixelBuffer.swift`, `LetterpressLockupTests.swift`, `AuthPresentationTests.swift` | 3 | Pixel helper; render and placement tests; drop the placeholder test |
| `scripts/brand/render-icons.swift`, `render-icons.sh` | 4 | Renderer compiled with the geometry files |
| `ClearAF/Assets.xcassets/AppIcon.appiconset/*` | 4 | Three PNGs + `Contents.json`; ChatGPT PNG deleted |
| `web-portal/public/apple-touch-icon.png`, `public/favicon.svg`, `src/app/favicon.ico` | 4 | Rendered portal icons |
| `generate_icon.py` | 4 | Deleted |
| `ClearAFTests/AppIconTests.swift` | 4 | Contents contract, pixel checks, deletions |
| `web-portal/src/components/layout/Sidebar.tsx`, `AuthShell.tsx`, `src/app/layout.tsx` | 5 | Lockup placements; icon metadata |
| `web-portal/public/{next,vercel,file,globe,window}.svg` | 5 | Deleted |
| `web-portal/tests/identity-assets.test.ts`, `workspace.test.ts`, `auth-pages.test.ts` | 5 | Asset and placement tests; update PR 5 placeholder assertions |
| `web-portal/tests/retired-tokens-repo.test.ts` | 6 | Repo-wide §8 sweep, icon contract in CI |
| `ClearAFTests/LetterpressSweepTests.swift` | 6 | Swift + asset-catalog JSON sweep for values and generators |
| `docs/design/design-language.md` | 6 | Identity section |

Task order: 1 → (2, 3, 4 in any order) → 5 (needs 2 and 4) → 6 (needs 4) → 7.

---

### Task 1: Mark construction and generated "af" outlines [judgment]

**Files:**
- Create: `scripts/brand/extract-glyphs.swift`
- Create (generated by the script): `ClearAF/Views/Brand/LetterpressMarkGlyphs.swift`, `web-portal/src/components/brand/mark-glyphs.ts`
- Create: `ClearAF/Views/Brand/LetterpressMarkGeometry.swift`
- Test: `ClearAFTests/LetterpressMarkTests.swift`

**Interfaces:**
- Consumes: `ClearAF/Fonts/Newsreader16pt-LightItalic.ttf`, `Newsreader16pt-Light.ttf` (PR 1).
- Produces:
  - `enum LetterpressMarkGlyphs` with `static let path: String` (M/L/Q/C/Z commands, em units, y down, origin at the bottom-right of the "af" line box) and `static let wordmarkAdvanceEm: CGFloat` (2.558).
  - TS `MARK_GLYPH_PATH: string` (identical string) and `WORDMARK_ADVANCE_EM: number` in `web-portal/src/components/brand/mark-glyphs.ts`.
  - `enum LetterpressMarkGeometry` with these members:
    - `CGFloat` constants: `aspect`, `monogramRatio`, `rightInsetRatio`, `bottomInsetRatio`, `cornerRadius`, `hairline`, `midBandMaximum`, `blockBelowHeight`, `blockSideRatio`, `blockRightInsetRatio`, `clearSpaceRatio`, `lockupGapRatio`, `wordmarkSizeRatio`, `wordmarkTrackingEm`, `lockupMinimumWidth`, `iconFrameRatio`, `iconLiftRatio`.
    - `width(height:)`, `stroke(height:)`, `usesBlock(height:)`, `monogramSize(height:)`, `clearSpace(height:)`, `lockupGap(height:)`, `wordmarkSize(height:)`, `lockupWidth(height:)`, `showsWordmark(height:) -> Bool`.
    - `monogramAnchor(height:) -> CGPoint`, `block(height:) -> CGRect`, `path(height:origin:) -> CGPath` (non-zero fill), `iconPlacement(side:frameRatio:) -> (height: CGFloat, origin: CGPoint)`.
    - `glyphs: CGPath`, `parse(_:) -> CGPath`.
  - The geometry file imports CoreGraphics only, because Task 4 compiles it into a macOS tool.

- [ ] **Step 1: Create the worktree** (superpowers:using-git-worktrees): branch `design/letterpress-8-identity` from `origin/main` after PR 7 merges, at `.claude/worktrees/letterpress-8`. Confirm PR 5 and PR 6 landed: `grep -rn 'data-placeholder="wordmark"' web-portal/src` finds `AuthShell.tsx`, and `grep -rn "struct ClearAFWordmark" ClearAF` finds `AuthenticationView.swift`.

- [ ] **Step 2: Write the failing test.** Create `ClearAFTests/LetterpressMarkTests.swift`:

```swift
import CoreGraphics
import Foundation
import Testing
@testable import ClearAF

/// Spec §10.2–10.5 construction numbers, written out so a change to the mark has to change a test.
struct LetterpressMarkTests {
    typealias G = LetterpressMarkGeometry

    static func near(_ actual: CGFloat, _ expected: CGFloat, _ tolerance: CGFloat = 1e-9) -> Bool {
        abs(actual - expected) <= tolerance
    }

    @Test func constructionConstantsAreTheSpecNumbers() {
        #expect(G.aspect == 0.80)
        #expect(G.monogramRatio == 0.39)
        #expect(G.rightInsetRatio == 0.19)
        #expect(G.bottomInsetRatio == 0.08)
        #expect(G.cornerRadius == 0)
        #expect(G.hairline == 0.75)
        #expect(G.clearSpaceRatio == 0.5)
        #expect(G.lockupGapRatio == 0.4)
        #expect(G.wordmarkTrackingEm >= 0.18 && G.wordmarkTrackingEm <= 0.20)
        #expect(G.lockupMinimumWidth == 96)
        #expect(G.iconFrameRatio == 0.52)
        #expect(G.iconLiftRatio == 0.015)
    }

    @Test func strokeFollowsTheHeightBands() {
        #expect(Self.near(G.stroke(height: 72), 2.016))
        #expect(Self.near(G.stroke(height: 48), 1.344))
        #expect(G.stroke(height: 47) == 1.5)
        #expect(Self.near(G.stroke(height: 28), 1.4))
        #expect(Self.near(G.stroke(height: 25), 1.25))
        #expect(Self.near(G.stroke(height: 24), 1.2))
        #expect(G.stroke(height: 23) == 0.75)
        #expect(G.stroke(height: 13) == 0.75)
    }

    @Test func monogramIsPlacedByTheInsetsFromTheInnerRules() {
        #expect(Self.near(G.width(height: 25), 20))
        let rail = G.monogramAnchor(height: 25)
        #expect(Self.near(rail.x, 14.95))
        #expect(Self.near(rail.y, 21.75))
        #expect(Self.near(G.monogramSize(height: 25), 9.75))
        let large = G.monogramAnchor(height: 72)
        #expect(Self.near(large.x, 44.64))
        #expect(Self.near(large.y, 64.224))
    }

    @Test func noLetterformTouchesARule() {
        let glyph = G.glyphs.boundingBoxOfPath
        for height in [16, 23, 25, 27, 28, 50, 72, 532.48] as [CGFloat] {
            let s = G.stroke(height: height), w = G.width(height: height)
            let size = G.monogramSize(height: height), anchor = G.monogramAnchor(height: height)
            let right = (w - s) - (anchor.x + glyph.maxX * size)
            let bottom = (height - s) - (anchor.y + glyph.maxY * size)
            let top = (anchor.y + glyph.minY * size) - s
            let left = (anchor.x + glyph.minX * size) - s
            #expect(right > 0.05 * height, "f terminal crowds the right rule at H=\(height)")
            #expect(Self.near(bottom, 0.08 * height, 1e-6), "descender is not 0.08 × H above the rule at H=\(height)")
            #expect(top > 0 && left > 0, "letters leave the frame at H=\(height)")
        }
    }

    @Test func generatedOutlineIsNewsreaderLightItalicAF() {
        #expect(LetterpressMarkGlyphs.path.hasPrefix("M"))
        #expect(LetterpressMarkGlyphs.path.hasSuffix("Z"))
        #expect(LetterpressMarkGlyphs.path.allSatisfy { "MLQCZ0123456789.- ".contains($0) })
        let box = G.glyphs.boundingBoxOfPath
        #expect(Self.near(box.minX, -0.6885, 1e-4))
        #expect(Self.near(box.minY, -0.9745, 1e-4))
        #expect(Self.near(box.maxX, 0.231, 1e-4))
        #expect(Self.near(box.maxY, 0, 1e-4))
        #expect(Self.near(LetterpressMarkGlyphs.wordmarkAdvanceEm, 2.558, 1e-3))
    }

    @Test func marksUnderTheFaviconFloorBecomeASolidBlock() {
        #expect(G.usesBlock(height: 13))
        #expect(!G.usesBlock(height: 16))
        let block = G.block(height: 13)
        #expect(Self.near(block.width, 4.03) && Self.near(block.height, 4.03))
        #expect(Self.near(block.minX, 4.58))
        #expect(Self.near(block.minY, 7.18))
    }

    @Test func lockupSpacingAndMinimumWidth() {
        #expect(Self.near(G.lockupGap(height: 25), 10))
        #expect(Self.near(G.clearSpace(height: 27), 13.5))
        #expect(Self.near(G.wordmarkSize(height: 28), 21.84))
        #expect(Self.near(G.lockupWidth(height: 25), 104.451, 1e-3))
        #expect(!G.showsWordmark(height: 22))
        #expect(G.showsWordmark(height: 23))
    }

    @Test func iconFrameIsFiftyTwoPercentLiftedAboveCentre() {
        let placement = G.iconPlacement(side: 1024)
        #expect(Self.near(placement.height, 532.48))
        #expect(Self.near(placement.origin.x, 299.008))
        #expect(Self.near(placement.origin.y, 230.4))
        let below = 1024 - (placement.origin.y + placement.height)
        #expect(Self.near(below - placement.origin.y, 30.72, 1e-6))
    }

    @Test func pathIsOneNonZeroFilledShape() {
        let path = G.path(height: 72)
        #expect(path.contains(CGPoint(x: 1, y: 36), using: .winding))
        #expect(path.contains(CGPoint(x: 28.8, y: 71), using: .winding))
        #expect(!path.contains(CGPoint(x: 28, y: 20), using: .winding))
        #expect(!path.contains(CGPoint(x: -1, y: 36), using: .winding))
        let box = path.boundingBoxOfPath
        #expect(Self.near(box.minX, 0) && Self.near(box.minY, 0))
        #expect(Self.near(box.width, 57.6) && Self.near(box.height, 72))
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/LetterpressMarkTests`
Expected: build FAIL, `cannot find 'LetterpressMarkGeometry' in scope`.

- [ ] **Step 4: Create `scripts/brand/extract-glyphs.swift`**

```swift
// Extracts the ClearAF mark's "af" monogram as outline path data from the bundled font and writes it
// for both clients. Run from the repository root:
//   swift scripts/brand/extract-glyphs.swift          (writes)
//   swift scripts/brand/extract-glyphs.swift --check  (exits 1 if the committed files differ)
// Output is plain text with 4-decimal em coordinates, so it is byte-identical on every run.
import CoreGraphics
import CoreText
import Foundation

let italicFont = "ClearAF/Fonts/Newsreader16pt-LightItalic.ttf"
let romanFont = "ClearAF/Fonts/Newsreader16pt-Light.ttf"
let swiftOutput = "ClearAF/Views/Brand/LetterpressMarkGlyphs.swift"
let tsOutput = "web-portal/src/components/brand/mark-glyphs.ts"

func loadFont(_ path: String) -> CTFont {
    guard let data = FileManager.default.contents(atPath: path),
          let descriptor = CTFontManagerCreateFontDescriptorFromData(data as CFData) else {
        FileHandle.standardError.write("Cannot read \(path). Run from the repository root.\n".data(using: .utf8)!)
        exit(2)
    }
    let probe = CTFontCreateWithFontDescriptor(descriptor, 12, nil)
    // Size the font at its units-per-em so CoreText coordinates are font units.
    return CTFontCreateWithFontDescriptor(descriptor, CGFloat(CTFontGetUnitsPerEm(probe)), nil)
}

func number(_ value: CGFloat) -> String {
    var text = String(format: "%.4f", Double(value))
    while text.hasSuffix("0") { text.removeLast() }
    if text.hasSuffix(".") { text.removeLast() }
    return text == "-0" ? "0" : text
}

/// Advance width of `text` in em, kerning applied by CoreText.
func advanceEm(_ text: String, _ font: CTFont) -> CGFloat {
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [kCTFontAttributeName as NSAttributedString.Key: font]))
    return CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil)) / CTFontGetSize(font)
}

let italic = loadFont(italicFont)
let roman = loadFont(romanFont)
let upm = CTFontGetSize(italic)
let line = CTLineCreateWithAttributedString(NSAttributedString(string: "af", attributes: [kCTFontAttributeName as NSAttributedString.Key: italic]))
let advanceEnd = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
let ascent = CTFontGetAscent(italic) / upm
let descent = CTFontGetDescent(italic) / upm
// A CSS line box at line-height 1 puts the baseline (1 + descent - ascent) / 2 em above its bottom edge.
let baselineAboveBottom = (1 + descent - ascent) / 2

var commands: [String] = []
for run in CTLineGetGlyphRuns(line) as! [CTRun] {
    let count = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: count)
    var positions = [CGPoint](repeating: .zero, count: count)
    CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: 0), &positions)
    for index in 0..<count {
        guard let outline = CTFontCreatePathForGlyph(italic, glyphs[index], nil) else { continue }
        let offset = positions[index].x
        // Em units, y down, origin at the bottom-right corner of the line box.
        func point(_ p: CGPoint) -> String {
            "\(number((p.x + offset - advanceEnd) / upm)) \(number(-p.y / upm - baselineAboveBottom))"
        }
        outline.applyWithBlock { element in
            let e = element.pointee
            switch e.type {
            case .moveToPoint: commands.append("M\(point(e.points[0]))")
            case .addLineToPoint: commands.append("L\(point(e.points[0]))")
            case .addQuadCurveToPoint: commands.append("Q\(point(e.points[0])) \(point(e.points[1]))")
            case .addCurveToPoint: commands.append("C\(point(e.points[0])) \(point(e.points[1])) \(point(e.points[2]))")
            case .closeSubpath: commands.append("Z")
            @unknown default: break
            }
        }
    }
}
let path = commands.joined()
let wordmarkEm = number(advanceEm("clear", roman) + advanceEm("af", italic))
let header = "Generated by scripts/brand/extract-glyphs.swift from \(italicFont). Do not edit."

let swiftFile = """
// \(header)
import CoreGraphics

enum LetterpressMarkGlyphs {
    /// The "af" monogram in em units, y down, origin at the bottom-right of its line box (line-height 1).
    static let path = "\(path)"
    /// Advance of "clear" (Newsreader Light) + "af" (Light Italic) in em, before tracking.
    static let wordmarkAdvanceEm: CGFloat = \(wordmarkEm)
}

"""
let tsFile = """
// \(header)

/** The "af" monogram in em units, y down, origin at the bottom-right of its line box (line-height 1). */
export const MARK_GLYPH_PATH = "\(path)";
/** Advance of "clear" (Newsreader Light) + "af" (Light Italic) in em, before tracking. */
export const WORDMARK_ADVANCE_EM = \(wordmarkEm);

"""

let check = CommandLine.arguments.contains("--check")
var stale: [String] = []
for (file, text) in [(swiftOutput, swiftFile), (tsOutput, tsFile)] {
    if check {
        if (try? String(contentsOfFile: file, encoding: .utf8)) != text { stale.append(file) }
    } else {
        try! FileManager.default.createDirectory(atPath: (file as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
        try! text.write(toFile: file, atomically: true, encoding: .utf8)
        print("wrote \(file)")
    }
}
if check {
    if stale.isEmpty { print("mark glyphs are current") } else { print("stale: \(stale.joined(separator: ", "))"); exit(1) }
}
```

- [ ] **Step 5: Generate the outlines and confirm they're reproducible**

Run: `swift scripts/brand/extract-glyphs.swift && swift scripts/brand/extract-glyphs.swift --check`
Expected:
```
wrote ClearAF/Views/Brand/LetterpressMarkGlyphs.swift
wrote web-portal/src/components/brand/mark-glyphs.ts
mark glyphs are current
```
Then `head -c 120 web-portal/src/components/brand/mark-glyphs.ts | tail -c 40` should show the path starting `M-0.453 -0.292L-0.408 -0.427Q`, and `grep wordmarkAdvanceEm ClearAF/Views/Brand/LetterpressMarkGlyphs.swift` should end `= 2.558`. If the numbers differ, the font file changed; stop and ask.

- [ ] **Step 6: Create `ClearAF/Views/Brand/LetterpressMarkGeometry.swift`**

```swift
import CoreGraphics

/// Construction of the ClearAF mark (spec §10.2–10.5). H is the frame's outer height; every measure derives from it.
/// CoreGraphics only: scripts/brand/render-icons.sh compiles this file into the icon renderer.
/// web-portal/src/components/brand/geometry.ts mirrors these constants; web-portal/tests/brand-mark.test.ts keeps them equal.
enum LetterpressMarkGeometry {
    static let aspect: CGFloat = 0.80
    static let monogramRatio: CGFloat = 0.39
    /// × frame width, from the inner edge of the right rule to the end of the "af" advance.
    static let rightInsetRatio: CGFloat = 0.19
    /// × H, from the inner edge of the bottom rule to the bottom of the "af" line box.
    static let bottomInsetRatio: CGFloat = 0.08
    static let cornerRadius: CGFloat = 0
    static let hairline: CGFloat = 0.75
    /// The 24–47 band is 0.05 × H, held to the spec's stated 1.2–1.5px.
    static let midBandMaximum: CGFloat = 1.5
    /// Below this height the letters become a solid block (logo-directions §4a, 18px specimen).
    static let blockBelowHeight: CGFloat = 16
    static let blockSideRatio: CGFloat = 0.31
    static let blockRightInsetRatio: CGFloat = 0.10
    static let clearSpaceRatio: CGFloat = 0.5
    static let lockupGapRatio: CGFloat = 0.4
    static let wordmarkSizeRatio: CGFloat = 0.78
    static let wordmarkTrackingEm: CGFloat = 0.18
    static let lockupMinimumWidth: CGFloat = 96
    static let iconFrameRatio: CGFloat = 0.52
    static let iconLiftRatio: CGFloat = 0.015

    static func width(height: CGFloat) -> CGFloat { height * aspect }

    static func stroke(height: CGFloat) -> CGFloat {
        if height >= 48 { return 0.028 * height }
        if height >= 24 { return min(0.05 * height, midBandMaximum) }
        return hairline
    }

    static func usesBlock(height: CGFloat) -> Bool { height < blockBelowHeight }
    static func monogramSize(height: CGFloat) -> CGFloat { monogramRatio * height }
    static func clearSpace(height: CGFloat) -> CGFloat { clearSpaceRatio * height }
    static func lockupGap(height: CGFloat) -> CGFloat { lockupGapRatio * height }
    static func wordmarkSize(height: CGFloat) -> CGFloat { wordmarkSizeRatio * height }

    /// Natural width of mark + gap + tracked wordmark (tracking follows each of the 7 letters, as CSS and SwiftUI apply it).
    static func lockupWidth(height: CGFloat) -> CGFloat {
        let size = wordmarkSize(height: height)
        return width(height: height) + lockupGap(height: height) + size * (LetterpressMarkGlyphs.wordmarkAdvanceEm + 7 * wordmarkTrackingEm)
    }

    /// Spec §10.3: below 96 wide the lockup drops to the mark alone.
    static func showsWordmark(height: CGFloat) -> Bool { lockupWidth(height: height) >= lockupMinimumWidth }

    /// Bottom-right corner of the monogram's line box, relative to the frame's top-left.
    static func monogramAnchor(height: CGFloat) -> CGPoint {
        let s = stroke(height: height), w = width(height: height)
        return CGPoint(x: w - s - rightInsetRatio * w, y: height - s - bottomInsetRatio * height)
    }

    static func block(height: CGFloat) -> CGRect {
        let s = stroke(height: height), w = width(height: height), side = blockSideRatio * height
        return CGRect(x: w - s - blockRightInsetRatio * w - side, y: height - s - bottomInsetRatio * height - side, width: side, height: side)
    }

    /// The whole mark as one path for a non-zero fill: frame ring (outer and inner wound in opposite directions) plus the letters.
    static func path(height: CGFloat, origin: CGPoint = .zero) -> CGPath {
        let path = CGMutablePath()
        let w = width(height: height), s = stroke(height: height)
        let outer = CGRect(x: origin.x, y: origin.y, width: w, height: height)
        let inner = outer.insetBy(dx: s, dy: s)
        path.move(to: CGPoint(x: outer.minX, y: outer.minY))
        path.addLine(to: CGPoint(x: outer.maxX, y: outer.minY))
        path.addLine(to: CGPoint(x: outer.maxX, y: outer.maxY))
        path.addLine(to: CGPoint(x: outer.minX, y: outer.maxY))
        path.closeSubpath()
        path.move(to: CGPoint(x: inner.minX, y: inner.minY))
        path.addLine(to: CGPoint(x: inner.minX, y: inner.maxY))
        path.addLine(to: CGPoint(x: inner.maxX, y: inner.maxY))
        path.addLine(to: CGPoint(x: inner.maxX, y: inner.minY))
        path.closeSubpath()
        if usesBlock(height: height) {
            path.addRect(block(height: height).offsetBy(dx: origin.x, dy: origin.y))
        } else {
            let anchor = monogramAnchor(height: height), size = monogramSize(height: height)
            let transform = CGAffineTransform(translationX: origin.x + anchor.x, y: origin.y + anchor.y).scaledBy(x: size, y: size)
            path.addPath(glyphs, transform: transform)
        }
        return path
    }

    /// Frame height and top-left for a mark centred in a square, lifted by `iconLiftRatio` of the side (spec §10.5).
    static func iconPlacement(side: CGFloat, frameRatio: CGFloat = iconFrameRatio) -> (height: CGFloat, origin: CGPoint) {
        let height = side * frameRatio
        return (height, CGPoint(x: (side - width(height: height)) / 2, y: (side - height) / 2 - iconLiftRatio * side))
    }

    static let glyphs: CGPath = parse(LetterpressMarkGlyphs.path)

    /// Parses the generated M/L/Q/C/Z path data (absolute commands, space-separated numbers).
    static func parse(_ data: String) -> CGPath {
        let path = CGMutablePath()
        var numbers: [CGFloat] = [], command: Character = " ", token = ""
        func flushNumber() {
            if let value = Double(token) { numbers.append(CGFloat(value)) }
            token = ""
        }
        func emit() {
            let p = stride(from: 0, to: numbers.count - 1, by: 2).map { CGPoint(x: numbers[$0], y: numbers[$0 + 1]) }
            switch command {
            case "M": path.move(to: p[0])
            case "L": path.addLine(to: p[0])
            case "Q": path.addQuadCurve(to: p[1], control: p[0])
            case "C": path.addCurve(to: p[2], control1: p[0], control2: p[1])
            case "Z": path.closeSubpath()
            default: break
            }
            numbers = []
        }
        for character in data {
            if "MLQCZ".contains(character) {
                flushNumber()
                if command != " " { emit() }
                command = character
            } else if character == " " {
                flushNumber()
            } else if character == "-" && !token.isEmpty {
                flushNumber()
                token = "-"
            } else {
                token.append(character)
            }
        }
        flushNumber()
        if command != " " { emit() }
        return path
    }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/LetterpressMarkTests`
Expected: `Test run with 9 tests passed`. The new files are picked up by the synchronized `ClearAF` and `ClearAFTests` groups, with no project file edit. Also run `-only-testing:ClearAFTests/LetterpressSweepTests` and expect PASS: the new files contain no hue, radius or retired names.

- [ ] **Step 8: Commit**

```bash
git add scripts/brand/extract-glyphs.swift ClearAF/Views/Brand/LetterpressMarkGeometry.swift ClearAF/Views/Brand/LetterpressMarkGlyphs.swift web-portal/src/components/brand/mark-glyphs.ts ClearAFTests/LetterpressMarkTests.swift
git commit -m "brand: mark construction and af outlines generated from Newsreader Light Italic" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Portal `Mark` and `Lockup` as inline SVG [judgment]

**Files:**
- Create: `web-portal/src/components/brand/geometry.ts`, `web-portal/src/components/brand/Mark.tsx`, `web-portal/src/components/brand/Lockup.tsx`
- Test: `web-portal/tests/brand-mark.test.ts`

**Interfaces:**
- Consumes: Task 1 `MARK_GLYPH_PATH`, `WORDMARK_ADVANCE_EM`; the Swift constants in `ClearAF/Views/Brand/LetterpressMarkGeometry.swift` (read by the parity test); `cn` from `@/lib/utils`; Tailwind `font-display` (PR 1).
- Produces:
  - `MARK` (same 17 keys and values as the Swift `CGFloat` constants) and `LOCKUP_HEIGHT = { rail: 25, signIn: 27 }`.
  - `markStroke(h)`, `markLayout(h): MarkLayout` (`width`, `height`, `stroke`, `monogramSize`, `anchor {x,y}`, `block {x,y,side} | null`), `clearSpace(h)`, `lockupGap(h)`, `wordmarkSize(h)`, `lockupWidth(h)`, `showsWordmark(h)`, `svgNumber(v)`.
  - `Mark({ height, title?, className? })`: an `<svg>` with `fill="currentColor"` and `data-mark-height`. It is `aria-hidden` unless `title` is given (then `role="img"` and `aria-label`).
  - `Lockup({ height, className? })`: a `flex w-fit items-center` row with the mark, the wordmark and `<span class="sr-only">ClearAF</span>`, or a `block` mark titled "ClearAF" when `showsWordmark(height)` is false.

- [ ] **Step 1: Write the failing test.** Create `web-portal/tests/brand-mark.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Lockup } from '../src/components/brand/Lockup';
import { Mark } from '../src/components/brand/Mark';
import { LOCKUP_HEIGHT, MARK, clearSpace, lockupGap, lockupWidth, markLayout, markStroke, showsWordmark, wordmarkSize } from '../src/components/brand/geometry';
import { MARK_GLYPH_PATH, WORDMARK_ADVANCE_EM } from '../src/components/brand/mark-glyphs';

const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ${expected}`);

test('construction constants are the spec §10.2–10.5 numbers', () => {
  assert.equal(MARK.aspect, 0.8);
  assert.equal(MARK.monogramRatio, 0.39);
  assert.equal(MARK.rightInsetRatio, 0.19);
  assert.equal(MARK.bottomInsetRatio, 0.08);
  assert.equal(MARK.cornerRadius, 0);
  assert.equal(MARK.hairline, 0.75);
  assert.equal(MARK.clearSpaceRatio, 0.5);
  assert.equal(MARK.lockupGapRatio, 0.4);
  assert.ok(MARK.wordmarkTrackingEm >= 0.18 && MARK.wordmarkTrackingEm <= 0.2);
  assert.equal(MARK.lockupMinimumWidth, 96);
  assert.equal(MARK.iconFrameRatio, 0.52);
  assert.equal(MARK.iconLiftRatio, 0.015);
  assert.deepEqual(LOCKUP_HEIGHT, { rail: 25, signIn: 27 });
});

test('stroke follows the height bands', () => {
  near(markStroke(72), 2.016);
  near(markStroke(48), 1.344);
  assert.equal(markStroke(47), 1.5);
  near(markStroke(27), 1.35);
  near(markStroke(25), 1.25);
  near(markStroke(24), 1.2);
  assert.equal(markStroke(23), 0.75);
  assert.equal(markStroke(13), 0.75);
});

test('monogram sits 0.19 × width and 0.08 × H inside the rules; small marks use the block', () => {
  const rail = markLayout(25);
  near(rail.width, 20);
  near(rail.anchor.x, 14.95);
  near(rail.anchor.y, 21.75);
  near(rail.monogramSize, 9.75);
  assert.equal(rail.block, null);
  const large = markLayout(72);
  near(large.anchor.x, 44.64);
  near(large.anchor.y, 64.224);
  const favicon = markLayout(13);
  assert.ok(favicon.block);
  near(favicon.block.side, 4.03);
  near(favicon.block.x, 4.58);
  near(favicon.block.y, 7.18);
  assert.equal(markLayout(16).block, null);
});

test('lockup gap, clear space, wordmark size and the 96px minimum', () => {
  near(lockupGap(25), 10);
  near(clearSpace(27), 13.5);
  near(wordmarkSize(28), 21.84);
  near(lockupWidth(25), 104.451, 1e-3);
  assert.equal(showsWordmark(22), false);
  assert.equal(showsWordmark(23), true);
});

test('portal and iOS share one construction and one outline', () => {
  const geometry = readFileSync('../ClearAF/Views/Brand/LetterpressMarkGeometry.swift', 'utf8');
  const glyphs = readFileSync('../ClearAF/Views/Brand/LetterpressMarkGlyphs.swift', 'utf8');
  const swift = Object.fromEntries([...geometry.matchAll(/static let (\w+): CGFloat = ([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(swift, { ...MARK });
  assert.equal(glyphs.match(/static let path = "([^"]+)"/)?.[1], MARK_GLYPH_PATH);
  assert.equal(Number(glyphs.match(/wordmarkAdvanceEm: CGFloat = ([\d.]+)/)?.[1]), WORDMARK_ADVANCE_EM);
  assert.match(MARK_GLYPH_PATH, /^M[MLQCZ\d. -]+Z$/);
});

test('mark: one colour from currentColor, filled ring, outline letters, no font or effects', () => {
  const html = renderToStaticMarkup(h(Mark, { height: 25 }));
  assert.match(html, /^<svg [^>]*width="20" height="25" viewBox="0 0 20 25" fill="currentColor"/);
  assert.match(html, /aria-hidden="true"/);
  assert.ok(html.includes('<path fill-rule="evenodd" d="M0 0H20V25H0ZM1.25 1.25H18.75V23.75H1.25Z"></path>'));
  assert.ok(html.includes(`d="${MARK_GLYPH_PATH}" transform="translate(14.95 21.75) scale(9.75)"`));
  assert.doesNotMatch(html, /<text|font-family|#[0-9a-f]{3,6}\b|stroke=|rx=|gradient|filter|opacity/i);
});

test('mark under the favicon floor draws the block and can carry a name', () => {
  const html = renderToStaticMarkup(h(Mark, { height: 13, title: 'ClearAF' }));
  assert.match(html, /role="img" aria-label="ClearAF"/);
  assert.ok(html.includes('<rect x="4.58" y="7.18" width="4.03" height="4.03"></rect>'));
  assert.ok(!html.includes(MARK_GLYPH_PATH));
});

test('lockup: mark, 0.4 × H gap, Newsreader 300 tracked 0.18em with italic af, one accessible name', () => {
  const html = renderToStaticMarkup(h(Lockup, { height: LOCKUP_HEIGHT.signIn }));
  assert.match(html, /^<div class="flex w-fit items-center" style="gap:10.8px">/);
  assert.match(html, /data-mark-height="27"/);
  assert.match(html, /<span aria-hidden="true" class="font-display font-light lowercase leading-none tracking-\[0.18em\]" style="font-size:21.06px">clear<span class="italic">af<\/span><\/span>/);
  assert.equal((html.match(/ClearAF/g) ?? []).length, 1);
  assert.match(html, /<span class="sr-only">ClearAF<\/span>/);
});

test('lockup below 96px wide is the mark alone', () => {
  const html = renderToStaticMarkup(h(Lockup, { height: 22, className: 'text-ink' }));
  assert.match(html, /^<svg [^>]*class="block text-ink" role="img" aria-label="ClearAF"/);
  assert.doesNotMatch(html, /clear<span/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/brand-mark.test.ts`
Expected: FAIL, `Cannot find module '../src/components/brand/Lockup'`.

- [ ] **Step 3: Create `web-portal/src/components/brand/geometry.ts`**

```ts
import { WORDMARK_ADVANCE_EM } from './mark-glyphs';

/**
 * Construction of the ClearAF mark (spec §10.2–10.5). H is the frame's outer height; every measure derives from it.
 * Mirrors ClearAF/Views/Brand/LetterpressMarkGeometry.swift; tests/brand-mark.test.ts keeps the two identical.
 */
export const MARK = {
  aspect: 0.8,
  monogramRatio: 0.39,
  rightInsetRatio: 0.19,
  bottomInsetRatio: 0.08,
  cornerRadius: 0,
  hairline: 0.75,
  midBandMaximum: 1.5,
  blockBelowHeight: 16,
  blockSideRatio: 0.31,
  blockRightInsetRatio: 0.1,
  clearSpaceRatio: 0.5,
  lockupGapRatio: 0.4,
  wordmarkSizeRatio: 0.78,
  wordmarkTrackingEm: 0.18,
  lockupMinimumWidth: 96,
  iconFrameRatio: 0.52,
  iconLiftRatio: 0.015,
} as const;

export type MarkLayout = {
  width: number;
  height: number;
  stroke: number;
  monogramSize: number;
  /** Bottom-right of the monogram's line box, from the frame's top-left. */
  anchor: { x: number; y: number };
  /** Solid block that replaces the letters below the favicon floor; null when the letters are drawn. */
  block: { x: number; y: number; side: number } | null;
};

export function markStroke(height: number): number {
  if (height >= 48) return 0.028 * height;
  if (height >= 24) return Math.min(0.05 * height, MARK.midBandMaximum);
  return MARK.hairline;
}

export function markLayout(height: number): MarkLayout {
  const width = MARK.aspect * height;
  const stroke = markStroke(height);
  const bottom = height - stroke - MARK.bottomInsetRatio * height;
  const side = MARK.blockSideRatio * height;
  return {
    width,
    height,
    stroke,
    monogramSize: MARK.monogramRatio * height,
    anchor: { x: width - stroke - MARK.rightInsetRatio * width, y: bottom },
    block: height < MARK.blockBelowHeight ? { x: width - stroke - MARK.blockRightInsetRatio * width - side, y: bottom - side, side } : null,
  };
}

export const clearSpace = (height: number): number => MARK.clearSpaceRatio * height;
export const lockupGap = (height: number): number => MARK.lockupGapRatio * height;
export const wordmarkSize = (height: number): number => MARK.wordmarkSizeRatio * height;

/** Natural width of mark + gap + tracked wordmark (tracking follows each of the 7 letters, as CSS applies it). */
export function lockupWidth(height: number): number {
  return MARK.aspect * height + lockupGap(height) + wordmarkSize(height) * (WORDMARK_ADVANCE_EM + 7 * MARK.wordmarkTrackingEm);
}

/** Spec §10.3: below 96px wide the lockup drops to the mark alone. */
export const showsWordmark = (height: number): boolean => lockupWidth(height) >= MARK.lockupMinimumWidth;

/** Rounds for stable SVG markup. */
export const svgNumber = (value: number): string => String(Math.round(value * 1000) / 1000);

/** Frame heights where the lockup is placed (spec §10.6). */
export const LOCKUP_HEIGHT = { rail: 25, signIn: 27 } as const;
```

- [ ] **Step 4: Create `web-portal/src/components/brand/Mark.tsx`**

```tsx
import * as React from 'react';
import { markLayout, svgNumber as n } from './geometry';
import { MARK_GLYPH_PATH } from './mark-glyphs';

type MarkProps = {
  /** Frame height in px (H). */
  height: number;
  /** Accessible name; omit when a visible or screen-reader label sits beside the mark. */
  title?: string;
  className?: string;
};

/**
 * The ClearAF mark (spec §10): a 4:5 frame with the italic "af" tucked bottom-right, one colour (currentColor).
 * The letters are outline paths generated from Newsreader Light Italic, so they never fall back to another font.
 */
export function Mark({ height, title, className }: MarkProps): React.JSX.Element {
  const { width, stroke: s, monogramSize, anchor, block } = markLayout(height);
  const ring = `M0 0H${n(width)}V${n(height)}H0ZM${n(s)} ${n(s)}H${n(width - s)}V${n(height - s)}H${n(s)}Z`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={n(width)}
      height={n(height)}
      viewBox={`0 0 ${n(width)} ${n(height)}`}
      fill="currentColor"
      focusable="false"
      className={className}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
      data-mark-height={height}
    >
      <path fillRule="evenodd" d={ring} />
      {block ? (
        <rect x={n(block.x)} y={n(block.y)} width={n(block.side)} height={n(block.side)} />
      ) : (
        <path d={MARK_GLYPH_PATH} transform={`translate(${n(anchor.x)} ${n(anchor.y)}) scale(${n(monogramSize)})`} />
      )}
    </svg>
  );
}
```

- [ ] **Step 5: Create `web-portal/src/components/brand/Lockup.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';
import { lockupGap, showsWordmark, svgNumber as n, wordmarkSize } from './geometry';
import { Mark } from './Mark';

type LockupProps = {
  /** Frame height of the mark in px (H). The wordmark, gap and fallback derive from it. */
  height: number;
  className?: string;
};

/**
 * Primary horizontal lockup (spec §10.3): mark + "clearaf" in Newsreader 300, tracked 0.18em, italic "af",
 * gap 0.4 × H, centred on each other. Below 96px wide it renders the mark alone.
 * Placements keep 0.5 × H clear on every side (clearSpace in ./geometry).
 */
export function Lockup({ height, className }: LockupProps): React.JSX.Element {
  if (!showsWordmark(height)) return <Mark height={height} title="ClearAF" className={cn('block', className)} />;
  return (
    <div className={cn('flex w-fit items-center', className)} style={{ gap: `${n(lockupGap(height))}px` }}>
      <Mark height={height} />
      <span aria-hidden className="font-display font-light lowercase leading-none tracking-[0.18em]" style={{ fontSize: `${n(wordmarkSize(height))}px` }}>
        clear<span className="italic">af</span>
      </span>
      <span className="sr-only">ClearAF</span>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd web-portal && node --import tsx --test tests/brand-mark.test.ts tests/letterpress-sweep.test.ts`
Expected: `ℹ fail 0`; all 9 brand-mark tests pass, and the sweep tests stay green (no hex, hue, alias or radius in the new files).
Run: `cd web-portal && npx eslint src/components/brand tests/brand-mark.test.ts && npm run typecheck`
Expected: no output from eslint; typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add web-portal/src/components/brand/geometry.ts web-portal/src/components/brand/Mark.tsx web-portal/src/components/brand/Lockup.tsx web-portal/tests/brand-mark.test.ts
git commit -m "portal: inline SVG mark and lockup sharing the iOS construction" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: iOS `LetterpressMark` and `LetterpressLockup` on sign-in [judgment]

**Files:**
- Create: `ClearAF/Views/Brand/LetterpressMark.swift`
- Create: `ClearAFTests/PixelBuffer.swift`, `ClearAFTests/LetterpressLockupTests.swift`
- Modify: `ClearAF/Views/AuthenticationView.swift` (delete `ClearAFWordmark`, replace its call), `ClearAF/Views/PasswordRecoveryView.swift` (replace its call), `ClearAFTests/AuthPresentationTests.swift` (delete `wordmarkFollowsTheLockupType`)

**Interfaces:**
- Consumes: Task 1 `LetterpressMarkGeometry`; `Letterpress.ink` and `Letterpress.displayFontName(size:italic:)` (PR 1); PR 6's `ClearAFWordmark` call sites in `AuthenticationView` and `PasswordRecoveryView`.
- Produces:
  - `struct LetterpressMark: Shape`: fits the largest 4:5 frame into the rect, centred.
  - `struct LetterpressLockup: View` with `init(height: CGFloat)` and `static let signInHeight: CGFloat = 28`. It uses fixed sizes and one accessibility element labelled "ClearAF" with the header trait.
  - Test helper `struct PixelBuffer` with `init(_ image: CGImage)`, `width`, `height`, `rgb(_ x: Int, _ y: Int) -> UInt32`, `alpha(_:_:) -> UInt8` and `luma(_:_:) -> Int` (top-left origin, sRGB). Task 4 reuses it.
- Reviewer: `care-access-reviewer` is not needed. Only the header view in the sign-in files changes; the auth calls are untouched. Confirm with `git diff` that no `SupabaseService` or `APIService` line moved.

- [ ] **Step 1: Write the failing tests.** Create `ClearAFTests/PixelBuffer.swift`:

```swift
import CoreGraphics

/// Reads an image's pixels in sRGB, top-left origin, for cheap pixel checks.
struct PixelBuffer {
    let width: Int
    let height: Int
    private let bytes: [UInt8]

    init(_ image: CGImage) {
        width = image.width
        height = image.height
        var data = [UInt8](repeating: 0, count: image.width * image.height * 4)
        data.withUnsafeMutableBytes { raw in
            let context = CGContext(data: raw.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8,
                                    bytesPerRow: image.width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        }
        bytes = data
    }

    private func offset(_ x: Int, _ y: Int) -> Int { (y * width + x) * 4 }

    func rgb(_ x: Int, _ y: Int) -> UInt32 {
        let i = offset(x, y)
        return UInt32(bytes[i]) << 16 | UInt32(bytes[i + 1]) << 8 | UInt32(bytes[i + 2])
    }

    func alpha(_ x: Int, _ y: Int) -> UInt8 { bytes[offset(x, y) + 3] }

    func luma(_ x: Int, _ y: Int) -> Int {
        let i = offset(x, y)
        return (Int(bytes[i]) * 299 + Int(bytes[i + 1]) * 587 + Int(bytes[i + 2]) * 114) / 1000
    }
}
```

Create `ClearAFTests/LetterpressLockupTests.swift`:

```swift
import Foundation
import SwiftUI
import Testing
@testable import ClearAF

@MainActor
struct LetterpressLockupTests {
    static let repoRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()

    func render<V: View>(_ view: V) throws -> PixelBuffer {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        return PixelBuffer(try #require(renderer.cgImage))
    }

    @Test func markFitsTheLargestFourByFiveFrameCentred() {
        let box = LetterpressMark().path(in: CGRect(x: 0, y: 0, width: 100, height: 100)).boundingRect
        #expect(abs(box.height - 100) < 1e-9)
        #expect(abs(box.width - 80) < 1e-9)
        #expect(abs(box.minX - 10) < 1e-9)
    }

    @Test func renderedMarkPutsInkOnEveryRuleAndLeavesTheFrameOpen() throws {
        let pixels = try render(LetterpressMark().fill(Color.black).frame(width: 57.6, height: 72).background(Color.white))
        #expect(pixels.width == 58 && pixels.height == 72)
        #expect(pixels.luma(1, 36) < 16, "left rule")
        #expect(pixels.luma(56, 36) < 16, "right rule")
        #expect(pixels.luma(28, 1) < 16, "top rule")
        #expect(pixels.luma(28, 70) < 16, "bottom rule")
        #expect(pixels.luma(28, 20) > 239, "inside the frame, above the letters")
    }

    @Test func signInLockupShowsTheWordmark() {
        #expect(LetterpressLockup.signInHeight == 28)
        #expect(LetterpressMarkGeometry.showsWordmark(height: LetterpressLockup.signInHeight))
    }

    @Test func lockupIsMarkThenGapThenWordmark() throws {
        let pixels = try render(LetterpressLockup(height: 28).background(Color.white))
        #expect(pixels.width >= 96)
        #expect(pixels.luma(0, pixels.height / 2) < 60, "the mark's left rule starts the lockup")
        // Mark is 22.4 wide and the gap is 11.2, so column 28 is clear from top to bottom.
        #expect((0..<pixels.height).allSatisfy { pixels.luma(28, $0) > 200 })
        #expect((34..<pixels.width).contains { x in (0..<pixels.height).contains { pixels.luma(x, $0) < 60 } }, "wordmark is drawn")
    }

    @Test func signInScreensUseTheLockupAndThePlaceholderIsGone() throws {
        for file in ["ClearAF/Views/AuthenticationView.swift", "ClearAF/Views/PasswordRecoveryView.swift"] {
            let source = try String(contentsOf: Self.repoRoot.appendingPathComponent(file), encoding: .utf8)
            #expect(source.contains("LetterpressLockup(height: LetterpressLockup.signInHeight)"), "\(file)")
        }
        let placeholder = "ClearAF" + "Wordmark"
        for folder in ["ClearAF", "ClearAFTests", "ClearAFUITests"] {
            let walker = FileManager.default.enumerator(at: Self.repoRoot.appendingPathComponent(folder), includingPropertiesForKeys: nil)
            while let url = walker?.nextObject() as? URL {
                guard url.pathExtension == "swift" else { continue }
                #expect(!(try String(contentsOf: url, encoding: .utf8)).contains(placeholder), "\(url.lastPathComponent)")
            }
        }
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: TEST with `-only-testing:ClearAFTests/LetterpressLockupTests`
Expected: build FAIL, `cannot find 'LetterpressMark' in scope`.

- [ ] **Step 3: Create `ClearAF/Views/Brand/LetterpressMark.swift`**

```swift
import SwiftUI

/// The ClearAF mark (spec §10): a 4:5 frame with the italic "af" tucked bottom-right, as one filled shape.
/// It fits the largest 4:5 frame into the proposed rect and takes its colour from the foreground style.
struct LetterpressMark: Shape {
    func path(in rect: CGRect) -> Path {
        let height = min(rect.height, rect.width / LetterpressMarkGeometry.aspect)
        let origin = CGPoint(x: rect.midX - LetterpressMarkGeometry.width(height: height) / 2, y: rect.midY - height / 2)
        return Path(LetterpressMarkGeometry.path(height: height, origin: origin))
    }
}

/// Primary horizontal lockup (spec §10.3): mark + "clearaf" in Newsreader Light, tracked 0.18em, italic "af",
/// gap 0.4 × H, centred on each other. Below 96pt wide it is the mark alone. Fixed size: it is an image, not text.
/// Placements keep 0.5 × H clear on every side.
struct LetterpressLockup: View {
    /// Frame height on sign in and password recovery (mobile mockup screen 1).
    static let signInHeight: CGFloat = 28

    let height: CGFloat

    var body: some View {
        HStack(spacing: LetterpressMarkGeometry.lockupGap(height: height)) {
            LetterpressMark()
                .frame(width: LetterpressMarkGeometry.width(height: height), height: height)
            if LetterpressMarkGeometry.showsWordmark(height: height) {
                let size = LetterpressMarkGeometry.wordmarkSize(height: height)
                Text("clear\(Text("af").font(.custom(Letterpress.displayFontName(size: size, italic: true), fixedSize: size)))")
                    .font(.custom(Letterpress.displayFontName(size: size, italic: false), fixedSize: size))
                    .tracking(size * LetterpressMarkGeometry.wordmarkTrackingEm)
                    .lineLimit(1)
                    .fixedSize()
            }
        }
        .foregroundStyle(Letterpress.ink)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("ClearAF")
        .accessibilityAddTraits(.isHeader)
    }
}
```

- [ ] **Step 4: Replace the PR 6 placeholder**

In `ClearAF/Views/AuthenticationView.swift` delete the whole placeholder type (PR 6 Task 3 text):

```swift
/// Text wordmark until the identity PR ships the mark (spec §10.3: Newsreader 300, lowercase, 0.18em, italic "af").
struct ClearAFWordmark: View {
    static let size: CGFloat = 22
    static let trackingEm: CGFloat = 0.18

    var body: some View {
        Text("clear\(Text("af").font(Letterpress.display(Self.size, italic: true, relativeTo: .title2)))")
            .font(Letterpress.display(Self.size, relativeTo: .title2))
            .tracking(Self.size * Self.trackingEm)
            .foregroundStyle(Letterpress.ink)
            .accessibilityLabel("ClearAF")
            .accessibilityAddTraits(.isHeader)
    }
}
```

Then in both `AuthenticationView.swift` and `PasswordRecoveryView.swift` replace the call (one each, keep its modifiers):

```swift
                ClearAFWordmark()
                    .padding(.top, Letterpress.Space.s28)
```
with
```swift
                LetterpressLockup(height: LetterpressLockup.signInHeight)
                    .padding(.top, Letterpress.Space.s28)
```

If PR 6 merged different text, use `grep -rn "ClearAFWordmark" ClearAF ClearAFTests ClearAFUITests`. Delete the type wherever it's declared, and replace every `ClearAFWordmark()` with `LetterpressLockup(height: LetterpressLockup.signInHeight)`. The screen's horizontal padding (26pt in the mockup) and the title's top padding (`s44`) already exceed the 14pt clear space.

In `ClearAFTests/AuthPresentationTests.swift` delete:

```swift
    @Test func wordmarkFollowsTheLockupType() {
        #expect(ClearAFWordmark.size == 22)
        #expect(ClearAFWordmark.trackingEm == 0.18)
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: TEST with `-only-testing:ClearAFTests/LetterpressLockupTests -only-testing:ClearAFTests/AuthPresentationTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: all pass (`LetterpressLockupTests` 5 tests). If `lockupIsMarkThenGapThenWordmark` fails on the dark-pixel check, confirm fonts are registered in the test host (`Letterpress.registerFonts()` runs at app launch). The check only needs ink pixels and passes with a fallback font too, so a failure there means the view didn't render.

- [ ] **Step 6: Commit**

```bash
git add ClearAF/Views/Brand/LetterpressMark.swift ClearAF/Views/AuthenticationView.swift ClearAF/Views/PasswordRecoveryView.swift ClearAFTests/PixelBuffer.swift ClearAFTests/LetterpressLockupTests.swift ClearAFTests/AuthPresentationTests.swift
git commit -m "ios: mark shape and lockup replace the sign-in wordmark placeholder" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: App icon, touch icon and favicons rendered from the geometry [judgment]

**Files:**
- Create: `scripts/brand/render-icons.swift`, `scripts/brand/render-icons.sh`
- Create (rendered): `ClearAF/Assets.xcassets/AppIcon.appiconset/AppIcon-light.png`, `AppIcon-dark.png`, `AppIcon-tinted.png`, `web-portal/public/apple-touch-icon.png`, `web-portal/public/favicon.svg`, `web-portal/src/app/favicon.ico` (replaces the Next default)
- Modify: `ClearAF/Assets.xcassets/AppIcon.appiconset/Contents.json`
- Delete: `ClearAF/Assets.xcassets/AppIcon.appiconset/ChatGPT Image Jul 15, 2025, 11_40_24 PM (1).png`, `generate_icon.py`
- Test: `ClearAFTests/AppIconTests.swift`

**Interfaces:**
- Consumes: Task 1 `LetterpressMarkGeometry.path(height:origin:)`, `iconPlacement(side:frameRatio:)`, `block(height:)`, `stroke(height:)`, `width(height:)`, `iconFrameRatio`; Task 3 `PixelBuffer`.
- Produces: the six asset files above (Task 5 wires the portal ones) and `Contents.json` with appearances any / `luminosity: dark` / `luminosity: tinted`.

- [ ] **Step 1: Write the failing test.** Create `ClearAFTests/AppIconTests.swift`:

```swift
import Foundation
import ImageIO
import Testing

/// Spec §10.5: a redrawn full-bleed icon in light, dark and tinted, rendered by scripts/brand/render-icons.sh.
struct AppIconTests {
    static let repoRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    static let iconSet = repoRoot.appendingPathComponent("ClearAF/Assets.xcassets/AppIcon.appiconset")

    struct Catalog: Decodable {
        struct Appearance: Decodable { let appearance: String; let value: String }
        struct Image: Decodable {
            let filename: String
            let idiom: String
            let platform: String?
            let size: String
            let appearances: [Appearance]?
        }
        let images: [Image]
    }

    static func image(_ name: String) throws -> CGImage {
        let url = iconSet.appendingPathComponent(name) as CFURL
        let source = try #require(CGImageSourceCreateWithURL(url, nil))
        return try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
    }

    @Test func contentsDeclaresLightDarkAndTinted() throws {
        let catalog = try JSONDecoder().decode(Catalog.self, from: Data(contentsOf: Self.iconSet.appendingPathComponent("Contents.json")))
        #expect(catalog.images.count == 3)
        var byAppearance: [String: String] = [:]
        for image in catalog.images {
            #expect(image.idiom == "universal")
            #expect(image.platform == "ios")
            #expect(image.size == "1024x1024")
            #expect(image.appearances?.allSatisfy { $0.appearance == "luminosity" } ?? true)
            byAppearance[image.appearances?.first?.value ?? "any"] = image.filename
        }
        #expect(byAppearance == ["any": "AppIcon-light.png", "dark": "AppIcon-dark.png", "tinted": "AppIcon-tinted.png"])
    }

    @Test func iconSetHoldsOnlyTheRenderedIcons() throws {
        let names = try FileManager.default.contentsOfDirectory(atPath: Self.iconSet.path).sorted()
        #expect(names == ["AppIcon-dark.png", "AppIcon-light.png", "AppIcon-tinted.png", "Contents.json"])
    }

    @Test func retiredIconSourcesAreDeleted() {
        #expect(!FileManager.default.fileExists(atPath: Self.repoRoot.appendingPathComponent("generate_icon.py").path))
        #expect(!FileManager.default.fileExists(atPath: Self.iconSet.appendingPathComponent("ChatGPT Image Jul 15, 2025, 11_40_24 PM (1).png").path))
    }

    @Test func lightIsInkOnCanvasFullBleedWithTheFrameLifted() throws {
        let icon = try Self.image("AppIcon-light.png")
        #expect(icon.width == 1024 && icon.height == 1024)
        #expect([.none, .noneSkipLast, .noneSkipFirst].contains(icon.alphaInfo), "opaque, no alpha channel")
        let pixels = PixelBuffer(icon)
        #expect(pixels.rgb(0, 0) == 0xF2EFE7, "no baked corner radius")
        #expect(pixels.rgb(1023, 1023) == 0xF2EFE7)
        #expect(pixels.rgb(306, 512) == 0x121312, "left rule")
        #expect(pixels.rgb(512, 232) == 0x121312, "top rule at 230.4, above true centre")
        #expect(pixels.rgb(512, 755) == 0x121312, "bottom rule")
        #expect(pixels.rgb(512, 765) == 0xF2EFE7)
        #expect(pixels.rgb(512, 400) == 0xF2EFE7, "frame is open")
    }

    @Test func darkIsReversedOnNearBlack() throws {
        let icon = try Self.image("AppIcon-dark.png")
        #expect([.none, .noneSkipLast, .noneSkipFirst].contains(icon.alphaInfo))
        let pixels = PixelBuffer(icon)
        #expect(pixels.rgb(0, 0) == 0x171716)
        #expect(pixels.rgb(306, 512) == 0xEFEDE4)
        #expect(pixels.rgb(512, 232) == 0xEFEDE4)
        #expect(pixels.rgb(512, 400) == 0x171716)
    }

    @Test func tintedIsMonochromeOnTransparent() throws {
        let pixels = PixelBuffer(try Self.image("AppIcon-tinted.png"))
        #expect(pixels.alpha(0, 0) == 0)
        #expect(pixels.alpha(512, 400) == 0)
        #expect(pixels.alpha(306, 512) == 255)
        #expect(pixels.rgb(306, 512) == 0xFFFFFF)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/AppIconTests`
Expected: FAIL on every test (`AppIcon-light.png` missing, 1 image in `Contents.json`, `generate_icon.py` exists).

- [ ] **Step 3: Create `scripts/brand/render-icons.swift`**

```swift
// Renders the ClearAF app icon (light, dark, tinted), apple-touch-icon, favicon.ico and favicon.svg from the
// mark geometry the app itself uses. Run from the repository root: scripts/brand/render-icons.sh
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

@main
struct RenderIcons {
    struct RGB {
        let r: UInt8, g: UInt8, b: UInt8
        var cg: CGColor { CGColor(srgbRed: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: 1) }
        var hex: String { String(format: "#%02X%02X%02X", r, g, b) }
    }

    // Spec §10.4–10.5 values.
    static let ink = RGB(r: 0x12, g: 0x13, b: 0x12)
    static let canvas = RGB(r: 0xF2, g: 0xEF, b: 0xE7)
    static let inkDark = RGB(r: 0xEF, g: 0xED, b: 0xE4)
    static let canvasDark = RGB(r: 0x17, g: 0x17, b: 0x16)
    static let tintSource = RGB(r: 0xFF, g: 0xFF, b: 0xFF)
    /// The favicon reproduces the 18px specimen: a 13px frame in an 18px square (letters become the block).
    static let faviconFrameRatio: CGFloat = 13.0 / 18.0

    static func render(side: Int, mark: RGB, background: RGB?, frameRatio: CGFloat) -> CGImage {
        let alpha: CGImageAlphaInfo = background == nil ? .premultipliedLast : .noneSkipLast
        let context = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
                                space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: alpha.rawValue)!
        let size = CGFloat(side)
        if let background {
            context.setFillColor(background.cg)
            context.fill(CGRect(x: 0, y: 0, width: size, height: size))
        }
        // The geometry is y-down; flip the bitmap context to match.
        context.translateBy(x: 0, y: size)
        context.scaleBy(x: 1, y: -1)
        let placement = LetterpressMarkGeometry.iconPlacement(side: size, frameRatio: frameRatio)
        context.addPath(LetterpressMarkGeometry.path(height: placement.height, origin: placement.origin))
        context.setFillColor(mark.cg)
        context.fillPath(using: .winding)
        return context.makeImage()!
    }

    static func pngData(_ image: CGImage) -> Data {
        let data = NSMutableData()
        let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(destination, image, nil)
        precondition(CGImageDestinationFinalize(destination))
        return data as Data
    }

    static func write(_ data: Data, _ path: String) throws {
        try data.write(to: URL(fileURLWithPath: path))
        print("wrote \(path)")
    }

    /// An .ico holding one 32px PNG (read by every current browser).
    static func ico(_ png: Data) -> Data {
        var data = Data([0, 0, 1, 0, 1, 0])
        data.append(contentsOf: [32, 32, 0, 0, 1, 0, 32, 0])
        withUnsafeBytes(of: UInt32(png.count).littleEndian) { data.append(contentsOf: $0) }
        withUnsafeBytes(of: UInt32(22).littleEndian) { data.append(contentsOf: $0) }
        data.append(png)
        return data
    }

    static func number(_ value: CGFloat) -> String {
        var text = String(format: "%.3f", Double(value))
        while text.hasSuffix("0") { text.removeLast() }
        if text.hasSuffix(".") { text.removeLast() }
        return text
    }

    /// favicon.svg: the block mark in an 18-unit square, ink by default and reversed for dark browser chrome.
    static func faviconSVG() -> String {
        let placement = LetterpressMarkGeometry.iconPlacement(side: 18, frameRatio: faviconFrameRatio)
        let h = placement.height, o = placement.origin
        let w = LetterpressMarkGeometry.width(height: h), s = LetterpressMarkGeometry.stroke(height: h)
        let b = LetterpressMarkGeometry.block(height: h).offsetBy(dx: o.x, dy: o.y)
        func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> String {
            "M\(number(x)) \(number(y))h\(number(w))v\(number(h))h\(number(-w))Z"
        }
        let d = rect(o.x, o.y, w, h) + rect(o.x + s, o.y + s, w - 2 * s, h - 2 * s) + rect(b.minX, b.minY, b.width, b.height)
        return """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><style>path{fill:\(ink.hex)}@media (prefers-color-scheme:dark){path{fill:\(inkDark.hex)}}</style><path fill-rule="evenodd" d="\(d)"/></svg>

        """
    }

    static func main() throws {
        let appIcon = "ClearAF/Assets.xcassets/AppIcon.appiconset"
        let frame = LetterpressMarkGeometry.iconFrameRatio
        try write(pngData(render(side: 1024, mark: ink, background: canvas, frameRatio: frame)), "\(appIcon)/AppIcon-light.png")
        try write(pngData(render(side: 1024, mark: inkDark, background: canvasDark, frameRatio: frame)), "\(appIcon)/AppIcon-dark.png")
        try write(pngData(render(side: 1024, mark: tintSource, background: nil, frameRatio: frame)), "\(appIcon)/AppIcon-tinted.png")
        try write(pngData(render(side: 180, mark: ink, background: canvas, frameRatio: frame)), "web-portal/public/apple-touch-icon.png")
        try write(ico(pngData(render(side: 32, mark: ink, background: canvas, frameRatio: faviconFrameRatio))), "web-portal/src/app/favicon.ico")
        try write(Data(faviconSVG().utf8), "web-portal/public/favicon.svg")
    }
}
```

- [ ] **Step 4: Create `scripts/brand/render-icons.sh`** and make it executable (`chmod +x scripts/brand/render-icons.sh`)

```sh
#!/bin/sh
# Compiles the icon renderer against the app's own mark geometry, then runs it from the repository root.
set -eu
cd "$(dirname "$0")/../.."
out="${TMPDIR:-/tmp}/clearaf-render-icons"
swiftc -O -parse-as-library \
  scripts/brand/render-icons.swift \
  ClearAF/Views/Brand/LetterpressMarkGeometry.swift \
  ClearAF/Views/Brand/LetterpressMarkGlyphs.swift \
  -o "$out"
"$out"
```

- [ ] **Step 5: Render, delete the retired sources, and write `Contents.json`**

```bash
scripts/brand/render-icons.sh
git rm "ClearAF/Assets.xcassets/AppIcon.appiconset/ChatGPT Image Jul 15, 2025, 11_40_24 PM (1).png" generate_icon.py
```
Expected: six `wrote …` lines. Then run `shasum ClearAF/Assets.xcassets/AppIcon.appiconset/*.png`, run the renderer again, and repeat `shasum`. The hashes should be identical (deterministic on one machine).
`cat web-portal/public/favicon.svg` should print exactly:
```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><style>path{fill:#121312}@media (prefers-color-scheme:dark){path{fill:#EFEDE4}}</style><path fill-rule="evenodd" d="M3.8 2.23h10.4v13h-10.4ZM4.55 2.98h8.9v11.5h-8.9ZM8.38 9.41h4.03v4.03h-4.03Z"/></svg>
```

Replace `ClearAF/Assets.xcassets/AppIcon.appiconset/Contents.json` with:

```json
{
  "images" : [
    {
      "filename" : "AppIcon-light.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "dark"
        }
      ],
      "filename" : "AppIcon-dark.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "tinted"
        }
      ],
      "filename" : "AppIcon-tinted.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: TEST with `-only-testing:ClearAFTests/AppIconTests -only-testing:ClearAFTests/LetterpressMarkTests`
Expected: all pass, and the build log shows no `AppIcon` asset-catalog warning. Open `AppIcon-light.png` with the Read tool as a sanity check: a hairline 4:5 frame with "af" low right, on paper, square corners.

- [ ] **Step 7: Commit**

```bash
git add scripts/brand/render-icons.swift scripts/brand/render-icons.sh ClearAF/Assets.xcassets/AppIcon.appiconset web-portal/public/apple-touch-icon.png web-portal/public/favicon.svg web-portal/src/app/favicon.ico ClearAFTests/AppIconTests.swift
git commit -m "brand: redraw the app icon in light, dark and tinted and render the portal icons; delete generate_icon.py" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
(`git rm` already staged the deletions.)

---

### Task 5: Portal placements, icon metadata and default asset removal [mechanical]

**Files:**
- Modify: `web-portal/src/components/layout/Sidebar.tsx` (PR 5), `web-portal/src/components/layout/AuthShell.tsx` (PR 5), `web-portal/src/app/layout.tsx`
- Modify: `web-portal/tests/workspace.test.ts`, `web-portal/tests/auth-pages.test.ts` (PR 5 placeholder assertions)
- Delete: `web-portal/public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`
- Test: `web-portal/tests/identity-assets.test.ts`

**Interfaces:**
- Consumes: Task 2 `Lockup`, `LOCKUP_HEIGHT`, `clearSpace`; Task 4 `public/favicon.svg`, `public/apple-touch-icon.png`, `src/app/favicon.ico`; `offences`, `read`, `sourceFiles` from `tests/letterpress-rules.ts` (PR 2).
- Produces: the rail head `<Lockup height={LOCKUP_HEIGHT.rail} className="text-ink" />` with a `mt-3.5` eyebrow; AuthShell `<Lockup height={LOCKUP_HEIGHT.signIn} className="text-ink" />`; `metadata.icons`.

- [ ] **Step 1: Write the failing test.** Create `web-portal/tests/identity-assets.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { LOCKUP_HEIGHT, clearSpace } from '../src/components/brand/geometry';
import { offences, read, sourceFiles } from './letterpress-rules';

const png = (path: string) => {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colourType: bytes[25] };
};

test('Next.js default SVGs are gone; favicon.svg and a 180px opaque apple-touch-icon are in public', () => {
  for (const name of ['next.svg', 'vercel.svg', 'file.svg', 'globe.svg', 'window.svg']) assert.ok(!existsSync(`public/${name}`), name);
  assert.deepEqual(png('public/apple-touch-icon.png'), { width: 180, height: 180, colourType: 2 });
});

test('favicon.svg is the block mark in ink, reversed for dark browser chrome, and nothing else', () => {
  const svg = read('public/favicon.svg');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 18 18">/);
  assert.ok(svg.includes('path{fill:#121312}@media (prefers-color-scheme:dark){path{fill:#EFEDE4}}'));
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  assert.doesNotMatch(svg, /gradient|<text|<image|stroke|filter|rx=|opacity/i);
});

test('favicon.ico holds one 32px PNG', () => {
  const ico = readFileSync('src/app/favicon.ico');
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 1, 0]);
  assert.equal(ico.readUInt32LE(18), 22);
  assert.equal(ico.subarray(22, 30).toString('hex'), '89504e470d0a1a0a');
  assert.equal(ico.readUInt32BE(22 + 16), 32);
  assert.equal(ico.readUInt32BE(22 + 20), 32);
});

test('root metadata links favicon.svg and the apple-touch-icon', () => {
  const layout = read('src/app/layout.tsx');
  assert.ok(layout.includes("icons: {\n    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],\n    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],\n  },"));
});

test('the lockup replaces every placeholder mark, with clear space around it', () => {
  const sources = sourceFiles('src');
  assert.deepEqual(offences(/Stethoscope/, sources), []);
  assert.deepEqual(offences(/data-placeholder="wordmark"/, sources), []);

  const sidebar = read('src/components/layout/Sidebar.tsx');
  assert.match(sidebar, /import \{ Lockup \} from '@\/components\/brand\/Lockup';/);
  assert.match(sidebar, /<div className="px-4 pb-5 pt-6">\s*<Lockup height=\{LOCKUP_HEIGHT\.rail\} className="text-ink" \/>\s*<p className="eyebrow mt-3\.5">Clinician<\/p>/);
  // px-4 = 16px, pt-6 = 24px, mt-3.5 = 14px: each at least 0.5 × H.
  for (const px of [16, 24, 14]) assert.ok(px >= clearSpace(LOCKUP_HEIGHT.rail), `${px}px`);

  const shell = read('src/components/layout/AuthShell.tsx');
  assert.match(shell, /<div className="flex w-full flex-col px-6 py-8[^"]*">\s*<Lockup height=\{LOCKUP_HEIGHT\.signIn\} className="text-ink" \/>/);
  // px-6 = 24px and py-8 = 32px around the lockup; the next block adds py-10.
  for (const px of [24, 32]) assert.ok(px >= clearSpace(LOCKUP_HEIGHT.signIn), `${px}px`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web-portal && node --import tsx --test tests/identity-assets.test.ts`
Expected: FAIL in 3 tests: default SVGs present, metadata has no `icons`, `Stethoscope` found in `Sidebar.tsx`. The favicon tests already pass from Task 4.

- [ ] **Step 3: Delete the Next.js defaults**

```bash
git rm web-portal/public/next.svg web-portal/public/vercel.svg web-portal/public/file.svg web-portal/public/globe.svg web-portal/public/window.svg
```

- [ ] **Step 4: Wire the icons in `web-portal/src/app/layout.tsx`.** Add `icons` as the last property of the exported `metadata` object, after `description`, leaving `title` and `description` as they are:

```tsx
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
```
`src/app/favicon.ico` (Task 4) stays a file-convention icon, so Next also emits `/favicon.ico` for browsers that ignore SVG.

- [ ] **Step 5: Place the rail lockup in `web-portal/src/components/layout/Sidebar.tsx`**

Replace the import line
```tsx
import { ClipboardList, List, LogOut, MessageSquare, Stethoscope, UserRound } from 'lucide-react';
```
with
```tsx
import { ClipboardList, List, LogOut, MessageSquare, UserRound } from 'lucide-react';
import { LOCKUP_HEIGHT } from '@/components/brand/geometry';
import { Lockup } from '@/components/brand/Lockup';
```
Replace the comment
```tsx
// Letterpress nav rail (spec §3: 190–210px). Stethoscope is a placeholder mark until PR 8 ships the identity.
```
with
```tsx
// Letterpress nav rail (spec §3: 190–210px). Lockup at H=25 with 0.5 × H clear on every side (spec §10.3, §10.6).
```
Replace the head
```tsx
      <div className="flex items-center gap-2"><Stethoscope aria-hidden className="h-5 w-5 text-ink" /><p className="font-display text-[19px] font-light">ClearAF</p></div>
      <p className="eyebrow mt-2">Clinician</p>
```
with
```tsx
      <Lockup height={LOCKUP_HEIGHT.rail} className="text-ink" />
      <p className="eyebrow mt-3.5">Clinician</p>
```
The wrapping `<div className="px-4 pb-5 pt-6">` stays. If PR 5 merged different text, `grep -n "Stethoscope" web-portal/src/components/layout/Sidebar.tsx`. Remove the icon from the import, replace the element that renders the Stethoscope and the "ClearAF" text with the `Lockup` line, and make any margin between the lockup and the next element at least `mt-3.5`.

- [ ] **Step 6: Place the sign-in lockup in `web-portal/src/components/layout/AuthShell.tsx`**

Below `import type { ReactNode } from 'react';` add:
```tsx
import { LOCKUP_HEIGHT } from '@/components/brand/geometry';
import { Lockup } from '@/components/brand/Lockup';
```
Replace the comment line
```tsx
// The wordmark is plain text until PR 8 ships the mark; `data-placeholder` marks it for replacement.
```
with
```tsx
// Lockup at H=27 (spec §10.6); the column padding keeps 0.5 × H clear around it.
```
Replace
```tsx
      <p data-placeholder="wordmark" className="font-display text-[22px] font-light tracking-[0.18em]">clear<span className="italic">af</span></p>
```
with
```tsx
      <Lockup height={LOCKUP_HEIGHT.signIn} className="text-ink" />
```
If PR 5 merged different text, replace the single element carrying `data-placeholder="wordmark"` (the element and its children) with the same line.

- [ ] **Step 7: Update the PR 5 assertions that pinned the placeholders**

In `web-portal/tests/workspace.test.ts` replace
```ts
test('sidebar is a 200px rail: Worklist, Messages, Templates, Account; Stethoscope only as the placeholder mark', () => {
```
with
```ts
test('sidebar is a 200px rail: Worklist, Messages, Templates, Account; the lockup heads it', () => {
```
and replace
```ts
  assert.equal((sidebar.match(/<Stethoscope/g) ?? []).length, 1);
```
with
```ts
  assert.doesNotMatch(sidebar, /Stethoscope/);
  assert.match(sidebar, /<Lockup height=\{LOCKUP_HEIGHT\.rail\}/);
```
In `web-portal/tests/auth-pages.test.ts` replace
```ts
  assert.match(html, /data-placeholder="wordmark"/);
```
with
```ts
  assert.match(html, /data-mark-height="27"/);
  assert.match(html, /<span class="sr-only">ClearAF<\/span>/);
```
(If PR 5 changed these lines, search the two files for `Stethoscope` and `data-placeholder` and make the same substitutions.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd web-portal && node --import tsx --test tests/identity-assets.test.ts tests/workspace.test.ts tests/auth-pages.test.ts tests/letterpress-sweep.test.ts`
Expected: `ℹ fail 0`.
Run: `cd web-portal && npm run lint && npm run typecheck`
Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add web-portal/src/components/layout/Sidebar.tsx web-portal/src/components/layout/AuthShell.tsx web-portal/src/app/layout.tsx web-portal/tests/identity-assets.test.ts web-portal/tests/workspace.test.ts web-portal/tests/auth-pages.test.ts
git commit -m "portal: lockup in the rail and on sign in, favicon and touch icon wired, Next defaults removed" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Repo-wide retired-token sweep and identity notes [judgment]

**Files:**
- Create: `web-portal/tests/retired-tokens-repo.test.ts`
- Modify: `ClearAFTests/LetterpressSweepTests.swift`
- Modify: `docs/design/design-language.md` (append an Identity section)

**Interfaces:**
- Consumes: Task 4's deletions and `Contents.json`; the PR 2 `LetterpressSweepTests` helpers `repoRoot`, `excluded`, `sources(in:)`, `offences(_:in:)`.
- Produces: `sources(in:extensions:)` with default `["swift"]`, so existing calls are unchanged. The CI-enforced (Linux) guarantees: no §8 value anywhere outside the records, `generate_icon.py` and the ChatGPT PNG absent, and three icon appearances declared.

- [ ] **Step 1: Write the failing tests.** Create `web-portal/tests/retired-tokens-repo.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Spec §8: "No reference anywhere to retired tokens". Runs from web-portal/ over the whole repository.
const REPO = resolve(process.cwd(), '..');
const TEXT = /\.(swift|ts|tsx|js|jsx|mjs|cjs|css|json|md|html|svg|py|sh|ya?ml|xcconfig|plist|pbxproj|entitlements|sql|prisma|toml|txt)$/;
// Records that name retired values on purpose: the spec's checklist and mockups, archived passes, past plans and their evidence.
const RECORDS = ['docs/design/letterpress/', 'docs/design/archive/', 'docs/superpowers/', 'docs/features/', 'docs/handoff/', '.superpowers/', '.claude/worktrees/'];
// The sweeps spell the patterns out; lockfiles are generated.
const SWEEPS = new Set(['ClearAFTests/LetterpressSweepTests.swift', 'web-portal/tests/letterpress-tokens.test.mjs', 'web-portal/tests/retired-tokens-repo.test.ts']);

const FILES = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: REPO, encoding: 'utf8' })
  .split('\0')
  .filter((path) => path && TEXT.test(path) && !path.endsWith('package-lock.json'))
  .filter((path) => !RECORDS.some((prefix) => path.startsWith(prefix)) && !SWEEPS.has(path))
  .filter((path) => existsSync(join(REPO, path)) && statSync(join(REPO, path)).isFile());

const RETIRED: { name: string; pattern: RegExp; exempt?: string }[] = [
  { name: '#0B4D45', pattern: /0B4D45/i },
  { name: '#C2552F', pattern: /C2552F/i },
  { name: 'skinPeach', pattern: /skinPeach/i },
  { name: 'calmBlue', pattern: /calmBlue/i },
  { name: 'gentleGreen', pattern: /gentleGreen/i },
  { name: 'softLavender', pattern: /softLavender/i },
  // Design-token names (scoreRing, scoreColor…). backend/ keeps the skin score columns and fields fenced by spec §0.
  { name: 'score*', pattern: /\bscore[A-Z]\w*/, exempt: 'backend/' },
  { name: 'glowShadow', pattern: /glowShadow/i },
  { name: 'any gradient', pattern: /gradient/i },
];

test('the sweep covers every live part of the repository', () => {
  for (const expected of ['ClearAF/Views/Letterpress.swift', 'web-portal/src/app/globals.css', 'backend/src/server.ts', 'docs/design/design-language.md', 'CLAUDE.md', 'ClearAF/Assets.xcassets/AppIcon.appiconset/Contents.json']) {
    assert.ok(FILES.includes(expected), `${expected} is not swept`);
  }
  assert.ok(!FILES.some((path) => path.startsWith('docs/superpowers/')));
});

for (const { name, pattern, exempt } of RETIRED) {
  test(`no reference to ${name} outside the records`, () => {
    const hits = FILES.filter((path) => !(exempt && path.startsWith(exempt))).flatMap((path) =>
      readFileSync(join(REPO, path), 'utf8')
        .split('\n')
        .flatMap((line, index) => (pattern.test(line) ? [`${path}:${index + 1}: ${line.trim().slice(0, 140)}`] : [])),
    );
    assert.deepEqual(hits, []);
  });
}

test('the retired icon generator and the ChatGPT raster are deleted', () => {
  assert.ok(!existsSync(join(REPO, 'generate_icon.py')));
  assert.ok(!existsSync(join(REPO, 'ClearAF/Assets.xcassets/AppIcon.appiconset/ChatGPT Image Jul 15, 2025, 11_40_24 PM (1).png')));
});

test('the app icon declares light, dark and tinted 1024px PNGs (alpha only on tinted)', () => {
  const set = join(REPO, 'ClearAF/Assets.xcassets/AppIcon.appiconset');
  const { images } = JSON.parse(readFileSync(join(set, 'Contents.json'), 'utf8')) as {
    images: { filename: string; size: string; appearances?: { appearance: string; value: string }[] }[];
  };
  const byAppearance = Object.fromEntries(images.map((image) => [image.appearances?.[0]?.value ?? 'any', image]));
  assert.deepEqual(Object.keys(byAppearance).sort(), ['any', 'dark', 'tinted']);
  for (const [appearance, image] of Object.entries(byAppearance)) {
    assert.equal(image.size, '1024x1024');
    const bytes = readFileSync(join(set, image.filename));
    assert.equal(bytes.readUInt32BE(16), 1024, image.filename);
    assert.equal(bytes[25], appearance === 'tinted' ? 6 : 2, `${image.filename} colour type`);
  }
});
```

In `ClearAFTests/LetterpressSweepTests.swift` replace `sources(in:)`:

```swift
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
```
with
```swift
    static func sources(in folders: [String], extensions: Set<String> = ["swift"]) throws -> [(path: String, text: String)] {
        var files: [(path: String, text: String)] = []
        for folder in folders {
            let root = repoRoot.appendingPathComponent(folder)
            guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { continue }
            for case let url as URL in walker where extensions.contains(url.pathExtension) && !excluded.contains(url.lastPathComponent) {
                files.append((url.path.replacingOccurrences(of: repoRoot.path + "/", with: ""), try String(contentsOf: url, encoding: .utf8)))
            }
        }
        return files
    }

    static func offences(_ pattern: String, in folders: [String], extensions: Set<String> = ["swift"]) throws -> [String] {
        let regex = try NSRegularExpression(pattern: pattern)
        return try sources(in: folders, extensions: extensions).flatMap { file in
```
and add these tests before the final closing brace:

```swift
    @Test func noRetiredValuesInSwiftOrAssetCatalogs() throws {
        let values = #"(?i)0B4D45|C2552F|gradient|glowShadow|skinPeach|calmBlue|gentleGreen|softLavender"#
        #expect(try Self.offences(values, in: ["ClearAF", "ClearAFTests", "ClearAFUITests"], extensions: ["swift", "json"]) == [])
    }

    @Test func retiredIconGeneratorIsGone() {
        #expect(!FileManager.default.fileExists(atPath: Self.repoRoot.appendingPathComponent("generate_icon.py").path))
    }
```

- [ ] **Step 2: Run the tests.** Tasks 1–5 already removed the known offenders, so these may pass immediately. Confirm the sweep has teeth by planting a violation:

```bash
echo "// gradient" >> web-portal/src/components/brand/geometry.ts
cd web-portal && node --import tsx --test tests/retired-tokens-repo.test.ts; cd ..
git checkout web-portal/src/components/brand/geometry.ts
```
Expected: `✖ no reference to any gradient outside the records` naming `web-portal/src/components/brand/geometry.ts:<line>: // gradient`. The other tests pass.

- [ ] **Step 3: Run the real sweep and fix what it finds**

Run: `cd web-portal && node --import tsx --test tests/retired-tokens-repo.test.ts`
Expected: `ℹ fail 0`. If PR 3–7 code or copy left a hit, such as a comment saying "no gradients" or a `scoreX` helper, reword or rename it in place. Don't widen `RECORDS`. Record each fix in the commit message.
Run: TEST with `-only-testing:ClearAFTests/LetterpressSweepTests`
Expected: all pass (6 tests: the 4 from PR 2 plus 2 new).

- [ ] **Step 4: Append the Identity section to `docs/design/design-language.md`**

```markdown
## Identity

- The mark (spec §10) is drawn from code, not a font. `ClearAF/Views/Brand/LetterpressMarkGeometry.swift` and `web-portal/src/components/brand/geometry.ts` hold the construction; `web-portal/tests/brand-mark.test.ts` keeps them equal. The "af" is an outline extracted from `Newsreader16pt-LightItalic` by `swift scripts/brand/extract-glyphs.swift` (`--check` detects drift). The wordmark `clearaf` is live text.
- Insets follow the approved specimen: measured from the inner edge of each rule, to the end of the "af" advance and the bottom of its line box. The 24–47 stroke band is capped at 1.5. Below H=16 the letters become a solid block (favicon only).
- App icon (light, dark, tinted), `apple-touch-icon.png`, `favicon.ico` and `favicon.svg` are rendered by `scripts/brand/render-icons.sh` from the same geometry. Re-render rather than editing the PNGs.
- Placements: portal rail H=25, portal sign-in H=27, iOS sign-in H=28, each with 0.5 × H clear. Components: `Mark`/`Lockup` (portal), `LetterpressMark`/`LetterpressLockup` (iOS).
- Colour is the foreground (`currentColor`, `Letterpress.ink`), which reverses in dark mode. No ochre variant ships until something sets the mark on `attention.wash`.
- `web-portal/tests/retired-tokens-repo.test.ts` enforces the §8 retired list across the repository. Records under `docs/design/letterpress`, `docs/design/archive`, `docs/superpowers`, `docs/features` and `docs/handoff` are exempt.
```

Run: `cd web-portal && node --import tsx --test tests/retired-tokens-repo.test.ts`
Expected: still `ℹ fail 0` (the new section names no retired value).

- [ ] **Step 5: Commit**

```bash
git add web-portal/tests/retired-tokens-repo.test.ts ClearAFTests/LetterpressSweepTests.swift docs/design/design-language.md
git commit -m "test: enforce the retired Letterpress tokens repo-wide and document the identity" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Verification [verification only]

No code changes. If a check fails, fix the task that owns the code, rerun only that focused check (verification agreement), then continue.

- [ ] **Step 1: Gates**

```bash
swift scripts/brand/extract-glyphs.swift --check
scripts/brand/render-icons.sh && git status --porcelain ClearAF/Assets.xcassets web-portal/public web-portal/src/app/favicon.ico
cd web-portal && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://security-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic-anon npm run build; cd ..
xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
  -derivedDataPath /tmp/clearaf-build-lp8 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  -only-testing:ClearAFTests test | xcbeautify
```
Expected: `mark glyphs are current`; the re-render leaves `git status` empty (rendering is deterministic); portal tests, lint, typecheck and build pass; `ClearAFTests` pass. The build log has no asset-catalog warning for `AppIcon`.

- [ ] **Step 2: Mark against the 4a specimens at 76/36/18 and the "In place" lockups.** Write this scratch generator to the session scratchpad (not the repo) as `pr8-specimens.mjs`:

```js
// Usage from web-portal/: node --import tsx <scratch>/pr8-specimens.mjs <scratch>/pr8-specimens.html
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const load = (path) => import(pathToFileURL(resolve(path)).href);
const { createElement: h } = await load('node_modules/react/index.js');
const { renderToStaticMarkup } = await load('node_modules/react-dom/server.node.js');
const { Mark } = await load('src/components/brand/Mark.tsx');
const { Lockup } = await load('src/components/brand/Lockup.tsx');

const cell = (label, left, right) =>
  `<tr><td class="l">${label}</td><td>${left}</td><td>${right}</td></tr>`;
const tile = (size, inner) =>
  `<div style="width:${size}px;height:${size}px;background:#121312;color:#F2EFE7;display:flex;align-items:center;justify-content:center">${inner}</div>`;
// Specimen markup copied from docs/design/letterpress/logo-directions.dc.html §4a and portal.dc.html.
const spec76 = tile(76, `<div style="width:40px;height:50px;border:1.5px solid #F2EFE7;display:flex;align-items:flex-end;justify-content:flex-end;padding:0 8px 4px 0;box-sizing:border-box"><div style="font:300 19px/1 Newsreader,serif;font-style:italic;color:#F2EFE7">af</div></div>`);
const spec36 = tile(36, `<div style="width:19px;height:24px;border:1px solid #F2EFE7;display:flex;align-items:flex-end;justify-content:flex-end;padding:0 3.5px 2px 0;box-sizing:border-box"><div style="font:300 10px/1 Newsreader,serif;font-style:italic;color:#F2EFE7">af</div></div>`);
const spec18 = tile(18, `<div style="width:10px;height:13px;border:.75px solid #F2EFE7;box-sizing:border-box;position:relative"><div style="position:absolute;right:1px;bottom:1px;width:4px;height:4px;background:#F2EFE7"></div></div>`);
const specRail = `<div style="display:flex;align-items:center;gap:9px;color:#121312"><div style="width:20px;height:25px;border:1.2px solid #121312;display:flex;align-items:flex-end;justify-content:flex-end;padding:0 4px 2px 0;box-sizing:border-box"><div style="font:300 11px/1 Newsreader,serif;font-style:italic">af</div></div><div style="font:400 19px/1 Newsreader,serif;letter-spacing:.18em">clear<span style="font-style:italic">af</span></div></div>`;
const specSignIn = `<div style="display:flex;align-items:center;gap:11px;color:#121312"><div style="width:21.6px;height:27px;border:1.4px solid #121312;display:flex;align-items:flex-end;justify-content:flex-end;padding:0 4.5px 2.5px 0;box-sizing:border-box"><div style="font:300 12px/1 Newsreader,serif;font-style:italic">af</div></div><div style="font:400 21px/1 Newsreader,serif;letter-spacing:.2em">clear<span style="font-style:italic">af</span></div></div>`;
const ours = (node) => renderToStaticMarkup(node);
const lockup = (height) => `<div style="color:#121312">${ours(h(Lockup, { height }))}</div>`;

writeFileSync(process.argv[2], `<!doctype html><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..500&display=swap" rel="stylesheet">
<style>body{background:#EDEAE1;font:12px monospace;padding:24px}td{padding:12px 20px;vertical-align:middle}.l{color:#5F5D55}
/* The Tailwind utilities Mark and Lockup use, so the scratch page renders them as the portal does. */
.flex{display:flex}.w-fit{width:fit-content}.items-center{align-items:center}.block{display:block}.font-display{font-family:Newsreader,serif}.font-light{font-weight:300}.lowercase{text-transform:lowercase}.leading-none{line-height:1}.tracking-\\[0\\.18em\\]{letter-spacing:.18em}.italic{font-style:italic}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style>
<table><tr><td></td><td>4a specimen</td><td>shipped Mark / Lockup</td></tr>
${cell('76 tile (H=50)', spec76, tile(76, ours(h(Mark, { height: 50 }))))}
${cell('36 tile (H=24)', spec36, tile(36, ours(h(Mark, { height: 24 }))))}
${cell('18 tile (H=13)', spec18, tile(18, ours(h(Mark, { height: 13 }))))}
${cell('rail H=25', specRail, lockup(25))}
${cell('sign in H=27', specSignIn, lockup(27))}
</table>`);
console.log('wrote', process.argv[2]);
```

Run it from `web-portal/`, serve the scratch folder with `python3 -m http.server 8765 --directory <scratch>`, open `http://localhost:8765/pr8-specimens.html` with the Playwright browser tools, set the viewport to 900×700 at device scale 3, and screenshot.
**Acceptance:**
- Each row matches its specimen in frame proportion (4:5).
- The "af" is tucked low right and touches no rule.
- The 18px row is a hairline frame with a solid square.
- Our lockups use weight 300 (lighter than the 400 specimen, by spec) with the wordmark centred on the mark.
- Stroke may differ by ≤ 0.2px from the specimen (formula versus hand-set).

- [ ] **Step 3: Portal in place.**
  1. Start the local stack: `node scripts/local.cjs start`, `cd backend && npm run dev`, `cd web-portal && npm run dev`.
  2. With Playwright at http://localhost:3000/login, take screenshots in light and dark (`browser_evaluate` can't switch `prefers-color-scheme`, so use `browser_run_code_unsafe` with `page.emulateMedia({ colorScheme: 'dark' })`).
  3. Check the head links:
     ```js
     [...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]')].map(l => l.outerHTML)
     ```
     This must include `/favicon.svg` (`image/svg+xml`), `/apple-touch-icon.png` (`180x180`) and `/favicon.ico`.
  4. Fetch `/next.svg` and expect a 404.
  5. For the rail: if a synthetic clinician session is available locally, open `/patients` and screenshot the rail head. Otherwise ask the user to sign in (credentials live in private material this agent must not read), then screenshot.

  **Acceptance:**
  - The lockup is at the top-left of the sign-in column and heads the rail.
  - It's ink in light and #EFEDE4 in dark.
  - Nothing sits within 12.5px (rail) or 13.5px (sign-in) of the frame.
  - No Stethoscope anywhere.
  - The favicon shows the framed block in the tab.

- [ ] **Step 4: iOS in place and on the home screen** (xcodebuildmcp-cli skill).
  1. Build and run the Debug app on iPhone 17. Uninstall `com.aryansachdev.ClearAF.dev` first so SpringBoard drops the cached icon.
  2. Signed out, screenshot sign-in in light, then run `xcrun simctl ui booted appearance dark` and screenshot again.
  3. Press Home (xcodebuildmcp home button). Screenshot the home screen in dark, run `xcrun simctl ui booted appearance light`, and screenshot it in light.
  4. **Tinted is user-led:** ask the user to long-press the home screen, choose Edit → Customize → Tinted, and confirm the icon reads as a tinted frame with "af" on a dark plate. Then have them restore the default.

  **Acceptance:**
  - Sign-in lockup: frame, gap and wordmark read as one unit, with the "af" clear of the rules.
  - Light icon: ink frame on paper. Dark icon: light frame on near-black. Square artwork masked by iOS, with no double-rounded plate.
  - The frame sits slightly above centre.

- [ ] **Step 5: §8 checklist for the touched surfaces.** Confirm and note in the PR description:
  - No hue except reserved ochre, and the mark uses none.
  - Light and dark checked on device (Simulator) and in the browser.
  - No reference anywhere to retired tokens (Task 6 sweep green).
  - Keyboard focus is unchanged in the rail. Tab through: the lockup isn't focusable, and nav items still show the 2px ink outline.
  - The largest accessibility text size doesn't clip sign-in. The lockup is fixed-size and the title below it wraps.

  Then run `/code-review`. Agents: `care-access-reviewer` isn't required (no auth, data, photo or migration change; confirm `git diff origin/main --stat` touches no `Services/`, `backend/` or `supabase/`), and neither is `api-contract-checker` (no API shape change).

---

## Controller notes (added at execution)

- PRs 1–7 are all merged. Trust merged code over this plan's assumptions about placeholder names: find the real ones with `grep -rn 'data-placeholder="wordmark"' web-portal/src` and `grep -rn 'ClearAFWordmark' ClearAF`.
- ONE xcodebuild at a time, foreground, long timeout. The `axe` tap channel and the Simulator photo picker are both broken on this machine; use XCUITest and screenshots.
- Commits end with a blank line then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_014Fkk5DxDotGjtsofAxspCT`.
- The final retired-token sweep in this PR is the last acceptance item for the whole redesign.
