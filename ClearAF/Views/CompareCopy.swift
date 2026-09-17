import Foundation

/// Compare modes (spec §6 iOS #6), switched with the native segmented control.
enum CompareMode: CaseIterable, Hashable {
    case sideBySide, overlay, flip

    var title: String {
        switch self {
        case .sideBySide: "Side by side"
        case .overlay: "Overlay"
        case .flip: "Flip"
        }
    }
}

/// A photo's place in the pair, in words (selection never relies on the outline alone).
enum CompareRole: Equatable {
    case earlier, later, selected

    var label: String {
        switch self {
        case .earlier: "Earlier"
        case .later: "Later"
        case .selected: "Selected"
        }
    }

    var accessibilityValue: String {
        switch self {
        case .earlier: "Earlier photo in the pair"
        case .later: "Later photo in the pair"
        case .selected: "Selected. Pick one more photo."
        }
    }
}

/// The two photos being compared, in tap order. A third pick drops the oldest; tapping a pick removes it.
/// Display order is always by capture date, never by which looks different (spec §7).
struct ComparePair<Item: Equatable>: Equatable {
    private(set) var picks: [Item] = []

    init(_ picks: [Item] = []) {
        for item in picks where !self.picks.contains(item) { self.picks.append(item) }
        self.picks = Array(self.picks.suffix(2))
    }

    mutating func toggle(_ item: Item) {
        if let index = picks.firstIndex(of: item) {
            picks.remove(at: index)
        } else {
            picks.append(item)
            if picks.count > 2 { picks.removeFirst() }
        }
    }

    /// Earlier then later by capture date; an undated photo counts as earliest; equal dates keep pick order.
    func ordered(date: (Item) -> Date?) -> (earlier: Item, later: Item)? {
        guard picks.count == 2 else { return nil }
        let first = picks[0], second = picks[1]
        return (date(second) ?? .distantPast) < (date(first) ?? .distantPast) ? (second, first) : (first, second)
    }

    func role(of item: Item, date: (Item) -> Date?) -> CompareRole? {
        guard picks.contains(item) else { return nil }
        guard let pair = ordered(date: date) else { return .selected }
        return pair.earlier == item ? .earlier : .later
    }
}

enum CompareCopy {
    static let footnote = "Lighting and capture conditions may differ. No filtering is applied to either photograph."
    static let pickEyebrow = "Pick the pair"
    static let changedEyebrow = "What changed in between"
    static let pickTwo = "Pick two photos from the strip below to compare them."
    static let pickHelp = "Tap photos to choose the pair. The earlier photo is always shown first."
    static let modeDisabledReason = "Pick two photos to choose how to compare them."
    static let loadingPhotos = "Loading your photos"
    static let loadingTimeline = "Loading what changed in between"
    static let photosError = "Photos could not be loaded. Please try again."
    static let photoUnreadable = "This photo couldn't be opened on this device."
    static let timelineError = "Couldn't load what changed in between. Your photos are still here."
    static let timelineUnavailable = "What changed in between isn't available from the server yet. Your photos can still be compared."
    static let tooFarApart = "These photos are more than three years apart. Pick a closer pair to see what changed in between."
    static let undated = "One of these photos has no capture date, so what changed in between can't be shown."
    static let nothingRecorded = "Nothing was recorded between these two photos."
    static let undatedStamp = "Undated"
    static let emptyTitle = "Two photos needed"
    static let emptyAction = "Take a photo"
    static let overlaySlider = "Later photo opacity"
    static let overlayLabel = "Earlier and later photos, overlaid"
    static let flipHelp = "Tap or swipe the photo to switch between the two."
    static let flipHint = "Double-tap to show the other photo."
    static let openHint = "Opens the full, uncropped photo."
    static let openEarlier = "Open earlier photo"
    static let openLater = "Open later photo"
    static let openShown = "Open this photo"

    static func emptySentence(total: Int) -> String {
        total == 1
            ? "You have one photo so far. Take another to compare the two."
            : "Compare shows two of your photos next to each other. Take your first photo today."
    }

    /// "13 days apart", counted in local calendar days.
    static func apart(_ earlier: Date?, _ later: Date?, timeZone: TimeZone = .current) -> String? {
        guard let earlier, let later else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let days = abs(calendar.dateComponents([.day], from: calendar.startOfDay(for: earlier), to: calendar.startOfDay(for: later)).day ?? 0)
        switch days {
        case 0: return "Same day"
        case 1: return "1 day apart"
        default: return "\(days) days apart"
        }
    }

