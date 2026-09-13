import SwiftUI

enum RoutineActionAppearance {
    static let tint = CareJournal.actionPrimary
    static let foreground = CareJournal.onPrimary
}

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
                        .foregroundStyle(CareJournal.textSecondary)
                    CareJournalPicker(title: "Time of day", selection: $selectedSlot) {
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
                        }.font(.caption).foregroundStyle(CareJournal.textSecondary)
                    }
                    if let error = actionError ?? repository.lastError {
                        Text(error).foregroundStyle(Color.retainedErrorText).accessibilityIdentifier("routine-error")
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
                                .foregroundStyle(CareJournal.textSecondary)
                        }
                    } else if repository.snapshot != nil {
                        Text("No \(selectedSlot.rawValue) routine assigned").font(.title3)
                        Text("Your clinician’s assignment will appear here.").foregroundStyle(CareJournal.textSecondary)
                    } else if !repository.isRefreshing {
                        Text("Assignments haven’t been loaded.").foregroundStyle(CareJournal.textSecondary)
                    }
                    if !repository.pending.isEmpty {
                        Text("\(repository.pending.count) completion(s) saved on this device and awaiting sync. Each keeps its original assignment, date and time zone.")
                            .font(.caption).foregroundStyle(CareJournal.textSecondary)
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(CareJournal.textPrimary)
            .tint(CareJournal.actionPrimary)
            .background(CareJournal.canvas)
            .navigationTitle("Routines")
            .toolbar {
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
                Text(routine.name).font(.system(.title2, design: .serif))
                Text(routine.timeOfDay.title)
                    .font(.subheadline).foregroundStyle(CareJournal.textSecondary)
            }
            ForEach(Array(routine.steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(index + 1)").font(.headline).foregroundStyle(CareJournal.actionPrimary)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(step.title).font(.headline)
                        if !step.instructions.isEmpty { Text(step.instructions) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(CareJournal.surface, in: RoundedRectangle(cornerRadius: 12))
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
            .buttonStyle(.borderedProminent)
            .tint(RoutineActionAppearance.tint)
            .foregroundStyle(RoutineActionAppearance.foreground)
            .disabled(status != .unrecorded)
            .accessibilityIdentifier("routine-\(routine.timeOfDay.rawValue)-record")
            Text("Record after you have completed the steps.")
            DisclosureGroup("Routine details") {
                Text("Version \(routine.version). Completions keep the assignment you viewed for that day.")
            }
                .font(.caption).foregroundStyle(CareJournal.textSecondary)
        }
    }
}
