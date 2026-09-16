import Foundation
import Combine

@MainActor protocol EnrollmentTransport {
    func fetchEnrollment(ticket: AccountAccess.Ticket) async throws -> EnrollmentState
    func submitScreening(id: UUID, answers: ScreeningAnswers, ticket: AccountAccess.Ticket) async throws -> EnrollmentStatus
    func joinWaitlist(screeningId: UUID, ticket: AccountAccess.Ticket) async throws -> EligibilityScreening
    func acceptConsent(version: Int, sha256: String, ticket: AccountAccess.Ticket) async throws -> EnrollmentStatus
}

/// Eligibility and consent state for the signed-in patient. The server decides eligibility.
@MainActor final class EnrollmentRepository: ObservableObject {
    @Published private(set) var state: EnrollmentState?
    @Published private(set) var loading = false
    @Published private(set) var saving = false
    @Published private(set) var error: String?
    private let access: AccountAccess
    private let transport: any EnrollmentTransport
    private var epoch = UUID()
    /// A screening keeps its ID across retries of identical answers, so a lost response never creates a duplicate.
    private var attempt: (id: UUID, answers: ScreeningAnswers)?

    init(access: AccountAccess, transport: any EnrollmentTransport) { self.access = access; self.transport = transport }

    func cancel() { epoch = UUID(); state = nil; loading = false; saving = false; error = nil; attempt = nil }
    private func require(_ ticket: AccountAccess.Ticket, _ e: UUID) throws {
        try access.require(ticket); guard epoch == e else { throw AccountFailure.accountChanged }
    }

    /// Returns false when the state could not be loaded for this login.
    @discardableResult func load(ticket: AccountAccess.Ticket) async -> Bool {
        guard (try? access.require(ticket)) != nil else { return false }
        let e = epoch; loading = true
        defer { if epoch == e { loading = false } }
        do {
            let next = try await transport.fetchEnrollment(ticket: ticket)
            try require(ticket, e)
            state = next; error = nil
            return true
        } catch {
            if (try? require(ticket, e)) != nil { self.error = "Couldn't load your eligibility steps. Check your connection and try again." }
            return false
        }
    }

    func submit(_ answers: ScreeningAnswers, ticket: AccountAccess.Ticket) async {
        guard (try? access.require(ticket)) != nil, !saving else { return }
        let e = epoch
        let id = attempt.flatMap { $0.answers == answers ? $0.id : nil } ?? UUID()
        attempt = (id, answers); saving = true; error = nil
        defer { if epoch == e { saving = false } }
        do {
            _ = try await transport.submitScreening(id: id, answers: answers, ticket: ticket)
            try require(ticket, e)
        } catch {
            guard (try? require(ticket, e)) != nil else { return }
            if case AccountFailure.requestFailed(400) = error { attempt = nil }
            self.error = "Couldn't save your answers. Check your connection and try again."
            return
        }
        // Keep the attempt until the refreshed state arrives: Continue after a failed reload reuses the saved screening.
        if await load(ticket: ticket) { attempt = nil }
    }

    func clearError() { error = nil }

    func joinWaitlist(ticket: AccountAccess.Ticket) async {
        guard (try? access.require(ticket)) != nil, !saving, let current = state, let screening = current.screening else { return }
        let e = epoch; saving = true; error = nil
        defer { if epoch == e { saving = false } }
        do {
            let saved = try await transport.joinWaitlist(screeningId: screening.id, ticket: ticket)
            try require(ticket, e)
            guard saved.id == screening.id, saved.waitlistRequestedAt != nil else { throw RoutineFailure.invalidData }
            state = EnrollmentState(status: current.status, rulesVersion: current.rulesVersion, screening: saved, consent: current.consent)
        } catch {
            if (try? require(ticket, e)) != nil { self.error = "Couldn't save your request. Try again." }
        }
    }

    func acceptConsent(ticket: AccountAccess.Ticket) async {
        guard (try? access.require(ticket)) != nil, !saving, let consent = state?.consent else { return }
        let e = epoch; saving = true; error = nil
        defer { if epoch == e { saving = false } }
        do {
            _ = try await transport.acceptConsent(version: consent.version, sha256: consent.sha256, ticket: ticket)
            try require(ticket, e)
        } catch {
            guard (try? require(ticket, e)) != nil else { return }
            guard !AccountFailure.isTransient(error) else { self.error = "Couldn't record your consent. Try again."; return }
            // Refused, for example 409 CONSENT_OUTDATED: reload so the current document and version are shown.
            if await load(ticket: ticket) { self.error = "Couldn't record your consent. Review the current document and try again." }
            return
        }
        await load(ticket: ticket)
    }
}
