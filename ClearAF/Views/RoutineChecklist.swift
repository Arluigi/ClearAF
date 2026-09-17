import SwiftUI

/// Copy for recording a routine (spec §4.4, §5, §7). Version, time zone and the upload queue sit under the action.
enum RoutineRecordCopy {
    static func action(_ slot: RoutineTimeOfDay) -> String {
        slot == .morning ? "Record this morning" : "Record this evening"
    }

    static func button(_ slot: RoutineTimeOfDay, status: RoutineDailyStatus) -> String {
        switch status {
        case .unrecorded: action(slot)
        case .pending: "Saved on this device"
        case .recorded: "Recorded"
        }
    }

    /// The sentence under the button. A recorded time is shown in the time zone the completion was made in.
    static func status(_ status: RoutineDailyStatus, completedAt: String?, timeZone: String?, locale: Locale = .current) -> String {
        switch status {
        case .unrecorded:
            return "Not recorded today"
        case .pending:
            return "Saved on this device. Waiting to upload."
        case .recorded:
            guard let completedAt, let date = RoutineDates.instant(completedAt) else { return "Recorded today. Comes back tomorrow." }
            let zone = timeZone.flatMap(TimeZone.init(identifier:)) ?? .current
            return "Recorded at \(LetterpressFormat.clock(date, locale: locale, timeZone: zone)). Comes back tomorrow."
        }
    }

    static func assignment(_ routine: CareRoutineRevision, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let steps = routine.steps.count == 1 ? "1 step" : "\(routine.steps.count) steps"
        guard let date = RoutineDates.instant(routine.createdAt) else { return "Assigned by your clinician · \(steps)" }
        return "Assigned on \(LetterpressFormat.dayMonth(date, locale: locale, timeZone: timeZone)) · \(steps)"
    }

    static func versionNote(_ routine: CareRoutineRevision, localDate: String, pendingCount: Int, locale: Locale = .current) -> String {
        var sentence = "Records against v\(routine.version) for \(dayLabel(localDate, locale: locale)), in your time zone."
        if pendingCount == 1 {
            sentence += " One completion is still waiting to upload."
        } else if pendingCount > 1 {
            sentence += " \(pendingCount) completions are still waiting to upload."
        }
        return sentence
    }

    static func lastChecked(_ date: Date, now: Date = Date(), locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let time = LetterpressFormat.clock(date, locale: locale, timeZone: timeZone)
        return calendar.isDate(date, inSameDayAs: now)
            ? "Last checked \(time)"
            : "Last checked \(LetterpressFormat.dayMonth(date, locale: locale, timeZone: timeZone)), \(time)"
    }

    static func todaysEvent(for revisionID: UUID, completions: [CareRoutineCompletion], pending: [PendingRoutineCompletion],
                            localDate: String) -> (completedAt: String, timeZone: String)? {
        if let done = completions.first(where: { $0.revisionId == revisionID && $0.localDate == localDate }) {
            return (done.completedAt, done.timeZone)
        }
        if let queued = pending.first(where: { $0.revisionId == revisionID && $0.localDate == localDate }) {
            return (queued.completedAt, queued.timeZone)
        }
        return nil
    }

    /// `localDate` is already the patient's calendar day, so it is formatted in UTC to avoid shifting it.
    private static func dayLabel(_ localDate: String, locale: Locale) -> String {
        let utc = TimeZone(identifier: "UTC")!
        let parser = DateFormatter()
        parser.calendar = Calendar(identifier: .gregorian)
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = utc
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: localDate) else { return localDate }
        return LetterpressFormat.weekdayDayMonth(date, locale: locale, timeZone: utc)
    }
}

/// Ruled checklist (spec §4.4). Ticks are local and reversible; recording is the filled button.
struct RoutineChecklist: View {
    let steps: [CareRoutineStep]
    @Binding var ticked: Set<Int>

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                RoutineChecklistRow(step: step, isTicked: ticked.contains(index)) {
                    if ticked.contains(index) { ticked.remove(index) } else { ticked.insert(index) }
                }
                .overlay(alignment: .top) { LetterpressRule() }
            }
            LetterpressRule()
        }
    }
}

private struct RoutineChecklistRow: View {
    let step: CareRoutineStep
    let isTicked: Bool
    let toggle: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: Letterpress.Space.s10) {
            Button(action: toggle) {
                RoutineCheckbox(isTicked: isTicked)
                    .frame(width: Letterpress.minTouch, height: Letterpress.minTouch, alignment: .topLeading)
                    .padding(.top, 2)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(step.title)
            .accessibilityValue(isTicked ? "Ticked" : "Not ticked")
            .accessibilityHint("Ticks this step on this device. Recording the routine is separate.")
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text(step.title)
                    .font(Letterpress.ui(17, weight: .medium, relativeTo: .headline))
                    .foregroundStyle(Letterpress.ink)
                    .strikethrough(isTicked, color: Letterpress.ink.opacity(0.32))
                if !step.instructions.isEmpty {
                    Text(step.instructions)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, Letterpress.Space.s4)
        }
        .padding(.vertical, Letterpress.Space.s10)
        .contentShape(Rectangle())
        .onTapGesture(perform: toggle)
    }
}

struct RoutineCheckbox: View {
    static let size: CGFloat = 22
    let isTicked: Bool

    var body: some View {
        ZStack {
            Rectangle().fill(isTicked ? Letterpress.ink : Color.clear)
            Rectangle().strokeBorder(Letterpress.ink, lineWidth: 1.5)
            if isTicked {
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Letterpress.canvas)
            }
        }
        .frame(width: Self.size, height: Self.size)
        .accessibilityHidden(true)
    }
}

/// The filled record action with its state sentence and demoted version metadata.
struct RoutineRecordPanel: View {
    let routine: CareRoutineRevision
    @ObservedObject var repository: RoutineRepository
    let identifierPrefix: String
    var showsVersionNote = true
    @Binding var actionError: String?

    var body: some View {
        let ticket = APIService.shared.access.snapshot()
        let status = repository.status(for: routine)
        let event = RoutineRecordCopy.todaysEvent(for: routine.id, completions: repository.snapshot?.completions ?? [],
                                                  pending: repository.pending, localDate: repository.localDate)
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Button(RoutineRecordCopy.button(routine.timeOfDay, status: status)) {
                do {
                    _ = try repository.recordCompletion(revision: routine, ticket: ticket)
                    actionError = nil
                } catch { actionError = error.localizedDescription }
            }
            .buttonStyle(.letterpress(.filled, fullWidth: true))
            .disabled(status != .unrecorded)
            .accessibilityIdentifier("\(identifierPrefix)-record")
            Text(RoutineRecordCopy.status(status, completedAt: event?.completedAt, timeZone: event?.timeZone))
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
                .accessibilityIdentifier("\(identifierPrefix)-status")
            if showsVersionNote {
                Text(RoutineRecordCopy.versionNote(routine, localDate: repository.localDate, pendingCount: repository.pending.count))
                    .font(Letterpress.ui(12, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
