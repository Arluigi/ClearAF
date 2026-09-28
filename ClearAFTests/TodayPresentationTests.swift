import Foundation
import Testing
@testable import ClearAF

struct TodayPresentationTests {
    static let utc = TimeZone(identifier: "UTC")!
    static let us = Locale(identifier: "en_US")

    private func routine(_ slot: RoutineTimeOfDay, active: Bool = true) -> CareRoutineRevision {
        CareRoutineRevision(id: UUID(), userId: UUID(), timeOfDay: slot, version: 1, createdBy: UUID(),
                            createdAt: "2026-09-02T09:00:00.000Z", name: "Synthetic", isActive: active,
                            steps: [CareRoutineStep(title: "Step", instructions: "")])
    }

    private func message(_ sender: String, unread: Bool, sentAt: String) -> AssignedMessage {
        let patient = UUID(), clinician = UUID()
        return AssignedMessage(id: UUID(), patientId: patient, clinicianId: clinician,
                               senderId: sender == "patient" ? patient : clinician, senderType: sender,
                               recipientId: sender == "patient" ? clinician : patient,
                               recipientType: sender == "patient" ? "dermatologist" : "patient",
                               content: "Synthetic note", sentAt: sentAt, unreadForMe: unread, reference: nil, origin: "native")
    }

    @Test func greetingFollowsTheHour() {
        #expect(TodayCopy.greeting(hour: 8) == "Good morning,")
        #expect(TodayCopy.greeting(hour: 13) == "Good afternoon,")
        #expect(TodayCopy.greeting(hour: 19) == "Good evening,")
        #expect(TodayCopy.greeting(hour: 23) == "Good night,")
    }

    @Test func initialsComeFromTheRealName() {
        #expect(TodayCopy.initials("Synthetic UI Patient") == "SU")
        #expect(TodayCopy.initials("aryan") == "A")
        #expect(TodayCopy.initials(nil) == "")
        #expect(TodayCopy.initials("   ") == "")
    }

    @Test func routineSlotFollowsTheTimeOfDayAndFallsBackToWhatIsAssigned() {
        let morning = routine(.morning), evening = routine(.evening)
        #expect(TodayCopy.slot(hour: 9, morning: morning, evening: evening) == .morning)
        #expect(TodayCopy.slot(hour: 14, morning: morning, evening: evening) == .evening)
        #expect(TodayCopy.slot(hour: 20, morning: morning, evening: nil) == .morning)
        #expect(TodayCopy.slot(hour: 9, morning: routine(.morning, active: false), evening: evening) == .evening)
        #expect(TodayCopy.slot(hour: 9, morning: nil, evening: nil) == nil)
    }

    @Test func unreadNoteIsTheLatestUnreadClinicianMessage() {
        let older = message("dermatologist", unread: true, sentAt: "2026-09-14T16:12:00.000Z")
        let newer = message("dermatologist", unread: true, sentAt: "2026-09-15T08:03:00.000Z")
        let read = message("dermatologist", unread: false, sentAt: "2026-09-15T09:00:00.000Z")
        let mine = message("patient", unread: false, sentAt: "2026-09-15T10:00:00.000Z")
        #expect(TodayCopy.latestUnread([older, newer, read, mine])?.id == newer.id)
        #expect(TodayCopy.latestUnread([read, mine]) == nil)
    }

