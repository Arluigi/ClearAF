import SwiftUI
import UIKit

/// A day in the completion calendar (spec §4.6): recorded state for today and earlier, future after today.
enum CalendarCell: Equatable {
    case recorded(AdherenceDayState)
    case future
}

struct CalendarTally: Equatable {
    let both: Int
    let one: Int
    let neither: Int
    var recorded: Int { both + one }
    var elapsed: Int { both + one + neither }
}

/// Copy and state for the calendar. Counts only; never a percentage, grade or target (spec §4.6, §7).
enum CompletionCalendarCopy {
    static let footnote = "Shows completions that reached your care team. Anything still waiting to upload is listed on Plan."
    private static let utc = TimeZone(identifier: "UTC")!

    /// Server per-day counts mapped exactly as the 14-day strip maps them; days after today are future.
    static func cells(month: String, calendar: CompletionCalendar, today: String) -> [CalendarCell] {
        let dates = SupportDates.days(month)
        let states = AdherenceWindow.build(dates: dates, calendars: [calendar]).states
        return zip(dates, states).map { date, state in date > today ? .future : .recorded(state) }
    }

    static func tally(_ cells: [CalendarCell]) -> CalendarTally {
        var both = 0, one = 0, neither = 0
        for cell in cells {
            switch cell {
            case .recorded(.both): both += 1
            case .recorded(.one): one += 1
            case .recorded(.neither): neither += 1
            case .future: break
            }
        }
        return CalendarTally(both: both, one: one, neither: neither)
    }

    /// Set under the mono count and uppercased by the view: "OF 30 DAYS".
    static func countLabel(_ tally: CalendarTally) -> String { "of \(tally.elapsed) \(tally.elapsed == 1 ? "day" : "days")" }

    static func sentence(_ tally: CalendarTally) -> String {
        guard tally.recorded > 0 else { return "No completions recorded this month." }
        return "Both routines recorded on \(days(tally.both)), one routine on \(days(tally.one)), none on \(days(tally.neither))."
    }

    private static func days(_ count: Int) -> String { count == 1 ? "1 day" : "\(count) days" }

    static func leadingBlanks(month: String, firstWeekday: Int) -> Int {
        guard let first = date("\(month)-01") else { return 0 }
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = utc
        return (gregorian.component(.weekday, from: first) - firstWeekday + 7) % 7
    }

    static func weekdaySymbols(firstWeekday: Int, locale: Locale) -> [String] {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.locale = locale
        let symbols = gregorian.veryShortStandaloneWeekdaySymbols
        return (0..<7).map { symbols[(firstWeekday - 1 + $0) % 7] }
    }

    static func defaultSelection(month: String, cells: [CalendarCell], today: String) -> String? {
        let dates = SupportDates.days(month)
        if dates.contains(today) { return today }
        return Array(zip(dates, cells)).last(where: { $0.1 == .recorded(.both) || $0.1 == .recorded(.one) })?.0
    }

    static func monthTitle(_ month: String, locale: Locale = .current) -> String {
        date("\(month)-01").map { LetterpressFormat.monthYear($0, locale: locale, timeZone: utc) } ?? month
    }

    static func eyebrow(_ localDate: String, locale: Locale = .current) -> String {
        date(localDate).map { LetterpressFormat.dayMonth($0, locale: locale, timeZone: utc) } ?? localDate
    }

    static func stateWords(_ cell: CalendarCell) -> String {
        switch cell {
        case .recorded(.both): "both routines recorded"
        case .recorded(.one): "one routine recorded"
        case .recorded(.neither): "no completion recorded"
        case .future: "upcoming"
        }
    }

    static func dayLabel(_ localDate: String, cell: CalendarCell, isToday: Bool, locale: Locale = .current) -> String {
        let day = date(localDate).map { LetterpressFormat.weekdayDayMonth($0, locale: locale, timeZone: utc) } ?? localDate
        return "\(day), \(stateWords(cell))\(isToday ? ", today" : "")"
    }

