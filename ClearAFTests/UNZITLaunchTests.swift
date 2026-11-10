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
            #expect(session.enrollment.catalog?.questionnaireVersion == "0.9-draft")
            #expect(session.enrollment.catalog?.consents.count == 4)
            #expect(session.enrollment.error == nil)
        }
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
