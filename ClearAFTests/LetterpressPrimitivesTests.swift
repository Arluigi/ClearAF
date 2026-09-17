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