    /// 24-hour time in the zone the patient reported with the completion, so it agrees with its local date.
    static func eventTime(_ completion: CareRoutineCompletion) -> String {
        guard let instant = RoutineDates.instant(completion.completedAt) else { return "—" }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: completion.timeZone) ?? .current
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: instant)
    }

    static func eventTitle(_ routine: CareRoutineRevision) -> String { "\(routine.timeOfDay.title) recorded" }

    static func eventMeta(_ routine: CareRoutineRevision) -> String { "\(routine.name) · V\(routine.version)" }

    static func missingSlots(recorded: [RoutineTimeOfDay], date: String, today: String) -> [String] {
        RoutineTimeOfDay.allCases.filter { !recorded.contains($0) }
            .map { "\($0.title) not recorded\(date == today ? " yet" : "")" }
    }

    /// "yyyy-MM-dd" is already the patient's calendar day, so it is parsed and formatted in UTC to avoid shifting it.
    static func date(_ localDate: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = utc
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter.date(from: localDate)
    }
}

/// Cell treatments by token name, so the contrast test resolves exactly what the view draws.
enum CalendarCellStyle {
    enum Fill: Equatable {
        case none
        case solid(String)
        case split(top: String, bottom: String)
    }

    static let todayOutline: CGFloat = 1.5
    static let todayInset: CGFloat = 3

    static func fill(_ cell: CalendarCell, isToday: Bool) -> Fill {
        switch cell {
        case .future: .none
        case .recorded(.both): .solid("lp.ink")
        case .recorded(.one): .split(top: "lp.ink", bottom: "lp.sunk")
        case .recorded(.neither): isToday ? .none : .solid("lp.sunk")
        }
    }

    static func text(_ cell: CalendarCell, isToday: Bool) -> String {
        switch cell {
        case .future: "lp.ink.future"
        case .recorded(.both): "lp.canvas"
        case .recorded(.one): "lp.ink"
        case .recorded(.neither): isToday ? "lp.ink" : "lp.ink.tertiary"
        }
    }

    /// The colour directly behind the day number (split cells put the number in the bottom half).
    static func background(_ cell: CalendarCell, isToday: Bool) -> String {
        switch fill(cell, isToday: isToday) {
        case .none: "lp.canvas"
        case .solid(let name): name
        case .split(_, let bottom): bottom
        }
    }
}

/// Grid metrics for the calendar's 7-column week (spec §8: 44pt floor, pinned per §4.1, never derived from padding).
/// On narrow screens (iPhone SE/mini-class, 375pt) the standard 22pt gutter and 6pt column spacing squeeze cells to
/// ~42pt; tighten both there so seven columns clear the floor without clipping or horizontal scrolling.
enum CompletionCalendarGrid {
    static let columns = 7
    private static let narrowScreenWidth: CGFloat = 380

    static func horizontalPadding(for screenWidth: CGFloat) -> CGFloat {
        screenWidth <= narrowScreenWidth ? Letterpress.Space.s10 : Letterpress.Space.s22
    }

    static func columnSpacing(for screenWidth: CGFloat) -> CGFloat {
        screenWidth <= narrowScreenWidth ? Letterpress.Space.s4 : Letterpress.Space.s6
    }

    /// The natural cell edge length at a given screen width, given the padding/spacing this type chooses.
    /// `CalendarDayCell` also pins an explicit `Letterpress.minTouch` frame floor as a backstop.
    static func cellWidth(for screenWidth: CGFloat) -> CGFloat {
        let padding = horizontalPadding(for: screenWidth)
        let spacing = columnSpacing(for: screenWidth)
        let available = screenWidth - (2 * padding) - (CGFloat(columns - 1) * spacing)
        return available / CGFloat(columns)
    }
}

