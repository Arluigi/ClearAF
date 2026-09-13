import SwiftUI
import UIKit
import CoreData

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var showingRemovalInfo = false
    @State private var name = ""
    @StateObject private var saveState = AccountSaveState()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: .spaceXXL) {
                    VStack(alignment: .leading, spacing: .spaceSM) {
                        Text("Name").font(.headline)
                        TextField("Your name", text: $name, axis: .vertical)
                            .textContentType(.name)
                            .standardTextField()
                            .accessibilityIdentifier("profileName")
                        Button(action: saveName) {
                            HStack {
                                if saveState.isSaving { SwiftUI.ProgressView().tint(.white) }
                                Text(saveState.isSaving ? "Saving…" : "Save name")
                            }.frame(maxWidth: .infinity)
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .accessibilityIdentifier("profileSaveName")
                        .disabled(!validName || saveState.isSaving)
                        if let saveError = saveState.errorMessage {
                            Text(saveError).foregroundStyle(Color.retainedErrorText).accessibilityIdentifier("profileSaveError")
                        }
                        if let saveConfirmation = saveState.successMessage {
                            Text(saveConfirmation).foregroundStyle(Color.textSecondary).accessibilityIdentifier("profileSaveConfirmation")
                        }
                    }
                    VStack(alignment: .leading, spacing: .spaceSM) {
                        Text("Email").font(.headline)
                        Text(APIService.shared.currentUser?.email ?? "Unavailable")
                            .font(.body)
                            .textSelection(.enabled)
                            .accessibilityLabel("Email")
                            .accessibilityValue(APIService.shared.currentUser?.email ?? "Unavailable")
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("profileEmail")
                    }
                    Button("Account removal") { showingRemovalInfo = true }
                        .accessibilityHint("Explains the current account removal process")
                    Button(role: .destructive) { APIService.shared.logout() } label: {
                        Text("Sign out").foregroundStyle(Color.retainedErrorText)
                    }
                        .accessibilityIdentifier("profileSignOut")
                }
                .padding(.spaceXXL)
                .frame(maxWidth: 600, alignment: .leading)
            }
            .navigationTitle("Profile")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: { dismiss() }) { Text("Close").font(.body) }
                        .accessibilityLabel("Close profile")
                }
            }
            .alert("Account removal is not available yet", isPresented: $showingRemovalInfo) {
                Button("OK") {}
            } message: {
                Text("The practice must finalize its record-retention and deletion process before account removal is enabled. Signing out ends access on this device; it does not delete your account or clinical records.")
            }
            .onAppear { name = APIService.shared.currentUser?.name ?? "" }
        }
    }

    private var validName: Bool {
        (2...100).contains(name.trimmingCharacters(in: .whitespacesAndNewlines).count)
    }

    private func saveName() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (2...100).contains(trimmed.count), !saveState.isSaving else { return }
        Task { @MainActor in
            await saveState.perform(success: "Name saved",
                failure: "Your name could not be saved. Check your connection and try again.") {
                try await APIService.shared.updateName(trimmed)
            }
            if saveState.errorMessage == nil {
                name = trimmed
            }
        }
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(.purple)
            
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            
            Text(title)
                .font(.caption)
                .foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(UIColor.systemGray6))
        .cornerRadius(12)
    }
}

struct SettingsRow: View {
    let title: String
    let icon: String
    let action: () -> Void
    @State private var isPressed = false
    
    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundColor(.purple)
                    .frame(width: 24)
                
                Text(title)
                    .font(.body)
                    .foregroundColor(.primary)
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.gray)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isPressed ? Color.gray.opacity(0.2) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
        .scaleEffect(isPressed ? 0.98 : 1.0)
        .onLongPressGesture(minimumDuration: 0, maximumDistance: .infinity, pressing: { pressing in
            withAnimation(.easeInOut(duration: 0.1)) {
                isPressed = pressing
            }
        }, perform: {})
    }
}

// MARK: - Settings Views

