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
        #expect(repo.error?.contains("If this is an emergency, call 911.") == true && repo.pending == nil)
        #expect(repo.error?.contains("If it isn't an emergency, contact your own doctor or a local urgent care clinic.") == true)
        #expect(repo.draft == UrgentDraft(category: .other, description: "Help"))
    }
    @Test func nonTransientFailureUnfreezesAndKeepsTheText() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        let repo = UrgentReportRepository(access: access, transport: transport)
        transport.failure = AccountFailure.requestFailed(503)
        await repo.send(category: .painOrInfection, description: "Swelling", ticket: ticket)
        #expect(repo.pending != nil) // transient: frozen for an identical retry
        transport.failure = AccountFailure.requestFailed(409)
        await repo.send(category: .painOrInfection, description: "Swelling", ticket: ticket)
        #expect(repo.pending == nil && repo.error != nil)
        #expect(repo.draft == UrgentDraft(category: .painOrInfection, description: "Swelling"))
        transport.failure = nil
        await repo.send(category: .painOrInfection, description: "Swelling and pain", ticket: ticket)
        #expect(Set(transport.sent.map(\.0)).count == 2 && repo.sent?.description == "Swelling and pain")
    }
    @Test func untrustedConfirmationKeepsTheAttemptFrozen() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        let repo = UrgentReportRepository(access: access, transport: transport)
        transport.wrongCategory = true // the server may have stored it, but the confirmation doesn't match
        await repo.send(category: .rapidWorsening, description: "Spreading", ticket: ticket)
        #expect(repo.pending != nil && repo.error?.contains("Check your connection and tap Retry") == true)
        transport.wrongCategory = false
        transport.failure = DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Synthetic unreadable body"))
        await repo.send(category: .other, description: "Edited", ticket: ticket)
        #expect(repo.pending != nil && repo.error?.contains("Check your connection and tap Retry") == true)
        transport.failure = nil
        await repo.send(category: .other, description: "Edited", ticket: ticket)
        #expect(Set(transport.sent.map(\.0)).count == 1 && repo.pending == nil && repo.sent?.category == "rapid_worsening")
    }
    @Test func refusedReportUnfreezesForEditing() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        let repo = UrgentReportRepository(access: access, transport: transport)
        transport.failure = AccountFailure.requestFailed(413)
        await repo.send(category: .other, description: "Too much", ticket: ticket)
        #expect(repo.pending == nil && repo.error?.contains("Check what you wrote") == true)
        #expect(repo.draft == UrgentDraft(category: .other, description: "Too much"))
    }
    @Test func draftOutlivesTheSheetAndClearsAfterSendOrSignOut() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        let repo = UrgentReportRepository(access: access, transport: transport)
        repo.updateDraft(UrgentDraft(category: .reactionToTreatment, description: "Hives after the new cream"))
        #expect(repo.draft == UrgentDraft(category: .reactionToTreatment, description: "Hives after the new cream"))
        transport.fail = true
        await repo.send(category: .reactionToTreatment, description: "Hives after the new cream", ticket: ticket)
        repo.updateDraft(UrgentDraft(category: .other, description: "Changed while frozen"))
        #expect(repo.draft.description == "Hives after the new cream" && repo.pending?.description == "Hives after the new cream")
        transport.fail = false
        await repo.send(category: .reactionToTreatment, description: "Hives after the new cream", ticket: ticket)
        #expect(repo.draft == UrgentDraft() && repo.pending == nil)
        repo.updateDraft(UrgentDraft(category: .other, description: "Unsent"))
        repo.cancel()
        #expect(repo.draft == UrgentDraft())
    }
    @Test func justSentReportStaysWhenTheListLoadsWithoutIt() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = UrgentFake(patient: ticket.accountID)
        let repo = UrgentReportRepository(access: access, transport: transport)
        let older = UrgentReport(id: UUID(), patientId: ticket.accountID, category: "other", description: "Earlier", status: "resolved",
            createdAt: "2026-09-14T12:00:00.000Z", acknowledgedAt: nil, resolvedAt: nil, resolutionNote: "Handled")
        transport.rows = [older]
        await repo.send(category: .rapidWorsening, description: "Spreading", ticket: ticket)
        let sent = try #require(repo.sent)
        await repo.load(ticket: ticket)
        #expect(repo.reports.map(\.id) == [sent.id, older.id])
        transport.rows = [sent, older]
        await repo.load(ticket: ticket)
        #expect(repo.reports.map(\.id) == [sent.id, older.id])
    }
    @Test func errorBodiesMapToAccountFailures() {
        func mapped(_ status: Int, _ body: String) -> String { String(describing: AccountFailure.from(status: status, body: Data(body.utf8))) }
        #expect(mapped(403, #"{"error":"Enrollment required","code":"ENROLLMENT_REQUIRED"}"#) == String(describing: AccountFailure.enrollmentRequired))
        #expect(mapped(409, #"{"error":"NO_ASSIGNED_CLINICIAN","code":"NO_ASSIGNED_CLINICIAN"}"#) == String(describing: AccountFailure.noAssignedClinician))
        #expect(mapped(404, #"{"error":"NOT_FOUND","code":"NOT_FOUND"}"#) == String(describing: AccountFailure.requestFailed(404)))
        #expect(mapped(500, "") == String(describing: AccountFailure.requestFailed(500)))
        #expect(mapped(502, "<html>Bad gateway</html>") == String(describing: AccountFailure.requestFailed(502)))
        #expect(mapped(401, #"{"code":null}"#) == String(describing: AccountFailure.requestFailed(401)))
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
    var wrongCategory = false
    var failure: Error?
    var onSend: (() -> Void)?
    var sent: [(UUID, UrgentCategory, String)] = []
    var rows: [UrgentReport] = []
    init(patient: UUID) { self.patient = patient }
    func sendUrgentReport(id: UUID, category: UrgentCategory, description: String, ticket: AccountAccess.Ticket) async throws -> UrgentReport {
        sent.append((id, category, description))
        onSend?()
        if let failure { throw failure }
        if fail { throw URLError(.networkConnectionLost) }
        return UrgentReport(id: id, patientId: patient, category: wrongCategory ? "other" : category.rawValue, description: description, status: "open",
            createdAt: "2026-09-15T12:00:00.000Z", acknowledgedAt: nil, resolvedAt: nil, resolutionNote: nil)
    }
    func urgentReports(ticket: AccountAccess.Ticket) async throws -> [UrgentReport] { rows }
}

@MainActor private final class DecisionFake: CareDecisionTransport {
    let decision: CareDecision?
    init(decision: CareDecision?) { self.decision = decision }
    func currentCareDecision(ticket: AccountAccess.Ticket) async throws -> CareDecision? { decision }
}
