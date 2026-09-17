import Foundation
import Testing

/// Pushed detail views (spec §6 tab bar, §8): no tab bar, no bottom spacer, no nested navigation stack.
struct PushedScreenTests {
    static let pushed = ["CompletionCalendarView.swift", "CheckInView.swift", "ProfileView.swift", "ReminderSettingsView.swift"]

    @Test func pushedScreensHideTheTabBarAndNestNoNavigationStack() throws {
        let files = try LetterpressSweepTests.sources(in: ["ClearAF/Views"])
        for name in Self.pushed {
            let file = try #require(files.first { $0.path.hasSuffix("/" + name) }, "\(name) not found")
            #expect(file.text.contains(".toolbar(.hidden, for: .tabBar)"), "\(name) must hide the tab bar")
            #expect(file.text.contains(".toolbar(.visible, for: .navigationBar)"), "\(name) must show its back button")
            #expect(!file.text.contains("NavigationStack"), "\(name) is pushed and must not own a NavigationStack")
            #expect(!file.text.contains("safeAreaInset(edge: .bottom"), "\(name) must not add a bottom spacer")
        }
    }

    @Test func todayPushesProfileInsteadOfPresentingASheet() throws {
        let files = try LetterpressSweepTests.sources(in: ["ClearAF/Views"])
        let today = try #require(files.first { $0.path.hasSuffix("/DashboardViewEnhanced.swift") })
        #expect(today.text.contains(".navigationDestination(isPresented: $showingProfile)"))
        #expect(!today.text.contains(".sheet(isPresented: $showingProfile)"))
    }

    @Test func reminderTogglesUseTheContrastSafeTint() throws {
        let files = try LetterpressSweepTests.sources(in: ["ClearAF/Views"])
        let reminders = try #require(files.first { $0.path.hasSuffix("/ReminderSettingsView.swift") })
        #expect(reminders.text.contains("Toggle("))
        #expect(reminders.text.contains(".tint(Letterpress.toggleOn)"))
    }
}