/// Completion calendar (spec §6 #8). Pushed from Plan: no tab bar, no bottom spacer.
struct CompletionCalendarView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var monthDate = Date()
    @State private var calendar: CompletionCalendar?
    @State private var loadFailed = false
    @State private var selected: String?

    private var month: String { String(RoutineDates.localDate(monthDate, zone: .current).prefix(7)) }
    private var today: String { RoutineDates.localDate(Date(), zone: .current) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                if let calendar {
                    populated(calendar)
                } else if loadFailed {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                        Text("Couldn't load \(CompletionCalendarCopy.monthTitle(month)).")
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                            .fixedSize(horizontal: false, vertical: true)
                        Button("Try again") { Task { await load() } }
                            .buttonStyle(.letterpress(.outlined))
                    }
                    .padding(.top, Letterpress.Space.s22)
                } else {
                    HStack(spacing: Letterpress.Space.s10) {
                        SwiftUI.ProgressView().tint(Letterpress.inkTertiary)
                        Text("Loading \(CompletionCalendarCopy.monthTitle(month))")
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                    .padding(.top, Letterpress.Space.s22)
                }
                Text(CompletionCalendarCopy.footnote)
                    .font(Letterpress.ui(12, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s22)
            }
            .padding(.horizontal, CompletionCalendarGrid.horizontalPadding(for: UIScreen.main.bounds.width))
            .padding(.top, Letterpress.Space.s10)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .navigationTitle("Completion history")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .task(id: month) { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(CompletionCalendarCopy.monthTitle(month))
                .font(Letterpress.display(34, relativeTo: .largeTitle))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            ViewThatFits(in: .horizontal) {
                HStack {
                    previousButton
                    Spacer()
                    nextButton
                }
                VStack(alignment: .leading, spacing: 0) {
                    previousButton
                    nextButton
                }
            }
        }
    }

    private var previousButton: some View {
        Button("Previous month") { move(-1) }.buttonStyle(.letterpress(.underline))
    }

    @ViewBuilder private var nextButton: some View {
        if month < String(today.prefix(7)) {
            Button("Next month") { move(1) }.buttonStyle(.letterpress(.underline))
        }
    }

    @ViewBuilder private func populated(_ calendar: CompletionCalendar) -> some View {
        let dates = SupportDates.days(month)
        let cells = CompletionCalendarCopy.cells(month: month, calendar: calendar, today: today)
        let tally = CompletionCalendarCopy.tally(cells)
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s10))
            : AnyLayout(HStackLayout(alignment: .center, spacing: Letterpress.Space.s14))
        layout {
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text("\(tally.recorded)")
                    .font(Letterpress.data(28, weight: .medium, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                Text(CompletionCalendarCopy.countLabel(tally))
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                    .textCase(.uppercase)
                    .foregroundStyle(Letterpress.inkTertiary)
            }
            if !dynamicTypeSize.isAccessibilitySize {
                Rectangle().fill(Letterpress.rule).frame(width: 1, height: Letterpress.minTouch).accessibilityHidden(true)
            }
            Text(CompletionCalendarCopy.sentence(tally))
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, Letterpress.Space.s18)
        .accessibilityElement(children: .combine)
        if dynamicTypeSize.isAccessibilitySize {
            dayList(dates: dates, cells: cells)
                .padding(.top, Letterpress.Space.s22)
        } else {
            grid(dates: dates, cells: cells)
                .padding(.top, Letterpress.Space.s22)
            legend
                .padding(.top, Letterpress.Space.s18)
        }
        LetterpressRule()
            .padding(.top, Letterpress.Space.s22)
        if let selected, dates.contains(selected), selected <= today {
            CompletionDayEvents(date: selected, today: today)
                .id(selected)
        }
    }

    private func grid(dates: [String], cells: [CalendarCell]) -> some View {
        let firstWeekday = Calendar.current.firstWeekday
        let spacing = CompletionCalendarGrid.columnSpacing(for: UIScreen.main.bounds.width)
        let columns = Array(
            repeating: GridItem(.flexible(minimum: Letterpress.minTouch), spacing: spacing),
            count: CompletionCalendarGrid.columns
        )
        return LazyVGrid(columns: columns, spacing: Letterpress.Space.s14) {
            ForEach(Array(CompletionCalendarCopy.weekdaySymbols(firstWeekday: firstWeekday, locale: .current).enumerated()), id: \.offset) { _, symbol in
                Text(symbol)
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption2))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .accessibilityHidden(true)
            }
            ForEach(0..<CompletionCalendarCopy.leadingBlanks(month: month, firstWeekday: firstWeekday), id: \.self) { _ in
                Color.clear.aspectRatio(1, contentMode: .fit).accessibilityHidden(true)
            }
            ForEach(Array(zip(dates, cells)), id: \.0) { pair in
                let (date, cell) = pair
                Button { selected = date } label: {
                    CalendarDayCell(day: Int(date.suffix(2)) ?? 0, cell: cell, isToday: date == today, isSelected: selected == date)
                }
                .buttonStyle(.plain)
                .disabled(cell == .future)
                .accessibilityLabel(CompletionCalendarCopy.dayLabel(date, cell: cell, isToday: date == today))
                .accessibilityHint(cell == .future ? "" : "Shows what was recorded")
                .accessibilityAddTraits(selected == date ? .isSelected : [])
            }
        }
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }

    private func dayList(dates: [String], cells: [CalendarCell]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(zip(dates, cells)), id: \.0) { pair in
                let (date, cell) = pair
                Button { selected = date } label: {
                    Text(CompletionCalendarCopy.dayLabel(date, cell: cell, isToday: date == today))
                        .font(Letterpress.ui(16, weight: date == today ? .medium : .body, relativeTo: .body))
                        .foregroundStyle(cell == .future ? Letterpress.inkFuture : Letterpress.ink)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, Letterpress.Space.s10)
                        .padding(.leading, Letterpress.Space.s10)
                        .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
                        .overlay(alignment: .top) { LetterpressRule() }
                        .overlay(alignment: .leading) {
                            if selected == date { Rectangle().fill(Letterpress.ink).frame(width: 2) }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(cell == .future)
                .accessibilityAddTraits(selected == date ? .isSelected : [])
            }
            LetterpressRule()
        }
    }

    private var legend: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Letterpress.Space.s14) { legendItems }
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) { legendItems }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder private var legendItems: some View {
        legendItem("Both routines") { Letterpress.ink }
        legendItem("One routine") { VStack(spacing: 0) { Letterpress.ink; Letterpress.sunk } }
        legendItem("None recorded") { Letterpress.sunk }
        legendItem("Today") { Rectangle().strokeBorder(Letterpress.ink, lineWidth: CalendarCellStyle.todayOutline) }
    }

    private func legendItem<Swatch: View>(_ title: String, @ViewBuilder swatch: () -> Swatch) -> some View {
        HStack(spacing: Letterpress.Space.s6) {
            swatch().frame(width: 13, height: 13)
            Text(title)
                .font(Letterpress.ui(12, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkSecondary)
        }
    }

    private func move(_ value: Int) {
        calendar = nil
        loadFailed = false
        selected = nil
        monthDate = Calendar.current.date(byAdding: .month, value: value, to: monthDate) ?? monthDate
    }

    private func load() async {
        guard let ticket = APIService.shared.access.snapshot() else { return }
        let requested = month
        calendar = nil
        loadFailed = false
        do {
            let result = try await APIService.shared.fetchCompletionCalendar(month: requested, ticket: ticket)
            try Task.checkCancellation()
            try APIService.shared.access.require(ticket)
            guard month == requested else { return }
            calendar = result
            let cells = CompletionCalendarCopy.cells(month: requested, calendar: result, today: today)
            selected = CompletionCalendarCopy.defaultSelection(month: requested, cells: cells, today: today)
        } catch {
            guard !Task.isCancelled, month == requested, APIService.shared.access.snapshot() == ticket else { return }
            loadFailed = true
        }
    }
}

