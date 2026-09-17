import Foundation
import Testing
@testable import ClearAF

@MainActor struct CompareCopyTests {
    static let us = Locale(identifier: "en_US")
    static let utc = TimeZone(identifier: "UTC")!
    struct Item: Equatable { let name: String; let date: Date? }

    private func d(_ value: String) -> Date { CompareTimelineTests.date(value) }

    private func rev(_ slot: RoutineTimeOfDay, _ version: Int, active: Bool = true) -> CareRoutineRevision {
        CareRoutineRevision(id: UUID(), userId: UUID(), timeOfDay: slot, version: version, createdBy: UUID(),
                            createdAt: "2026-09-02T09:00:00.000Z", name: "Synthetic", isActive: active, steps: [])
    }

    @Test func pairKeepsTheLastTwoPicksAndShowsTheEarlierFirst() {
        let a = Item(name: "a", date: d("2026-09-15T07:12:00.000Z"))
        let b = Item(name: "b", date: d("2026-09-02T07:04:00.000Z"))
        let c = Item(name: "c", date: d("2026-09-10T07:00:00.000Z"))
        var pair = ComparePair<Item>()
        #expect(pair.ordered(date: \.date) == nil)
        pair.toggle(a)
        #expect(pair.role(of: a, date: \.date) == .selected)
        #expect(pair.ordered(date: \.date) == nil)
        pair.toggle(b)
        #expect(pair.ordered(date: \.date).map { [$0.earlier.name, $0.later.name] } == ["b", "a"])
        #expect(pair.role(of: b, date: \.date) == .earlier && pair.role(of: a, date: \.date) == .later)
        pair.toggle(c)
        #expect(pair.picks.map(\.name) == ["b", "c"], "a third pick drops the oldest pick")
        #expect(pair.role(of: a, date: \.date) == nil)
        pair.toggle(b)
        #expect(pair.picks.map(\.name) == ["c"], "tapping a picked photo removes it")
        let tie = Item(name: "tie", date: c.date)
        pair.toggle(tie)
        #expect(pair.ordered(date: \.date).map { [$0.earlier.name, $0.later.name] } == ["c", "tie"], "equal dates keep pick order")
        let undated = Item(name: "undated", date: nil)
        #expect(ComparePair([undated, a]).ordered(date: \.date).map { $0.earlier.name } == "undated")
        #expect(ComparePair([a, a, b]).picks.map(\.name) == ["a", "b"])
    }

    @Test func apartCountsCalendarDaysAndRoutineLineNamesActiveVersions() {
        #expect(CompareCopy.apart(d("2026-09-02T07:04:00.000Z"), d("2026-09-15T07:12:00.000Z"), timeZone: Self.utc) == "13 days apart")
        #expect(CompareCopy.apart(d("2026-09-14T23:30:00.000Z"), d("2026-09-15T00:10:00.000Z"), timeZone: Self.utc) == "1 day apart")
        #expect(CompareCopy.apart(d("2026-09-15T07:00:00.000Z"), d("2026-09-15T19:00:00.000Z"), timeZone: Self.utc) == "Same day")
        #expect(CompareCopy.apart(nil, d("2026-09-15T19:00:00.000Z"), timeZone: Self.utc) == nil)
        #expect(CompareCopy.routineLine([rev(.evening, 2), rev(.morning, 3)]) == "Morning v3 · Evening v2")
        #expect(CompareCopy.routineLine([rev(.evening, 2), rev(.morning, 5, active: false)]) == "Evening v2")
        #expect(CompareCopy.routineLine([]) == nil)
        #expect(CompareMode.allCases.map(\.title) == ["Side by side", "Overlay", "Flip"])
        #expect([CompareRole.earlier, .later, .selected].map(\.label) == ["Earlier", "Later", "Selected"])
    }

