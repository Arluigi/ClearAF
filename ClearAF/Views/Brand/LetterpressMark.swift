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
        // Fixed to Letterpress.ink (not the view's inherited foreground) because every current placement — portal
        // rail, portal sign-in, iOS sign-in — sits on paper/canvas, and Letterpress.ink already reverses for dark
        // mode via the asset catalog's Any/Dark pair. The portal's Mark/Lockup instead inherit `currentColor` from
        // a `className`, because CSS has no equivalent of a colour-set asset to reverse automatically. A reversed
        // placement on ink (e.g. an ochre wash or a dark plate) would need this lockup to take an explicit colour
        // parameter instead of hardcoding Letterpress.ink; nothing in the current spec needs that yet.
        .foregroundStyle(Letterpress.ink)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("ClearAF")
        .accessibilityAddTraits(.isHeader)
    }
}
