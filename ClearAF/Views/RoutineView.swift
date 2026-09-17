import SwiftUI

/// Plan (spec §6 #7): AM/PM switch, checklist, one filled record action, metadata under it, 14-day strip.
struct RoutineView: View {
    @ObservedObject private var repository = APIService.shared.routines
    @State private var selectedSlot: RoutineTimeOfDay = .morning
    @State private var actionError: String?
    @State private var tickBook = RoutineTickBook()

    var body: some View {
        let ticket = APIService.shared.access.snapshot()
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                    LetterpressPicker(title: "Time of day", selection: $selectedSlot) {
                        ForEach(RoutineTimeOfDay.allCases, id: \.self) { slot in
                            Text(slot.title).tag(slot)
                        }
                    }
                    freshness
                    if let error = actionError ?? repository.lastError {
                        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                            Text(error)
                                .font(Letterpress.ui(15, relativeTo: .body))
                                .foregroundStyle(Letterpress.error)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("routine-error")
                            Button("Retry") {
                                Task { @MainActor in
                                    guard APIService.shared.access.snapshot() == ticket else { return }
                                    actionError = nil
                                    await repository.retry()
                                }
                            }
                            .buttonStyle(.letterpress(.outlined))
                        }
                    }
                    content
                    LetterpressRule()
                    AdherenceStripRow(repository: repository)
                }
                .padding(.horizontal, Letterpress.Space.s22)
                .padding(.vertical, Letterpress.Space.s18)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Letterpress.canvas.ignoresSafeArea())
            .navigationTitle("Plan")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { @MainActor in
                            guard APIService.shared.access.snapshot() == ticket else { return }
                            actionError = nil
                            await repository.refresh()
                        }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                            .labelStyle(.iconOnly)
                            .frame(minWidth: Letterpress.minTouch, minHeight: Letterpress.minTouch)
                    }
                    .disabled(repository.isRefreshing)
                }
            }
            .refreshable {
                guard APIService.shared.access.snapshot() == ticket else { return }
                await repository.refresh()
            }
            .onChange(of: selectedSlot) { _, _ in actionError = nil }
        }
    }

    @ViewBuilder private var freshness: some View {
        if repository.isRefreshing {
            Text(repository.snapshot == nil ? "Loading your routine" : "Checking for changes")
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
        } else if repository.isCached, let refreshed = repository.lastRefreshed {
            Text(RoutineRecordCopy.lastChecked(refreshed))
                .letterpressEyebrow(color: Letterpress.attentionText)
        }
    }

    @ViewBuilder private var content: some View {
        if let routine = repository.routine(for: selectedSlot) {
            if routine.isActive {
                assignment(routine)
            } else {
                emptyState(title: "No active \(selectedSlot.rawValue) routine",
                           sentence: "Your clinician archived version \(routine.version). Contact your care team if you need guidance.")
            }
        } else if repository.snapshot != nil {
            emptyState(title: "No \(selectedSlot.rawValue) routine yet", sentence: "Your clinician’s assignment will appear here.")
        } else if !repository.isRefreshing {
            emptyState(title: "Routine not loaded", sentence: "Pull down or tap Refresh to load your assignment.")
        }
    }

    private func assignment(_ routine: CareRoutineRevision) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(routine.name)
                        .font(Letterpress.display(22, relativeTo: .title2))
                        .foregroundStyle(Letterpress.ink)
                    Spacer(minLength: Letterpress.Space.s10)
                    Text("V\(routine.version)")
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(Letterpress.inkTertiary)
                }
                Text(RoutineRecordCopy.assignment(routine))
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
            }
            RoutineChecklist(steps: routine.steps, ticked: Binding(
                get: { tickBook.ticked(revisionID: routine.id, localDate: repository.localDate) },
                set: { tickBook.setTicked($0, revisionID: routine.id, localDate: repository.localDate) }))
            RoutineRecordPanel(routine: routine, repository: repository,
                               identifierPrefix: "routine-\(routine.timeOfDay.rawValue)", actionError: $actionError)
                .padding(.top, Letterpress.Space.s4)
        }
    }

    private func emptyState(title: String, sentence: String) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Text(title)
                .font(Letterpress.display(24, relativeTo: .title2))
                .foregroundStyle(Letterpress.ink)
            Text(sentence)
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
