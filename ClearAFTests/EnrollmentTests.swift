import Foundation
import Testing
@testable import ClearAF

@MainActor struct EnrollmentTests {
    @Test func failedScreeningRetriesTheSameIdUntilAnswersChange() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        let repo = EnrollmentRepository(access: access, transport: transport)
        let answers = ScreeningAnswers(stateCode: "IL", dateOfBirth: "1990-01-01", pregnancyStatus: "none")
        transport.failSubmit = true
        await repo.submit(answers, ticket: ticket); await repo.submit(answers, ticket: ticket)
        #expect(transport.submittedIDs.count == 2 && Set(transport.submittedIDs).count == 1)
        await repo.submit(ScreeningAnswers(stateCode: "NY", dateOfBirth: "1990-01-01", pregnancyStatus: "none"), ticket: ticket)
        #expect(Set(transport.submittedIDs).count == 2)
        transport.failSubmit = false
        await repo.submit(answers, ticket: ticket)
        #expect(repo.state?.status == .consentRequired && repo.error == nil)
    }
    @Test func consentSendsTheDisplayedVersionAndHash() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        transport.state = EnrollmentFake.make(.consentRequired)
        let repo = EnrollmentRepository(access: access, transport: transport)
        await repo.load(ticket: ticket); await repo.acceptConsent(ticket: ticket)
        #expect(transport.accepted.first?.0 == 1 && transport.accepted.first?.1 == String(repeating: "a", count: 64))
        #expect(repo.state?.status == .enrolled)
    }
    @Test func lateResponseAfterAccountChangeIsDropped() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        transport.onFetch = { access.invalidate() }
        let repo = EnrollmentRepository(access: access, transport: transport)
        await repo.load(ticket: ticket)
        #expect(repo.state == nil)
    }
    @Test func waitlistUsesTheLatestScreeningAndKeepsTheRequest() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        transport.state = EnrollmentFake.make(.ineligible)
        let repo = EnrollmentRepository(access: access, transport: transport)
        await repo.load(ticket: ticket); await repo.joinWaitlist(ticket: ticket)
        #expect(transport.waitlisted == [transport.state.screening?.id])
        #expect(repo.state?.status == .ineligible && repo.state?.screening?.waitlistRequestedAt != nil)
    }
    @Test func residenceOptionsMirrorTheServerCodesInNameOrder() {
        let codes = ResidenceOption.all.map(\.code)
        #expect(codes.count == 52 && Set(codes).count == 52 && codes.last == "NON_US")
        let states = ResidenceOption.all.dropLast().map(\.name)
        #expect(states == states.sorted() && states.first == "Alabama" && states.contains("District of Columbia"))
        #expect(PregnancyAnswer.allCases.map(\.title) == ["None of these", "Pregnant", "Trying to conceive", "Breastfeeding"])
    }
    @Test func dateOfBirthUsesGregorianCalendarDateInTheLocalZone() throws {
        var components = DateComponents(); components.year = 1990; components.month = 1; components.day = 31; components.hour = 23
        var gregorian = Calendar(identifier: .gregorian); gregorian.timeZone = TimeZone(identifier: "America/Chicago")!
        let date = try #require(gregorian.date(from: components))
        #expect(ScreeningDates.string(from: date, timeZone: gregorian.timeZone) == "1990-01-31")
    }
}

@MainActor private final class EnrollmentFake: EnrollmentTransport {
    var state = EnrollmentFake.make(.screeningRequired)
    var failSubmit = false
    var submittedIDs: [UUID] = []
    var accepted: [(Int, String)] = []
    var waitlisted: [UUID?] = []
    var onFetch: (() -> Void)?

    static func make(_ status: EnrollmentStatus) -> EnrollmentState {
        let screening = status == .screeningRequired ? nil : EligibilityScreening(
            id: UUID(), stateCode: "IL", dateOfBirth: "1990-01-01", pregnancyStatus: "none",
            eligible: status != .ineligible, reasons: status == .ineligible ? ["state"] : [], flags: [],
            rulesVersion: "2026-09-15.1", submittedAt: "2026-09-15T12:00:00.000Z", waitlistRequestedAt: nil)
        let consent = ConsentDocument(version: 1, title: "Consent", body: "First paragraph.\n\nSecond paragraph.",
            sha256: String(repeating: "a", count: 64), acceptedAt: status == .enrolled ? "2026-09-15T12:01:00.000Z" : nil)
        return EnrollmentState(status: status, rulesVersion: "2026-09-15.1", screening: screening, consent: consent)
    }
    func fetchEnrollment(ticket: AccountAccess.Ticket) async throws -> EnrollmentState {
        onFetch?()
        return state
    }
    func submitScreening(id: UUID, answers: ScreeningAnswers, ticket: AccountAccess.Ticket) async throws -> EnrollmentStatus {
        submittedIDs.append(id)
        if failSubmit { throw URLError(.networkConnectionLost) }
        state = Self.make(.consentRequired)
        return .consentRequired
    }
    func joinWaitlist(screeningId: UUID, ticket: AccountAccess.Ticket) async throws -> EligibilityScreening {
        waitlisted.append(screeningId)
        let s = try #require(state.screening)
        let saved = EligibilityScreening(id: s.id, stateCode: s.stateCode, dateOfBirth: s.dateOfBirth, pregnancyStatus: s.pregnancyStatus,
            eligible: s.eligible, reasons: s.reasons, flags: s.flags, rulesVersion: s.rulesVersion, submittedAt: s.submittedAt,
            waitlistRequestedAt: "2026-09-15T12:02:00.000Z")
        state = EnrollmentState(status: state.status, rulesVersion: state.rulesVersion, screening: saved, consent: state.consent)
        return saved
    }
    func acceptConsent(version: Int, sha256: String, ticket: AccountAccess.Ticket) async throws -> EnrollmentStatus {
        accepted.append((version, sha256))
        state = Self.make(.enrolled)
        return .enrolled
    }
}