struct EditProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    
    @State private var userName: String = ""
    @State private var selectedSkinType: String = "Normal"
    
    let skinTypes = [
        ("Normal", "Balanced, neither too oily nor too dry"),
        ("Dry", "Feels tight, flaky, or rough"),
        ("Oily", "Shiny, greasy, prone to breakouts"),
        ("Combination", "Oily T-zone, dry or normal cheeks"),
        ("Sensitive", "Easily irritated, reacts to products")
    ]
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: .spaceXXL) {
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        VStack(alignment: .leading, spacing: .spaceMD) {
                            Text("Name")
                                .font(.headlineMedium)
                                .foregroundColor(.textPrimary)
                            
                            TextField("Your name", text: $userName)
                                .font(.bodyLarge)
                                .standardTextField()
                        }
                        
                        VStack(alignment: .leading, spacing: .spaceMD) {
                            Text("Skin Type")
                                .font(.headlineMedium)
                                .foregroundColor(.textPrimary)
                            
                            VStack(spacing: .spaceSM) {
                                ForEach(skinTypes, id: \.0) { skinType in
                                    Button(action: {
                                        HapticManager.light()
                                        selectedSkinType = skinType.0
                                    }) {
                                        HStack {
                                            Image(systemName: selectedSkinType == skinType.0 ? "checkmark.circle.fill" : "circle")
                                                .foregroundColor(selectedSkinType == skinType.0 ? .primaryPurple : .textTertiary)
                                            
                                            VStack(alignment: .leading, spacing: .spaceXS) {
                                                Text(skinType.0)
                                                    .font(.bodyLarge)
                                                    .fontWeight(.medium)
                                                    .foregroundColor(.textPrimary)
                                                
                                                Text(skinType.1)
                                                    .font(.bodyMedium)
                                                    .foregroundColor(.textSecondary)
                                            }
                                            
                                            Spacer()
                                        }
                                        .padding(.spaceLG)
                                        .background(
                                            selectedSkinType == skinType.0 ? 
                                            Color.primaryPurple.opacity(0.1) : Color.backgroundSecondary
                                        )
                                        .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
                                    }
                                    .buttonStyle(PlainButtonStyle())
                                }
                            }
                        }
                    }
                }
                .padding(.spaceXXL)
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() },
                trailing: Button("Save") { saveProfile() }
                    .fontWeight(.semibold)
                    .foregroundColor(.primaryPurple)
                    .disabled(!isFormValid)
            )
            .onAppear {
                loadCurrentProfile()
            }
        }
    }
    
    private var isFormValid: Bool {
        !userName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        userName.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
    }
    
    private func loadCurrentProfile() {
        guard let user = users.first else { return }
        userName = user.name ?? ""
        selectedSkinType = user.skinType ?? "Normal"
    }
    
    private func saveProfile() {
        guard let user = users.first else { return }
        
        user.name = userName.trimmingCharacters(in: .whitespacesAndNewlines)
        user.skinType = selectedSkinType
        
        do {
            try viewContext.save()
            HapticManager.success()
            dismiss()
        } catch {
            print("Error saving profile: \(error)")
            HapticManager.error()
        }
    }
}

