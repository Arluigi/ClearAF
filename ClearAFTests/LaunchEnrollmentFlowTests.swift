import XCTest
import UIKit
@testable import ClearAF

@MainActor final class LaunchEnrollmentFlowTests: XCTestCase {
    func testFourIndependentAcceptancesAndVersionChangeRequiresReview() throws {
        var selection = LaunchConsentSelection()
        let documents = LaunchConsentKey.allCases.enumerated().map { index, key in
            LaunchConsent(key: key, version: 1, versionLabel: "0.9-draft", title: "DRAFT", body: "Synthetic DRAFT text", sha256: "hash\(index)", effectiveAt: "2026-11-09T00:00:00Z", acceptedAt: nil)
        }
        for document in documents.dropLast() { selection.set(document, accepted: true) }
        XCTAssertFalse(selection.isComplete(documents))
        selection.set(documents.last!, accepted: true)
        XCTAssertTrue(selection.isComplete(documents))
        selection.set(documents[0], accepted: false)
        XCTAssertFalse(selection.isComplete(documents))
        selection.set(documents[0], accepted: true)
        let changed = LaunchConsent(key: .telehealth, version: 2, versionLabel: "1.0", title: "Updated", body: "Updated", sha256: "new", effectiveAt: "2026-11-10T00:00:00Z", acceptedAt: nil)
        XCTAssertFalse(selection.isComplete([changed] + Array(documents.dropFirst())))
    }
    func testEligibilityStopsAndSafeReviewCues() {
        XCTAssertFalse(LaunchEligibility(E1: .somethingElse, E2: .no, E3: .neither, E4: .no).canContinue)
        XCTAssertFalse(LaunchEligibility(E1: .acne, E2: .yes, E3: .neither, E4: .no).canContinue)
        for pregnancy in [LaunchEligibility.Pregnancy.pregnant, .breastfeeding] {
            let answers = LaunchEligibility(E1: .darkMarks, E2: .no, E3: pregnancy, E4: .yes)
            XCTAssertTrue(answers.canContinue)
            XCTAssertFalse(answers.reviewCues.isEmpty)
        }
    }
    func testIdentityRequiresAdultNCReadablePairAndValidDate() throws {
        let now = try XCTUnwrap(LaunchDates.instant("2026-11-09T12:00:00Z"))
        XCTAssertTrue(LaunchIdentityInput.valid(fullName: "Synthetic Adult", dateOfBirth: "2000-01-01", physicallyInNC: true, readable: true, idPhoto: Data([1]), selfie: Data([2]), now: now))
        for dob in ["2010-01-01", "2027-01-01", "2000-02-31", "bad"] {
            XCTAssertFalse(LaunchIdentityInput.valid(fullName: "Synthetic Adult", dateOfBirth: dob, physicallyInNC: true, readable: true, idPhoto: Data([1]), selfie: Data([2]), now: now))
        }
        XCTAssertFalse(LaunchIdentityInput.valid(fullName: "Synthetic Adult", dateOfBirth: "2000-01-01", physicallyInNC: false, readable: true, idPhoto: Data([1]), selfie: Data([2]), now: now))
        XCTAssertFalse(LaunchIdentityInput.valid(fullName: "Synthetic Adult", dateOfBirth: "2000-01-01", physicallyInNC: true, readable: false, idPhoto: Data([1]), selfie: Data([2]), now: now))
    }
    func testIdentityEncoderStripsMetadataAndEnforcesBudget() throws {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 800, height: 600)).image { context in UIColor.gray.setFill(); context.fill(CGRect(x: 0, y: 0, width: 800, height: 600)) }
        let jpeg = try LaunchIdentityInput.jpeg(try XCTUnwrap(image.pngData()))
        XCTAssertLessThanOrEqual(jpeg.count, 1_572_864)
        XCTAssertNotNil(UIImage(data: jpeg))
        XCTAssertThrowsError(try LaunchIdentityInput.jpeg(Data([0,1,2])))
    }
    func testIdentityFailureKeepsServerStepAndRetryID() async throws {
        let fake = FlowTransport(), access = AccountAccess(), ticket = access.activate(UUID())
        let repo = LaunchEnrollmentRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket)
        let id = UUID()
        let saved = await repo.submitIdentity(id: id, fullName: "Synthetic Adult", dateOfBirth: "2000-01-01", physicallyInNC: true, idPhoto: Data([1]), selfie: Data([2]), ticket: ticket)
        XCTAssertFalse(saved)
        XCTAssertEqual(repo.state?.case.status, .identity)
        XCTAssertTrue(fake.requests.last(where: { $0.method == "PUT" })?.path.hasSuffix("/identity/\(id.uuidString.lowercased())") == true)
        XCTAssertLessThanOrEqual(fake.requests.last(where: { $0.method == "PUT" })?.body?.count ?? Int.max, 3_670_016)
    }
    func testStaleConsentRefreshesAndDoesNotAdvanceLocally() async throws {
        let fake = FlowTransport(), access = AccountAccess(), ticket = access.activate(UUID())
        fake.status = "consents"
        let repo = LaunchEnrollmentRepository(access: access, transport: fake)
        _ = await repo.refresh(ticket: ticket)
        let result = await repo.submitConsents([], ticket: ticket)
        XCTAssertFalse(result)
        XCTAssertEqual(repo.state?.case.status, .consents)
        XCTAssertEqual(fake.requests.filter { $0.path == "/enrollment" }.count, 2)
    }
    func testSignupFailureExplainsClosedWaitlistWithoutRevealingMembership() {
        XCTAssertTrue(AuthForm.message(.register).contains("closed waitlist"))
    }
    func testLaunchURLUsesAdditiveNamespaceAndRejectsEscapes() throws {
        XCTAssertEqual(try LaunchRequest(path: "/enrollment").url(baseURL: "https://example.invalid/api").absoluteString, "https://example.invalid/api/launch/enrollment")
        XCTAssertThrowsError(try LaunchRequest(path: "//evil.invalid").url(baseURL: "https://example.invalid/api"))
        XCTAssertThrowsError(try LaunchRequest(path: "/../users").url(baseURL: "https://example.invalid/api"))
    }
    func testServerStepAndCareAccessAreAuthoritative() throws {
        XCTAssertFalse(LaunchEnrollmentRoute.canOpenCare(caseStatus: .submitted, membershipAccess: .enrollment))
        XCTAssertFalse(LaunchEnrollmentRoute.canOpenCare(caseStatus: .approved, membershipAccess: .enrollment))
        XCTAssertTrue(LaunchEnrollmentRoute.canOpenCare(caseStatus: .approved, membershipAccess: .care))
        XCTAssertTrue(LaunchEnrollmentRoute.canOpenCare(caseStatus: .approved, membershipAccess: .readOnly))
    }
}
@MainActor private final class FlowTransport: LaunchTransport {
    var status = "identity"
    var requests: [LaunchRequest] = []
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data {
        requests.append(request)
        if request.method != "GET" { throw LaunchFailure.server(status: 409, code: "CONSENT_OUTDATED") }
        return Data(String(decoding: LaunchContractTests.enrollment, as: UTF8.self).replacingOccurrences(of: "\"status\":\"consents\"", with: "\"status\":\"\(status)\"").utf8)
    }
}
