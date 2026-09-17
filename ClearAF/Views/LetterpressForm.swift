import SwiftUI

/// Step progress (spec §6 #2, #9): one 2pt rule per step, ink for steps reached. The mono counter beside it carries
/// the meaning, so the rule is hidden from VoiceOver.
struct LetterpressProgressRule: View {
    static let height: CGFloat = 2
    static let pendingOpacity: Double = 0.2

    let completed: Int
    let total: Int

    static func isFilled(_ segment: Int, completed: Int) -> Bool { segment < completed }

    var body: some View {
        HStack(spacing: Letterpress.Space.s4) {
            ForEach(0..<max(total, 1), id: \.self) { segment in
                Rectangle()
                    .fill(Self.isFilled(segment, completed: completed) ? Letterpress.ink : Letterpress.ink.opacity(Self.pendingOpacity))
                    .frame(height: Self.height)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }
}

/// Single-choice row: ruled, 44pt minimum, radio mark in ink, selection spoken as a trait.
struct LetterpressRadioRow: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Letterpress.Space.s14) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .font(Letterpress.ui(20, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .accessibilityHidden(true)
                Text(title)
                    .font(Letterpress.ui(16, weight: selected ? .medium : .body, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, Letterpress.Space.s10)
            .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
            .overlay(alignment: .top) { LetterpressRule() }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// Persistent mono label above a baseline-rule field, with a note or validation message beneath (spec §4.2).
/// Placeholders are examples only; the label names the field.
struct LetterpressLabeledField<Field: View>: View {
    let label: String
    let isEmpty: Bool
    var message: String? = nil
    var isError = false
    @ViewBuilder let field: () -> Field

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Text(label)
                .letterpressEyebrow()
                .accessibilityHidden(true)
            field()
                .letterpressField(isEmpty: isEmpty)
            if let message {
                Text(message)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(isError ? Letterpress.error : Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
