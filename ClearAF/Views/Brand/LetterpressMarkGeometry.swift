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
    /// Raised from 16 to 20 so there's no dead band above the 18px specimen where the monogram is mush
    /// (docs/design/design-language.md, Identity).
    static let blockBelowHeight: CGFloat = 20
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
    /// `usesBlock` overrides the size-derived rule (`Self.usesBlock(height:)`) when non-nil: the favicon renders
    /// at a height above `blockBelowHeight` (its 32px .ico bitmap needs a large enough frame to read at all) but
    /// still must show the approved block specimen, not a smear of "af" (logo-directions §4a).
    static func path(height: CGFloat, origin: CGPoint = .zero, usesBlock: Bool? = nil) -> CGPath {
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
        if usesBlock ?? Self.usesBlock(height: height) {
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
