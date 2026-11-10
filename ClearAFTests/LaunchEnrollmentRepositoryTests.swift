import XCTest
@testable import ClearAF

@MainActor final class LaunchEnrollmentRepositoryTests: XCTestCase {
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
