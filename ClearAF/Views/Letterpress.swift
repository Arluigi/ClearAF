import SwiftUI

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
    static let attentionMark = Color("lp.attention.mark")
    static let attentionText = Color("lp.attention.text")
    static let attentionWash = Color("lp.attention.wash")

    static let error = Color("lp.error")
    static let rule = Color("lp.ink").opacity(0.13)

    static let colorNames = ["lp.canvas", "lp.surface", "lp.rail", "lp.sunk", "lp.ink", "lp.ink.secondary", "lp.ink.tertiary",
                             "lp.ink.future", "lp.attention.mark", "lp.attention.text", "lp.attention.wash", "lp.error"]
}
