import XCTest
@testable import ClearAF

final class IntakeV2Tests: XCTestCase {
    private func enrollment(status: String = "consents", version: String = "2.0-pending-review", accepted: Bool = true, paid: Bool = false) throws -> LaunchEnrollmentResponse {
        var envelope = try JSONSerialization.jsonObject(with: LaunchContractTests.enrollment) as! [String: Any]
        var record = envelope["case"] as! [String: Any]
        record["status"] = status; record["questionnaireVersion"] = version
        record["intakeV2"] = ["answers": [:], "evaluation": ["missingRequired": [], "exitPage": NSNull(), "hold": false, "requiredPhotoSlots": ["front", "left", "right"]]] as [String: Any]
        envelope["case"] = record
        envelope["consents"] = ["telehealth", "medication", "privacy_notice", "subscription_terms"].map { key in ["key": key, "version": 1, "versionLabel": version, "title": key, "body": "Synthetic", "sha256": "test", "effectiveAt": "2026-11-09T00:00:00Z", "acceptedAt": accepted ? "2026-11-09T12:00:00Z" : NSNull()] as [String: Any] }
        if paid { envelope["membership"] = ["id": "00000000-0000-4000-8000-000000000003", "planId": "care", "status": "paid_pending_review", "amountCents": 3900, "currency": "usd", "cancelAtPeriodEnd": false, "refundStatus": "not_applicable", "access": "enrollment"] as [String: Any] }
        return try JSONDecoder().decode(LaunchEnrollmentResponse.self, from: JSONSerialization.data(withJSONObject: envelope))
    }
    func testAcceptedConsentsKeepPartialV2OnQuestionnaireAndLegacyStaysLegacy() throws {
        XCTAssertTrue(IntakeV2Routing.usesQuestionnaire(try enrollment()))
        XCTAssertFalse(IntakeV2Routing.usesQuestionnaire(try enrollment(accepted: false)))
        XCTAssertFalse(IntakeV2Routing.usesQuestionnaire(try enrollment(version: "1.0-pending-review")))
    }
    func testColdLaunchWaitsForMatchingV2CatalogBeforeInitializingProgress() throws {
        let state = try enrollment(status: "identity")
        XCTAssertFalse(IntakeV2Routing.canInitialize(state, catalog: nil))
        var catalog = LaunchCatalog(contractVersion: 1, settingsVersion: 1, plans: [], consents: [], reviewCopy: "", questionnaireVersion: "1.0-pending-review", eligibilityQuestions: [], medicalQuestions: [])
        XCTAssertFalse(IntakeV2Routing.canInitialize(state, catalog: catalog))
        catalog = LaunchCatalog(contractVersion: 1, settingsVersion: 1, plans: [], consents: [], reviewCopy: "", questionnaireVersion: "2.0-pending-review", eligibilityQuestions: [], medicalQuestions: [])
        XCTAssertFalse(IntakeV2Routing.canInitialize(state, catalog: catalog))
        catalog.intakeV2 = .init(sections: [], exitPages: [:], holdNotice: "", attestationIntro: "", dateQuestionIds: [])
        XCTAssertTrue(IntakeV2Routing.canInitialize(state, catalog: catalog))
    }
    func testCorrectionsRemainEditableAfterPaymentAndCompleteAnswers() throws {
        XCTAssertTrue(IntakeV2Routing.showsFinalReview(try enrollment(status: "medical_history", paid: true)))
        XCTAssertFalse(IntakeV2Routing.showsFinalReview(try enrollment(status: "needs_changes", paid: true)))
        XCTAssertTrue(IntakeV2Routing.usesQuestionnaire(try enrollment(status: "needs_changes", paid: true)))
        XCTAssertTrue(IntakeV2Routing.needsIdentity(nil))
    }
    func testTextOnlyCorrectionCanReuseEarlierPhotosAndNewPhotoCorrectionUsesDraft() {
        for status in [LaunchPhotoSet.Status.submitted, .needsChanges] {
            let set = LaunchPhotoSet(id: UUID(), purpose: .enrollment, status: status, requiredSlots: [.front, .left, .right], items: [])
            XCTAssertTrue(IntakeV2Routing.canSubmitPhotoSet(set, previouslySubmitted: true))
            XCTAssertFalse(IntakeV2Routing.canSubmitPhotoSet(set, previouslySubmitted: false))
        }
        let newSet = LaunchPhotoSet(id: UUID(), purpose: .enrollment, status: .draft, requiredSlots: [.front, .left, .right], items: [])
        XCTAssertTrue(IntakeV2Routing.canSubmitPhotoSet(newSet, previouslySubmitted: false))
    }
    func testExplicitNoneIsExclusiveAndCanBeRemoved() {
        XCTAssertEqual(IntakeV2Rules.select("none", selected: ["kidney"]), ["none"])
        XCTAssertEqual(IntakeV2Rules.select("kidney", selected: ["none"]), ["kidney"])
        XCTAssertEqual(IntakeV2Rules.select("none", selected: ["none"]), [])
    }
    func testMissingParentNeverShowsConditionalQuestion() {
        let condition = LaunchQuestion.Condition(questionId: "B2", operator: "not_in", values: ["no"])
        XCTAssertFalse(IntakeV2Rules.shown([condition], answers: [:]))
        XCTAssertTrue(IntakeV2Rules.shown([condition], answers: ["B2": .string("yes")]))
    }
    func testStructuredTreatmentAnswersRoundTrip() throws {
        let answers: [String: IntakeValue] = ["H1": .bool(true), "C1": .object(["tretinoin": .object(["duration": .string("3_to_6_months"), "helped": .string("did_not_help")])])]
        XCTAssertEqual(try JSONDecoder().decode([String: IntakeValue].self, from: JSONEncoder().encode(answers)), answers)
    }
    func testMedicineNoneAndTextAreMutuallyExclusiveAndEmptyPicksAreOmitted() {
        let cleaned = IntakeV2Rules.cleaned(["D2_none": .bool(true), "D2": .string("Old answer"), "D1": .array([])], questions: [])
        XCTAssertNil(cleaned["D2"])
        XCTAssertNil(cleaned["D1"])
        XCTAssertEqual(cleaned["D2_none"], .bool(true))
    }
    func testEachOfSixAttestationsMustBeAffirmative() {
        for index in 1...6 {
            let question = LaunchQuestion(id: "H\(index)", prompt: "Required attestation", kind: .attestation, required: true, options: [], fields: [], showWhen: [])
            XCTAssertFalse(IntakeV2Rules.complete(question, answers: [:]))
            XCTAssertFalse(IntakeV2Rules.complete(question, answers: [question.id: .bool(false)]))
            XCTAssertTrue(IntakeV2Rules.complete(question, answers: [question.id: .bool(true)]))
        }
    }
    func testTreatmentRepeatRequiresStoppedReasonAndHydroquinoneDarkeningScreen() {
        let stop = LaunchQuestion(id: "stopReason", prompt: "Why did you stop?", kind: .choice, required: true, options: [.init(id: "cost", label: "Cost")], fields: [], showWhen: [.init(questionId: "status", operator: "in", values: ["stopped"])])
        let darkened = LaunchQuestion(id: "darkened", prompt: "Darkening?", kind: .choice, required: true, options: [.init(id: "no", label: "No")], fields: [], showWhen: [.init(questionId: "treatmentId", operator: "in", values: ["hydroquinone"])])
        let question = LaunchQuestion(id: "C1", prompt: "Treatments", kind: .repeatGroup, required: true, options: [], fields: [stop, darkened], showWhen: [])
        var row: [String: IntakeValue] = ["treatmentId": .string("hydroquinone"), "status": .string("stopped")]
        XCTAssertFalse(IntakeV2Rules.complete(question, answers: ["C1": .array([.object(row)])]))
        row["stopReason"] = .string("cost")
        XCTAssertFalse(IntakeV2Rules.complete(question, answers: ["C1": .array([.object(row)])]))
        row["darkened"] = .string("no")
        XCTAssertTrue(IntakeV2Rules.complete(question, answers: ["C1": .array([.object(row)])]))
        row["status"] = .string("using")
        let cleaned = IntakeV2Rules.cleaned(["C1": .array([.object(row)])], questions: [question])
        if case .array(let values) = cleaned["C1"] { XCTAssertNil(values.first?.object["stopReason"]) }
        else { XCTFail("Treatment row missing") }
    }
}
