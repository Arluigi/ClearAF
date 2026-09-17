import SwiftUI

struct RoutineView: View {
    @ObservedObject private var repository = APIService.shared.routines
    @State private var selectedSlot: RoutineTimeOfDay = .morning
    @State private var actionError: String?

    var body: some View {
        let ticket = APIService.shared.access.snapshot()
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("Your clinician assigns and updates these routines.")
                        .foregroundStyle(Letterpress.inkSecondary)
                    LetterpressPicker(title: "Time of day", selection: $selectedSlot) {
                        ForEach(RoutineTimeOfDay.allCases, id: \.self) { slot in
                            Text(slot.title).tag(slot)
                        }
                    }
                    Text(Date.now, format: .dateTime.weekday().month().day()).font(.subheadline)
                    if repository.isRefreshing {
                        HStack { SwiftUI.ProgressView(); Text("Refreshing routines…") }
                    }
                    if let refreshed = repository.lastRefreshed {
                        DisclosureGroup(repository.isCached ? "Saved assignment · refresh to check for changes" : "Assignment details") {
                            Text(repository.isCached ? "Saved assignment on this device" : "Latest fetched assignment")
                            Text("Last refreshed \(refreshed.formatted(date: .abbreviated, time: .shortened))")
                        }.font(.caption).foregroundStyle(Letterpress.inkSecondary)
                    }
                    if let error = actionError ?? repository.lastError {
                        Text(error).foregroundStyle(Letterpress.error).accessibilityIdentifier("routine-error")
                        Button("Retry") {
                            Task { @MainActor in
                                guard APIService.shared.access.snapshot() == ticket else { return }
                                actionError = nil
                                await repository.retry()
                            }
                        }
                    }
                    if let routine = repository.routine(for: selectedSlot) {
                        if routine.isActive { assignment(routine, ticket: ticket) }
                        else {
                            Text("No active \(selectedSlot.rawValue) assignment").font(.title3)
                            Text("Your clinician archived version \(routine.version). Contact your care team if you need guidance.")
                                .foregroundStyle(Letterpress.inkSecondary)
                        }
                    } else if repository.snapshot != nil {
                        Text("No \(selectedSlot.rawValue) routine assigned").font(.title3)
                        Text("Your clinician’s assignment will appear here.").foregroundStyle(Letterpress.inkSecondary)
                    } else if !repository.isRefreshing {
                        Text("Assignments haven’t been loaded.").foregroundStyle(Letterpress.inkSecondary)
                    }
                    if !repository.pending.isEmpty {
                        Text("\(repository.pending.count) completion(s) saved on this device and awaiting sync. Each keeps its original assignment, date and time zone.")
                            .font(.caption).foregroundStyle(Letterpress.inkSecondary)
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(Letterpress.ink)
            .tint(Letterpress.action)
            .background(Letterpress.canvas)
            .navigationTitle("Routines")
            .toolbar {
                ToolbarItemGroup {
                    NavigationLink { CompletionCalendarView() } label: {
                        Label("Completion history", systemImage: "calendar")
                    }
                    Button {
                        Task { @MainActor in
                            guard APIService.shared.access.snapshot() == ticket else { return }
                            actionError = nil
                            await repository.refresh()
                        }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                            .labelStyle(.iconOnly)
                            .frame(minWidth: 44, minHeight: 44)
                    }.disabled(repository.isRefreshing)
                }
            }
            .refreshable {
                guard APIService.shared.access.snapshot() == ticket else { return }
                await repository.refresh()
            }
            .onChange(of: selectedSlot) { _, _ in actionError = nil }
        }
    }

    private func assignment(_ routine: CareRoutineRevision, ticket: AccountAccess.Ticket?) -> some View {
        let status = repository.status(for: routine)
        return VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 6) {
                Text(routine.name).font(Letterpress.display(22, relativeTo: .title2))
                Text(routine.timeOfDay.title)
                    .font(.subheadline).foregroundStyle(Letterpress.inkSecondary)
            }
            ForEach(Array(routine.steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(index + 1)").font(.headline).foregroundStyle(Letterpress.action)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(step.title).font(.headline)
                        if !step.instructions.isEmpty { Text(step.instructions) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(Letterpress.surface, in: RoundedRectangle(cornerRadius: Letterpress.Radius.control))
            }
            Text(status.label)
                .font(.headline)
                .accessibilityIdentifier("routine-\(routine.timeOfDay.rawValue)-status")
            Button("Record completion") {
                do {
                    _ = try repository.recordCompletion(revision: routine, ticket: ticket)
                    actionError = nil
                } catch { actionError = error.localizedDescription }
            }
            .buttonStyle(.letterpress(.filled))
            .disabled(status != .unrecorded)
            .accessibilityIdentifier("routine-\(routine.timeOfDay.rawValue)-record")
            Text("Record after you have completed the steps.")
            DisclosureGroup("Routine details") {
                Text("Version \(routine.version). Completions keep the assignment you viewed for that day.")
            }
                .font(.caption).foregroundStyle(Letterpress.inkSecondary)
        }
    }
}
