import Foundation
import Testing
import UIKit
@testable import ClearAF

struct CompletionCalendarTests {
    static let us = Locale(identifier: "en_US")

    private func september(_ days: [CompletionCalendar.Day]) -> CompletionCalendar {
        CompletionCalendar(month: "2026-09", days: days)
    }

    private func routine(_ slot: RoutineTimeOfDay) -> CareRoutineRevision {
        CareRoutineRevision(id: UUID(), userId: UUID(), timeOfDay: slot, version: 4, createdBy: UUID(),
                            createdAt: "2026-09-02T09:00:00.000Z", name: "Synthetic Morning Routine", isActive: true,
                            steps: [CareRoutineStep(title: "Step", instructions: "")])
    }

    @Test func cellsAreBothOneNoneOrFutureFromRealCounts() {
        let calendar = september([
            CompletionCalendar.Day(localDate: "2026-09-01", morning: 1, evening: 1),
            CompletionCalendar.Day(localDate: "2026-09-02", morning: 0, evening: 2),
        ])
        let cells = CompletionCalendarCopy.cells(month: "2026-09", calendar: calendar, today: "2026-09-04")
        #expect(cells.count == 30)
        #expect(cells[0] == .recorded(.both))
        #expect(cells[1] == .recorded(.one))
        #expect(cells[2] == .recorded(.neither))
        #expect(cells[3] == .recorded(.neither))
        #expect(cells[4] == .future)
        #expect(cells[29] == .future)
    }

    @Test func tallyCountsElapsedDaysAndNeverGrades() {
        let tally = CompletionCalendarCopy.tally([.recorded(.both), .recorded(.one), .recorded(.neither), .recorded(.neither), .future])
        #expect(tally == CalendarTally(both: 1, one: 1, neither: 2))
        #expect(tally.recorded == 2 && tally.elapsed == 4)
        #expect(CompletionCalendarCopy.countLabel(tally) == "of 4 days")
        #expect(CompletionCalendarCopy.sentence(tally) == "Both routines recorded on 1 day, one routine on 1 day, none on 2 days.")
        #expect(CompletionCalendarCopy.sentence(CalendarTally(both: 0, one: 0, neither: 3)) == "No completions recorded this month.")
        #expect(!CompletionCalendarCopy.sentence(tally).contains("%"))
    }

    @Test func gridStartsOnTheLocaleFirstWeekday() {
        // 1 September 2026 is a Tuesday.
        #expect(CompletionCalendarCopy.leadingBlanks(month: "2026-09", firstWeekday: 1) == 2)
        #expect(CompletionCalendarCopy.leadingBlanks(month: "2026-09", firstWeekday: 2) == 1)
        #expect(CompletionCalendarCopy.weekdaySymbols(firstWeekday: 2, locale: Self.us) == ["M", "T", "W", "T", "F", "S", "S"])
        #expect(CompletionCalendarCopy.weekdaySymbols(firstWeekday: 1, locale: Self.us).first == "S")
    }

    @Test func selectionDefaultsToTodayOrTheLastRecordedDay() {
        let cells: [CalendarCell] = [.recorded(.both), .recorded(.neither), .recorded(.one), .recorded(.neither)]
            + Array(repeating: .recorded(.neither), count: 27)
        #expect(CompletionCalendarCopy.defaultSelection(month: "2026-09", cells: Array(cells.prefix(30)), today: "2026-09-17") == "2026-09-17")
        #expect(CompletionCalendarCopy.defaultSelection(month: "2026-08", cells: cells, today: "2026-09-17") == "2026-08-03")
        #expect(CompletionCalendarCopy.defaultSelection(month: "2026-08", cells: Array(repeating: .recorded(.neither), count: 31), today: "2026-09-17") == nil)
    }

    @Test func labelsAreWrittenOutAndSpeakTheState() {
        #expect(CompletionCalendarCopy.monthTitle("2026-09", locale: Self.us) == "September 2026")
        #expect(CompletionCalendarCopy.eyebrow("2026-09-15", locale: Self.us) == "15 Sep")
        #expect(CompletionCalendarCopy.dayLabel("2026-09-15", cell: .recorded(.one), isToday: true, locale: Self.us) == "Tue 15 Sep, one routine recorded, today")
        #expect(CompletionCalendarCopy.dayLabel("2026-09-17", cell: .future, isToday: false, locale: Self.us) == "Thu 17 Sep, upcoming")
    }

    @Test func eventsUseTheReportedTimeZoneAndNameMissingSlots() {
        let completion = CareRoutineCompletion(id: UUID(), userId: UUID(), revisionId: UUID(),
                                               completedAt: "2026-09-15T12:14:00.000Z", localDate: "2026-09-15",
                                               timeZone: "America/Chicago", receivedAt: "2026-09-15T12:15:00.000Z")
        #expect(CompletionCalendarCopy.eventTime(completion) == "07:14")
        #expect(CompletionCalendarCopy.eventTitle(routine(.morning)) == "Morning recorded")
        #expect(CompletionCalendarCopy.eventMeta(routine(.morning)) == "Synthetic Morning Routine · V4")
        #expect(CompletionCalendarCopy.missingSlots(recorded: [.morning], date: "2026-09-15", today: "2026-09-15") == ["Evening not recorded yet"])
        #expect(CompletionCalendarCopy.missingSlots(recorded: [], date: "2026-09-14", today: "2026-09-15") == ["Morning not recorded", "Evening not recorded"])
    }

    @Test func gridCellsClearThe44ptFloorOnA375ptWideDevice() {
        // iPhone SE (3rd gen) / mini-class width (spec §8's 44pt floor, pinned per §4.1, never derived).
        #expect(CompletionCalendarGrid.cellWidth(for: 375) >= Letterpress.minTouch)
        // Standard-width iPhones (390pt+) already clear the floor with the wider gutter/spacing.
        #expect(CompletionCalendarGrid.cellWidth(for: 390) >= Letterpress.minTouch)
    }

    @Test func cellNumbersMeetContrastOnWhatSitsBehindThemInBothAppearances() {
        let cases: [(CalendarCell, Bool)] = [(.recorded(.both), false), (.recorded(.one), false), (.recorded(.neither), false), (.future, false),
                                             (.recorded(.both), true), (.recorded(.one), true), (.recorded(.neither), true)]
        #expect(CalendarCellStyle.fill(.future, isToday: false) == .none)
        #expect(CalendarCellStyle.text(.future, isToday: false) == "lp.ink.future")
        #expect(CalendarCellStyle.fill(.recorded(.one), isToday: false) == .split(top: "lp.ink", bottom: "lp.sunk"))
        for style in [UIUserInterfaceStyle.light, .dark] {
            for (cell, isToday) in cases {
                let text = LetterpressTests.resolved(CalendarCellStyle.text(cell, isToday: isToday), style)
                let background = LetterpressTests.resolved(CalendarCellStyle.background(cell, isToday: isToday), style)
                #expect(LetterpressTests.contrast(text, background) >= 4.5, "\(cell) today=\(isToday) \(style.rawValue)")
                if CalendarCellStyle.text(cell, isToday: isToday) == "lp.ink.future" {
                    #expect(CalendarCellStyle.background(cell, isToday: isToday) != "lp.sunk")
                }
            }
        }
    }
}
