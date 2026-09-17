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
    @Test func outdatedConsentReloadsTheCurrentDocument() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        transport.state = EnrollmentFake.make(.consentRequired)
        let repo = EnrollmentRepository(access: access, transport: transport)
        await repo.load(ticket: ticket)
        // The server has published version 2 and refuses the old version/hash (409 CONSENT_OUTDATED).
        transport.state = EnrollmentFake.make(.consentRequired, version: 2, sha256: String(repeating: "b", count: 64))
        transport.failAccept = AccountFailure.requestFailed(409)
        await repo.acceptConsent(ticket: ticket)
        #expect(repo.state?.consent.version == 2 && repo.error != nil)
        transport.failAccept = nil
        await repo.acceptConsent(ticket: ticket)
        #expect(transport.accepted.map(\.0) == [1, 2] && transport.accepted.last?.1 == String(repeating: "b", count: 64))
        #expect(repo.state?.status == .enrolled)
    }
    @Test func transientConsentFailureKeepsTheShownDocument() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        transport.state = EnrollmentFake.make(.consentRequired)
        let repo = EnrollmentRepository(access: access, transport: transport)
        await repo.load(ticket: ticket)
        let fetches = transport.fetchCount
        transport.failAccept = URLError(.networkConnectionLost)
        await repo.acceptConsent(ticket: ticket)
        #expect(transport.fetchCount == fetches && repo.state?.consent.version == 1)
        #expect(repo.error == "Couldn't record your consent. Try again.")
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
    @Test func failedReloadAfterASavedScreeningReusesTheSameId() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        let repo = EnrollmentRepository(access: access, transport: transport)
        let answers = ScreeningAnswers(stateCode: "IL", dateOfBirth: "1990-01-01", pregnancyStatus: "none")
        transport.failFetch = true
        await repo.submit(answers, ticket: ticket)
        #expect(repo.error != nil && repo.state == nil)
        transport.failFetch = false
        await repo.submit(answers, ticket: ticket)
        #expect(transport.submittedIDs.count == 2 && Set(transport.submittedIDs).count == 1)
        #expect(repo.state?.status == .consentRequired && repo.error == nil)
        await repo.submit(answers, ticket: ticket)
        #expect(Set(transport.submittedIDs).count == 2) // the attempt ends once the refreshed state arrives
    }
    @Test func staleErrorCanBeCleared() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = EnrollmentFake()
        let repo = EnrollmentRepository(access: access, transport: transport)
        transport.failSubmit = true
        await repo.submit(ScreeningAnswers(stateCode: "IL", dateOfBirth: "1990-01-01", pregnancyStatus: "none"), ticket: ticket)
        #expect(repo.error != nil)
        repo.clearError()
        #expect(repo.error == nil)
    }
    @Test func notEligibleReasonsNeverMisstateTheCause() {
        func screening(_ state: String, _ reasons: [String]) -> EligibilityScreening {
            EligibilityScreening(id: UUID(), stateCode: state, dateOfBirth: "2010-01-01", pregnancyStatus: "none", eligible: false,
                reasons: reasons, flags: [], rulesVersion: "2026-09-15.1", submittedAt: "2026-09-15T12:00:00.000Z", waitlistRequestedAt: nil)
        }
        #expect(EnrollmentCopy.reasons(for: screening("NON_US", ["state", "age"])) ==
            ["ClearAF is only available in the United States right now.", "You don't meet the minimum age for online care yet."])
        #expect(EnrollmentCopy.reasons(for: screening("IL", ["state", "pregnancy", "breastfeeding"])) ==
            ["ClearAF isn't available in your state yet.", "ClearAF can't treat you online during pregnancy.", "ClearAF can't treat you online while breastfeeding."])
        #expect(EnrollmentCopy.reasons(for: screening("IL", ["new_rule", "other_rule"])) == ["You're not eligible for online care right now."])
        #expect(EnrollmentCopy.reasons(for: screening("IL", [])) == ["You're not eligible for online care right now."])
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
    var failFetch = false
    var failAccept: Error?
    var fetchCount = 0
    var submittedIDs: [UUID] = []
    var accepted: [(Int, String)] = []
    var waitlisted: [UUID?] = []
    var onFetch: (() -> Void)?

    static func make(_ status: EnrollmentStatus, version: Int = 1, sha256: String = String(repeating: "a", count: 64)) -> EnrollmentState {
        let screening = status == .screeningRequired ? nil : EligibilityScreening(
            id: UUID(), stateCode: "IL", dateOfBirth: "1990-01-01", pregnancyStatus: "none",
            eligible: status != .ineligible, reasons: status == .ineligible ? ["state"] : [], flags: [],
            rulesVersion: "2026-09-15.1", submittedAt: "2026-09-15T12:00:00.000Z", waitlistRequestedAt: nil)
        let consent = ConsentDocument(version: version, title: "Consent", body: "First paragraph.\n\nSecond paragraph.",
            sha256: sha256, acceptedAt: status == .enrolled ? "2026-09-15T12:01:00.000Z" : nil)
        return EnrollmentState(status: status, rulesVersion: "2026-09-15.1", screening: screening, consent: consent)
    }
    func fetchEnrollment(ticket: AccountAccess.Ticket) async throws -> EnrollmentState {
        fetchCount += 1
        onFetch?()
        if failFetch { throw URLError(.networkConnectionLost) }
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
        if let failAccept { throw failAccept }
        state = Self.make(.enrolled)
        return .enrolled
    }
}

struct EnrollmentCopyTests {
    @Test func stepsExplainThemselvesInWords() {
        #expect(EnrollmentCopy.continueReason == "Answer all three questions to continue.")
        #expect(EnrollmentCopy.notCharged == "You have not been charged.")
        #expect(EnrollmentCopy.waitlisted == "We'll keep your request on file.")
        #expect(EnrollmentCopy.consentEyebrow(version: 3) == "Consent · V3")
    }
}
