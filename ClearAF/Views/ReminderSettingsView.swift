import SwiftUI

struct ReminderSettingsView: View {
    @ObservedObject private var api=APIService.shared
    @ObservedObject private var repository=APIService.shared.reminders
    @State private var draft=ReminderPreferences()
    var body:some View {
        Form {
            Section {
                Text("Choose reminders that work for you. These reminders stay on this device and pause when you sign out.")
                    .foregroundStyle(CareJournal.textSecondary)
            }
            Section("Daily routines") {
                reminder("Morning",time:$draft.morning)
                reminder("Evening",time:$draft.evening)
            }
            Section("Weekly photo check-in") {
                reminder("Photo reminder",time:$draft.photo)
                if draft.photo.enabled {
                    Picker("Day",selection:$draft.weekday) {
                        ForEach(1...7,id:\.self) { day in Text(Calendar.current.weekdaySymbols[day-1]).tag(day) }
                    }
                }
            }
            Section {
                Button(repository.state == .saving ? "Saving…" : "Save reminders") {
                    guard let ticket=api.access.snapshot() else{return}
                    Task { await repository.save(draft,ticket:ticket) }
                }.disabled(repository.state == .saving)
                Text(status).foregroundStyle(CareJournal.textSecondary).accessibilityIdentifier("reminderStatus")
                if repository.state == .denied {
                    Text("Allow notifications for ClearAF in iPhone Settings, then try saving again.")
                }
            }
        }
        .navigationTitle("Reminders")
        .tint(CareJournal.actionPrimary)
        .task {
            if let ticket=api.access.snapshot(){await repository.resume(ticket:ticket)}
            draft=repository.preferences
            await repository.refreshPermission()
        }
    }
    private var status:String {
        switch repository.state {
        case .disabled:return "Reminders are off."
        case .paused:return "Saved preferences. Save to enable reminders."
        case .saving:return "Updating reminders…"
        case .enabled:return "Reminders are scheduled on this device. Times follow your device’s local timezone."
        case .denied:return "Notification permission is off. Reminders are not scheduled."
        case .failed:return "Unable to update reminders. Check your settings and try again."
        }
    }
    @ViewBuilder private func reminder(_ name:String,time:Binding<ReminderTime>) -> some View {
        Toggle(name,isOn:time.enabled)
            .tint(Letterpress.toggleOn)
        if time.wrappedValue.enabled {
            DatePicker("\(name) time",selection:Binding(get:{
                Calendar.current.date(from:DateComponents(hour:time.wrappedValue.hour,minute:time.wrappedValue.minute)) ?? Date()
            },set:{ date in
                time.wrappedValue.hour=Calendar.current.component(.hour,from:date)
                time.wrappedValue.minute=Calendar.current.component(.minute,from:date)
            }),displayedComponents:.hourAndMinute)
        }
    }
}
