import SwiftUI

enum UrgentReportCopy {
    static let emergency = "If you have trouble breathing, swelling of your face, lips or throat, or feel seriously unwell, call 911 now."
    static let sent = "Sent. It's flagged as urgent at the top of your care team's queue."
    static func status(_ status: String) -> String {
        switch status {
        case "acknowledged": return "Seen by your care team"
        case "resolved": return "Resolved"
        default: return "Open"
        }
    }
}

/// The "Something's wrong?" row on Today and at the top of each enrollment step.
struct UrgentReportEntry: View {
    /// 20 on Today; 0 where the row sits inside a padded container or a form section.
    var horizontalPadding: CGFloat = 20
    @State private var showing = false
    var body: some View {
        Button { showing = true } label: {
            HStack(spacing: Letterpress.Space.s14) {
                Label {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                        Text("Something's wrong?").font(.headline)
                        Text("Tell your care team about a reaction or sudden change")
                            .font(.subheadline)
                            .foregroundStyle(Letterpress.inkSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } icon: {
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(Letterpress.error)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(Letterpress.inkSecondary).accessibilityHidden(true)
            }
            .foregroundStyle(Letterpress.ink)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .letterpressSurface()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, horizontalPadding)
        .accessibilityIdentifier("urgentEntry")
        .sheet(isPresented: $showing) { UrgentReportView() }
    }
}

/// Compact entry for the onboarding overlay, so an urgent report is possible in every signed-in phase.
struct UrgentReportButton: View {
    @Binding var isPresented: Bool
    var body: some View {
        Button { isPresented = true } label: {
            Label {
                Text("Something's wrong?").foregroundStyle(Letterpress.error)
            } icon: {
                Image(systemName: "exclamationmark.triangle").foregroundStyle(Letterpress.error)
            }
            .labelStyle(.titleAndIcon)
        }
        .accessibilityIdentifier("urgentEntry")
        .accessibilityHint("Tell your care team about a reaction or sudden change")
    }
}

struct UrgentReportView: View {
    @ObservedObject private var repository = APIService.shared.urgentReports
    @Environment(\.dismiss) private var dismiss
    private let question = "What's happening?"

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label {
                        Text(UrgentReportCopy.emergency).font(.callout.weight(.semibold))
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Letterpress.error)
                    }
                    .accessibilityIdentifier("urgentEmergencyNotice")
                }
                .listRowBackground(Letterpress.sunk)
                if repository.sent != nil {
                    Section {
                        Label(UrgentReportCopy.sent, systemImage: "checkmark.circle")
                            .accessibilityIdentifier("urgentSent")
                    }
                } else {
                    composer
                }
                if !repository.reports.isEmpty {
                    Section {
                        ForEach(repository.reports) { UrgentReportRow(report: $0) }
                    } header: { Text("Recent reports").textCase(nil) }
                }
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

    @ViewBuilder private var composer: some View {
        let frozen = repository.pending != nil
        let count = repository.draft.description.utf16.count
        Section {
            Picker(question, selection: category) {
                ForEach(UrgentCategory.allCases) { Text($0.title).tag(Optional($0)) }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            .accessibilityIdentifier("urgentCategory")
            .disabled(frozen)
        } header: { Text(question).textCase(nil) }
        Section {
            TextField("Describe what's happening", text: details, axis: .vertical)
                .lineLimit(3...8)
                .accessibilityIdentifier("urgentDescription")
                .disabled(frozen)
            Text("\(count)/2000")
                .font(.caption)
                .foregroundStyle(count > 2000 ? Letterpress.error : Letterpress.inkSecondary)
        } header: { Text("Details").textCase(nil) }
        Section {
            Button(action: send) {
                HStack(spacing: Letterpress.Space.s10) {
                    if repository.sending { SwiftUI.ProgressView().tint(Letterpress.inkTertiary) }
                    Text(frozen ? "Retry" : "Send")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.letterpress(.filled))
            .disabled(!canSend)
            .accessibilityIdentifier("urgentSend")
            if let error = repository.error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(Letterpress.error)
                    .accessibilityIdentifier("urgentError")
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
            Text(UrgentCategory(rawValue: report.category)?.title ?? UrgentCategory.other.title).font(.headline)
            HStack(spacing: Letterpress.Space.s4) {
                if let date = RoutineDates.instant(report.createdAt) {
                    Text(date, format: .dateTime.month().day().hour().minute())
                    Text("·").accessibilityHidden(true)
                }
                Text(UrgentReportCopy.status(report.status))
            }
            .font(.caption)
            .foregroundStyle(Letterpress.inkSecondary)
            if let note = report.resolutionNote, !note.isEmpty {
                Text(note).font(.callout).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