struct SkinTypeView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    
    @State private var selectedSkinType: String = "Normal"
    @State private var selectedConcerns: Set<String> = []
    
    let skinTypes = [
        ("Normal", "Balanced, neither too oily nor too dry", "face.smiling"),
        ("Dry", "Feels tight, flaky, or rough", "drop"),
        ("Oily", "Shiny, greasy, prone to breakouts", "circle.fill"),
        ("Combination", "Oily T-zone, dry or normal cheeks", "circle.lefthalf.filled"),
        ("Sensitive", "Easily irritated, reacts to products", "exclamationmark.triangle")
    ]
    
    let skinConcerns = [
        ("Acne", "circle.hexagongrid.fill"),
        ("Dark Spots", "circle.dotted"),
        ("Fine Lines", "waveform.path"),
        ("Large Pores", "circle.grid.hex"),
        ("Uneven Tone", "paintpalette"),
        ("Dryness", "drop"),
        ("Oiliness", "circle.fill"),
        ("Sensitivity", "exclamationmark.triangle")
    ]
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: .spaceXXL) {
                    // Skin Type Section
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Skin Type")
                            .font(.headlineLarge)
                            .foregroundColor(.textPrimary)
                        
                        VStack(spacing: .spaceSM) {
                            ForEach(skinTypes, id: \.0) { skinType in
                                Button(action: {
                                    HapticManager.light()
                                    selectedSkinType = skinType.0
                                }) {
                                    HStack(spacing: .spaceLG) {
                                        Image(systemName: skinType.2)
                                            .font(.title2)
                                            .foregroundColor(.primaryPurple)
                                            .frame(width: 30)
                                        
                                        VStack(alignment: .leading, spacing: .spaceXS) {
                                            Text(skinType.0)
                                                .font(.bodyLarge)
                                                .fontWeight(.medium)
                                                .foregroundColor(.textPrimary)
                                            
                                            Text(skinType.1)
                                                .font(.bodyMedium)
                                                .foregroundColor(.textSecondary)
                                        }
                                        
                                        Spacer()
                                        
                                        Image(systemName: selectedSkinType == skinType.0 ? "checkmark.circle.fill" : "circle")
                                            .foregroundColor(selectedSkinType == skinType.0 ? .primaryPurple : .textTertiary)
                                            .font(.title3)
                                    }
                                    .padding(.spaceLG)
                                    .background(
                                        selectedSkinType == skinType.0 ? 
                                        Color.primaryPurple.opacity(0.1) : Color.backgroundSecondary
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
                                }
                                .buttonStyle(PlainButtonStyle())
                            }
                        }
                    }
                    
                    // Skin Concerns Section
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        VStack(alignment: .leading, spacing: .spaceXS) {
                            Text("Skin Concerns")
                                .font(.headlineLarge)
                                .foregroundColor(.textPrimary)
                            
                            Text("Select all that apply (optional)")
                                .font(.bodyMedium)
                                .foregroundColor(.textSecondary)
                        }
                        
                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: .spaceMD) {
                            ForEach(skinConcerns, id: \.0) { concern in
                                Button(action: {
                                    HapticManager.light()
                                    if selectedConcerns.contains(concern.0) {
                                        selectedConcerns.remove(concern.0)
                                    } else {
                                        selectedConcerns.insert(concern.0)
                                    }
                                }) {
                                    VStack(spacing: .spaceMD) {
                                        Image(systemName: concern.1)
                                            .font(.title2)
                                            .foregroundColor(selectedConcerns.contains(concern.0) ? .white : .primaryPurple)
                                        
                                        Text(concern.0)
                                            .font(.bodyMedium)
                                            .fontWeight(.medium)
                                            .foregroundColor(selectedConcerns.contains(concern.0) ? .white : .textPrimary)
                                    }
                                    .frame(maxWidth: .infinity)
                                    .padding(.spaceLG)
                                    .background(
                                        selectedConcerns.contains(concern.0) ? 
                                        Color.primaryPurple : Color.backgroundSecondary
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
                                }
                                .buttonStyle(PlainButtonStyle())
                            }
                        }
                    }
                }
                .padding(.spaceXXL)
            }
            .navigationTitle("Skin Type & Concerns")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() },
                trailing: Button("Save") { saveSkinInfo() }
                    .fontWeight(.semibold)
                    .foregroundColor(.primaryPurple)
            )
            .onAppear {
                loadCurrentSkinInfo()
            }
        }
    }
    
    private func loadCurrentSkinInfo() {
        guard let user = users.first else { return }
        selectedSkinType = user.skinType ?? "Normal"
        // Load skin concerns from user data if stored
    }
    
    private func saveSkinInfo() {
        guard let user = users.first else { return }
        
        user.skinType = selectedSkinType
        // Save skin concerns to user data
        
        do {
            try viewContext.save()
            HapticManager.success()
            dismiss()
        } catch {
            print("Error saving skin info: \(error)")
            HapticManager.error()
        }
    }
}

