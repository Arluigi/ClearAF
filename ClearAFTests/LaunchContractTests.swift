import XCTest
@testable import ClearAF

final class LaunchContractTests: XCTestCase {
    func testUnknownStatusesFailClosed() throws {
        for value in ["future", "activating"] {
            XCTAssertThrowsError(try JSONDecoder().decode(LaunchMembership.Status.self, from: Data("\"\(value)\"".utf8)))
        }
        XCTAssertThrowsError(try JSONDecoder().decode(LaunchCase.Status.self, from: Data("\"future\"".utf8)))
    }
    func testEnrollmentNullsAndEmptyDraft() throws {
        let value = try JSONDecoder().decode(LaunchEnrollmentResponse.self, from: Self.enrollment)
        XCTAssertEqual(value.case.status, .consents)
        XCTAssertNil(value.membership)
        XCTAssertNil(value.case.identity)
        XCTAssertEqual(value.case.medicalHistory, LaunchMedicalDraft())
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as! [String: Any]
        XCTAssertTrue(encoded["membership"] is NSNull)
    }
    func testDestinationUnionAndExplicitNull() throws {
        let pharmacy = LaunchPharmacy(name: "Synthetic", addressLine1: "1 Test St", addressLine2: nil, city: "Chicago", state: "IL", postalCode: "60601", phone: "3125550100")
        let destination = LaunchDestination.care(pharmacy)
        let bytes = try JSONEncoder().encode(destination)
        XCTAssertEqual(try JSONDecoder().decode(LaunchDestination.self, from: bytes), destination)
        let object = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
        XCTAssertTrue((object["pharmacy"] as! [String: Any])["addressLine2"] is NSNull)
        XCTAssertThrowsError(try JSONDecoder().decode(LaunchDestination.self, from: Data(#"{"planId":"all_in","pharmacy":"other","shippingAddress":{}}"#.utf8)))
    }
    func testHiddenMedicalBranchesEncodeExplicitNulls() throws {
        let object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(LaunchMedicalDraft())) as! [String: Any]
        for field in ["M2", "M3", "M4", "M8"] { XCTAssertTrue(object[field] is NSNull, "Missing explicit null for \(field)") }
    }
    func testMoneyAndUTCDateValidation() throws {
        XCTAssertNotNil(LaunchDates.instant("2026-11-09T12:00:00.000Z"))
        XCTAssertNil(LaunchDates.instant("tomorrow"))
        XCTAssertThrowsError(try JSONDecoder().decode(LaunchPlan.self, from: Data(#"{"id":"care","name":"Care","amountCents":-1,"currency":"usd","interval":"month","includesPartnerRx":false,"cadence":{"weeklyWeeks":0,"then":"monthly"}}"#.utf8)))
    }
    static let enrollment = Data(#"{"case":{"id":"00000000-0000-4000-8000-000000000001","revision":0,"status":"consents","identity":null,"eligibility":null,"medicalHistory":{},"questionnaireVersion":"0.9-draft","photoSet":null,"destination":null,"planId":null,"flags":[],"submittedAt":null,"approvedAt":null,"patientMessage":null},"membership":null,"consents":[]}"#.utf8)
}

extension LaunchContractTests {
    func testCatalogIncludesVersionedDraftContentAndConditionalQuestions() throws {
        let json = #"{"contractVersion":1,"settingsVersion":2,"plans":[{"id":"all_in","name":"All-In","amountCents":9100,"currency":"usd","interval":"month","includesPartnerRx":true,"cadence":{"weeklyWeeks":8,"then":"monthly"}}],"consents":[{"key":"telehealth","version":1,"versionLabel":"0.9-draft","title":"DRAFT","body":"Synthetic DRAFT text","sha256":"abc","effectiveAt":"2026-11-09T00:00:00Z","acceptedAt":null}],"reviewCopy":"Review within 1 to 2 business days.","questionnaireVersion":"0.9-draft","eligibilityQuestions":[],"medicalQuestions":[{"id":"M2","prompt":"DRAFT question","kind":"choice","required":true,"options":[{"id":"no","label":"No"}],"fields":[],"showWhen":[{"questionId":"M1","operator":"not_in","values":["male"]}]}]}"#
        let catalog = try JSONDecoder().decode(LaunchCatalog.self, from: Data(json.utf8))
        XCTAssertEqual(catalog.plans.first?.amountCents, 9100)
        XCTAssertEqual(catalog.consents.first?.versionLabel, "0.9-draft")
        XCTAssertEqual(catalog.medicalQuestions.first?.showWhen.first?.values, ["male"])
    }
    func testAmendedBillingMembershipAndHostedSessionShapes() throws {
        let json = #"{"membership":{"id":"00000000-0000-4000-8000-000000000001","planId":"care","status":"paid_pending_review","amountCents":4100,"currency":"usd","activatedAt":null,"currentPeriodEnd":"2026-12-09T12:00:00Z","paidThrough":"2026-12-09T12:00:00Z","cancelAtPeriodEnd":true,"cadenceAnchor":null,"refundStatus":"pending","access":"enrollment","destinationRequired":true}}"#
        let billing = try JSONDecoder().decode(LaunchBillingResponse.self, from: Data(json.utf8))
        XCTAssertEqual(billing.membership?.status, .paidPendingReview)
        XCTAssertEqual(billing.membership?.destinationRequired, true)
        XCTAssertNil(billing.membership?.cadenceAnchor)
        let action = try JSONDecoder().decode(LaunchPaymentAction.self, from: Data(#"{"url":"https://checkout.stripe.com/c/pay/synthetic","expiresAt":"2026-11-09T13:00:00Z"}"#.utf8))
        XCTAssertEqual(URL(string: action.url)?.host, "checkout.stripe.com")
    }
    func testPhotoCaptureAndSetShapes() throws {
        let bytes = Data(#"{"capture":{"id":"00000000-0000-4000-8000-000000000001","captureId":"00000000-0000-4000-8000-000000000002","captureDate":"2026-11-09T12:00:00Z","uploadedAt":"2026-11-09T12:01:00Z"}}"#.utf8)
        struct CaptureEnvelope: Decodable { let capture: LaunchCapture }
        XCTAssertNotNil(LaunchDates.instant(try JSONDecoder().decode(CaptureEnvelope.self, from: bytes).capture.uploadedAt))
        let set = try JSONDecoder().decode(LaunchPhotoSet.self, from: Data(#"{"id":"00000000-0000-4000-8000-000000000001","purpose":"enrollment","status":"draft","requiredSlots":["front","left","right","chest"],"items":[]}"#.utf8))
        XCTAssertEqual(set.requiredSlots.count, 4)
        XCTAssertEqual(set.items.count, 0)
    }
    func testCheckInAndPrescriptionPageShapes() throws {
        let checkIn = #"{"data":[{"id":"00000000-0000-4000-8000-000000000001","dueAt":"2026-11-16T12:00:00Z","cadenceAnchor":"2026-11-09T12:00:00Z","kind":"weekly","status":"due","formId":"00000000-0000-4000-8000-000000000002","form":{"id":"00000000-0000-4000-8000-000000000002","userId":"00000000-0000-4000-8000-000000000003","version":1,"createdBy":"00000000-0000-4000-8000-000000000004","createdAt":"2026-11-09T12:00:00Z","title":"DRAFT","isActive":true,"questions":[]},"responseId":null,"photoSet":null,"answers":null,"submittedAt":null,"reviewedAt":null,"patientMessage":null}],"pagination":{"page":1,"limit":20,"total":1,"totalPages":1}}"#
        let page = try JSONDecoder().decode(SupportPage<LaunchCheckIn>.self, from: Data(checkIn.utf8))
        XCTAssertEqual(page.data.first?.kind, .weekly)
        XCTAssertEqual(page.pagination.total, 1)
        let rx = #"{"data":[{"id":"00000000-0000-4000-8000-000000000001","patientId":"00000000-0000-4000-8000-000000000002","clinicianId":"00000000-0000-4000-8000-000000000003","drug":"Synthetic","strength":"1%","sig":"DRAFT","pharmacy":{"name":"Test","addressLine1":"1 Test St","addressLine2":null,"city":"Raleigh","state":"NC","postalCode":"27601","phone":"9195550100"},"sentAt":"2026-11-09T12:00:00Z","recordedAt":"2026-11-09T12:01:00Z","source":"treatrx_external"}],"pagination":{"page":1,"limit":20,"total":1,"totalPages":1}}"#
        let prescriptions = try JSONDecoder().decode(SupportPage<LaunchPrescription>.self, from: Data(rx.utf8))
        XCTAssertEqual(prescriptions.data.first?.source, "treatrx_external")
        XCTAssertEqual(prescriptions.data.first?.strength, "1%")
    }
}

extension LaunchContractTests {
    func testExplicitLegacyChartDiscriminatorNeedsNoLaunchEnrollment() throws {
        let response = try JSONDecoder().decode(LaunchChartResponse.self, from: Data(#"{"careModel":"legacy"}"#.utf8))
        XCTAssertEqual(response.careModel, .legacy)
        XCTAssertNil(response.enrollment)
        XCTAssertThrowsError(try JSONDecoder().decode(LaunchChartResponse.self, from: Data(#"{}"#.utf8)))
    }
}
