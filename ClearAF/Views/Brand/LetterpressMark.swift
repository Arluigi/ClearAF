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

/// UNZIT wordmark in the existing Letterpress display face. The API stays stable for existing placements.
struct LetterpressLockup: View {
    /// Frame height on sign in and password recovery (mobile mockup screen 1).
    static let signInHeight: CGFloat = 28

    let height: CGFloat

    var body: some View {
        let size = LetterpressMarkGeometry.wordmarkSize(height: height)
        Text("UNZIT")
            .font(.custom(Letterpress.displayFontName(size: size, italic: false), fixedSize: size))
            .tracking(size * LetterpressMarkGeometry.wordmarkTrackingEm)
            .lineLimit(1)
            .fixedSize()
        .foregroundStyle(Letterpress.ink)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("UNZIT")
        .accessibilityAddTraits(.isHeader)
    }
}
