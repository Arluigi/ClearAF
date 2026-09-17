import SwiftUI

struct ReminderSummaryRow: Equatable, Identifiable {
    let id: String
    let title: String
    let detail: String
    let time: String?
}

enum ReminderCopy {
    static let intro = "Choose reminders that work for you. They stay on this device and pause when you sign out."
    static let deniedHelp = "Allow notifications for ClearAF in iPhone Settings, then try saving again."

    static func time(_ reminder: ReminderTime) -> String { String(format: "%02d:%02d", reminder.hour, reminder.minute) }

    static func rows(_ preferences: ReminderPreferences, weekdaySymbols: [String] = Calendar.current.weekdaySymbols) -> [ReminderSummaryRow] {
        let index = preferences.weekday - 1
        let weekly = weekdaySymbols.indices.contains(index) ? "\(weekdaySymbols[index])s" : "Once a week"
        return [
            row("morning", "Morning routine", preferences.morning, schedule: "Every day"),
            row("evening", "Evening routine", preferences.evening, schedule: "Every day"),
            row("photo", "Weekly photo", preferences.photo, schedule: weekly),
        ]
    }

    private static func row(_ id: String, _ title: String, _ reminder: ReminderTime, schedule: String) -> ReminderSummaryRow {
        ReminderSummaryRow(id: id, title: title, detail: reminder.enabled ? schedule : "Off", time: reminder.enabled ? time(reminder) : nil)
    }

    static func status(_ state: ReminderRepository.State) -> String {
        switch state {
        case .disabled: "Reminders are off."
        case .paused: "Saved preferences. Save to turn reminders on."
        case .saving: "Updating reminders…"
        case .enabled: "Reminders are scheduled on this device. Times follow your device's time zone."
        case .denied: "Notification permission is off. Reminders aren't scheduled."
        case .failed: "Couldn't update reminders. Check your settings and try again."
        }
    }
}

/// Toggle and time rows shared by Reminders and onboarding. Changes stay in `draft` until the screen saves.
struct ReminderRows: View {
    @Binding var draft: ReminderPreferences

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            row("Morning routine", schedule: "Every day", time: $draft.morning)
            row("Evening routine", schedule: "Every day", time: $draft.evening)
            row("Weekly photo", schedule: "Once a week", time: $draft.photo)
            if draft.photo.enabled {
                HStack(spacing: Letterpress.Space.s10) {
                    Text("Day")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                    Spacer(minLength: Letterpress.Space.s10)
                    Picker("Day", selection: $draft.weekday) {
                        ForEach(1...7, id: \.self) { day in Text(Calendar.current.weekdaySymbols[day - 1]).tag(day) }
                    }
                    .pickerStyle(.menu)
                    .tint(Letterpress.ink)
                }
                .frame(minHeight: Letterpress.minTouch)
                .overlay(alignment: .top) { LetterpressRule() }
            }
            LetterpressRule()
        }
    }

    private func row(_ title: String, schedule: String, time: Binding<ReminderTime>) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Toggle(isOn: time.enabled) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text(title)
                        .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                    Text(schedule)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .tint(Letterpress.toggleOn)
            if time.wrappedValue.enabled {
                DatePicker("\(title) time", selection: Binding(get: {
                    Calendar.current.date(from: DateComponents(hour: time.wrappedValue.hour, minute: time.wrappedValue.minute)) ?? Date()
                }, set: { date in
                    time.wrappedValue.hour = Calendar.current.component(.hour, from: date)
                    time.wrappedValue.minute = Calendar.current.component(.minute, from: date)
                }), displayedComponents: .hourAndMinute)
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.ink)
                .tint(Letterpress.ink)
            }
        }
        .padding(.vertical, Letterpress.Space.s10)
        .frame(minHeight: Letterpress.minTouch)
        .overlay(alignment: .top) { LetterpressRule() }
    }
}

/// Reminder settings, pushed from Profile. Saving keeps the existing explicit permission request.
struct ReminderSettingsView: View {
    @ObservedObject private var api = APIService.shared
    @ObservedObject private var repository = APIService.shared.reminders
    @State private var draft = ReminderPreferences()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(ReminderCopy.intro)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                ReminderRows(draft: $draft)
                    .padding(.top, Letterpress.Space.s22)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Button(repository.state == .saving ? "Saving…" : "Save reminders") {
                        guard let ticket = api.access.snapshot() else { return }
                        Task { await repository.save(draft, ticket: ticket) }
                    }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(repository.state == .saving)
                    .accessibilityIdentifier("reminderSave")
                    Text(ReminderCopy.status(repository.state))
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(repository.state == .failed ? Letterpress.error : Letterpress.inkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("reminderStatus")
                    if repository.state == .denied {
                        Text(ReminderCopy.deniedHelp)
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, Letterpress.Space.s22)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.top, Letterpress.Space.s18)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .navigationTitle("Reminders")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .task {
            if let ticket = api.access.snapshot() { await repository.resume(ticket: ticket) }
            draft = repository.preferences
            await repository.refreshPermission()
        }
    }
}
