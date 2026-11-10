import XCTest
@testable import ClearAF

@MainActor final class LaunchCheckInTests: XCTestCase {
    func testIndependentLaunchFlagAndStructuredFiveTopics() {
        XCTAssertTrue(LaunchFlags.launchCheckIns); XCTAssertFalse(LaunchFlags.clinicianForms); XCTAssertFalse(LaunchFlags.adherenceCalendar)
        var input = LaunchFollowUpInput()
        XCTAssertNil(input.answers)
        input.tolerability = .someIrritation; input.sideEffectsNone = false; input.sideEffectsDetails = "Synthetic irritation"
        input.pregnancyStatus = .neither; input.newMedicinesNone = true; input.physicallyInNC = false
        XCTAssertEqual(input.answers?.physicallyInNC, false)
        XCTAssertEqual(input.answers?.sideEffects.details, "Synthetic irritation")
        input.sideEffectsNone = true; input.normalize()
        XCTAssertEqual(input.sideEffectsDetails, ""); XCTAssertNil(input.answers?.sideEffects.details)
        input.newMedicinesNone = false
        XCTAssertNil(input.answers)
    }
    func testServerOccurrencesAndCompletePhotosRequiredBeforeSend() async throws {
        let fake = LaunchCheckFake(), access = AccountAccess(), ticket = access.activate(fake.patient), repo = LaunchCheckInRepository(access: access, transport: fake)
        verifyTrue(awaitResult(await repo.refresh(ticket: ticket)))
        XCTAssertEqual(repo.occurrences.first?.kind, .weekly)
        XCTAssertEqual(repo.occurrences.first?.dueAt, "2026-11-16T12:00:00Z")
        try repo.start(fake.id, ticket: ticket)
        try repo.update(Self.input, occurrenceId: fake.id, ticket: ticket)
        verifyFalse(awaitResult(await repo.send(fake.id, ticket: ticket)))
        XCTAssertFalse(fake.requests.contains { $0.method == "PUT" })
        try repo.attach(Self.photos, occurrenceId: fake.id, ticket: ticket)
        verifyTrue(awaitResult(await repo.send(fake.id, ticket: ticket)))
        XCTAssertEqual(repo.occurrences.first?.status, .submitted)
        let request = try XCTUnwrap(fake.requests.last { $0.method == "PUT" })
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.body)) as! [String: Any]
        XCTAssertEqual(Set(body.keys), ["formId", "photoSetId", "answers"])
        XCTAssertEqual((body["answers"] as? [String: Any])?["physicallyInNC"] as? Bool, false)
        XCTAssertEqual(body["photoSetId"] as? String, Self.photos.id.uuidString.lowercased())
    }
    func testOfflineResumeKeepsResponseIDAndRejectsSwitchedOccurrence() async throws {
        let fake = LaunchCheckFake(), access = AccountAccess(), ticket = access.activate(fake.patient), root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let repo = LaunchCheckInRepository(access: access, transport: fake, directory: root)
        _ = await repo.refresh(ticket: ticket); try repo.start(fake.id, ticket: ticket)
        try repo.update(Self.input, occurrenceId: fake.id, ticket: ticket); try repo.attach(Self.photos, occurrenceId: fake.id, ticket: ticket)
        let response = repo.drafts[fake.id]?.responseId
        fake.offline = true; verifyFalse(awaitResult(await repo.send(fake.id, ticket: ticket)))
        repo.cancel(); try repo.resume(ticket: ticket)
        XCTAssertEqual(repo.drafts[fake.id]?.responseId, response)
        fake.offline = false; fake.kind = "monthly"; fake.status = "superseded"
        verifyFalse(awaitResult(await repo.send(fake.id, ticket: ticket)))
        XCTAssertFalse(fake.requests.contains { $0.method == "PUT" })
        let other = access.activate(UUID()); repo.cancel(); try repo.resume(ticket: other)
        XCTAssertTrue(repo.drafts.isEmpty)
    }
    func testChangedFormAndReadOnlyMembershipCannotCreateOrReplay() async throws {
        let fake = LaunchCheckFake(), access = AccountAccess(), ticket = access.activate(fake.patient), repo = LaunchCheckInRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket); try repo.start(fake.id, ticket: ticket)
        try repo.update(Self.input, occurrenceId: fake.id, ticket: ticket); try repo.attach(Self.photos, occurrenceId: fake.id, ticket: ticket)
        fake.formId = UUID()
        verifyFalse(awaitResult(await repo.send(fake.id, ticket: ticket)))
        fake.access = "read_only"; _ = await repo.refresh(ticket: ticket)
        XCTAssertThrowsError(try repo.start(fake.id, ticket: ticket))
        XCTAssertFalse(repo.occurrences.isEmpty)
    }
    func testLateAccountResponseCannotPopulateOccurrenceList() async {
        let fake = LaunchCheckFake(), access = AccountAccess(), ticket = access.activate(fake.patient), repo = LaunchCheckInRepository(access: access, transport: fake)
        fake.pause = true
        let task = Task { await repo.refresh(ticket: ticket) }
        while fake.continuation == nil { await Task.yield() }
        _ = access.activate(UUID()); repo.cancel(); fake.continuation?.resume(returning: fake.billing)
        verifyFalse(awaitResult(await task.value)); XCTAssertTrue(repo.occurrences.isEmpty)
    }
    func testOccurrenceOnLaterPageIsRevalidatedBeforeSend() async throws {
        let fake = LaunchCheckFake(), access = AccountAccess(), ticket = access.activate(fake.patient), repo = LaunchCheckInRepository(access: access, transport: fake)
        fake.secondPage = true; _ = await repo.refresh(ticket: ticket); _ = await repo.loadMore(ticket: ticket)
        try repo.start(fake.id, ticket: ticket); try repo.update(Self.input, occurrenceId: fake.id, ticket: ticket); try repo.attach(Self.photos, occurrenceId: fake.id, ticket: ticket)
        verifyTrue(awaitResult(await repo.send(fake.id, ticket: ticket)))
        XCTAssertGreaterThanOrEqual(fake.requests.filter { $0.path.contains("page=2") }.count, 2)
    }
    func testLostAcknowledgmentReconcilesMatchingSubmissionWithoutAnotherWrite() async throws {
        let fake = LaunchCheckFake(), access = AccountAccess(), ticket = access.activate(fake.patient), repo = LaunchCheckInRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket); try repo.start(fake.id, ticket: ticket)
        try repo.update(Self.input, occurrenceId: fake.id, ticket: ticket); try repo.attach(Self.photos, occurrenceId: fake.id, ticket: ticket)
        fake.loseAcknowledgment = true
        verifyFalse(awaitResult(await repo.send(fake.id, ticket: ticket)))
        fake.access = "read_only"
        verifyTrue(awaitResult(await repo.send(fake.id, ticket: ticket)))
        XCTAssertEqual(fake.requests.filter { $0.method == "PUT" }.count, 1)
        XCTAssertEqual(repo.drafts[fake.id]?.sent, true)
    }
    func testFixedSemanticChoicesDoNotInferMeaningFromReversedServerOptions() throws {
        let fake = LaunchCheckFake()
        var object = fake.occurrence()
        var form = object["form"] as! [String:Any]
        form["questions"] = fake.questions.map { question -> [String:Any] in var q = question; q["options"] = Array((question["options"] as! [[String:Any]]).reversed()); return q }
        object["form"] = form
        let occurrence = try JSONDecoder().decode(LaunchCheckIn.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertTrue(LaunchFollowUpSchema.valid(occurrence.form, owner: fake.patient))
        let choice = try XCTUnwrap(LaunchFollowUpChoices.options(.sideEffects).first { $0.id == "none" })
        XCTAssertEqual(choice.label, "None")
        var input = Self.input; input.choose(.sideEffects, code: choice.id)
        XCTAssertEqual(input.answers?.sideEffects.none, true)
        input.choose(.newMedicines, code: "details"); input.newMedicinesDetails = "Synthetic medicine"
        XCTAssertEqual(input.answers?.newMedicines.none, false)
        input.choose(.location, code: "outside_nc")
        XCTAssertEqual(input.answers?.physicallyInNC, false)
    }
    func testDraftReplacementAndDuplicateSendBlockedDuringSubmission() async throws {
        let fake = LaunchCheckFake(), access = AccountAccess(), ticket = access.activate(fake.patient), repo = LaunchCheckInRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket); try repo.start(fake.id, ticket: ticket)
        try repo.update(Self.input, occurrenceId: fake.id, ticket: ticket); try repo.attach(Self.photos, occurrenceId: fake.id, ticket: ticket)
        fake.pause = true; let task = Task { await repo.send(fake.id, ticket: ticket) }
        while fake.continuation == nil { await Task.yield() }
        XCTAssertThrowsError(try repo.start(fake.id, ticket: ticket, replacing: true))
        verifyFalse(await repo.send(fake.id, ticket: ticket))
        fake.pause = false; fake.continuation?.resume(returning: fake.billing)
        verifyTrue(await task.value)
        XCTAssertEqual(fake.requests.filter { $0.method == "PUT" }.count, 1)
    }
    private func awaitResult(_ value: Bool) -> Bool { value }
    private func verifyTrue(_ value: Bool, file: StaticString = #filePath, line: UInt = #line) { XCTAssertTrue(value, file: file, line: line) }
    private func verifyFalse(_ value: Bool, file: StaticString = #filePath, line: UInt = #line) { XCTAssertFalse(value, file: file, line: line) }
    static var input: LaunchFollowUpInput { var input = LaunchFollowUpInput(); input.tolerability = .good; input.sideEffectsNone = true; input.pregnancyStatus = .neither; input.newMedicinesNone = true; input.physicallyInNC = false; return input }
    static var photos: LaunchPhotoSet { .init(id: UUID(uuidString: "00000000-0000-4000-8000-000000000010")!, purpose: .checkIn, status: .draft, requiredSlots: [.front,.left,.right], items: [.front,.left,.right].map { .init(slot: $0, photoId: UUID(), captureId: UUID()) }) }
}
@MainActor final class LaunchCheckFake: LaunchTransport {
    let patient = UUID(), id = UUID(); var formId = UUID(), kind = "weekly", status = "due", access = "care", offline = false, pause = false
    var secondPage = false, loseAcknowledgment = false; var savedBody: [String:Any]?; var savedResponseId: String?
    var requests: [LaunchRequest] = []; var continuation: CheckedContinuation<Data, Never>?
    var billing: Data { LaunchBillingTests.membership(status: access == "care" ? "active" : "ended", access: access, cancel: false, destination: false) }
    var questions: [[String: Any]] { [3,2,0,6,2,0,2].enumerated().map { index, count in ["id": String(format: "00000000-0000-4000-8000-%012d", index + 1), "prompt": "DRAFT topic \(index)", "type": count == 0 ? "text" : "choice", "required": count != 0, "options": (0..<count).map { option in ["id": String(format: "00000000-0000-4000-8000-%012d", (index + 1) * 100 + option), "label": "DRAFT choice \(option)"] }] } }
    func occurrence() -> [String: Any] {
        var value: [String:Any] = ["id": id.uuidString, "dueAt": "2026-11-16T12:00:00Z", "cadenceAnchor": "2026-11-09T12:00:00Z", "kind": kind, "status": status, "formId": formId.uuidString,
         "form": ["id": formId.uuidString,"userId":patient.uuidString,"version":1,"createdBy":UUID().uuidString,"createdAt":"2026-11-09T12:00:00Z","title":"DRAFT check-in","isActive":true,"questions":self.questions],
         "responseId":NSNull(),"photoSet":NSNull(),"answers":NSNull(),"submittedAt":NSNull(),"reviewedAt":NSNull(),"patientMessage":NSNull()]
        if let savedBody, let savedResponseId { value["answers"] = savedBody["answers"]; value["responseId"] = savedResponseId; value["photoSet"] = try! JSONSerialization.jsonObject(with: JSONEncoder().encode(LaunchCheckInTests.photos)) }
        return value
    }
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data {
        requests.append(request)
        if offline { throw URLError(.notConnectedToInternet) }
        if pause { return await withCheckedContinuation { continuation = $0 } }
        if request.path == "/billing" { return billing }
        if request.method == "PUT" { status = "submitted"; savedBody = try JSONSerialization.jsonObject(with: request.body!) as? [String:Any]; savedResponseId = String(request.path.split(separator:"/").last!); if loseAcknowledgment { throw URLError(.networkConnectionLost) }; return try JSONSerialization.data(withJSONObject:["checkIn":occurrence()]) }
        let requested = request.path.contains("page=2") ? 2 : 1
        let data: [[String:Any]] = secondPage && requested == 1 ? [] : [occurrence()]
        return try JSONSerialization.data(withJSONObject:["data":data,"pagination":["page":requested,"limit":20,"total":1,"totalPages":secondPage ? 2 : 1]])
    }
}

@MainActor final class CaptureCheckInCatalogTests: XCTestCase {
    func testCheckInLoadsAPIGuidanceAndClearsItOnAccountChange() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = CaptureCatalogTransport()
        let repo = LaunchCheckInRepository(access: access, transport: transport)
        let loaded = await repo.loadPhotoGuidance(ticket: ticket)
        XCTAssertTrue(loaded)
        XCTAssertEqual(repo.photoGuidance?.instructions, ["Published check-in guidance"])
        XCTAssertEqual(transport.requests.first?.questionnaireVersion, "2.1-pending-review")
        repo.cancel()
        XCTAssertNil(repo.photoGuidance)
    }
    func testUnavailableNewCatalogFallsBackButNetworkFailureDoesNot() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = CaptureCatalogTransport()
        let repo = LaunchCheckInRepository(access: access, transport: transport)
        transport.oldCatalogOnly = true
        let loaded = await repo.loadPhotoGuidance(ticket: ticket)
        XCTAssertTrue(loaded)
        XCTAssertEqual(transport.requests.map(\.questionnaireVersion), ["2.1-pending-review", "2.0-pending-review"])
        repo.cancel(); transport.requests = []; transport.offline = true
        let offline = await repo.loadPhotoGuidance(ticket: ticket)
        XCTAssertFalse(offline)
        XCTAssertNil(repo.photoGuidance)
        XCTAssertEqual(transport.requests.count, 1)
    }
    func testLateCatalogCannotCrossAccountBoundary() async {
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = CaptureCatalogTransport()
        let repo = LaunchCheckInRepository(access: access, transport: transport)
        transport.pause = true
        let task = Task { await repo.loadPhotoGuidance(ticket: ticket) }
        while transport.continuation == nil { await Task.yield() }
        _ = access.activate(UUID()); repo.cancel()
        transport.continuation?.resume(returning: transport.catalog)
        let loaded = await task.value
        XCTAssertFalse(loaded)
        XCTAssertNil(repo.photoGuidance)
    }
}
@MainActor private final class CaptureCatalogTransport: LaunchTransport {
    var requests: [LaunchRequest] = []
    var oldCatalogOnly = false
    var offline = false
    var pause = false
    var continuation: CheckedContinuation<Data, Error>?
    var catalog: Data {
        var envelope: [String: Any] = ["contractVersion": 1, "settingsVersion": 1, "plans": [], "consents": [], "reviewCopy": "Review", "questionnaireVersion": oldCatalogOnly ? "2.0-pending-review" : "2.1-pending-review", "eligibilityQuestions": [], "medicalQuestions": []]
        for (key, value) in CaptureReviewMockContent.guidance { envelope[key] = value }
        var photo = envelope["photoGuidance"] as! [String: Any]
        photo["instructions"] = ["Published check-in guidance"]
        envelope["photoGuidance"] = photo
        return try! JSONSerialization.data(withJSONObject: envelope)
    }
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data {
        requests.append(request)
        if offline { throw URLError(.notConnectedToInternet) }
        if oldCatalogOnly && request.questionnaireVersion == "2.1-pending-review" { throw LaunchFailure.server(status: 503, code: "BILLING_UNAVAILABLE") }
        if pause { return try await withCheckedThrowingContinuation { continuation = $0 } }
        return catalog
    }
}
