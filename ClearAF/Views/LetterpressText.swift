import SwiftUI

/// Section eyebrow and persistent field label (spec §2, §4.2): mono 500, 10pt, 0.16em tracking, uppercase.
/// Never a sentence, never a button label.
struct LetterpressEyebrow: ViewModifier {
    static let size: CGFloat = 10
    static let trackingEm: CGFloat = 0.16
    static var tracking: CGFloat { size * trackingEm }

    var color: Color = Letterpress.inkTertiary

    func body(content: Content) -> some View {
        content
            .font(Letterpress.data(Self.size, weight: .medium, relativeTo: .caption2))
            .tracking(Self.tracking)
            .textCase(.uppercase)
            .foregroundStyle(color)
    }
}

extension View {
    func letterpressEyebrow(color: Color = Letterpress.inkTertiary) -> some View {
        modifier(LetterpressEyebrow(color: color))
    }
}

/// Rules, not borders (spec §3): 1pt `rule` between rows and sections; 2pt ink for a major break.
struct LetterpressRule: View {
    enum Weight {
        case hairline, major
        var thickness: CGFloat { self == .major ? 2 : 1 }
    }

    var weight: Weight = .hairline

    var body: some View {
        Rectangle()
            .fill(weight == .major ? Letterpress.ink : Letterpress.rule)
            .frame(height: weight.thickness)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
    }
}