struct NotificationSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var morningReminder = true
    @State private var eveningReminder = true
    @State private var photoReminder = true
    @State private var weeklyProgress = false
    @State private var milestoneAlerts = true
    @State private var morningTime = Date()
    @State private var eveningTime = Date()
    @State private var photoTime = Date()
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: .spaceXXL) {
                    // Routine Reminders Section
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Routine Reminders")
                            .font(.headlineLarge)
                            .foregroundColor(.textPrimary)
                        
                        VStack(spacing: .spaceLG) {
                            NotificationToggle(
                                title: "Morning Routine",
                                subtitle: "Remind me to complete my morning routine",
                                icon: "sun.max",
                                isOn: $morningReminder
                            )
                            
                            if morningReminder {
                                HStack {
                                    Text("Time:")
                                        .font(.bodyMedium)
                                        .foregroundColor(.textSecondary)
                                    Spacer()
                                    DatePicker("", selection: $morningTime, displayedComponents: .hourAndMinute)
                                        .labelsHidden()
                                }
                                .padding(.leading, 44)
                            }
                            
                            NotificationToggle(
                                title: "Evening Routine",
                                subtitle: "Remind me to complete my evening routine",
                                icon: "moon",
                                isOn: $eveningReminder
                            )
                            
                            if eveningReminder {
                                HStack {
                                    Text("Time:")
                                        .font(.bodyMedium)
                                        .foregroundColor(.textSecondary)
                                    Spacer()
                                    DatePicker("", selection: $eveningTime, displayedComponents: .hourAndMinute)
                                        .labelsHidden()
                                }
                                .padding(.leading, 44)
                            }
                        }
                    }
                    
                    // Progress Tracking Section
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Progress Tracking")
                            .font(.headlineLarge)
                            .foregroundColor(.textPrimary)
                        
                        VStack(spacing: .spaceLG) {
                            NotificationToggle(
                                title: "Daily Photo",
                                subtitle: "Remind me to take my progress photo",
                                icon: "camera",
                                isOn: $photoReminder
                            )
                            
                            if photoReminder {
                                HStack {
                                    Text("Time:")
                                        .font(.bodyMedium)
                                        .foregroundColor(.textSecondary)
                                    Spacer()
                                    DatePicker("", selection: $photoTime, displayedComponents: .hourAndMinute)
                                        .labelsHidden()
                                }
                                .padding(.leading, 44)
                            }
                            
                            NotificationToggle(
                                title: "Weekly Progress",
                                subtitle: "Weekly summary of my skin journey",
                                icon: "chart.line.uptrend.xyaxis",
                                isOn: $weeklyProgress
                            )
                        }
                    }
                    
                    // Milestone Alerts Section
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Achievements")
                            .font(.headlineLarge)
                            .foregroundColor(.textPrimary)
                        
                        NotificationToggle(
                            title: "Milestone Alerts",
                            subtitle: "Celebrate streaks and achievements",
                            icon: "star",
                            isOn: $milestoneAlerts
                        )
                    }
                    
                    // Permission Note
                    VStack(spacing: .spaceMD) {
                        HStack(spacing: .spaceMD) {
                            Image(systemName: "info.circle")
                                .foregroundColor(.primaryPurple)
                            
                            Text("Notifications require permission in your device settings")
                                .font(.bodyMedium)
                                .foregroundColor(.textSecondary)
                        }
                        
                        Button(action: {
                            HapticManager.light()
                            if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(settingsUrl)
                            }
                        }) {
                            Text("Open Settings")
                                .font(.bodyMedium)
                                .fontWeight(.medium)
                                .foregroundColor(.primaryPurple)
                        }
                    }
                    .wellnessCard(style: .flat)
                }
                .padding(.spaceXXL)
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() },
                trailing: Button("Save") { saveNotificationSettings() }
                    .fontWeight(.semibold)
                    .foregroundColor(.primaryPurple)
            )
            .onAppear {
                loadNotificationSettings()
            }
        }
    }
    
    private func loadNotificationSettings() {
        guard let id = APIService.shared.access.snapshot()?.accountID else { return }
        let preferences = AccountPreferences(accountID: id)
        // Load current notification settings from UserDefaults
        morningReminder = preferences.bool(forKey: "morningReminder")
        eveningReminder = preferences.bool(forKey: "eveningReminder")
        photoReminder = preferences.bool(forKey: "photoReminder")
        weeklyProgress = preferences.bool(forKey: "weeklyProgress")
        milestoneAlerts = preferences.bool(forKey: "milestoneAlerts")
    }
    
    private func saveNotificationSettings() {
        guard let id = APIService.shared.access.snapshot()?.accountID else { return }
        let preferences = AccountPreferences(accountID: id)
        preferences.set(morningReminder, forKey: "morningReminder")
        preferences.set(eveningReminder, forKey: "eveningReminder")
        preferences.set(photoReminder, forKey: "photoReminder")
        preferences.set(weeklyProgress, forKey: "weeklyProgress")
        preferences.set(milestoneAlerts, forKey: "milestoneAlerts")
        
        HapticManager.success()
        dismiss()
    }
}

