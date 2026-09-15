import Foundation
import Combine

@MainActor protocol CareDecisionTransport {
    func currentCareDecision(ticket: AccountAccess.Ticket) async throws -> CareDecision?
}

/// The latest care decision a clinician recorded for the signed-in patient.
@MainActor final class CareDecisionRepository: ObservableObject {
    @Published private(set) var current: CareDecision?
    @Published private(set) var error: String?
    private let access: AccountAccess
    private let transport: any CareDecisionTransport
    private var epoch = UUID()

    init(access: AccountAccess, transport: any CareDecisionTransport) { self.access = access; self.transport = transport }

    func cancel() { epoch = UUID(); current = nil; error = nil }

    func load(ticket: AccountAccess.Ticket) async {
        guard (try? access.require(ticket)) != nil else { return }
        let e = epoch
        do {
            let decision = try await transport.currentCareDecision(ticket: ticket)
            try access.require(ticket); guard epoch == e else { return }
            guard decision.map({ $0.patientId == ticket.accountID }) ?? true else { throw AccountFailure.accountChanged }
            current = decision; error = nil
        } catch {
            guard (try? access.require(ticket)) != nil, epoch == e else { return }
            self.error = "Couldn't check your care status. Try again later."
        }
    }
}
