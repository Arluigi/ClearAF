import SwiftUI

/// Days in the strip (spec §4.6), from the server's per-day morning/evening completion counts.
enum AdherenceDayState: Equatable { case both, one, neither }

struct AdherenceWindow: Equatable {
    static let length = 14
    let dates: [String]
    let states: [AdherenceDayState]

    var recordedDays: Int { states.filter { $0 != .neither }.count }
    /// A count, never a grade or percentage (spec §4.6, §7).
    var summary: String { "\(recordedDays) of the last \(Self.length) days" }

    static func dates(endingOn today: Date, timeZone: TimeZone) -> [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let start = calendar.startOfDay(for: today)
        return (0..<length).reversed().compactMap { offset in
            calendar.date(byAdding: .day, value: -offset, to: start).map { RoutineDates.localDate($0, zone: timeZone) }
        }
    }

    static func months(for dates: [String]) -> [String] {
        var months: [String] = []
        for month in dates.map({ String($0.prefix(7)) }) where !months.contains(month) { months.append(month) }
        return months
    }

    static func build(dates: [String], calendars: [CompletionCalendar]) -> AdherenceWindow {
        let days = Dictionary(calendars.flatMap(\.days).map { ($0.localDate, $0) }, uniquingKeysWith: { first, _ in first })
        return AdherenceWindow(dates: dates, states: dates.map { date -> AdherenceDayState in
            guard let day = days[date] else { return .neither }
            switch (day.morning > 0, day.evening > 0) {
            case (true, true): return .both
            case (false, false): return .neither
            default: return .one
            }
        })
    }
}

struct AdherenceBars: View {
    static let barWidth: CGFloat = 6
    static let height: CGFloat = 22
    let window: AdherenceWindow

    static func fraction(_ state: AdherenceDayState) -> CGFloat {
        switch state {
        case .both: 1
        case .one: 0.7
        case .neither: 0.4
        }
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: Letterpress.Space.s4) {
            ForEach(Array(window.states.enumerated()), id: \.offset) { index, state in
                Rectangle()
                    .fill(state == .neither ? Letterpress.sunk : Letterpress.ink)
                    .frame(width: Self.barWidth, height: Self.height * Self.fraction(state))
                    .overlay {
                        if index == window.states.count - 1 {
                            Rectangle().strokeBorder(Letterpress.ink, lineWidth: 1.5)
                        }
                    }
            }
        }
        .frame(height: Self.height, alignment: .bottom)
        .accessibilityHidden(true)
    }
}

/// "Completion history" row on Plan: summary, bars, link to the calendar.
struct AdherenceStripRow: View {
    @ObservedObject var repository: RoutineRepository
    @State private var window: AdherenceWindow?
    @State private var failed = false

    var body: some View {
        NavigationLink { CompletionCalendarView() } label: {
            HStack(spacing: Letterpress.Space.s10) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text("Completion history")
                        .font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline))
                        .foregroundStyle(Letterpress.ink)
                    Text(detail)
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(failed ? Letterpress.error : Letterpress.inkTertiary)
                }
                Spacer(minLength: Letterpress.Space.s10)
                if let window { AdherenceBars(window: window) }
                Image(systemName: "chevron.right")
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: Letterpress.minTouch)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("Completion history, \(detail)")
        .task(id: "\(repository.localDate)-\(repository.snapshot?.completions.count ?? 0)") { await load() }
    }

    private var detail: String {
        if let window { return window.summary }
        return failed ? "Couldn't load the last 14 days" : "Loading the last 14 days"
    }

    private func load() async {
        guard let ticket = APIService.shared.access.snapshot() else { return }
        failed = false
        let dates = AdherenceWindow.dates(endingOn: Date(), timeZone: .current)
        do {
            var calendars: [CompletionCalendar] = []
            for month in AdherenceWindow.months(for: dates) {
                calendars.append(try await APIService.shared.fetchCompletionCalendar(month: month, ticket: ticket))
                try Task.checkCancellation()
                try APIService.shared.access.require(ticket)
            }
            window = AdherenceWindow.build(dates: dates, calendars: calendars)
        } catch {
            guard !Task.isCancelled, APIService.shared.access.snapshot() == ticket else { return }
            window = nil
            failed = true
        }
    }
}