struct NotificationToggle: View {
    let title: String
    let subtitle: String
    let icon: String
    @Binding var isOn: Bool
    
    var body: some View {
        HStack(spacing: .spaceLG) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(.primaryPurple)
                .frame(width: 30)
            
            VStack(alignment: .leading, spacing: .spaceXS) {
                Text(title)
                    .font(.bodyLarge)
                    .fontWeight(.medium)
                    .foregroundColor(.textPrimary)
                
                Text(subtitle)
                    .font(.bodyMedium)
                    .foregroundColor(.textSecondary)
            }
            
            Spacer()
            
            Toggle("", isOn: $isOn)
                .labelsHidden()
                .scaleEffect(0.9)
                .onChange(of: isOn) { _, _ in
                    HapticManager.light()
                }
        }
        .padding(.spaceLG)
        .background(Color.backgroundSecondary)
        .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
    }
}

struct ExportDataView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: SkinPhoto.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \SkinPhoto.captureDate, ascending: false)],
        animation: .default)
    private var photos: FetchedResults<SkinPhoto>
    
    @FetchRequest(
        entity: Routine.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \Routine.timeOfDay, ascending: true)],
        animation: .default)
    private var routines: FetchedResults<Routine>
    
    @State private var showingShareSheet = false
    @State private var exportText = ""
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: .spaceXXL) {
                    // Export Options
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Export Your Data")
                            .font(.headlineLarge)
                            .foregroundColor(.textPrimary)
                        
                        Text("Download your skincare journey data for backup or analysis")
                            .font(.bodyMedium)
                            .foregroundColor(.textSecondary)
                        
                        VStack(spacing: .spaceLG) {
                            ExportOption(
                                title: "Progress Summary",
                                subtitle: "Export skin scores and photo dates",
                                icon: "chart.line.uptrend.xyaxis",
                                action: { exportProgressData() }
                            )
                            
                            ExportOption(
                                title: "Legacy Local Routines",
                                subtitle: "Export older routines stored on this device; clinician assignments are not included",
                                icon: "list.bullet",
                                action: { exportRoutineData() }
                            )
                            
                            ExportOption(
                                title: "Complete Backup",
                                subtitle: "Export all your ClearAF data",
                                icon: "folder",
                                action: { exportAllData() }
                            )
                        }
                    }
                    
                    // Data Summary
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Your Data")
                            .font(.headlineLarge)
                            .foregroundColor(.textPrimary)
                        
                        VStack(spacing: .spaceMD) {
                            DataSummaryRow(icon: "photo", title: "Progress Photos", count: "\(photos.count)")
                            DataSummaryRow(icon: "list.bullet", title: "Legacy Local Routines", count: "\(routines.count)")
                            DataSummaryRow(icon: "calendar", title: "Days Tracked", count: calculateDaysTracked())
                        }
                        .wellnessCard(style: .flat)
                    }
                }
                .padding(.spaceXXL)
            }
            .navigationTitle("Export Data")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(trailing: 
                Button("Done") { dismiss() }
            )
            .sheet(isPresented: $showingShareSheet) {
                ShareSheet(items: [exportText])
            }
        }
    }
    
    private func exportProgressData() {
        var csvContent = "Date,Skin Score,Notes\n"
        
        for photo in photos {
            let dateFormatter = DateFormatter()
            dateFormatter.dateFormat = "yyyy-MM-dd"
            let dateString = dateFormatter.string(from: photo.captureDate ?? Date())
            let notes = photo.notes?.replacingOccurrences(of: ",", with: ";") ?? ""
            csvContent += "\(dateString),\(photo.skinScore),\"\(notes)\"\n"
        }
        
        exportText = csvContent
        showingShareSheet = true
        HapticManager.success()
    }
    
    private func exportRoutineData() {
        var jsonContent = "{\n  \"legacyLocalRoutines\": [\n"
        
        for (index, routine) in routines.enumerated() {
            jsonContent += "    {\n"
            jsonContent += "      \"name\": \"\(routine.name ?? "")\",\n"
            jsonContent += "      \"timeOfDay\": \"\(routine.timeOfDay ?? "")\",\n"
            jsonContent += "      \"isActive\": \(routine.isActive),\n"
            jsonContent += "      \"steps\": [\n"
            
            if let steps = routine.steps?.allObjects as? [RoutineStep] {
                let sortedSteps = steps.sorted { $0.orderIndex < $1.orderIndex }
                for (stepIndex, step) in sortedSteps.enumerated() {
                    jsonContent += "        {\n"
                    jsonContent += "          \"productName\": \"\(step.productName ?? "")\",\n"
                    jsonContent += "          \"productType\": \"\(step.productType ?? "")\",\n"
                    jsonContent += "          \"instructions\": \"\(step.instructions ?? "")\",\n"
                    jsonContent += "          \"duration\": \(step.duration)\n"
                    jsonContent += "        }"
                    if stepIndex < sortedSteps.count - 1 { jsonContent += "," }
                    jsonContent += "\n"
                }
            }
            
            jsonContent += "      ]\n"
            jsonContent += "    }"
            if index < routines.count - 1 { jsonContent += "," }
            jsonContent += "\n"
        }
        
        jsonContent += "  ]\n}"
        
        exportText = jsonContent
        showingShareSheet = true
        HapticManager.success()
    }
    
    private func exportAllData() {
        exportProgressData()
        // Combine with routine data in a comprehensive export
        HapticManager.success()
    }
    
    private func calculateDaysTracked() -> String {
        guard let firstPhoto = photos.last?.captureDate else { return "0" }
        let daysSince = Calendar.current.dateComponents([.day], from: firstPhoto, to: Date()).day ?? 0
        return "\(daysSince)"
    }
}

