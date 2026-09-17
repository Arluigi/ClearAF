import Testing
@testable import ClearAF

struct AppTabTests {
    @Test func fourDestinationsWithCaptureInTheCentre() {
        #expect(AppTab.allCases == [.today, .record, .capture, .plan, .notes])
        #expect(AppTab.allCases.map(\.title) == ["Today", "Record", "Capture", "Plan", "Notes"])
        #expect(AppTab.destinations == [.today, .record, .plan, .notes])
    }

    @Test func captureIsAnActionThatKeepsTheCurrentDestination() {
        for current in AppTab.destinations {
            let route = AppTab.route(.capture, from: current)
            #expect(route.selection == current)
            #expect(route.startsCapture)
        }
        let route = AppTab.route(.plan, from: .today)
        #expect(route.selection == .plan)
        #expect(!route.startsCapture)
    }
}
