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

    /// Posts a VoiceOver announcement whenever `message` becomes a new non-nil value.
    func announcing(_ message: String?) -> some View {
        onChange(of: message) { _, new in
            if let new, !new.isEmpty { AccessibilityNotification.Announcement(new).post() }
        }
    }
}