private struct CalendarDayCell: View {
    let day: Int
    let cell: CalendarCell
    let isToday: Bool
    let isSelected: Bool

    private var isSplit: Bool {
        if case .split = CalendarCellStyle.fill(cell, isToday: isToday) { return true }
        return false
    }

    var body: some View {
        ZStack(alignment: isSplit ? .bottom : .center) {
            cellFill
                .padding(isToday ? CalendarCellStyle.todayInset : 0)
            Text("\(day)")
                .font(Letterpress.data(12, weight: cell == .future ? .regular : .medium, relativeTo: .caption))
                .foregroundStyle(Color(CalendarCellStyle.text(cell, isToday: isToday)))
                .padding(.bottom, isSplit ? Letterpress.Space.s4 : 0)
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(minWidth: Letterpress.minTouch, minHeight: Letterpress.minTouch)
        .frame(maxWidth: .infinity)
        .overlay {
            if isToday { Rectangle().strokeBorder(Letterpress.ink, lineWidth: CalendarCellStyle.todayOutline) }
        }
        .overlay(alignment: .bottom) {
            if isSelected {
                Rectangle().fill(Letterpress.ink).frame(height: 2).offset(y: Letterpress.Space.s6)
            }
        }
        .contentShape(Rectangle())
    }

    @ViewBuilder private var cellFill: some View {
        switch CalendarCellStyle.fill(cell, isToday: isToday) {
        case .none:
            Color.clear
        case .solid(let name):
            Color(name)
        case .split(let top, let bottom):
            VStack(spacing: 0) {
                Color(top)
                Color(bottom)
            }
        }
    }
}

/// The selected day's recorded events, beneath the calendar (spec §6 #8). Pagination is the endpoint's own.
private struct CompletionDayEvents: View {
    let date: String
    let today: String
    @State private var events: [CompletionCalendarEvent] = []
    @State private var page = 1
    @State private var totalPages = 1
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(CompletionCalendarCopy.eyebrow(date))
                .letterpressEyebrow()
                .padding(.top, Letterpress.Space.s18)
                .padding(.bottom, Letterpress.Space.s10)
                .accessibilityAddTraits(.isHeader)
            if loading {
                Text("Loading this day")
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
            } else if failed {
                VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                    Text("Couldn't load this day.")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.error)
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(.letterpress(.underline))
                }
            } else {
                ForEach(events) { event in
                    row(time: CompletionCalendarCopy.eventTime(event.completion),
                        title: CompletionCalendarCopy.eventTitle(event.routine),
                        meta: CompletionCalendarCopy.eventMeta(event.routine),
                        recorded: true)
                }
                if totalPages <= 1 {
                    ForEach(CompletionCalendarCopy.missingSlots(recorded: events.map(\.routine.timeOfDay), date: date, today: today), id: \.self) { title in
                        row(time: "—", title: title, meta: nil, recorded: false)
                    }
                }
                LetterpressRule()
                if totalPages > 1 {
                    HStack(spacing: Letterpress.Space.s10) {
                        Button("Previous") { page -= 1 }
                            .buttonStyle(.letterpress(.outlined))
                            .disabled(page <= 1)
                        Spacer(minLength: 0)
                        Text("Page \(page) of \(totalPages)")
                            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                            .foregroundStyle(Letterpress.inkTertiary)
                        Spacer(minLength: 0)
                        Button("Next") { page += 1 }
                            .buttonStyle(.letterpress(.outlined))
                            .disabled(page >= totalPages)
                    }
                    .padding(.top, Letterpress.Space.s14)
                }
            }
        }
        .task(id: page) { await load() }
    }

    private func row(time: String, title: String, meta: String?, recorded: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s14) {
            Text(time)
                .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkTertiary)
                .frame(minWidth: Letterpress.minTouch, alignment: .leading)
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text(title)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(recorded ? Letterpress.ink : Letterpress.inkSecondary)
                if let meta {
                    Text(meta)
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(Letterpress.inkTertiary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, Letterpress.Space.s10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { LetterpressRule() }
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        guard let ticket = APIService.shared.access.snapshot() else { return }
        loading = true
        failed = false
        do {
            let result = try await APIService.shared.fetchCompletionDay(date: date, page: page, ticket: ticket)
            try Task.checkCancellation()
            try APIService.shared.access.require(ticket)
            events = result.data
            totalPages = max(result.pagination.totalPages, 1)
            loading = false
        } catch {
            guard !Task.isCancelled, APIService.shared.access.snapshot() == ticket else { return }
            loading = false
            failed = true
        }
    }
}
