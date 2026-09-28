import SwiftUI

extension View {
    func accessibleButton(label: String, hint: String? = nil, value: String? = nil) -> some View {
        self
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(label)
            .accessibilityHint(hint ?? "")
            .accessibilityValue(value ?? "")
    }
}
