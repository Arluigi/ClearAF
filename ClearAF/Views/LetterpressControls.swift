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
    @MainActor static func applyControlAppearance() {
        let control = UISegmentedControl.appearance()
        control.backgroundColor = UIColor(named: "lp.sunk")
        control.selectedSegmentTintColor = UIColor(named: "lp.surface")
        let metrics = UIFontMetrics(forTextStyle: .footnote)
        func font(_ weight: UIWeight) -> UIFont {
            metrics.scaledFont(for: UIFont(name: weight.fontName, size: 13) ?? UIFont.preferredFont(forTextStyle: .footnote))
        }
        control.setTitleTextAttributes([.font: font(.body), .foregroundColor: UIColor(named: "lp.ink.secondary")!], for: .normal)
        control.setTitleTextAttributes([.font: font(.medium), .foregroundColor: UIColor(named: "lp.ink")!], for: .selected)
    }
}