    @Test func todaySlotAppearsUntilTodaysPhotoExists() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Self.utc
        let iso = ISO8601DateFormatter()
        let now = iso.date(from: "2026-09-15T12:00:00Z")!
        #expect(TodayCopy.needsTodaySlot(latest: nil, now: now, calendar: calendar))
        #expect(TodayCopy.needsTodaySlot(latest: iso.date(from: "2026-09-14T23:00:00Z")!, now: now, calendar: calendar))
        #expect(!TodayCopy.needsTodaySlot(latest: iso.date(from: "2026-09-15T07:12:00Z")!, now: now, calendar: calendar))
    }

    @Test func careStatusBylineUsesTheClinicianNameAndAWrittenDate() {
        let decision = CareDecision(id: UUID(), patientId: UUID(), clinicianId: UUID(), clinicianName: "Synthetic Clinician",
                                    decision: "needs_in_person", patientMessage: nil, photoId: nil, refundStatus: "not_applicable",
                                    refundUpdatedAt: nil, createdAt: "2026-09-02T09:00:00.000Z")
        #expect(CareStatusCopy.byline(decision, locale: Self.us, timeZone: Self.utc) == "From Synthetic Clinician on 2 Sep 2026")
    }

    @Test func urgentReportsAreDescribedInWords() {
        let report = UrgentReport(id: UUID(), patientId: UUID(), category: "other", description: "Synthetic", status: "acknowledged",
                                  createdAt: "2026-09-14T12:00:00.000Z", acknowledgedAt: nil, resolvedAt: nil, resolutionNote: nil)
        #expect(UrgentReportCopy.meta(report, locale: Self.us, timeZone: Self.utc) == "14 Sep, 12:00 pm · Seen by your care team")
        #expect(UrgentReportCopy.disabledReason == "Choose what's happening and describe it to send.")
    }

    /// Design audit B8: a photo-rail tile reads as one element: what it is, when, where it stands.
    @Test func photoRailTilesReadAsOneElement() throws {
        let date = ISO8601DateFormatter().date(from: "2026-09-03T10:00:00Z")!
        #expect(TodayCopy.photoLabel(date, state: .shared, locale: Self.us, timeZone: Self.utc) == "Photo, 3 Sep, Shared")
        #expect(TodayCopy.photoLabel(nil, state: .waitingToShare) == "Photo, Waiting to share")
        let today = try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views/DashboardViewEnhanced.swift"), encoding: .utf8)
        #expect(today.contains(".accessibilityElement(children: .combine)"))
        #expect(!today.contains("Latest progress photo"))
    }

    /// Design audit B8: Today refreshes by pull, keeps its greeting current, scales its avatar and names routine errors.
    @Test func todayRefreshesScalesAndNamesErrors() throws {
        let views = LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views")
        let today = try String(contentsOf: views.appendingPathComponent("DashboardViewEnhanced.swift"), encoding: .utf8)
        #expect(today.contains(".refreshable { await refresh() }"))
        #expect(today.contains("TimelineView(.everyMinute)"))
        #expect(today.contains("_size = ScaledMetric(wrappedValue: size, relativeTo: .body)"))
        #expect(today.contains("InitialsAvatar(name: name, size: 30, textSize: 11, iconSize: 13)"))
        #expect(today.contains(".dynamicTypeSize(...DynamicTypeSize.accessibility2)"))
        #expect(today.contains("if let error = actionError ?? repository.lastError"))
        #expect(!today.contains("Routines need attention."))
        #expect(today.contains("Button(\"Open plan\") { selectedTab = .plan }.buttonStyle(.letterpress(.underline))"))
        #expect(!today.contains("frame(width: 30, height: 30)"))
        let profile = try String(contentsOf: views.appendingPathComponent("ProfileView.swift"), encoding: .utf8)
        #expect(profile.contains("InitialsAvatar(name: api.currentUser?.name, size: 56, textSize: 17, iconSize: 17)"))
        #expect(profile.contains(".dynamicTypeSize(...DynamicTypeSize.accessibility2)"))
        #expect(!profile.contains("frame(width: 56, height: 56)"))
        let eyebrow = try String(contentsOf: views.appendingPathComponent("LetterpressText.swift"), encoding: .utf8)
        #expect(eyebrow.contains("@ScaledMetric(relativeTo: .caption2) private var tracking: CGFloat = LetterpressEyebrow.tracking"))
        #expect(eyebrow.contains(".tracking(tracking)"))
    }

    /// Design audit B8: the loading and account-error screens are Letterpress, not system defaults.
    @Test func accountLoadingAndErrorScreensAreLetterpress() throws {
        let content = try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/ContentView.swift"), encoding: .utf8)
        #expect(!content.contains(".font(.title2)"))
        #expect(content.contains("Text(\"Unable to open your account\")\n                    .font(Letterpress.display(28, relativeTo: .title))"))
        #expect(content.contains("Button(\"Try again\", action: retry)\n                    .buttonStyle(.letterpress(.filled, fullWidth: true))"))
        #expect(content.contains("Button(\"Sign out\", action: signOut)\n                    .buttonStyle(.letterpress(.underline))"))
        #expect(content.components(separatedBy: ".background(Letterpress.canvas.ignoresSafeArea())").count - 1 >= 2)
    }
}
