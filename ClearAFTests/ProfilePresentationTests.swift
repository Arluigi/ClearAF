import Foundation
import Testing
@testable import ClearAF

@MainActor struct ProfilePresentationTests {
    static let symbols = Calendar.current.weekdaySymbols

    @Test func reminderRowsSummariseScheduleAndTime() {
        var preferences = ReminderPreferences()
        #expect(ReminderCopy.rows(preferences, weekdaySymbols: Self.symbols).map(\.detail) == ["Off", "Off", "Off"])
        #expect(ReminderCopy.rows(preferences, weekdaySymbols: Self.symbols).allSatisfy { $0.time == nil })
        preferences.morning = ReminderTime(enabled: true, hour: 7, minute: 5)
        preferences.photo = ReminderTime(enabled: true, hour: 18, minute: 0)
        preferences.weekday = 1
        let rows = ReminderCopy.rows(preferences, weekdaySymbols: Self.symbols)
        #expect(rows.map(\.title) == ["Morning routine", "Evening routine", "Weekly photo"])
        #expect(rows[0] == ReminderSummaryRow(id: "morning", title: "Morning routine", detail: "Every day", time: "07:05"))
        #expect(rows[2].detail == "Sundays" && rows[2].time == "18:00")
    }

    @Test func reminderStatusIsASentenceWithoutBlame() {
        #expect(ReminderCopy.status(.enabled) == "Reminders are scheduled on this device. Times follow your device's time zone.")
        #expect(ReminderCopy.status(.failed) == "Couldn't update reminders. Check your settings and try again.")
        #expect(ReminderCopy.status(.disabled) == "Reminders are off.")
    }

    @Test func profileCopyUsesRealAccountData() {
        let utc = TimeZone(identifier: "UTC")!
        #expect(ProfileCopy.since("2026-07-30T10:00:00.000Z", locale: Locale(identifier: "en_US"), timeZone: utc) == "Patient since 30 Jul 2026")
        #expect(ProfileCopy.since(nil) == nil)
        #expect(ProfileCopy.version(["CFBundleShortVersionString": "1.0", "CFBundleVersion": "12"]) == "ClearAF 1.0 · build 12")
        #expect(ProfileCopy.version(nil) == nil)
        #expect(!ProfileCopy.nameChanged("  Sam Patient ", saved: "Sam Patient"))
        #expect(ProfileCopy.nameChanged("Sam", saved: "Sam Patient"))
    }

    private func conversation(_ name: String) -> AssignedConversation {
        AssignedConversation(patientId: UUID(), clinicianId: UUID(), patientName: nil, clinicianName: name, lastMessage: nil, unreadCount: 0)
    }

    @Test func careTeamComesFromTheAssignedConversation() async {
        let access = AccountAccess()
        _ = access.activate(UUID())
        #expect(await CareTeamLookup.load(access: access) { _ in self.conversation("Synthetic Clinician") } == .assigned("Synthetic Clinician"))
        #expect(await CareTeamLookup.load(access: access) { _ in nil } == .unassigned)
        #expect(await CareTeamLookup.load(access: access) { _ in throw URLError(.notConnectedToInternet) } == .failed)
        #expect(CareTeamLookup.title(.assigned("Synthetic Clinician")) == "Synthetic Clinician")
        #expect(CareTeamLookup.title(.unassigned) == "No clinician assigned yet")
    }

    @Test func careTeamDropsLateResultsAndKeepsAShownName() async {
        let access = AccountAccess()
        _ = access.activate(UUID())
        let result = await CareTeamLookup.load(access: access) { _ in
            access.invalidate()
            return self.conversation("Previous Account Clinician")
        }
        #expect(result == nil)
        #expect(CareTeamLookup.merge(.assigned("Synthetic Clinician"), .failed) == .assigned("Synthetic Clinician"))
        #expect(CareTeamLookup.merge(.loading, .failed) == .failed)
        #expect(CareTeamLookup.merge(.assigned("Synthetic Clinician"), .unassigned) == .unassigned)
    }
}
