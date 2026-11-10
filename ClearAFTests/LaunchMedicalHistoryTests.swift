import XCTest
@testable import ClearAF

@MainActor final class LaunchMedicalHistoryTests: XCTestCase {
    func testParentEditsClearHiddenBranches() {
        var draft = Self.complete
        draft.M1 = .male
        draft.clearHiddenBranches()
        XCTAssertNil(draft.M2); XCTAssertNil(draft.M3); XCTAssertNil(draft.M4); XCTAssertNil(draft.M8)
        draft.M1 = .female; draft.M2 = .no; draft.M3 = .yes; draft.M4 = .init(method: "iud", details: nil)
        draft.clearHiddenBranches()
        XCTAssertNil(draft.M3); XCTAssertNil(draft.M4)
        draft.M1 = .intersex; draft.M2 = .notSure; draft.M3 = .no; draft.M4 = .init(method: "none", details: nil); draft.M8 = .notApplicable
        XCTAssertTrue(LaunchMedicalValidation.complete(draft))
    }
    func testEveryAnswerKindAndFixedMachineValues() {
        XCTAssertTrue(LaunchMedicalValidation.complete(Self.complete))
        XCTAssertFalse(LaunchMedicalValidation.complete(LaunchMedicalDraft()))
        var draft = Self.complete; draft.M5 = "future_value"
        XCTAssertFalse(LaunchMedicalValidation.validDraft(draft))
        draft = Self.complete; draft.M4 = .init(method: "future", details: nil)
        XCTAssertFalse(LaunchMedicalValidation.validDraft(draft))
        draft = Self.complete; draft.M22 = false
        XCTAssertFalse(LaunchMedicalValidation.complete(draft))
        draft = Self.complete; draft.M21 = ""; draft.M20 = .init(pcpName: nil, pcpPhone: nil, shareSummary: false)
        XCTAssertTrue(LaunchMedicalValidation.complete(draft))
        draft = Self.complete; draft.M11 = .init(none: false, treatments: Array(repeating: .init(name: "Synthetic", duration: "1 month", helped: "No", sideEffects: "None"), count: 21))
        XCTAssertFalse(LaunchMedicalValidation.validDraft(draft))
    }
    func testNoneChoicesAreExplicitExclusiveAndPreferencePersists() throws {
        XCTAssertEqual(LaunchMedicalValidation.select("none", in: ["kidney"]), ["none"])
        XCTAssertEqual(LaunchMedicalValidation.select("kidney", in: ["none"]), ["kidney"])
        var draft = Self.complete; draft.M13 = ["none", "lithium"]
        XCTAssertFalse(LaunchMedicalValidation.validDraft(draft))
        draft = Self.complete; draft.M9 = .init(signs: ["voice_change"], none: true, details: nil)
        XCTAssertFalse(LaunchMedicalValidation.validDraft(draft))
        let decoded = try JSONDecoder().decode(LaunchMedicalDraft.self, from: JSONEncoder().encode(Self.complete))
        XCTAssertEqual(decoded.medicationPreference, .topical)
    }
    func testNestedNullableFieldsAreExplicitNulls() throws {
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(Self.complete)) as! [String: Any]
        XCTAssertTrue((object["M4"] as! [String: Any])["details"] is NSNull)
        XCTAssertTrue((object["M14"] as! [String: Any])["details"] is NSNull)
        XCTAssertTrue((object["M15"] as! [String: Any])["reaction"] is NSNull)
        XCTAssertTrue((object["M20"] as! [String: Any])["pcpName"] is NSNull)
    }
    func testDestinationsRespectUnionAndAnyUSPharmacy() {
        let pharmacy = LaunchPharmacy(name: "Synthetic Pharmacy", addressLine1: "1 Test St", addressLine2: nil, city: "Chicago", state: "IL", postalCode: "60601", phone: "3125550100")
        XCTAssertTrue(LaunchDestinationValidation.valid(.care(pharmacy)))
        XCTAssertTrue(LaunchDestinationValidation.valid(.allIn(.init(recipient: "Synthetic Adult", line1: "1 Test St", line2: nil, city: "Raleigh", state: "NC", postalCode: "27601"))))
        XCTAssertFalse(LaunchDestinationValidation.valid(.allIn(.init(recipient: "Synthetic Adult", line1: "1 Test St", line2: nil, city: "Chicago", state: "IL", postalCode: "60601"))))
        XCTAssertFalse(LaunchDestinationValidation.valid(.care(.init(name: "", addressLine1: "", addressLine2: nil, city: "", state: "NC", postalCode: "", phone: ""))))
    }
    func testOfflineDraftResumeAndConflictRequiresExplicitReapply() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = MedicalTransport(), root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let repo = LaunchEnrollmentRepository(access: access, transport: fake, directory: root)
        _ = await repo.refresh(ticket: ticket)
        try repo.stageMedical(Self.complete, ticket: ticket)
        let revision = repo.draft?.revisionId
        fake.failure = URLError(.notConnectedToInternet)
        let offline = await repo.saveMedical(ticket: ticket)
        XCTAssertFalse(offline)
        repo.cancel(); try repo.resume(ticket: ticket)
        XCTAssertEqual(repo.draft?.answers.medicationPreference, .topical)
        XCTAssertEqual(repo.draft?.revisionId, revision)
        fake.failure = nil; _ = await repo.refresh(ticket: ticket)
        fake.conflict = true
        let conflict = await repo.saveMedical(ticket: ticket)
        XCTAssertFalse(conflict)
        XCTAssertTrue(repo.medicalNeedsReapply)
        XCTAssertEqual(repo.draft?.answers, Self.complete)
        let count = fake.requests.count
        let blocked = await repo.saveMedical(ticket: ticket)
        XCTAssertFalse(blocked); XCTAssertEqual(fake.requests.count, count)
        try repo.reapplyMedical(ticket: ticket)
        XCTAssertFalse(repo.medicalNeedsReapply)
        XCTAssertNotEqual(repo.draft?.revisionId, revision)
    }
    func testEditsDuringSaveArePreservedAndOptionalFieldsHaveWireValues() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = MedicalTransport(), repo = LaunchEnrollmentRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket)
        var first = Self.complete; first.M20 = nil; first.M21 = nil
        try repo.stageMedical(first, ticket: ticket)
        XCTAssertNotNil(repo.draft?.answers.M20)
        XCTAssertEqual(repo.draft?.answers.M21, "")
        fake.pause = true
        let task = Task { await repo.saveMedical(ticket: ticket) }
        while fake.continuation == nil { await Task.yield() }
        var newer = Self.complete; newer.M21 = "Updated on device"
        try repo.stageMedical(newer, ticket: ticket)
        fake.continuation?.resume()
        _ = await task.value
        XCTAssertEqual(repo.draft?.answers.M21, "Updated on device")
    }
    func testQuestionnaireVersionConflictReloadsBeforeExplicitReapply() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = MedicalTransport(), repo = LaunchEnrollmentRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket); await repo.loadCatalog(ticket: ticket)
        try repo.stageMedical(Self.complete, ticket: ticket)
        fake.conflict = true; fake.changeVersion = true; fake.catalogFailure = true
        let saved = await repo.saveMedical(ticket: ticket)
        XCTAssertFalse(saved)
        XCTAssertTrue(repo.medicalNeedsReapply)
        XCTAssertThrowsError(try repo.reapplyMedical(ticket: ticket))
        fake.catalogFailure = false
        await repo.loadCatalog(ticket: ticket)
        try repo.reapplyMedical(ticket: ticket)
        XCTAssertEqual(repo.catalog?.questionnaireVersion, "1.0")
        XCTAssertEqual(repo.draft?.questionnaireVersion, "1.0")
        XCTAssertEqual(fake.requests.filter { $0.method != "GET" }.count, 1)
    }
    func testUnpaidAndSubmittedCasesCannotStageHistory() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = MedicalTransport(), repo = LaunchEnrollmentRepository(access: access, transport: fake)
        fake.paid = false; _ = await repo.refresh(ticket: ticket)
        XCTAssertThrowsError(try repo.stageMedical(Self.complete, ticket: ticket))
        fake.paid = true; fake.status = "submitted"; fake.revision = 1; _ = await repo.refresh(ticket: ticket)
        XCTAssertThrowsError(try repo.stageMedical(Self.complete, ticket: ticket))
    }
    static var complete: LaunchMedicalDraft {
        .init(M1: .female, M2: .yes, M3: .no, M4: .init(method: "iud", details: nil), M5: "1_to_5_years", M6: ["cheeks"], M7: ["red_bumps"], M8: .no, M9: .init(signs: [], none: true, details: nil), M10: "burns_then_tans", M11: .init(none: true, treatments: []), M12: "never", M13: ["none"], M14: .init(none: true, details: nil), M15: .init(picks: ["none"], reaction: nil), M16: ["none"], M17: "somewhat", M18: "Synthetic cleanser", M19: "yes", M20: .init(pcpName: nil, pcpPhone: nil, shareSummary: false), M21: "", M22: true, medicationPreference: .topical)
    }
}
@MainActor private final class MedicalTransport: LaunchTransport {
    var version = "0.9-draft"; var changeVersion = false; var catalogFailure = false
    var paid = true; var status = "medical_history"; var revision = 0; var failure: Error?; var conflict = false
    var requests: [LaunchRequest] = []
    var pause = false; var continuation: CheckedContinuation<Void, Never>?
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data {
        requests.append(request)
        if request.path == "/catalog" {
            if catalogFailure { throw URLError(.notConnectedToInternet) }
            return Data("{\"contractVersion\":1,\"settingsVersion\":1,\"plans\":[],\"consents\":[],\"reviewCopy\":\"Review within 1 to 2 business days.\",\"questionnaireVersion\":\"\(version)\",\"eligibilityQuestions\":[],\"medicalQuestions\":[]}".utf8)
        }
        if let failure { throw failure }
        if pause && request.method != "GET" { await withCheckedContinuation { continuation = $0 } }
        if request.method != "GET", conflict { revision += 1; if changeVersion { version = "1.0" }; throw LaunchFailure.server(status: 409, code: "REVISION_CONFLICT") }
        let membership = paid ? String(decoding: LaunchBillingTests.membership(status: "paid_pending_review", access: "enrollment", cancel: false, destination: false), as: UTF8.self).dropFirst().dropLast().replacingOccurrences(of: "\"membership\":", with: "") : "null"
        return Data("{\"case\":{\"id\":\"00000000-0000-4000-8000-000000000001\",\"revision\":\(revision),\"status\":\"\(status)\",\"identity\":null,\"eligibility\":null,\"medicalHistory\":{},\"questionnaireVersion\":\"\(version)\",\"photoSet\":null,\"destination\":null,\"planId\":\"care\",\"flags\":[],\"submittedAt\":null,\"approvedAt\":null,\"patientMessage\":null},\"membership\":\(membership),\"consents\":[]}".utf8)
    }
}