    @Test func accessibilityAndEmptyCopyIsPlainAndPromisesNothing() {
        #expect(CompareCopy.emptyTitle == "Two photos needed")
        #expect(CompareCopy.emptySentence(total: 0) == "Compare shows two of your photos next to each other. Take your first photo today.")
        #expect(CompareCopy.emptySentence(total: 1) == "You have one photo so far. Take another to compare the two.")
        #expect(CompareCopy.percent(0.504) == "50%")
        #expect(CompareCopy.overlayValue(0.504) == "Later photo at 50%")
        let sept15 = d("2026-09-15T07:12:00.000Z")
        #expect(CompareCopy.flipLabel(showingLater: true, date: sept15, locale: Self.us, timeZone: Self.utc) == "Showing the later photo, 15 Sep 2026")
        #expect(CompareCopy.flipLabel(showingLater: false, date: nil, locale: Self.us, timeZone: Self.utc) == "Showing the earlier photo")
        #expect(CompareCopy.paneLabel(role: .earlier, date: sept15, locale: Self.us, timeZone: Self.utc) == "Earlier photo, 15 Sep 2026")
        #expect(CompareCopy.thumbnailLabel(date: sept15, locale: Self.us, timeZone: Self.utc) == "Photo, 15 Sep 2026")
        #expect(CompareCopy.thumbnailLabel(date: nil) == "Undated photo")
        let lines = [CompareCopy.footnote, CompareCopy.pickTwo, CompareCopy.pickHelp, CompareCopy.modeDisabledReason, CompareCopy.loadingPhotos,
                     CompareCopy.loadingTimeline, CompareCopy.photosError, CompareCopy.photoUnreadable, CompareCopy.timelineError,
                     CompareCopy.timelineUnavailable, CompareCopy.tooFarApart, CompareCopy.undated, CompareCopy.nothingRecorded,
                     CompareCopy.emptyTitle, CompareCopy.emptySentence(total: 0), CompareCopy.emptySentence(total: 1), CompareCopy.flipHelp,
                     CompareCopy.flipHint, CompareCopy.openHint, CompareCopy.overlayLabel]
        for line in lines {
            #expect(!line.contains("!"), "\(line)")
            #expect(line.range(of: #"improv|better|worse|progress|score|streak|great|clearer|%"#, options: [.regularExpression, .caseInsensitive]) == nil, "\(line)")
        }
    }

    @Test func timelineRowsSummariseRecordedDaysThenListEventsInOrder() throws {
        let response = try JSONDecoder().decode(CompareTimelineResponse.self, from: CompareTimelineTests.json())
        let rows = CompareTimeline.rows(response, locale: Self.us, timeZone: Self.utc)
        #expect(rows.map(\.date) == ["2–15 SEP", "2 SEP", "14 SEP"])
        #expect(rows.map(\.text) == ["Morning routine recorded on 11 of 14 days", "Morning routine updated to v4", "Check-in sent"])
        #expect(rows[2].answers == [.init(prompt: "Pick one", answer: "Neutral second"),
                                    .init(prompt: "Anything else?", answer: "“Synthetic note about the chin”")])
        #expect(Set(rows.map(\.id)).count == rows.count)
    }

    @Test func recordedRevisionRangeAndTruncationCopy() {
        #expect(CompareTimeline.recordedText(.evening, count: 0, days: 14) == "No evening routine recorded in these 14 days")
        #expect(CompareTimeline.recordedText(.morning, count: 1, days: 1) == "Morning routine recorded that day")
        #expect(CompareTimeline.recordedText(.morning, count: 0, days: 1) == "No morning routine recorded that day")
        #expect(CompareTimeline.revisionText(rev(.evening, 1)) == "Evening routine assigned · v1")
        #expect(CompareTimeline.revisionText(rev(.morning, 4)) == "Morning routine updated to v4")
        #expect(CompareTimeline.revisionText(rev(.morning, 5, active: false)) == "Morning routine archived · v5")
        #expect(CompareTimeline.rangeStamp(fromDate: "2026-08-28", toDate: "2026-09-15", locale: Self.us) == "28 AUG – 15 SEP")
        #expect(CompareTimeline.rangeStamp(fromDate: "2025-12-28", toDate: "2026-01-03", locale: Self.us) == "28 DEC 2025 – 3 JAN 2026")
        #expect(CompareTimeline.rangeStamp(fromDate: "2026-09-15", toDate: "2026-09-15", locale: Self.us) == "15 SEP")
        #expect(CompareTimeline.moreCheckIns(shown: 50, total: 73) == "Showing the first 50 of 73 check-ins from this period.")
        #expect(CompareTimeline.moreCheckIns(shown: 2, total: 2) == nil)
    }
}