struct ExportOption: View {
    let title: String
    let subtitle: String
    let icon: String
    let action: () -> Void
    
    var body: some View {
        Button(action: {
            HapticManager.light()
            action()
        }) {
            HStack(spacing: .spaceLG) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(.primaryPurple)
                    .frame(width: 30)
                
                VStack(alignment: .leading, spacing: .spaceXS) {
                    Text(title)
                        .font(.bodyLarge)
                        .fontWeight(.medium)
                        .foregroundColor(.textPrimary)
                    
                    Text(subtitle)
                        .font(.bodyMedium)
                        .foregroundColor(.textSecondary)
                }
                
                Spacer()
                
                Image(systemName: "square.and.arrow.up")
                    .font(.title3)
                    .foregroundColor(.textTertiary)
            }
            .padding(.spaceLG)
            .background(Color.backgroundSecondary)
            .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
        }
        .buttonStyle(PlainButtonStyle())
    }
}

struct DataSummaryRow: View {
    let icon: String
    let title: String
    let count: String
    
    var body: some View {
        HStack(spacing: .spaceMD) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(.primaryPurple)
                .frame(width: 24)
            
            Text(title)
                .font(.bodyMedium)
                .foregroundColor(.textPrimary)
            
            Spacer()
            
            Text(count)
                .font(.bodyMedium)
                .fontWeight(.semibold)
                .foregroundColor(.textSecondary)
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        return controller
    }
    
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct HelpSupportView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: .spaceXXL) {
                    // Getting Started Section
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Getting Started")
                            .font(.headlineLarge)
                            .foregroundColor(.textPrimary)
                        
                        VStack(spacing: .spaceLG) {
                            HelpItem(
                                icon: "camera.fill",
                                title: "Taking Progress Photos",
                                content: "For best results, take photos in consistent lighting at the same time each day. Use the front camera and try to keep the same angle and expression."
                            )
                            
                            HelpItem(
                                icon: "list.bullet",
                                title: "Assigned Routines",
                                content: "Your clinician assigns and updates morning and evening routines. Review the ordered steps in Routines, then record completion. Pending completions stay on this device until they sync. Contact your clinician about changes."
                            )
                            
                            HelpItem(
                                icon: "chart.line.uptrend.xyaxis",
                                title: "Tracking Progress",
                                content: "Rate your skin condition after each photo on a scale of 0-100. Your timeline will show progress over time with detailed graphs and insights."
                            )
                        }
                    }
                    
                    // Troubleshooting Section
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Common Questions")
                            .font(.headlineLarge)
                            .foregroundColor(.textPrimary)
                        
                        VStack(spacing: .spaceLG) {
                            HelpItem(
                                icon: "exclamationmark.triangle",
                                title: "Camera Not Working",
                                content: "Make sure ClearAF has camera permission in your device settings. Restart the app if issues persist."
                            )
                            
                            HelpItem(
                                icon: "clock",
                                title: "Setting Up Reminders",
                                content: "Go to Profile > Notifications to set up routine reminders and photo alerts. You'll need to allow notifications in your device settings."
                            )
                            
                            HelpItem(
                                icon: "square.and.arrow.up",
                                title: "Backing Up Data",
                                content: "Use the Export Data feature in your profile to export progress records and legacy local routines as CSV or JSON files. Current clinician assignments and their completion history are not part of the legacy routine export."
                            )
                        }
                    }
                    
                    // Contact Section
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Still Need Help?")
                            .font(.headlineLarge)
                            .foregroundColor(.textPrimary)
                        
                        VStack(spacing: .spaceMD) {
                            Button(action: {
                                HapticManager.light()
                                if let url = URL(string: "mailto:support@clearaf.app?subject=ClearAF%20Support") {
                                    UIApplication.shared.open(url)
                                }
                            }) {
                                HStack(spacing: .spaceMD) {
                                    Image(systemName: "envelope.fill")
                                        .foregroundColor(.primaryPurple)
                                    
                                    VStack(alignment: .leading, spacing: .spaceXS) {
                                        Text("Email Support")
                                            .font(.bodyLarge)
                                            .fontWeight(.medium)
                                            .foregroundColor(.textPrimary)
                                        
                                        Text("Get help from our support team")
                                            .font(.bodyMedium)
                                            .foregroundColor(.textSecondary)
                                    }
                                    
                                    Spacer()
                                    
                                    Image(systemName: "arrow.up.right")
                                        .foregroundColor(.textTertiary)
                                }
                                .padding(.spaceLG)
                                .background(Color.backgroundSecondary)
                                .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
                            }
                            .buttonStyle(PlainButtonStyle())
                            
                            Text("App Version: 1.0\nBuilt with ❤️ for clear skin")
                                .font(.captionLarge)
                                .foregroundColor(.textSecondary)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                        }
                        .wellnessCard(style: .flat)
                    }
                }
                .padding(.spaceXXL)
            }
            .navigationTitle("Help & Support")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(trailing: 
                Button("Done") { dismiss() }
            )
        }
    }
}

