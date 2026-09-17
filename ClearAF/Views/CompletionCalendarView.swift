import SwiftUI

struct CompletionCalendarView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var monthDate = Date()
    @State private var calendar: CompletionCalendar?
    @State private var error: String?
    private var month: String { String(RoutineDates.localDate(monthDate, zone: .current).prefix(7)) }
    var body: some View {
        List {
            Section {
                ViewThatFits(in: .horizontal) {
                    HStack {
                        Button("Previous month") { move(-1) }
                        Spacer(); Text(month); Spacer()
                        Button("Next month") { move(1) }
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text(month).font(.headline)
                        Button("Previous month") { move(-1) }
                        Button("Next month") { move(1) }
                    }
                }
                Text("Server-recorded completions by their reported local date. Pending completions remain on the Routines screen.").font(.caption)
            }
            if let error { Text(error); Button("Retry") { Task { await load() } } }
            if calendar == nil && error == nil { SwiftUI.ProgressView("Loading month…") }
            if let calendar {
                if dynamicTypeSize.isAccessibilitySize {
                    ForEach(SupportDates.days(month), id: \.self) { date in
                        let day = calendar.days.first { $0.localDate == date }
                        NavigationLink { CompletionDayView(date: date) } label: {
                            VStack(alignment: .leading) {
                                Text(date)
                                Text(daySummary(day)).font(.caption).foregroundStyle(Letterpress.inkSecondary)
                            }
                        }.accessibilityLabel("\(date), \(daySummary(day))")
                    }
                } else {
                    Section {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 7), spacing: 8) {
                            ForEach(Array(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].enumerated()), id: \.offset) { _, name in
                                Text(name).font(.caption2).foregroundStyle(Letterpress.inkSecondary).accessibilityHidden(true)
                            }
                            ForEach(0..<weekdayOffset, id: \.self) { _ in Color.clear.frame(height: 60).accessibilityHidden(true) }
                            ForEach(SupportDates.days(month), id: \.self) { date in
                                let day = calendar.days.first { $0.localDate == date }
                                NavigationLink { CompletionDayView(date: date) } label: {
                                    VStack(spacing: 4) {
                                        Text(String(Int(date.suffix(2)) ?? 0)).font(.callout)
                                        if let day {
                                            Text("AM \(day.morning)").font(.caption2)
                                            Text("PM \(day.evening)").font(.caption2)
                                        } else {
                                            Text("—").font(.caption2)
                                            Text("—").font(.caption2)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 60)
                                    .padding(.vertical, 3)
                                    .background(Letterpress.surface, in: Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(date), \(daySummary(day))")
                                .accessibilityHint("Opens completion records")
                            }
                        }
                        Text("AM: morning · PM: evening · —: Not recorded")
                            .font(.caption).foregroundStyle(Letterpress.inkSecondary)
                    }
                }
            }
        }.navigationTitle("Completion history").tint(Letterpress.action)
        .task(id: month) { await load() }
    }
    private var weekdayOffset: Int {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = TimeZone(secondsFromGMT: 0)!
        let parts = month.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2, let first = gregorian.date(from: DateComponents(year: parts[0], month: parts[1], day: 1)) else { return 0 }
        return gregorian.component(.weekday, from: first) - 1
    }
    private func daySummary(_ day: CompletionCalendar.Day?) -> String {
        guard let day else { return "Not recorded" }
        return "Morning: \(day.morning) recorded · Evening: \(day.evening) recorded"
    }
    private func move(_ value: Int) { calendar = nil; error = nil; monthDate = Calendar.current.date(byAdding: .month, value: value, to: monthDate) ?? monthDate }
    private func load() async {
        guard let ticket = APIService.shared.access.snapshot() else { return }
        let requested = month; calendar = nil; error = nil
        do { let result = try await APIService.shared.fetchCompletionCalendar(month: requested, ticket: ticket); try Task.checkCancellation(); try APIService.shared.access.require(ticket); guard month == requested else { return }; calendar = result }
        catch { if !Task.isCancelled && month == requested && APIService.shared.access.snapshot() == ticket { self.error = "This month could not be loaded." } }
    }
}
struct CompletionDayView: View {
    let date: String
    @State private var events: [CompletionCalendarEvent] = []
    @State private var page = 1
    @State private var totalPages = 1
    @State private var loading = false
    @State private var error: String?
    var body: some View {
        List {
            if loading { SwiftUI.ProgressView("Loading records…") }
            if let error { Text(error); Button("Retry") { Task { await load() } } }
            if events.isEmpty && !loading && error == nil { Text("Not recorded") }
            ForEach(events) { event in
                Section("\(event.routine.timeOfDay.title) · \(event.routine.name)") {
                    Text("Version \(event.routine.version)")
                    Text("Reported: \(event.completion.localDate) · \(event.completion.timeZone)")
                    Text("Completed: \(formatted(event.completion.completedAt))")
                    Text("Received: \(formatted(event.completion.receivedAt))")
                    ForEach(Array(event.routine.steps.enumerated()), id: \.offset) { _, step in Text(step.title); Text(step.instructions) }
                }
            }
            HStack {
                Button("Previous") { page -= 1; events = []; Task { await load() } }.disabled(page <= 1 || loading)
                Spacer(); Text("Page \(page)"); Spacer()
                Button("Next") { page += 1; events = []; Task { await load() } }.disabled(page >= totalPages || loading)
            }
        }.navigationTitle(date).task { await load() }.refreshable { await load() }
    }
    private func formatted(_ value: String) -> String {
        RoutineDates.instant(value)?.formatted(date: .abbreviated, time: .standard) ?? value
    }
    private func load() async {
        guard let ticket = APIService.shared.access.snapshot(), !loading else { return }
        loading = true; error = nil; events = []; defer { loading = false }
        do { let result = try await APIService.shared.fetchCompletionDay(date: date, page: page, ticket: ticket); try APIService.shared.access.require(ticket); events = result.data; totalPages = result.pagination.totalPages }
        catch { if APIService.shared.access.snapshot() == ticket { self.error = "Records could not be loaded." } }
    }
}
