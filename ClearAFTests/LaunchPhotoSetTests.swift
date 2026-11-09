import XCTest
import UIKit
@testable import ClearAF

@MainActor final class LaunchPhotoSetTests: XCTestCase {
    func testRequiredAnglesAndDistinctAcknowledgedAssociations() {
        XCTAssertEqual(Set(LaunchPhotoRules.required(sites: ["chest"])), [.front, .left, .right, .chest])
        XCTAssertEqual(Set(LaunchPhotoRules.required(sites: ["back"])), [.front, .left, .right, .back])
        let id = UUID(), a = UUID(), b = UUID(), c = UUID()
        let valid = LaunchPhotoSet(id: id, purpose: .enrollment, status: .draft, requiredSlots: [.front,.left,.right], items: [.init(slot: .front, photoId: a, captureId: UUID()),.init(slot: .left, photoId: b, captureId: UUID()),.init(slot: .right, photoId: c, captureId: UUID())])
        XCTAssertTrue(LaunchPhotoRules.complete(valid))
        let duplicate = LaunchPhotoSet(id: id, purpose: .enrollment, status: .draft, requiredSlots: [.front,.left,.right], items: [.init(slot: .front, photoId: a, captureId: UUID()),.init(slot: .left, photoId: a, captureId: UUID()),.init(slot: .right, photoId: c, captureId: UUID())])
        XCTAssertFalse(LaunchPhotoRules.complete(duplicate))
        XCTAssertFalse(LaunchPhotoRules.complete(.init(id: id, purpose: .enrollment, status: .draft, requiredSlots: [.front,.left,.right,.chest], items: valid.items)))
    }
    func testEncoderProducesJPEGWithinBudgetAndRejectsInvalidOrOversizeMultipart() throws {
        let bytes = try LaunchSkinPhotoEncoder.jpeg(Self.image())
        XCTAssertTrue(bytes.starts(with: [0xff,0xd8,0xff])); XCTAssertLessThanOrEqual(bytes.count, 3_145_728)
        XCTAssertThrowsError(try LaunchSkinPhotoEncoder.jpeg(Data([1,2])))
        XCTAssertThrowsError(try LaunchSkinPhotoEncoder.multipart(Data(repeating: 0, count: 3_145_729), date: .now, purpose: .enrollment, targetId: UUID(), boundary: "test"))
        let body = try LaunchSkinPhotoEncoder.multipart(bytes, date: .now, purpose: .checkIn, targetId: UUID(), boundary: "test")
        XCTAssertLessThanOrEqual(body.count, 3_670_016)
        XCTAssertTrue(String(decoding: body, as: UTF8.self).contains("check_in"))
    }
    func testInterruptedAssociationRetriesSameCaptureAndResumesProtectedBytes() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = PhotoSetFake(), target = UUID(), root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let repo = LaunchPhotoSetRepository(access: access, transport: fake, directory: root)
        try repo.resume(ticket: ticket, targetId: target, purpose: .enrollment, requiredSlots: [.front,.left,.right])
        try repo.stage(Self.image(), slot: .front, ticket: ticket)
        let capture = repo.entries.first?.captureId
        fake.associationFails = true
        let failed = await repo.upload(.front, ticket: ticket)
        XCTAssertFalse(failed); XCTAssertFalse(repo.isComplete)
        XCTAssertNotNil(repo.entries.first?.photoId)
        repo.cancel()
        try repo.resume(ticket: ticket, targetId: target, purpose: .enrollment, requiredSlots: [.front,.left,.right])
        XCTAssertEqual(repo.entries.first?.captureId, capture)
        XCTAssertFalse(repo.entries.first?.bytes.isEmpty ?? true)
        fake.associationFails = false
        let retry = await repo.upload(.front, ticket: ticket)
        XCTAssertTrue(retry)
        XCTAssertEqual(fake.requests.filter { $0.path.hasPrefix("/photo-captures/") }.count, 1)
        XCTAssertEqual(repo.acknowledgedSlots, [.front])
        let json = try JSONSerialization.jsonObject(with: XCTUnwrap(fake.requests.last?.body)) as! [String: Any]
        XCTAssertEqual(json["targetId"] as? String, target.uuidString.lowercased())
    }
    func testThreeAngleJourneyAndInvalidAssociationNeverCompletes() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = PhotoSetFake(), repo = LaunchPhotoSetRepository(access: access, transport: fake)
        try repo.resume(ticket: ticket, targetId: UUID(), purpose: .enrollment, requiredSlots: [.front,.left,.right,.chest,.back])
        for (slot, color) in [(LaunchPhotoSlot.front, UIColor.red), (.left, .green), (.right, .blue)] {
            try repo.stage(Self.image(color), slot: slot, ticket: ticket)
            let result = await repo.upload(slot, ticket: ticket); XCTAssertTrue(result)
        }
        XCTAssertEqual(repo.acknowledgedSlots, [.front,.left,.right]); XCTAssertFalse(repo.isComplete)
        try repo.stage(Self.image(.yellow), slot: .chest, ticket: ticket)
        _ = await repo.upload(.chest, ticket: ticket)
        XCTAssertFalse(repo.isComplete)
        try repo.stage(Self.image(.purple), slot: .back, ticket: ticket)
        fake.mismatchedAssociation = true
        let invalid = await repo.upload(.back, ticket: ticket)
        XCTAssertFalse(invalid); XCTAssertFalse(repo.isComplete)
        fake.mismatchedAssociation = false
        let retry = await repo.upload(.back, ticket: ticket)
        XCTAssertTrue(retry); XCTAssertTrue(repo.isComplete)
        XCTAssertEqual(Set(repo.entries.compactMap(\.photoId)).count, 5)
    }
    func testRetakeRemovesOnlyDraftAssociationAndSubmittedSetIsImmutable() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = PhotoSetFake(), repo = LaunchPhotoSetRepository(access: access, transport: fake)
        try repo.resume(ticket: ticket, targetId: UUID(), purpose: .enrollment, requiredSlots: [.front])
        try repo.stage(Self.image(), slot: .front, ticket: ticket)
        _ = await repo.upload(.front, ticket: ticket)
        let capture = repo.entries.first?.captureId
        let retaken = await repo.retake(.front, ticket: ticket)
        XCTAssertTrue(retaken); XCTAssertTrue(repo.acknowledgedSlots.isEmpty)
        try repo.stage(Self.image(), slot: .front, ticket: ticket)
        XCTAssertNotEqual(repo.entries.first?.captureId, capture)
        let submitted = LaunchPhotoSet(id: UUID(), purpose: .enrollment, status: .submitted, requiredSlots: [.front], items: [])
        repo.cancel()
        try repo.resume(ticket: ticket, targetId: UUID(), purpose: .enrollment, requiredSlots: [.front], serverSet: submitted)
        XCTAssertThrowsError(try repo.stage(Self.image(), slot: .front, ticket: ticket))
        XCTAssertFalse(fake.requests.contains { $0.method == "DELETE" })
    }
    func testCorrectionsCreateFreshSetOnceAndDropRemovedSensitiveAngles() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = PhotoSetFake(), target = UUID(), root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let repo = LaunchPhotoSetRepository(access: access, transport: fake, directory: root)
        let previousID = UUID()
        let submitted = LaunchPhotoSet(id: previousID, purpose: .enrollment, status: .submitted, requiredSlots: [.front,.left,.right,.chest], items: [])
        try repo.resume(ticket: ticket, targetId: target, purpose: .enrollment, requiredSlots: [.front,.left,.right,.chest], serverSet: submitted)
        XCTAssertTrue(repo.isReadOnly)
        let correction = LaunchPhotoSet(id: previousID, purpose: .enrollment, status: .needsChanges, requiredSlots: [.front,.left,.right,.chest], items: [])
        try repo.resume(ticket: ticket, targetId: target, purpose: .enrollment, requiredSlots: [.front,.left,.right], serverSet: correction)
        XCTAssertFalse(repo.isReadOnly); XCTAssertFalse(repo.requiredSlots.contains(.chest))
        try repo.stage(Self.image(), slot: .front, ticket: ticket)
        fake.required = ["front","left","right","back"]
        _ = await repo.upload(.front, ticket: ticket)
        let newID = repo.photoSet?.id, capture = repo.entries.first?.captureId
        XCTAssertNotEqual(newID, previousID)
        repo.cancel()
        try repo.resume(ticket: ticket, targetId: target, purpose: .enrollment, requiredSlots: [.front,.left,.right], serverSet: correction)
        XCTAssertFalse(repo.isReadOnly); XCTAssertFalse(repo.requiredSlots.contains(.chest))
        XCTAssertEqual(repo.entries.first?.captureId, capture); XCTAssertEqual(repo.photoSet?.id, newID)
        XCTAssertTrue(repo.requiredSlots.contains(.back), "Current correction set requirements survive resume")
    }
    func testFailedOptionalRetakeAssociationBlocksFinalCompleteness() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = PhotoSetFake(), repo = LaunchPhotoSetRepository(access: access, transport: fake)
        let target = UUID()
        try repo.resume(ticket: ticket, targetId: target, purpose: .enrollment, requiredSlots: [.front,.left,.right])
        for (slot,color) in [(LaunchPhotoSlot.front, UIColor.red),(.left,.green),(.right,.blue),(.closeUp,.yellow)] {
            try repo.stage(Self.image(color), slot: slot, ticket: ticket); _ = await repo.upload(slot, ticket: ticket)
        }
        XCTAssertTrue(repo.isComplete)
        fake.associationFails = true
        _ = await repo.retake(.closeUp, ticket: ticket)
        XCTAssertFalse(repo.isComplete)
        repo.cancel()
        try repo.resume(ticket: ticket, targetId: target, purpose: .enrollment, requiredSlots: [.front,.left,.right])
        XCTAssertTrue(repo.associationNeedsRetry, "Dirty association recovery survives relaunch even without an error in memory")
        let uploadCount = fake.requests.filter { $0.path.hasPrefix("/photo-captures/") }.count
        fake.associationFails = false
        let retried = await repo.retryAssociation(ticket: ticket)
        XCTAssertTrue(retried); XCTAssertTrue(repo.isComplete)
        XCTAssertEqual(fake.requests.filter { $0.path.hasPrefix("/photo-captures/") }.count, uploadCount)
    }
    func testLateResponseAndDifferentAccountNeverReceiveLocalPhoto() async throws {
        let access = AccountAccess(), a = UUID(), ticket = access.activate(a), fake = PhotoSetFake(), root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString), target = UUID()
        defer { try? FileManager.default.removeItem(at: root) }
        let repo = LaunchPhotoSetRepository(access: access, transport: fake, directory: root)
        try repo.resume(ticket: ticket, targetId: target, purpose: .enrollment, requiredSlots: [.front])
        try repo.stage(Self.image(), slot: .front, ticket: ticket)
        fake.pause = true
        let upload = Task { await repo.upload(.front, ticket: ticket) }
        while fake.continuation == nil { await Task.yield() }
        let b = access.activate(UUID()); repo.cancel()
        try repo.resume(ticket: b, targetId: target, purpose: .enrollment, requiredSlots: [.front])
        fake.continuation?.resume(returning: fake.captureResponse())
        let stale = await upload.value
        XCTAssertFalse(stale); XCTAssertTrue(repo.entries.isEmpty); XCTAssertNil(repo.photoSet)
    }
    func testSubmittedPhotoSnapshotCannotBeResubmitted() async {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = SubmitPhotoFake(), repo = LaunchEnrollmentRepository(access: access, transport: fake)
        fake.setStatus = "submitted"
        _ = await repo.refresh(ticket: ticket)
        XCTAssertFalse(repo.canSubmitCase)
        XCTAssertTrue(fake.requests.allSatisfy { $0.method == "GET" })
    }
    func testFinalSubmitIsSingleAndPaidReceiptNeverClaimsNoCharge() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = SubmitPhotoFake(), repo = LaunchEnrollmentRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket)
        let task = Task { await repo.submitCase(ticket: ticket) }
        while fake.continuation == nil { await Task.yield() }
        let duplicate = await repo.submitCase(ticket: ticket)
        XCTAssertFalse(duplicate)
        fake.continuation?.resume(returning: fake.enrollment(status: "submitted"))
        let submitted = await task.value
        XCTAssertTrue(submitted)
        XCTAssertEqual(fake.requests.filter { $0.method == "POST" }.count, 1)
        XCTAssertEqual(repo.state?.case.status, .submitted)
        XCTAssertTrue(LaunchCaseReceipt.copy(status: .submitted, refund: .pending).contains("1 to 2 business days"))
        XCTAssertFalse(LaunchCaseReceipt.copy(status: .rejected, refund: .issued).contains("not been charged"))
    }
    static func image(_ color: UIColor = .gray) -> Data { UIGraphicsImageRenderer(size: CGSize(width: 100, height: 120)).image { context in color.setFill(); context.fill(CGRect(x: 0,y: 0,width: 100,height: 120)) }.pngData()! }
}
@MainActor private final class PhotoSetFake: LaunchTransport {
    var requests: [LaunchRequest] = [], associationFails = false, pause = false, mismatchedAssociation = false
    var continuation: CheckedContinuation<Data, Never>?
    var captureID = UUID(), photoID = UUID(); var required = ["front","left","right"]
    func captureResponse() -> Data { Data("{\"capture\":{\"id\":\"\(photoID)\",\"captureId\":\"\(captureID)\",\"captureDate\":\"2026-11-09T00:00:00Z\",\"uploadedAt\":\"2026-11-09T00:00:00Z\"}}".utf8) }
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data {
        requests.append(request)
        if request.path.hasPrefix("/photo-captures/") {
            captureID = UUID(uuidString: String(request.path.split(separator: "/").last!))!; photoID = UUID()
            if pause { return await withCheckedContinuation { continuation = $0 } }
            return captureResponse()
        }
        if associationFails { throw URLError(.notConnectedToInternet) }
        let body = try JSONSerialization.jsonObject(with: request.body!) as! [String: Any]
        var result = body; result.removeValue(forKey: "targetId"); result["id"] = String(request.path.split(separator: "/").last!); result["status"] = "draft"; result["requiredSlots"] = required
        if mismatchedAssociation { result["id"] = UUID().uuidString }
        return try JSONSerialization.data(withJSONObject: ["photoSet": result])
    }
}
@MainActor private final class SubmitPhotoFake: LaunchTransport {
    var requests: [LaunchRequest] = []; var continuation: CheckedContinuation<Data, Never>?; var setStatus = "draft"
    func enrollment(status: String) -> Data {
        let items = ["front","left","right"].map { "{\"slot\":\"\($0)\",\"photoId\":\"\(UUID())\",\"captureId\":\"\(UUID())\"}" }.joined(separator: ",")
        return Data("{\"case\":{\"id\":\"00000000-0000-4000-8000-000000000001\",\"revision\":1,\"status\":\"\(status)\",\"identity\":null,\"eligibility\":null,\"medicalHistory\":{},\"questionnaireVersion\":\"0.9-draft\",\"photoSet\":{\"id\":\"00000000-0000-4000-8000-000000000002\",\"purpose\":\"enrollment\",\"status\":\"\(setStatus)\",\"requiredSlots\":[\"front\",\"left\",\"right\"],\"items\":[\(items)]},\"destination\":{\"planId\":\"care\",\"pharmacy\":{\"name\":\"Synthetic\",\"addressLine1\":\"1 Test St\",\"addressLine2\":null,\"city\":\"Raleigh\",\"state\":\"NC\",\"postalCode\":\"27601\",\"phone\":\"9195550100\"}},\"planId\":\"care\",\"flags\":[],\"submittedAt\":null,\"approvedAt\":null,\"patientMessage\":null},\"membership\":null,\"consents\":[]}".utf8)
    }
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data { requests.append(request); if request.method == "POST" { return await withCheckedContinuation { continuation = $0 } }; return enrollment(status: "destination") }
}
