import Foundation
import Testing
@testable import ClearAF

@MainActor struct SafetyTests {
    @Test func urgentReportKeepsItsIdAcrossRetriesAndClearsAfterSuccess() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        let repo = UrgentReportRepository(access: access, transport: transport)
        transport.fail = true
        await repo.send(category: .rapidWorsening, description: " Spreading fast ", ticket: ticket)
        #expect(repo.pending != nil && repo.error != nil)
        await repo.send(category: .other, description: "Edited", ticket: ticket) // frozen: same attempt retried
        transport.fail = false
        await repo.send(category: .other, description: "Edited", ticket: ticket)
        #expect(Set(transport.sent.map(\.0)).count == 1)
        #expect(transport.sent.allSatisfy { $0.1 == .rapidWorsening && $0.2 == "Spreading fast" })
        #expect(repo.pending == nil && repo.reports.first?.status == "open")
    }
    @Test func noAssignedClinicianIsExplained() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        transport.failure = AccountFailure.noAssignedClinician
        let repo = UrgentReportRepository(access: access, transport: transport)
        await repo.send(category: .other, description: "Help", ticket: ticket)
        #expect(repo.error?.contains("911") == true && repo.pending == nil)
    }
    @Test func careDecisionWording() {
        #expect(CareStatusCopy.title(for: "refer_out") == "Online care isn't the right fit right now")
        #expect(CareStatusCopy.title(for: "needs_in_person") == "Your clinician recommends an in-person visit")
        #expect(CareStatusCopy.refund("pending") == "Refund: being processed")
        #expect(CareStatusCopy.refund("issued") == "Refund: issued")
        #expect(CareStatusCopy.refund("not_applicable") == nil)
    }
    @Test func blankOrOverlongDescriptionIsRejectedLocally() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        let repo = UrgentReportRepository(access: access, transport: transport)
        await repo.send(category: .other, description: "  \n ", ticket: ticket)
        #expect(repo.error == "Describe what's happening (up to 2,000 characters).")
        await repo.send(category: .other, description: String(repeating: "x", count: 2001), ticket: ticket)
        #expect(transport.sent.isEmpty && repo.pending == nil)
    }
    @Test func lateReportAfterSignOutIsDropped() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        let repo = UrgentReportRepository(access: access, transport: transport)
        transport.onSend = { access.invalidate() }
        await repo.send(category: .painOrInfection, description: "Swollen", ticket: ticket)
        #expect(repo.reports.isEmpty && repo.sent == nil)
    }
    @Test func careDecisionFromAnotherAccountIsIgnored() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID())
        let decision = CareDecision(id: UUID(), patientId: UUID(), clinicianId: UUID(), clinicianName: "Fixture", decision: "refer_out",
            patientMessage: nil, photoId: nil, refundStatus: "pending", refundUpdatedAt: nil, createdAt: "2026-09-15T12:00:00.000Z")
        let repo = CareDecisionRepository(access: access, transport: DecisionFake(decision: decision))
        await repo.load(ticket: ticket)
        #expect(repo.current == nil && repo.error != nil)
    }
}

@MainActor private final class UrgentFake: UrgentReportTransport {
    let patient: UUID
    var fail = false
    var failure: Error?
    var onSend: (() -> Void)?
    var sent: [(UUID, UrgentCategory, String)] = []
    init(patient: UUID) { self.patient = patient }
    func sendUrgentReport(id: UUID, category: UrgentCategory, description: String, ticket: AccountAccess.Ticket) async throws -> UrgentReport {
        sent.append((id, category, description))
        onSend?()
        if let failure { throw failure }
        if fail { throw URLError(.networkConnectionLost) }
        return UrgentReport(id: id, patientId: patient, category: category.rawValue, description: description, status: "open",
            createdAt: "2026-09-15T12:00:00.000Z", acknowledgedAt: nil, resolvedAt: nil, resolutionNote: nil)
    }
    func urgentReports(ticket: AccountAccess.Ticket) async throws -> [UrgentReport] { [] }
}

@MainActor private final class DecisionFake: CareDecisionTransport {
    let decision: CareDecision?
    init(decision: CareDecision?) { self.decision = decision }
    func currentCareDecision(ticket: AccountAccess.Ticket) async throws -> CareDecision? { decision }
}
