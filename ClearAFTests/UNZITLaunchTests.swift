import Testing
@testable import ClearAF

struct UNZITLaunchTests {
    @Test func calendarAndClinicianFormsAreHiddenForLaunch() {
        #expect(!LaunchFlags.adherenceCalendar)
        #expect(!LaunchFlags.clinicianForms)
    }

    #if DEBUG
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
