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
        #expect(G.usesBlock(height: 19))
        #expect(!G.usesBlock(height: 20))
        let block = G.block(height: 13)
        #expect(Self.near(block.width, 4.03) && Self.near(block.height, 4.03))
        #expect(Self.near(block.minX, 4.58))
        #expect(Self.near(block.minY, 7.18))
    }

    @Test func usesBlockOverrideForcesTheBlockRegardlessOfHeight() {
        // The 32px favicon renders above blockBelowHeight but must still show the block (§4a); the .ico renderer
        // passes usesBlock: true explicitly rather than relying on the size-derived rule.
        let letters = G.path(height: 72)
        let forcedBlock = G.path(height: 72, usesBlock: true)
        #expect(!G.usesBlock(height: 72), "height 72 would draw letters by the default rule")
        let center = CGPoint(x: G.block(height: 72).midX, y: G.block(height: 72).midY)
        #expect(forcedBlock.contains(center, using: .winding), "forced block fills its own bounds")
        #expect(letters != forcedBlock)
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
