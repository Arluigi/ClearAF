import Foundation
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

    /// The photo-save error sits in each tab's bottom inset, above the tab bar, and is announced once from the root.
    @Test func photoErrorBannerSitsAboveTheTabBarAndCanBeDismissed() throws {
        let text = try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/ContentView.swift"), encoding: .utf8)
        #expect(!text.contains(".overlay(alignment: .bottom) { PhotoPersistenceErrorView"))
        #expect(text.contains(".safeAreaInset(edge: .bottom"))
        #expect(text.components(separatedBy: ".photoErrorInset()").count - 1 == 5) // four destinations + onboarding
        #expect(text.contains("repository.lastError = nil"))
        #expect(text.contains("reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity)"))
        #expect(text.components(separatedBy: "AccessibilityNotification.Announcement(").count - 1 == 1)
        #expect(!text.contains(".font(.callout)"))
    }
}
