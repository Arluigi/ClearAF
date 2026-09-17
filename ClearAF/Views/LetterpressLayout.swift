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
