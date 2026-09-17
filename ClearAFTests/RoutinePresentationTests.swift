import Foundation
import Testing
@testable import ClearAF

struct RoutinePresentationTests {
    static let utc = TimeZone(identifier: "UTC")!
    static let us = Locale(identifier: "en_US")

    private func routine(version: Int = 4, steps: Int = 3, slot: RoutineTimeOfDay = .morning) -> CareRoutineRevision {
        CareRoutineRevision(id: UUID(), userId: UUID(), timeOfDay: slot, version: version, createdBy: UUID(),
                            createdAt: "2026-09-02T09:00:00.000Z", name: "Synthetic Morning Routine", isActive: true,
                            steps: (0..<steps).map { CareRoutineStep(title: "Step \($0 + 1)", instructions: "") })
    }

    @Test func recordCopyNamesTheSlotAndEachSavedState() {
        #expect(RoutineRecordCopy.button(.morning, status: .unrecorded) == "Record this morning")
        #expect(RoutineRecordCopy.button(.evening, status: .unrecorded) == "Record this evening")
        #expect(RoutineRecordCopy.button(.morning, status: .pending) == "Saved on this device")
        #expect(RoutineRecordCopy.button(.morning, status: .recorded) == "Recorded")
        #expect(RoutineRecordCopy.status(.unrecorded, completedAt: nil, timeZone: nil) == "Not recorded today")
        #expect(RoutineRecordCopy.status(.pending, completedAt: nil, timeZone: nil) == "Saved on this device. Waiting to upload.")
        #expect(RoutineRecordCopy.status(.recorded, completedAt: nil, timeZone: nil) == "Recorded today. Comes back tomorrow.")
    }

    @Test func recordedTimeUsesTheCompletionsOwnTimeZone() {
        let text = RoutineRecordCopy.status(.recorded, completedAt: "2026-09-15T11:14:00.000Z", timeZone: "America/New_York", locale: Self.us)
        #expect(text == "Recorded at 7:14 am. Comes back tomorrow.")
    }

    @Test func metadataUnderTheActionIsInWords() {
        #expect(RoutineRecordCopy.assignment(routine(), locale: Self.us, timeZone: Self.utc) == "Assigned on 2 Sep · 3 steps")
        #expect(RoutineRecordCopy.assignment(routine(steps: 1), locale: Self.us, timeZone: Self.utc) == "Assigned on 2 Sep · 1 step")
        #expect(RoutineRecordCopy.versionNote(routine(), localDate: "2026-09-15", pendingCount: 0, locale: Self.us)
                == "Records against v4 for Tue 15 Sep, in your time zone.")
        #expect(RoutineRecordCopy.versionNote(routine(), localDate: "2026-09-15", pendingCount: 1, locale: Self.us)
                == "Records against v4 for Tue 15 Sep, in your time zone. One completion is still waiting to upload.")
        #expect(RoutineRecordCopy.versionNote(routine(), localDate: "2026-09-15", pendingCount: 2, locale: Self.us)
                == "Records against v4 for Tue 15 Sep, in your time zone. 2 completions are still waiting to upload.")
    }

    @Test func lastCheckedShowsTheDayOnlyWhenItIsNotToday() {
        let iso = ISO8601DateFormatter()
        let checked = iso.date(from: "2026-09-15T08:40:00Z")!
        #expect(RoutineRecordCopy.lastChecked(checked, now: iso.date(from: "2026-09-15T12:00:00Z")!, locale: Self.us, timeZone: Self.utc) == "Last checked 8:40 am")
        #expect(RoutineRecordCopy.lastChecked(checked, now: iso.date(from: "2026-09-16T09:00:00Z")!, locale: Self.us, timeZone: Self.utc) == "Last checked 15 Sep, 8:40 am")
    }

    @Test func todaysEventPrefersTheServerRecordOverThePendingOne() {
        let revision = UUID(), user = UUID()
        let server = CareRoutineCompletion(id: UUID(), userId: user, revisionId: revision, completedAt: "2026-09-15T07:14:00.000Z",
                                           localDate: "2026-09-15", timeZone: "UTC", receivedAt: "2026-09-15T07:15:00.000Z")
        let queued = PendingRoutineCompletion(id: UUID(), userId: user, revisionId: revision, completedAt: "2026-09-15T07:20:00.000Z",
                                              localDate: "2026-09-15", timeZone: "Europe/London")
        let both = RoutineRecordCopy.todaysEvent(for: revision, completions: [server], pending: [queued], localDate: "2026-09-15")
        #expect(both?.completedAt == "2026-09-15T07:14:00.000Z")
        let pendingOnly = RoutineRecordCopy.todaysEvent(for: revision, completions: [], pending: [queued], localDate: "2026-09-15")
        #expect(pendingOnly?.timeZone == "Europe/London")
        #expect(RoutineRecordCopy.todaysEvent(for: revision, completions: [server], pending: [], localDate: "2026-09-16") == nil)
    }

    @Test func windowIsTheLast14LocalDaysEndingToday() {
        let now = ISO8601DateFormatter().date(from: "2026-09-03T02:00:00Z")!
        let dates = AdherenceWindow.dates(endingOn: now, timeZone: TimeZone(identifier: "America/Los_Angeles")!)
        #expect(dates.count == 14)
        #expect(dates.first == "2026-08-20")
        #expect(dates.last == "2026-09-02")
        #expect(AdherenceWindow.months(for: dates) == ["2026-08", "2026-09"])
    }

    @Test func threeStatesComeFromRealCompletionCounts() {
        let calendar = CompletionCalendar(month: "2026-09", days: [
            CompletionCalendar.Day(localDate: "2026-09-01", morning: 1, evening: 1),
            CompletionCalendar.Day(localDate: "2026-09-02", morning: 0, evening: 2),
        ])
        let window = AdherenceWindow.build(dates: ["2026-09-01", "2026-09-02", "2026-09-03"], calendars: [calendar])
        #expect(window.states == [.both, .one, .neither])
        #expect(window.recordedDays == 2)
        #expect(AdherenceBars.fraction(.both) == 1)
        #expect(AdherenceBars.fraction(.one) == 0.7)
        #expect(AdherenceBars.fraction(.neither) == 0.4)
    }

    @Test func summaryIsACountNeverAPercentage() {
        let window = AdherenceWindow(dates: Array(repeating: "2026-09-01", count: 14),
                                     states: Array(repeating: .both, count: 11) + Array(repeating: .neither, count: 3))
        #expect(window.summary == "11 of the last 14 days")
        #expect(!window.summary.contains("%"))
    }

    @Test func ticksResetWhenTheLocalDateChanges() {
        var book = RoutineTickBook()
        let revision = UUID()
        book.setTicked([0, 1], revisionID: revision, localDate: "2026-09-15")
        #expect(book.ticked(revisionID: revision, localDate: "2026-09-15") == [0, 1])
        // Midnight rolls the local date forward; yesterday's ticks must not carry over onto the same
        // still-active revision (spec §4.4).
        #expect(book.ticked(revisionID: revision, localDate: "2026-09-16") == [])
        // Ticking today does not disturb what was recorded for yesterday.
        book.setTicked([2], revisionID: revision, localDate: "2026-09-16")
        #expect(book.ticked(revisionID: revision, localDate: "2026-09-15") == [0, 1])
        #expect(book.ticked(revisionID: revision, localDate: "2026-09-16") == [2])
    }
}
