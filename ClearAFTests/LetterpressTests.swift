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
