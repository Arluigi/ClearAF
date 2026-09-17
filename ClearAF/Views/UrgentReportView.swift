import SwiftUI

enum UrgentReportCopy {
    static let emergency = "If you have trouble breathing, swelling of your face, lips or throat, or feel seriously unwell, call 911 now."
    static let sent = "Sent. It's flagged as urgent at the top of your care team's queue."
    static let disabledReason = "Choose what's happening and describe it to send."
    static func status(_ status: String) -> String {
        switch status {
        case "acknowledged": return "Seen by your care team"
        case "resolved": return "Resolved"
        default: return "Open"
        }
    }
    static func meta(_ report: UrgentReport, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let state = status(report.status)
        guard let date = RoutineDates.instant(report.createdAt) else { return state }
        return "\(LetterpressFormat.dayMonth(date, locale: locale, timeZone: timeZone)), \(LetterpressFormat.clock(date, locale: locale, timeZone: timeZone)) · \(state)"
    }
}

/// The "Something's wrong?" row on Today and at the top of each enrollment step. Said in words; no warning colour.
struct UrgentReportEntry: View {
    /// 22 on Today; 0 where the row sits inside a padded container.
    var horizontalPadding: CGFloat = Letterpress.Space.s22
    @State private var showing = false
    var body: some View {
        Button { showing = true } label: {
            HStack(spacing: Letterpress.Space.s14) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text("Something's wrong?")
                        .font(Letterpress.ui(16, weight: .medium, relativeTo: .headline))
                        .foregroundStyle(Letterpress.ink)
                    Text("Tell your care team about a reaction or sudden change")
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .accessibilityHidden(true)
            }
            .multilineTextAlignment(.leading)
            .padding(.vertical, Letterpress.Space.s10)
            .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
            .overlay(alignment: .top) { LetterpressRule() }
            .overlay(alignment: .bottom) { LetterpressRule() }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, horizontalPadding)
        .accessibilityIdentifier("urgentEntry")
        .sheet(isPresented: $showing) { UrgentReportView() }
    }
}

struct UrgentReportView: View {
    @ObservedObject private var repository = APIService.shared.urgentReports
    @Environment(\.dismiss) private var dismiss
    private let question = "What's happening?"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s22) {
                    emergencyNotice
                    if repository.sent != nil {
                        Text(UrgentReportCopy.sent)
                            .font(Letterpress.ui(16, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("urgentSent")
                    } else {
                        composer
                    }
                    if !repository.reports.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Recent reports").letterpressEyebrow().padding(.bottom, Letterpress.Space.s6)
                            ForEach(repository.reports) { UrgentReportRow(report: $0) }
                            LetterpressRule()
                        }
                    }
                }
                .padding(Letterpress.Space.s22)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Something's wrong?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .task {
                repository.startNew()
                guard let ticket = APIService.shared.access.snapshot() else { return }
                await repository.load(ticket: ticket)
            }
        }
        .letterpressSheetBackground()
    }

    /// Emphasis without a hue (carry-in from PR 2): 2px ink leading rule, medium-weight title, error-coloured icon kept.
    private var emergencyNotice: some View {
        HStack(alignment: .top, spacing: Letterpress.Space.s10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Letterpress.error)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                Text("Emergency").letterpressEyebrow(color: Letterpress.ink)
                Text(UrgentReportCopy.emergency)
                    .font(Letterpress.ui(16, weight: .medium, relativeTo: .callout))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.leading, Letterpress.Space.s14)
        .overlay(alignment: .leading) { Rectangle().fill(Letterpress.ink).frame(width: 2) }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("urgentEmergencyNotice")
    }

    // The draft lives in the account-scoped repository, so closing the sheet or a phase change never loses it.
    private var category: Binding<UrgentCategory?> {
        Binding(get: { repository.draft.category },
                set: { repository.updateDraft(UrgentDraft(category: $0, description: repository.draft.description)) })
    }
    private var details: Binding<String> {
        Binding(get: { repository.draft.description },
                set: { repository.updateDraft(UrgentDraft(category: repository.draft.category, description: $0)) })
    }

    private var composer: some View {
        let frozen = repository.pending != nil
        let count = repository.draft.description.utf16.count
        return VStack(alignment: .leading, spacing: Letterpress.Space.s22) {
            VStack(alignment: .leading, spacing: 0) {
                Text(question).letterpressEyebrow().padding(.bottom, Letterpress.Space.s6)
                ForEach(UrgentCategory.allCases) { option in
                    let selected = repository.draft.category == option
                    Button { category.wrappedValue = option } label: {
                        HStack(spacing: Letterpress.Space.s14) {
                            Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                                .font(Letterpress.ui(20, relativeTo: .body))
                                .foregroundStyle(Letterpress.ink)
                                .accessibilityHidden(true)
                            Text(option.title)
                                .font(Letterpress.ui(16, relativeTo: .body))
                                .foregroundStyle(Letterpress.ink)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, Letterpress.Space.s10)
                        .frame(minHeight: Letterpress.minTouch)
                        .overlay(alignment: .top) { LetterpressRule() }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(frozen)
                    .accessibilityAddTraits(selected ? [.isSelected] : [])
                }
                LetterpressRule()
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("urgentCategory")
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                Text("Details").letterpressEyebrow()
                TextField("Describe what's happening", text: details, axis: .vertical)
                    .lineLimit(3...8)
                    .letterpressField(isEmpty: repository.draft.description.isEmpty)
                    .accessibilityIdentifier("urgentDescription")
                    .disabled(frozen)
                Text("\(count) / 2000")
                    .font(Letterpress.data(12, weight: .regular, relativeTo: .caption))
                    .foregroundStyle(count > 2000 ? Letterpress.error : Letterpress.inkSecondary)
            }
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Button(action: send) {
                    Text(repository.sending ? "Sending…" : frozen ? "Retry" : "Send")
                }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(!canSend)
                .accessibilityIdentifier("urgentSend")
                if let error = repository.error {
                    Text(error)
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("urgentError")
                } else if !canSend && !repository.sending {
                    Text(UrgentReportCopy.disabledReason)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
            }
        }
    }

    private var canSend: Bool {
        guard !repository.sending else { return false }
        if repository.pending != nil { return true }
        let count = repository.draft.description.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count
        return repository.draft.category != nil && (1...2000).contains(count)
    }

    private func send() {
        guard canSend, let ticket = APIService.shared.access.snapshot() else { return }
        let draft = repository.draft
        let chosen = repository.pending?.category ?? draft.category ?? .other
        Task { await repository.send(category: chosen, description: draft.description, ticket: ticket) }
    }
}

private struct UrgentReportRow: View {
    let report: UrgentReport
    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
            Text(UrgentCategory(rawValue: report.category)?.title ?? UrgentCategory.other.title)
                .font(Letterpress.ui(16, weight: .medium, relativeTo: .headline))
                .foregroundStyle(Letterpress.ink)
            Text(UrgentReportCopy.meta(report))
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
            if let note = report.resolutionNote, !note.isEmpty {
                Text(note)
                    .font(Letterpress.display(16, relativeTo: .callout))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Letterpress.Space.s10)
        .overlay(alignment: .top) { LetterpressRule() }
        .accessibilityElement(children: .combine)
    }
}
