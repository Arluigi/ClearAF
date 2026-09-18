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
