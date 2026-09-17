import SwiftUI
import UIKit

/// Baseline-rule field (spec §4.2): 1.5pt ink when filled or focused, ink at 50% when empty.
struct LetterpressFieldModifier: ViewModifier {
    static let ruleWidth: CGFloat = 1.5

    let isEmpty: Bool
    @FocusState private var focused: Bool

    func body(content: Content) -> some View {
        content
            .font(Letterpress.ui(17, relativeTo: .body))
            .focused($focused)
            .padding(.vertical, Letterpress.Space.s10)
            .frame(minHeight: Letterpress.minTouch)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(isEmpty && !focused ? Letterpress.fieldRuleEmpty : Letterpress.ink)
                    .frame(height: Self.ruleWidth)
                    .accessibilityHidden(true)
            }
    }
}

extension View {
    func letterpressField(isEmpty: Bool) -> some View {
        modifier(LetterpressFieldModifier(isEmpty: isEmpty))
    }
}

/// Two-to-three-way mode switch (spec §4.3): native segmented Picker, becoming a menu at accessibility text sizes.
struct LetterpressPicker<Selection: Hashable, Options: View>: View {
    let title: String
    @Binding var selection: Selection
    @ViewBuilder let options: () -> Options
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            Picker(title, selection: $selection, content: options).pickerStyle(.menu)
                .frame(minHeight: Letterpress.minTouch)
        } else {
            Picker(title, selection: $selection, content: options).pickerStyle(.segmented)
        }
    }
}

extension Letterpress {
    /// Native switch on-track. Ink in light; ink.tertiary in dark, because dark ink (#EFEDE4) against the white thumb
    /// is 1.17:1 while ink.tertiary is 3.33:1 against the thumb and 5.39:1 against canvas.
    static let toggleOn = Color(UIColor { traits in
        UIColor(named: traits.userInterfaceStyle == .dark ? "lp.ink.tertiary" : "lp.ink", in: .main, compatibleWith: traits)!
    })

    /// Segmented controls stay native (spec §4.3); the appearance proxy supplies the sunk track, surface thumb and
    /// Plex labels (weight changes on selection). Corners stay system-rounded: squaring them needs custom geometry.
    ///
    /// `UIFontMetrics.scaledFont(for:)` bakes in the content size category at the moment it's called, into a plain
    /// `UIFont` — it does not keep tracking Dynamic Type on its own the way a system label with
    /// `adjustsFontForContentSizeCategory` does. Re-run this whenever the category changes (`observeContentSizeChanges`,
    /// called once from here) so any segmented control built afterward — a new `LetterpressPicker` mounted on
    /// navigating to a screen, or SwiftUI recreating one — resolves the current size. What this *cannot* fix: a
    /// `UISegmentedControl` already on screen when the category changes. `UIAppearance` proxies only apply their
    /// attributes when a view is initialized (or re-added to a window); re-setting the proxy does not repaint an
    /// existing instance, and SwiftUI's `Picker(.segmented)` bridge is a private, non-`UIViewRepresentable` type we
    /// have no hook into to force a rebuild. In practice the segmented pickers in this app (`LetterpressPicker`) sit
    /// on screens that get torn down and remounted on navigation, so this is a rare, cosmetic gap (a picker visible
    /// at the exact moment the user changes text size in Settings keeps its old label size until the screen next
    /// appears), not a silent correctness bug.
    @MainActor static func applyControlAppearance() {
        let control = UISegmentedControl.appearance()
        control.backgroundColor = UIColor(named: "lp.sunk")
        control.selectedSegmentTintColor = UIColor(named: "lp.surface")
        applySegmentedFonts()
        observeContentSizeChanges()
    }

    /// Resolves and sets the segmented title fonts for the *current* content size category. Split out so both
    /// the initial call and the content-size observer below share one implementation.
    @MainActor private static func applySegmentedFonts() {
        let control = UISegmentedControl.appearance()
        let metrics = UIFontMetrics(forTextStyle: .footnote)
        func font(_ weight: UIWeight) -> UIFont {
            metrics.scaledFont(for: UIFont(name: weight.fontName, size: 13) ?? UIFont.preferredFont(forTextStyle: .footnote))
        }
        control.setTitleTextAttributes([.font: font(.body), .foregroundColor: UIColor(named: "lp.ink.secondary")!], for: .normal)
        control.setTitleTextAttributes([.font: font(.medium), .foregroundColor: UIColor(named: "lp.ink")!], for: .selected)
    }

    /// `NSObjectProtocol` observer tokens aren't `Sendable`, so a plain `static var` holding one fails Swift's
    /// strict-concurrency check even though every read and write here happens on the main actor: `Letterpress`
    /// is an enum, not an actor, so the compiler can't see that `applyControlAppearance`/this initializer being
    /// `@MainActor` is enough to serialize access to it. `nonisolated(unsafe)` is the escape hatch for exactly
    /// that case — it's safe because the only writer is the `guard ... else { return }` below (set once, never
    /// reassigned) and the only reader is that same guard, both always on the main actor.
    nonisolated(unsafe) private static var contentSizeObserver: NSObjectProtocol?

    /// Registered once: re-resolves the segmented appearance's fonts whenever the system content size category
    /// changes, so pickers built after that point (see `applyControlAppearance` above) pick up the new size.
    @MainActor private static func observeContentSizeChanges() {
        guard contentSizeObserver == nil else { return }
        contentSizeObserver = NotificationCenter.default.addObserver(
            forName: UIContentSizeCategory.didChangeNotification, object: nil, queue: .main
        ) { _ in
            Task { @MainActor in applySegmentedFonts() }
        }
    }
}