struct HelpItem: View {
    let icon: String
    let title: String
    let content: String
    @State private var isExpanded = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceMD) {
            Button(action: {
                HapticManager.light()
                withAnimation(.bouncy) {
                    isExpanded.toggle()
                }
            }) {
                HStack(spacing: .spaceMD) {
                    Image(systemName: icon)
                        .font(.title3)
                        .foregroundColor(.primaryPurple)
                        .frame(width: 24)
                    
                    Text(title)
                        .font(.bodyLarge)
                        .fontWeight(.medium)
                        .foregroundColor(.textPrimary)
                    
                    Spacer()
                    
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption)
                        .foregroundColor(.textTertiary)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                        .animation(.bouncy, value: isExpanded)
                }
            }
            .buttonStyle(PlainButtonStyle())
            
            if isExpanded {
                Text(content)
                    .font(.bodyMedium)
                    .foregroundColor(.textSecondary)
                    .padding(.leading, 36)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .padding(.spaceLG)
        .background(Color.backgroundSecondary)
        .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
    }
}

struct PrivacyPolicyView: View {
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: .spaceXXL) {
                    // Header
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Privacy Policy")
                            .font(.displayMedium)
                            .fontWeight(.bold)
                            .foregroundColor(.textPrimary)
                        
                        Text("Last updated: \(formattedDate)")
                            .font(.bodyMedium)
                            .foregroundColor(.textSecondary)
                    }
                    
                    // Data Collection Section
                    PrivacySection(
                        title: "Data We Collect",
                        icon: "doc.text",
                        content: "Clear AF collects only the data necessary to provide you with the best skincare tracking experience:\n\n• Photos you choose to upload for progress tracking\n• Routine information and preferences you set\n• Skin scores and notes you enter\n• Usage data to improve the app experience"
                    )
                    
                    // Data Usage Section
                    PrivacySection(
                        title: "How We Use Your Data",
                        icon: "gearshape",
                        content: "Your data is used exclusively to:\n\n• Track your skincare progress and routines\n• Provide personalized insights and recommendations\n• Sync your data across your devices\n• Improve our app features and user experience\n\nWe never sell your personal data to third parties."
                    )
                    
                    // Data Security Section
                    PrivacySection(
                        title: "Data Security",
                        icon: "lock.shield",
                        content: "Your privacy and security are our top priorities:\n\n• All data is encrypted in transit and at rest\n• Photos are stored securely on your device and our servers\n• We use industry-standard security measures\n• Regular security audits and updates"
                    )
                    
                    // Data Control Section
                    PrivacySection(
                        title: "Your Data Rights",
                        icon: "person.badge.shield.checkmark",
                        content: "You have complete control over your data:\n\n• Export all your data at any time\n• Delete your account and data permanently\n• Opt out of data collection features\n• Contact us for data access requests"
                    )
                    
                    // Contact Section
                    VStack(alignment: .leading, spacing: .spaceLG) {
                        Text("Questions?")
                            .font(.headlineLarge)
                            .fontWeight(.semibold)
                            .foregroundColor(.textPrimary)
                        
                        VStack(spacing: .spaceMD) {
                            HStack(spacing: .spaceMD) {
                                Image(systemName: "envelope")
                                    .foregroundColor(.primaryPurple)
                                
                                Text("Email us at privacy@clearaf.app")
                                    .font(.bodyMedium)
                                    .foregroundColor(.textSecondary)
                            }
                            
                            Button(action: {
                                HapticManager.light()
                                if let url = URL(string: "mailto:privacy@clearaf.app") {
                                    UIApplication.shared.open(url)
                                }
                            }) {
                                Text("Contact Privacy Team")
                                    .font(.bodyMedium)
                                    .fontWeight(.medium)
                                    .foregroundColor(.primaryPurple)
                            }
                        }
                        .wellnessCard(style: .flat)
                    }
                }
                .padding(.spaceXXL)
            }
            .navigationTitle("Privacy Policy")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(trailing: 
                Button("Done") { 
                    HapticManager.light()
                    dismiss() 
                }
                .fontWeight(.semibold)
                .foregroundColor(.primaryPurple)
            )
        }
    }
    
    private var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        return formatter.string(from: Date())
    }
}

struct PrivacySection: View {
    let title: String
    let icon: String
    let content: String
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceLG) {
            HStack(spacing: .spaceMD) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(.primaryPurple)
                    .frame(width: 30)
                
                Text(title)
                    .font(.headlineLarge)
                    .fontWeight(.semibold)
                    .foregroundColor(.textPrimary)
            }
            
            Text(content)
                .font(.bodyMedium)
                .foregroundColor(.textSecondary)
                .lineSpacing(4)
        }
        .wellnessCard(style: .flat)
    }
}

// MARK: - Enhanced Profile Components

struct EnhancedStatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color
    
    var body: some View {
        VStack(spacing: .spaceMD) {
            ZStack {
                Circle()
                    .fill(color.opacity(0.2))
                    .frame(width: 60, height: 60)
                
                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundColor(color)
            }
            
            VStack(spacing: .spaceXS) {
                Text(value)
                    .font(.headlineLarge)
                    .fontWeight(.bold)
                    .foregroundColor(.textPrimary)
                
                Text(title)
                    .font(.captionLarge)
                    .foregroundColor(.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .wellnessCard(style: .elevated)
    }
}

#Preview {
    ProfileView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
        .preferredColorScheme(.dark)
}
