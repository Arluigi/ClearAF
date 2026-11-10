import Foundation
import Testing
@testable import ClearAF

struct UNZITLaunchTests {
    @Test func calendarAndClinicianFormsAreHiddenForLaunch() {
        #expect(!LaunchFlags.adherenceCalendar)
        #expect(!LaunchFlags.clinicianForms)
        #expect(LaunchFlags.launchCheckIns)
    }

    #if DEBUG
    @Test func launchMockArgumentRequiresKnownCompleteStep() {
        #expect(LaunchMockRoute.requested(arguments: ["app"]) == nil)
        #expect(LaunchMockRoute.requested(arguments: ["app", "-UNZITLaunchMock"]) == nil)
        #expect(LaunchMockRoute.requested(arguments: ["app", "-UNZITLaunchMock", "unknown"]) == nil)
        for route in LaunchMockRoute.allCases {
            #expect(LaunchMockRoute.requested(arguments: ["app", "-UNZITLaunchMock", route.rawValue]) == route)
        }
    }
    @Test @MainActor func everyLaunchMockUsesDecodableCatalogAndEnrollmentWithoutBackend() async {
        for route in LaunchMockRoute.allCases {
            let session = LaunchMockSession(route: route)
            await session.load()
            #expect(session.loaded)
            #expect(session.enrollment.state != nil, "Missing mock case for \(route.rawValue)")
            #expect(session.enrollment.catalog?.questionnaireVersion == (route.isCaptureReview ? "2.2-pending-review" : "0.9-draft"))
            #expect(session.enrollment.catalog?.consents.count == 4)
            #expect(session.enrollment.error == nil)
        }
    }
    @Test func captureReviewGuidanceMatchesPendingReviewCatalog() throws {
        let source = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("backend/src/content/catalogs/2.2-pending-review.json")
        let catalog = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: source)) as? [String: Any])
        for field in ["identityGuidance", "photoGuidance"] {
            let expected = try JSONSerialization.data(withJSONObject: try #require(catalog[field]), options: .sortedKeys)
            let actual = try JSONSerialization.data(withJSONObject: try #require(CaptureReviewMockContent.guidance[field]), options: .sortedKeys)
            #expect(actual == expected, "Review fixture drifted from \(field)")
        }
    }
    @Test @MainActor func captureReviewImageUsesItsSyntheticAccount() async throws {
        let session = LaunchMockSession(route: .reviewFront)
        let loader = PhotoImageLoader(access: session.access)
        let bytes = CaptureReviewMockContent.image(label: "Review test")
        let image = await loader.image(for: "mock-review", maxPixelSize: 600, data: { bytes })
        #expect(image != nil)
        #expect(loader.cachedCount == 1)
    }
    @Test func paidReviewCopyPreservesTurnaroundAndNeverClaimsNoCharge() {
        #expect(LaunchCaseReceipt.copy(status: .submitted, refund: nil).contains("1 to 2 business days"))
        for status in [LaunchCase.Status.submitted, .rejected, .approved] {
            #expect(!LaunchCaseReceipt.copy(status: status, refund: .pending).contains("not been charged"))
        }
    }
    @Test func prototypeArgumentMustBePresentCompleteAndKnown() {
        #expect(UNZITPrototypeRoute.requested(arguments: ["app"]) == nil)
        #expect(UNZITPrototypeRoute.requested(arguments: ["app", "-UNZITPrototype"]) == nil)
        #expect(UNZITPrototypeRoute.requested(arguments: ["app", "-UNZITPrototype", "unknown"]) == nil)
        for route in UNZITPrototypeRoute.allCases {
            #expect(UNZITPrototypeRoute.requested(arguments: ["app", "-UNZITPrototype", route.rawValue]) == route)
        }
    }
    #endif
}
