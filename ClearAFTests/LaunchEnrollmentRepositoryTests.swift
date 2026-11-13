import XCTest
@testable import ClearAF

@MainActor final class LaunchEnrollmentRepositoryTests: XCTestCase {
    func testDispatchedMutationCannotRestoreStateAfterAccountSwitch() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = LaunchEnrollmentFake()
        let repo = LaunchEnrollmentRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket)
        fake.pause = true
        let save = Task { await repo.mutate(LaunchRequest(path: "/enrollment/test/progress", method: "PUT"), ticket: ticket) }
        while fake.continuation == nil { await Task.yield() }
        save.cancel()
        repo.cancel()
        _ = access.activate(UUID())
        fake.continuation?.resume(returning: LaunchContractTests.enrollment)
        let accepted = await save.value
        XCTAssertFalse(accepted)
        XCTAssertNil(repo.state)
        XCTAssertFalse(repo.saving)
    }
    func testCancelledAutosaveStillAcknowledgesCommittedRevisionBeforeNextSave() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID())
        let transport = CancellableEnrollmentTransport()
        let repo = LaunchEnrollmentRepository(access: access, transport: transport)
        let loaded = await repo.refresh(ticket: ticket)
        XCTAssertTrue(loaded)
        let save = Task { await repo.saveProgress(step: "eligibility", topicId: "quick_eligibility", eligibilityDraft: ["E1": "acne"], ticket: ticket) }
        while !transport.committed { await Task.yield() }
        // SwiftUI cancels .task(id: answers) when the next answer changes, even
        // though the API has already committed the previous answer.
        save.cancel()
        let acknowledged = await save.value
        XCTAssertTrue(acknowledged)
        XCTAssertEqual(repo.state?.case.revision, 1)
        XCTAssertNil(repo.error)
        XCTAssertFalse(repo.saving)
        let next = await repo.saveProgress(step: "eligibility", topicId: "quick_eligibility", eligibilityDraft: ["E1": "acne", "E2": "no"], ticket: ticket)
        XCTAssertTrue(next)
        XCTAssertEqual(transport.expectedRevisions, [0, 1])
    }
    func testRefreshUsesServerStepAndDropsLateAccountResponse() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = LaunchEnrollmentFake()
        let repo = LaunchEnrollmentRepository(access: access, transport: fake, directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let loaded = await repo.refresh(ticket: ticket)
        XCTAssertTrue(loaded)
        XCTAssertEqual(repo.state?.case.status, .consents)
        repo.cancel()
        fake.pause = true
        let task = Task { await repo.refresh(ticket: ticket) }
        while fake.continuation == nil { await Task.yield() }
        _ = access.activate(UUID())
        fake.continuation?.resume(returning: LaunchContractTests.enrollment)
        let stale = await task.value
        XCTAssertFalse(stale)
        XCTAssertNil(repo.state)
    }
    func testMutationCarriesRevisionAndUsesExactMethodAndPath() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = LaunchEnrollmentFake()
        let repo = LaunchEnrollmentRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket)
        struct Body: Encodable { let expectedRevision: Int; let answers: LaunchEligibility }
        let request = try LaunchRequest.json("/enrollment/00000000-0000-4000-8000-000000000001/eligibility", Body(expectedRevision: 2, answers: LaunchEligibility(E1: .acne, E2: .no, E3: .pregnant, E4: .yes)))
        let saved = await repo.mutate(request, ticket: ticket)
        XCTAssertTrue(saved)
        XCTAssertEqual(fake.requests.last?.method, "PUT")
        XCTAssertEqual(fake.requests.last?.path, request.path)
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(fake.requests.last?.body)) as! [String: Any]
        XCTAssertEqual(body["expectedRevision"] as? Int, 2)
        XCTAssertEqual((body["answers"] as? [String: String])?["E3"], "pregnant")
    }
    func testOlderRefreshCannotOverwriteSuccessfulMutation() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = LaunchEnrollmentFake()
        let repo = LaunchEnrollmentRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket)
        fake.pause = true
        let oldRefresh = Task { await repo.refresh(ticket: ticket) }
        while fake.continuation == nil { await Task.yield() }
        fake.pause = false
        fake.response = Data(String(decoding: LaunchContractTests.enrollment, as: UTF8.self).replacingOccurrences(of: "\"revision\":0", with: "\"revision\":2").replacingOccurrences(of: "\"status\":\"consents\"", with: "\"status\":\"identity\"").utf8)
        let saved = await repo.mutate(LaunchRequest(path: "/enrollment/00000000-0000-4000-8000-000000000001/consents", method: "PUT"), ticket: ticket)
        XCTAssertTrue(saved)
        fake.continuation?.resume(returning: LaunchContractTests.enrollment)
        _ = await oldRefresh.value
        XCTAssertEqual(repo.state?.case.revision, 2)
        XCTAssertEqual(repo.state?.case.status, .identity)
    }
    func testProtectedDraftResumesOnlyForSameAccountAndKeepsCaptureIDs() throws {
        let access = AccountAccess(), a = UUID(), ticket = access.activate(a), root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fake = LaunchEnrollmentFake(), repo = LaunchEnrollmentRepository(access: access, transport: fake, directory: root)
        try repo.resume(ticket: ticket)
        let id = UUID()
        try repo.saveDraft(LaunchEnrollmentDraft(caseId: UUID(), expectedRevision: 3, revisionId: UUID(), answers: LaunchMedicalDraft(), captureIDs: [.front: id]), ticket: ticket)
        repo.cancel()
        try repo.resume(ticket: access.activate(UUID()))
        XCTAssertNil(repo.draft)
        try repo.resume(ticket: access.activate(a))
        XCTAssertEqual(repo.draft?.captureIDs[.front], id)
        XCTAssertEqual(repo.draft?.expectedRevision, 3)
    }
    func testOfflineRefreshRetainsDraftButDoesNotInventServerState() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = LaunchEnrollmentFake()
        fake.failure = URLError(.notConnectedToInternet)
        let repo = LaunchEnrollmentRepository(access: access, transport: fake)
        let loaded = await repo.refresh(ticket: ticket)
        XCTAssertFalse(loaded)
        XCTAssertNil(repo.state)
        XCTAssertNotNil(repo.error)
    }
}
@MainActor private final class CancellableEnrollmentTransport: LaunchTransport {
    var committed = false
    var expectedRevisions: [Int] = []
    private var revision = 0
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data {
        if request.method == "PUT" {
            let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.body)) as! [String: Any]
            let expected = body["expectedRevision"] as! Int
            expectedRevisions.append(expected)
            guard expected == revision else { throw LaunchFailure.server(status: 409, code: "REVISION_CONFLICT") }
            revision += 1
            committed = true
            try await Task.sleep(for: .milliseconds(40))
        }
        var envelope = try JSONSerialization.jsonObject(with: LaunchContractTests.enrollment) as! [String: Any]
        var record = envelope["case"] as! [String: Any]
        record["revision"] = revision; record["status"] = "eligibility"; record["questionnaireVersion"] = "2.2-pending-review"
        envelope["case"] = record
        return try JSONSerialization.data(withJSONObject: envelope)
    }
}
@MainActor final class LaunchEnrollmentFake: LaunchTransport {
    var onFetch: (() -> Void)?
    var failure: Error?
    var response = LaunchContractTests.enrollment
    var pause = false
    var continuation: CheckedContinuation<Data, Never>?
    var requests: [LaunchRequest] = []
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data {
        requests.append(request)
        onFetch?()
        if pause { return await withCheckedContinuation { continuation = $0 } }
        if let failure { throw failure }
        return response
    }
}
