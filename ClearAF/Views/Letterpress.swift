import SwiftUI
import CoreText
import UIKit

/// Letterpress 1.0 tokens (docs/design/letterpress/spec.md §1). Ink is the action colour; ochre is only for unread and prescription.
enum Letterpress {
    // Paper
    static let canvas = Color("lp.canvas")
    static let surface = Color("lp.surface")
    static let rail = Color("lp.rail")
    static let sunk = Color("lp.sunk")

    // Ink
    static let ink = Color("lp.ink")
    static let inkSecondary = Color("lp.ink.secondary")
    static let inkTertiary = Color("lp.ink.tertiary")
    /// The only de-emphasis token. Never on `sunk` or `attentionWash`.
    static let inkFuture = Color("lp.ink.future")
    static var action: Color { ink }

    // Attention: unread and prescription only
    /// Graphics only (bars, dots). Use attentionText for text.
    static let attentionMark = Color("lp.attention.mark")
    static let attentionText = Color("lp.attention.text")
    static let attentionWash = Color("lp.attention.wash")

    static let error = Color("lp.error")
    static let rule = Color("lp.ink").opacity(0.13)

    static let colorNames = ["lp.canvas", "lp.surface", "lp.rail", "lp.sunk", "lp.ink", "lp.ink.secondary", "lp.ink.tertiary",
                             "lp.ink.future", "lp.attention.mark", "lp.attention.text", "lp.attention.wash", "lp.error"]

    // Type (spec §2). Static faces resolved by PostScript name; Plex Medium is "-Medm".
    enum UIWeight {
        case regular, body, medium
        var fontName: String {
            switch self {
            case .regular: "IBMPlexSans"
            case .body: "IBMPlexSans-Text"
            case .medium: "IBMPlexSans-Medm"
            }
        }
    }

    enum DataWeight {
        case regular, medium
        var fontName: String { self == .regular ? "IBMPlexMono" : "IBMPlexMono-Medm" }
    }

    static let fontNames = ["Newsreader16pt-Light", "Newsreader16pt-LightItalic", "Newsreader72pt-Light", "Newsreader72pt-LightItalic",
                            "IBMPlexSans", "IBMPlexSans-Text", "IBMPlexSans-Medm", "IBMPlexMono", "IBMPlexMono-Medm"]

    static func displayFontName(size: CGFloat, italic: Bool) -> String {
        "Newsreader\(size >= 28 ? "72pt" : "16pt")-Light\(italic ? "Italic" : "")"
    }

    static func display(_ size: CGFloat, italic: Bool = false, relativeTo style: Font.TextStyle = .largeTitle) -> Font {
        .custom(displayFontName(size: size, italic: italic), size: size, relativeTo: style)
    }

    static func ui(_ size: CGFloat, weight: UIWeight = .body, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(weight.fontName, size: size, relativeTo: style)
    }

    /// Metadata, numbers and eyebrows. Tabular figures always.
    static func data(_ size: CGFloat, weight: DataWeight = .medium, relativeTo style: Font.TextStyle = .caption) -> Font {
        Font.custom(weight.fontName, size: size, relativeTo: style).monospacedDigit()
    }

    /// Registers bundled fonts once per process. Safe to call repeatedly.
    static func registerFonts() {
        _ = fontRegistration
    }

    private static let fontRegistration: Void = {
        let urls = Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) ?? []
        CTFontManagerRegisterFontURLs(urls as CFArray, .process, true, nil)
        #if DEBUG
        for name in fontNames { assert(UIFont(name: name, size: 12) != nil, "Letterpress font \(name) failed to register") }
        #endif
    }()
}
