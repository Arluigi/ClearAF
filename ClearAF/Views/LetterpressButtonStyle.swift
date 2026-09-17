import SwiftUI

/// Letterpress buttons (spec §4.1): filled ink, outlined (1pt ink at 32%), text-underline. Radius 4.
/// Height is pinned with `minHeight`, never derived from padding, so Dynamic Type and font metrics cannot shrink it
/// below 44pt. Disabled is `sunk` + `ink.tertiary`; the screen states why in a sentence.
struct LetterpressButtonStyle: ButtonStyle {
    enum Variant: CaseIterable { case filled, outlined, underline }

    /// `.regular` is the pinned 44pt button (spec §4.1). `.compact` is for controls nested inside an already-tight
    /// layout — a grid tile's Share/Retry — where growing the visible row by 44pt would grow the tile itself.
    enum Size { case regular, compact }

    static let minHeight: CGFloat = Letterpress.minTouch
    static let cornerRadius: CGFloat = Letterpress.Radius.control
    static let outlineOpacity: Double = 0.32
    static let compactFontSize: CGFloat = 11
    /// Half of `minTouch`: expanding a hit shape by this much on every side always yields at least a 44×44
    /// hit-testing rectangle, however small the compact content itself renders (down to zero).
    static let compactHitAreaInset: CGFloat = Letterpress.minTouch / 2

    var variant: Variant = .filled
    var fullWidth = false
    var size: Size = .regular

    func makeBody(configuration: Configuration) -> some View {
        LetterpressButtonBody(configuration: configuration, variant: variant, fullWidth: fullWidth, size: size)
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
    let size: LetterpressButtonStyle.Size
    @Environment(\.isEnabled) private var isEnabled

    private var compact: Bool { size == .compact }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: LetterpressButtonStyle.cornerRadius)
        configuration.label
            .font(compact
                ? Letterpress.ui(LetterpressButtonStyle.compactFontSize, weight: .medium, relativeTo: .caption2)
                : Letterpress.ui(16, weight: .medium, relativeTo: .body))
            .underline(variant == .underline)
            .multilineTextAlignment(.center)
            .foregroundStyle(LetterpressButtonStyle.foreground(variant, isEnabled: isEnabled))
            .padding(.horizontal, variant == .underline ? 0 : (compact ? Letterpress.Space.s6 : Letterpress.Space.s18))
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: compact ? nil : LetterpressButtonStyle.minHeight)
            .background(LetterpressButtonStyle.background(variant, isEnabled: isEnabled), in: shape)
            .overlay {
                if variant == .outlined && isEnabled {
                    shape.strokeBorder(Letterpress.ink.opacity(LetterpressButtonStyle.outlineOpacity), lineWidth: 1)
                }
            }
            .contentShape(shape)
            .modifier(ExpandedHitArea(mode: compact ? .inset : (variant == .underline ? .framed : .none)))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Expands a button's tap target to the spec's 44×44pt minimum without adding visible padding to the drawn
/// control. `.framed` (the regular underline variant, which usually stands alone in its own row) grows the
/// view's own layout frame around the unpadded label — the visible label stays put, but the row reserves 44pt.
/// `.compact` instead widens only the hit-testing *shape*, leaving the layout frame — and so a tightly stacked
/// container like a grid tile — untouched; `contentShape` accepts geometry independent of a view's own bounds,
/// so an inset can legitimately claim tap area outside them.
private struct ExpandedHitArea: ViewModifier {
    enum Mode { case none, framed, inset }
    let mode: Mode

    func body(content: Content) -> some View {
        switch mode {
        case .none:
            content
        case .framed:
            content
                .frame(minWidth: Letterpress.minTouch, minHeight: Letterpress.minTouch)
                .contentShape(Rectangle())
        case .inset:
            content
                .contentShape(Rectangle().inset(by: -LetterpressButtonStyle.compactHitAreaInset))
        }
    }
}

extension ButtonStyle where Self == LetterpressButtonStyle {
    static func letterpress(_ variant: LetterpressButtonStyle.Variant = .filled, fullWidth: Bool = false,
                             size: LetterpressButtonStyle.Size = .regular) -> LetterpressButtonStyle {
        LetterpressButtonStyle(variant: variant, fullWidth: fullWidth, size: size)
    }
}
