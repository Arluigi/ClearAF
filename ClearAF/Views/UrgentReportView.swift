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

/// Today's entry point to the urgent report sheet.
struct UrgentReportEntry: View {
    @State private var showing = false
    var body: some View {
        Button { showing = true } label: {
            HStack(spacing: .spaceMD) {
                Label {
                    VStack(alignment: .leading, spacing: .spaceXS) {
                        Text("Something's wrong?").font(.headline)
                        Text("Tell your care team about a reaction or sudden change")
                            .font(.subheadline)
                            .foregroundStyle(CareJournal.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } icon: {
                    Image(systemName: "exclamationmark.triangle").foregroundStyle(.red)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(CareJournal.textSecondary).accessibilityHidden(true)
            }
            .foregroundStyle(CareJournal.textPrimary)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .careJournalSurface()
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 20)
        .accessibilityIdentifier("urgentEntry")
        .sheet(isPresented: $showing) { UrgentReportView() }
    }
}

struct UrgentReportView: View {
    @ObservedObject private var repository = APIService.shared.urgentReports
    @Environment(\.dismiss) private var dismiss
    @State private var category: UrgentCategory?
    @State private var details = ""
    private let question = "What's happening?"

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label {
                        Text(UrgentReportCopy.emergency).font(.callout.weight(.semibold))
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
                    }
                }
                .listRowBackground(Color.red.opacity(0.12))
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
                if let pending = repository.pending { category = pending.category; details = pending.description }
                guard let ticket = APIService.shared.access.snapshot() else { return }
                await repository.load(ticket: ticket)
            }
        }
    }

    @ViewBuilder private var composer: some View {
        let frozen = repository.pending != nil
        Section {
            Picker(question, selection: $category) {
                ForEach(UrgentCategory.allCases) { Text($0.title).tag(Optional($0)) }
            }
            .pickerStyle(.inline)
            .labelsHidden()
            .accessibilityIdentifier("urgentCategory")
            .disabled(frozen)
        } header: { Text(question).textCase(nil) }
        Section {
            TextField("Describe what's happening", text: $details, axis: .vertical)
                .lineLimit(3...8)
                .accessibilityIdentifier("urgentDescription")
                .disabled(frozen)
            Text("\(details.utf16.count)/2000")
                .font(.caption)
                .foregroundStyle(details.utf16.count > 2000 ? Color.retainedErrorText : CareJournal.textSecondary)
        } header: { Text("Details").textCase(nil) }
        Section {
            Button(action: send) {
                HStack(spacing: .spaceSM) {
                    if repository.sending { SwiftUI.ProgressView().tint(CareJournal.onPrimary) }
                    Text(frozen ? "Retry" : "Send")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(CareJournal.actionPrimary)
            .foregroundStyle(CareJournal.onPrimary)
            .disabled(!canSend)
            .accessibilityIdentifier("urgentSend")
            if let error = repository.error {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color.retainedErrorText)
                    .accessibilityIdentifier("urgentError")
            }
        }
    }

    private var canSend: Bool {
        guard !repository.sending else { return false }
        if repository.pending != nil { return true }
        let count = details.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count
        return category != nil && (1...2000).contains(count)
    }

    private func send() {
        guard canSend, let ticket = APIService.shared.access.snapshot() else { return }
        let chosen = repository.pending?.category ?? category ?? .other
        Task { await repository.send(category: chosen, description: details, ticket: ticket) }
    }
}

private struct UrgentReportRow: View {
    let report: UrgentReport
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceXS) {
            Text(UrgentCategory(rawValue: report.category)?.title ?? UrgentCategory.other.title).font(.headline)
            HStack(spacing: .spaceXS) {
                if let date = RoutineDates.instant(report.createdAt) {
                    Text(date, format: .dateTime.month().day().hour().minute())
                    Text("·").accessibilityHidden(true)
                }
                Text(UrgentReportCopy.status(report.status))
            }
            .font(.caption)
            .foregroundStyle(CareJournal.textSecondary)
            if let note = report.resolutionNote, !note.isEmpty {
                Text(note).font(.callout).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