    /// Active routine versions in force when a photo was taken: "Morning v3 · Evening v2".
    static func routineLine(_ revisions: [CareRoutineRevision]) -> String? {
        let parts = RoutineTimeOfDay.allCases.compactMap { slot in
            revisions.first { $0.timeOfDay == slot && $0.isActive }.map { "\(slot.title) v\($0.version)" }
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    static func percent(_ opacity: Double) -> String { "\(Int((opacity * 100).rounded()))%" }

    static func overlayValue(_ opacity: Double) -> String { "Later photo at \(percent(opacity))" }

    static func flipLabel(showingLater: Bool, date: Date?, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let base = "Showing the \(showingLater ? "later" : "earlier") photo"
        return date.map { "\(base), \(LetterpressFormat.dayMonthYear($0, locale: locale, timeZone: timeZone))" } ?? base
    }

    static func paneLabel(role: CompareRole, date: Date?, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let base = "\(role.label) photo"
        return date.map { "\(base), \(LetterpressFormat.dayMonthYear($0, locale: locale, timeZone: timeZone))" } ?? base
    }

    static func thumbnailLabel(date: Date?, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        date.map { "Photo, \(LetterpressFormat.dayMonthYear($0, locale: locale, timeZone: timeZone))" } ?? "Undated photo"
    }
}

struct CompareTimelineRow: Equatable, Identifiable {
    struct Answer: Equatable {
        let prompt: String
        let answer: String
    }

    let id: String
    let date: String
    let text: String
    var answers: [Answer] = []
}

/// "What changed in between": recorded days per slot, then routine versions and check-ins in time order.
/// Answers are shown as given; nothing is averaged, scored or read as a trend.
enum CompareTimeline {
    static func rows(_ response: CompareTimelineResponse, locale: Locale = .current, timeZone: TimeZone = .current) -> [CompareTimelineRow] {
        var rows: [CompareTimelineRow] = []
        let slots = Set((response.routinesAtFrom + response.revisions + response.routinesAtTo).map(\.timeOfDay))
        let range = rangeStamp(fromDate: response.fromDate, toDate: response.toDate, locale: locale)
        for slot in RoutineTimeOfDay.allCases where slots.contains(slot) {
            let count = slot == .morning ? response.completions.morning : response.completions.evening
            rows.append(CompareTimelineRow(id: "recorded-\(slot.rawValue)", date: range, text: recordedText(slot, count: count, days: response.days)))
        }
        var events: [(at: Date, row: CompareTimelineRow)] = []
        for revision in response.revisions {
            guard let at = RoutineDates.instant(revision.createdAt) else { continue }
            events.append((at, CompareTimelineRow(id: "revision-\(revision.id.uuidString)",
                                                  date: LetterpressFormat.stamp(at, locale: locale, timeZone: timeZone),
                                                  text: revisionText(revision))))
        }
        for checkIn in response.responses {
            guard let at = RoutineDates.instant(checkIn.submittedAt) else { continue }
            events.append((at, CompareTimelineRow(id: "check-in-\(checkIn.id.uuidString)",
                                                  date: LetterpressFormat.stamp(at, locale: locale, timeZone: timeZone),
                                                  text: "Check-in sent", answers: answers(checkIn))))
        }
        rows += events.enumerated()
            .sorted { ($0.element.at, $0.offset) < ($1.element.at, $1.offset) }
            .map { $0.element.row }
        if let more = moreCheckIns(shown: response.responses.count, total: response.responsesTotal) {
            rows.append(CompareTimelineRow(id: "more-check-ins", date: "", text: more))
        }
        return rows
    }

    /// "2–15 SEP", "28 AUG – 15 SEP", "28 DEC 2025 – 3 JAN 2026", "15 SEP". Inputs are server local dates (YYYY-MM-DD).
    static func rangeStamp(fromDate: String, toDate: String, locale: Locale = .current) -> String {
        let utc = TimeZone(identifier: "UTC")!
        let parser = DateFormatter()
        parser.calendar = Calendar(identifier: .gregorian)
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = utc
        parser.dateFormat = "yyyy-MM-dd"
        guard let from = parser.date(from: fromDate), let to = parser.date(from: toDate) else { return "" }
        let stamp = { (date: Date) in LetterpressFormat.stamp(date, locale: locale, timeZone: utc) }
        if fromDate == toDate { return stamp(from) }
        if fromDate.prefix(7) == toDate.prefix(7) { return "\(Int(fromDate.suffix(2)) ?? 0)–\(stamp(to))" }
        if fromDate.prefix(4) == toDate.prefix(4) { return "\(stamp(from)) – \(stamp(to))" }
        let withYear = { (date: Date) in LetterpressFormat.dayMonthYear(date, locale: locale, timeZone: utc).uppercased(with: locale) }
        return "\(withYear(from)) – \(withYear(to))"
    }

    static func recordedText(_ slot: RoutineTimeOfDay, count: Int, days: Int) -> String {
        let name = "\(slot.rawValue) routine"
        if days == 1 { return count > 0 ? "\(slot.title) routine recorded that day" : "No \(name) recorded that day" }
        return count == 0 ? "No \(name) recorded in these \(days) days" : "\(slot.title) routine recorded on \(count) of \(days) days"
    }

    static func revisionText(_ revision: CareRoutineRevision) -> String {
        let name = "\(revision.timeOfDay.title) routine"
        if !revision.isActive { return "\(name) archived · v\(revision.version)" }
        return revision.version == 1 ? "\(name) assigned · v1" : "\(name) updated to v\(revision.version)"
    }

    static func answers(_ response: CheckInResponse) -> [CompareTimelineRow.Answer] {
        response.form.questions.compactMap { question in
            guard let given = response.answers.first(where: { $0.questionId == question.id }) else { return nil }
            switch question.type {
            case .choice:
                guard let label = question.options.first(where: { $0.id == given.optionId })?.label else { return nil }
                return CompareTimelineRow.Answer(prompt: question.prompt, answer: label)
            case .text:
                guard let text = given.text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
                return CompareTimelineRow.Answer(prompt: question.prompt, answer: "“\(text)”")
            }
        }
    }

    static func moreCheckIns(shown: Int, total: Int) -> String? {
        total > shown ? "Showing the first \(shown) of \(total) check-ins from this period." : nil
    }
}
