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
            .modifier(UnderlineHitArea(isActive: variant == .underline))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Expands the underline variant's tap target to the spec's 44×44pt minimum without adding
/// visible padding: the frame grows around the already-drawn (unpadded) label, centred, and only
/// the hit-testing shape follows — filled/outlined keep their own rounded-rect content shape.
private struct UnderlineHitArea: ViewModifier {
    let isActive: Bool
    func body(content: Content) -> some View {
        if isActive {
            content
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        } else {
            content
        }
    }
}

extension ButtonStyle where Self == LetterpressButtonStyle {
    static func letterpress(_ variant: LetterpressButtonStyle.Variant = .filled, fullWidth: Bool = false) -> LetterpressButtonStyle {
        LetterpressButtonStyle(variant: variant, fullWidth: fullWidth)
    }
}
