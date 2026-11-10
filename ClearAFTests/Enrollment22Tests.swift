import XCTest
@testable import ClearAF

@MainActor final class Enrollment22Tests: XCTestCase {
    private func state(status: String, answers: [String: Any] = [:], progress: [String: Any]? = nil) throws -> LaunchEnrollmentResponse {
        var envelope = try JSONSerialization.jsonObject(with: LaunchContractTests.enrollment) as! [String: Any]
        var record = envelope["case"] as! [String: Any]
        record["status"] = status
        record["questionnaireVersion"] = "2.2-pending-review"
        record["intakeV2"] = ["answers": answers, "evaluation": ["missingRequired": [], "exitPage": NSNull(), "hold": false, "requiredPhotoSlots": ["front", "left", "right"]]] as [String: Any]
        if let progress { record["enrollmentProgress"] = progress }
        envelope["case"] = record
        return try JSONDecoder().decode(LaunchEnrollmentResponse.self, from: JSONSerialization.data(withJSONObject: envelope))
    }
    func testResumeProgressAndPartialDraftRoundTripWithoutLosingServerCheckpoint() throws {
        let progress: [String: Any] = ["step": "medical_history", "topicId": "medicines", "eligibilityDraft": ["E1": "acne"], "identityDraft": ["fullName": "Synthetic", "dateOfBirth": NSNull(), "physicallyInNC": false, "idPhoto": NSNull(), "selfie": NSNull()]]
        let envelope = try state(status: "medical_history", progress: progress)
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(envelope)) as! [String: Any]
        let record = encoded["case"] as! [String: Any]
        let checkpoint = record["enrollmentProgress"] as? [String: Any]
        XCTAssertEqual(checkpoint?["topicId"] as? String, "medicines")
        XCTAssertEqual((checkpoint?["eligibilityDraft"] as? [String: String])?["E1"], "acne")
    }
    func testResumeUsesServerTopicEvenWhenEarlierTopicsWereAlreadyAnswered() throws {
        let saved = try state(status: "medical_history", progress: ["step": "medical_history", "topicId": "medicines"])
        let sections = [IntakeV2Catalog.Section(id: "about_you", title: "About you", intro: "", questionIds: ["B1"]), .init(id: "medicines", title: "Medicines", intro: "", questionIds: ["D1"])]
        XCTAssertEqual(Enrollment22Routing.resumeTopic(saved, sections: sections, questions: []), "medicines")
    }
    func testProgressRequestKeepsRevisionAndExplicitNullTopicAndSeparateConsentSignatures() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = LaunchEnrollmentFake()
        fake.response = try JSONEncoder().encode(state(status: "consents"))
        let repository = LaunchEnrollmentRepository(access: access, transport: fake, directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        _ = await repository.refresh(ticket: ticket)
        let document = LaunchConsent(key: .telehealth, version: 5, versionLabel: "2.2-pending-review", title: "Telehealth", body: "Unchanged legal body", sha256: "legal-hash", effectiveAt: "2026-11-10T00:00:00Z", acceptedAt: nil)
        let saved = await repository.saveProgress(step: "consents", consentDraft: [.init(document)], ticket: ticket)
        XCTAssertTrue(saved)
        let request = try XCTUnwrap(fake.requests.last)
        XCTAssertTrue(request.path.hasSuffix("/progress"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.body)) as! [String: Any]
        XCTAssertEqual(body["expectedRevision"] as? Int, 0)
        XCTAssertTrue(body["topicId"] is NSNull)
        let signatures = body["consentDraft"] as? [[String: Any]]
        XCTAssertEqual(signatures?.first?["key"] as? String, "telehealth")
        XCTAssertEqual(signatures?.first?["version"] as? Int, 5)
        XCTAssertEqual(signatures?.first?["sha256"] as? String, "legal-hash")
    }
    func testAutosavedMedicalDraftCannotAdvanceUntilPatientContinues() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = LaunchEnrollmentFake()
        fake.response = try JSONEncoder().encode(state(status: "medical_history"))
        let repository = LaunchEnrollmentRepository(access: access, transport: fake, directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        _ = await repository.refresh(ticket: ticket)
        let saved = await repository.saveIntakeV2(["B1": .string("male")], ticket: ticket, advance: false)
        XCTAssertTrue(saved)
        let request = try XCTUnwrap(fake.requests.last)
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.body)) as! [String: Any]
        XCTAssertEqual(body["advance"] as? Bool, false)
        XCTAssertEqual(repository.state?.case.status, .medicalHistory)
    }
    func testPartialIdentityUploadSupportsOnePhotoAndNoUnconfirmedDate() throws {
        let body = try LaunchIdentityInput.draftMultipart(idPhoto: Data([1, 2, 3]), selfie: nil, fullName: "Synthetic", dateOfBirth: nil, physicallyInNC: false, revision: 3, boundary: "test-boundary")
        let text = String(decoding: body, as: UTF8.self)
        XCTAssertTrue(text.contains("name=\"idPhoto\""))
        XCTAssertFalse(text.contains("name=\"selfie\""))
        XCTAssertTrue(text.contains("name=\"expectedRevision\"\r\n\r\n3"))
        XCTAssertTrue(text.contains("name=\"dateOfBirth\"\r\n\r\n\r\n"))
    }
    func testPaidIdentityOffersExplicitRefundWithoutWeakeningUploadValidation() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let source = try String(contentsOf: root.appendingPathComponent("ClearAF/Views/Enrollment/IdentityCaptureView.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("Stop enrollment and request a full refund?"))
        XCTAssertTrue(source.contains("I’m outside North Carolina"))
        XCTAssertTrue(source.contains("I’m under 18"))
        XCTAssertFalse(LaunchIdentityInput.valid(fullName: "Synthetic Adult", dateOfBirth: "2000-01-01", physicallyInNC: false, readable: true, idPhoto: Data([1]), selfie: Data([2])))
    }
    func testIdentityStopUsesConfirmedReasonAndCannotRunOutsideIdentityStep() async throws {
        let access = AccountAccess(), ticket = access.activate(UUID()), fake = LaunchEnrollmentFake()
        fake.response = try JSONEncoder().encode(state(status: "identity"))
        let repository = LaunchEnrollmentRepository(access: access, transport: fake, directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        _ = await repository.refresh(ticket: ticket)
        let stopped = await repository.stopIdentityEnrollment(reason: .outsideNC, ticket: ticket)
        XCTAssertTrue(stopped)
        let request = try XCTUnwrap(fake.requests.last)
        XCTAssertEqual(request.method, "POST")
        XCTAssertTrue(request.path.hasSuffix("/identity-ineligible"))
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.body)) as! [String: Any]
        XCTAssertEqual(body["reason"] as? String, "outside_nc")
        XCTAssertEqual(body["expectedRevision"] as? Int, 0)
        fake.response = try JSONEncoder().encode(state(status: "medical_history"))
        _ = await repository.refresh(ticket: ticket)
        let count = fake.requests.count
        let refused = await repository.stopIdentityEnrollment(reason: .under18, ticket: ticket)
        XCTAssertFalse(refused)
        XCTAssertEqual(fake.requests.count, count)
    }
    func testNewOrderDoesNotRouteIdentityOrPhotosIntoMedicalQuestionnaire() throws {
        for status in ["eligibility", "consents", "payment", "identity", "photos", "destination", "submitted"] {
            XCTAssertFalse(IntakeV2Routing.usesQuestionnaire(try state(status: status)), status)
        }
        XCTAssertTrue(IntakeV2Routing.usesQuestionnaire(try state(status: "medical_history")))
    }
    func testMedicalCompletionDoesNotSkipPhotosOrDestinationInNewOrder() throws {
        XCTAssertFalse(IntakeV2Routing.showsFinalReview(try state(status: "medical_history")))
        XCTAssertFalse(IntakeV2Routing.showsFinalReview(try state(status: "photos")))
    }
}
