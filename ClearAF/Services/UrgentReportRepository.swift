import Foundation
import Combine

@MainActor protocol UrgentReportTransport {
    func sendUrgentReport(id: UUID, category: UrgentCategory, description: String, ticket: AccountAccess.Ticket) async throws -> UrgentReport
    func urgentReports(ticket: AccountAccess.Ticket) async throws -> [UrgentReport]
}

/// What the person has chosen and typed so far; kept with the account so it survives the sheet closing or a phase change.
struct UrgentDraft: Equatable {
    var category: UrgentCategory?
    var description = ""
}

/// Urgent reports go to the patient's assigned clinician. They are never gated on enrollment.
@MainActor final class UrgentReportRepository: ObservableObject {
    @Published private(set) var reports: [UrgentReport] = []
    @Published private(set) var draft = UrgentDraft()
    /// The first attempt is frozen while it can be retried unchanged, so a retry never creates a second report.
    @Published private(set) var pending: (id: UUID, category: UrgentCategory, description: String)?
    @Published private(set) var sending = false
    @Published private(set) var error: String?
    @Published private(set) var sent: UrgentReport?
    private let access: AccountAccess
    private let transport: any UrgentReportTransport
    private var epoch = UUID()

    init(access: AccountAccess, transport: any UrgentReportTransport) { self.access = access; self.transport = transport }

    func cancel() { epoch = UUID(); reports = []; draft = UrgentDraft(); pending = nil; sending = false; error = nil; sent = nil }
    private func require(_ ticket: AccountAccess.Ticket, _ e: UUID) throws {
        try access.require(ticket); guard epoch == e else { throw AccountFailure.accountChanged }
    }

    /// Edits are ignored while an attempt is frozen or sending.
    func updateDraft(_ next: UrgentDraft) {
        guard pending == nil, !sending else { return }
        draft = next
    }

    /// Clears a previous confirmation when the sheet opens again; a frozen attempt and its error stay.
    func startNew() {
        guard !sending else { return }
        sent = nil
        if pending == nil { error = nil }
    }

    func send(category: UrgentCategory, description: String, ticket: AccountAccess.Ticket) async {
        guard (try? access.require(ticket)) != nil, !sending else { return }
        let e = epoch
        if pending == nil {
            draft = UrgentDraft(category: category, description: description)
            let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
            guard (1...2000).contains(text.utf16.count) else { error = "Describe what's happening (up to 2,000 characters)."; return }
            pending = (UUID(), category, text)
        }
        guard let attempt = pending else { return }
        sending = true; error = nil
        defer { if epoch == e { sending = false } }
        do {
            let report = try await transport.sendUrgentReport(id: attempt.id, category: attempt.category, description: attempt.description, ticket: ticket)
            try require(ticket, e)
            guard report.id == attempt.id, report.patientId == ticket.accountID, report.category == attempt.category.rawValue else {
                throw RoutineFailure.invalidData
            }
            pending = nil; draft = UrgentDraft(); sent = report
            reports = [report] + reports.filter { $0.id != report.id }
        } catch {
            guard (try? require(ticket, e)) != nil else { return }
            if case AccountFailure.noAssignedClinician = error {
                pending = nil; self.error = AccountFailure.noAssignedClinician.localizedDescription
            } else if AccountFailure.isTransient(error) || Self.mayHaveBeenStored(error) {
                // Keep the same report ID: a retry either reaches the server or returns the row it already stored.
                self.error = "Not sent yet. Check your connection and tap Retry. If this is an emergency, call 911."
            } else {
                // Refused as sent: unfreeze so the person can edit and send again; the typed text stays in the draft.
                pending = nil
                self.error = "Couldn't send your report. Check what you wrote and try again. If this is an emergency, call 911."
            }
        }
    }

    /// An unreadable or mismatched confirmation can follow a report the server did store.
    private static func mayHaveBeenStored(_ error: Error) -> Bool {
        if error is DecodingError { return true }
        if case RoutineFailure.invalidData = error { return true }
        return false
    }

    func load(ticket: AccountAccess.Ticket) async {
        guard (try? access.require(ticket)) != nil else { return }
        let e = epoch
        do {
            let rows = try await transport.urgentReports(ticket: ticket)
            try require(ticket, e)
            guard rows.allSatisfy({ $0.patientId == ticket.accountID }) else { throw AccountFailure.accountChanged }
            // A report confirmed while this page was loading stays visible.
            let justSent = sent.flatMap { report in rows.contains { $0.id == report.id } ? nil : report }
            reports = (justSent.map { [$0] } ?? []) + rows
        } catch {
            // Earlier reports are informational; sending stays available when they cannot be loaded.
        }
    }
}
