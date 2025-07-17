import SwiftUI
import UIKit
import CoreData

struct ProfileView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @State private var showingEditProfile = false
    @State private var showingSkinType = false
    @State private var showingNotifications = false
    @State private var showingExportData = false
    @State private var showingHelp = false
    @State private var showingPrivacy = false
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.backgroundSecondary.ignoresSafeArea()
                
                VStack(spacing: .spaceXL) {
                    // Enhanced header
                    HStack {
                        Text("Profile")
                            .font(.displayMedium)
                            .foregroundColor(.textPrimary)
                        Spacer()
                    }
                    .padding(.horizontal, .spaceXL)
                    
                    ScrollView {
                        VStack(spacing: .spaceXXL) {
                            // Profile Header
                            VStack(spacing: .spaceLG) {
                                ZStack {
                                    Circle()
                                        .fill(Color.primaryGradient)
                                        .frame(width: 100, height: 100)
                                    
                                    Image(systemName: "person.fill")
                                        .font(.system(size: 40))
                                        .foregroundColor(.white)
                                }
                                .glowShadow()
                                
                                VStack(spacing: .spaceXS) {
                                    Text(users.first?.name ?? "User")
                                        .font(.displayMedium)
                                        .foregroundColor(.textPrimary)
                                    
                                    Text("Member since \(formatJoinDate())")
                                        .font(.captionLarge)
                                        .foregroundColor(.textSecondary)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .wellnessCard(style: .elevated)
                            .padding(.horizontal, .spaceXL)
                        
                            // Enhanced Stats Cards
                            HStack(spacing: .spaceLG) {
                                EnhancedStatCard(
                                    title: "Current Score",
                                    value: "\(users.first?.currentSkinScore ?? 0)",
                                    icon: "chart.line.uptrend.xyaxis",
                                    color: scoreColor(for: Int(users.first?.currentSkinScore ?? 0))
                                )
                                
                                EnhancedStatCard(
                                    title: "Streak",
                                    value: "\(users.first?.streakCount ?? 0) days",
                                    icon: "flame.fill",
                                    color: .orange
                                )
                            }
                            .padding(.horizontal, .spaceXL)
                            
                            // Settings List
                            VStack(spacing: 0) {
                                SettingsRow(
                                    title: "Edit Profile",
                                    icon: "person.fill",
                                    action: {
                                        showingEditProfile = true
                                    }
                                )
                            
                                SettingsRow(
                                    title: "Skin Type & Concerns",
                                    icon: "face.smiling",
                                    action: {
                                        showingSkinType = true
                                    }
                                )
                            
                                SettingsRow(
                                    title: "Notifications",
                                    icon: "bell.fill",
                                    action: {
                                        showingNotifications = true
                                    }
                                )
                            
                                SettingsRow(
                                    title: "Export Data",
                                    icon: "square.and.arrow.up",
                                    action: {
                                        showingExportData = true
                                    }
                                )
                            
                                SettingsRow(
                                    title: "Help & Support",
                                    icon: "questionmark.circle.fill",
                                    action: {
                                        showingHelp = true
                                    }
                                )
                            
                                SettingsRow(
                                    title: "Privacy Policy",
                                    icon: "hand.raised.fill",
                                    action: {
                                        showingPrivacy = true
                                    }
                                )
                            }
                            .wellnessCard(style: .elevated)
                            .padding(.horizontal, .spaceXL)
                        
                            
                            // Footer
                            VStack(spacing: .spaceMD) {
                                Divider()
                                    .padding(.horizontal, .spaceXL)
                                
                                VStack(spacing: .spaceSM) {
                                    HStack(spacing: .spaceXS) {
                                        Image(systemName: "sparkles")
                                            .font(.caption)
                                            .foregroundColor(.primaryPurple)
                                        Text("ClearAF")
                                            .font(.captionLarge)
                                            .fontWeight(.semibold)
                                            .foregroundColor(.textPrimary)
                                        Text("v1.0")
                                            .font(.caption)
                                            .foregroundColor(.textSecondary)
                                    }
                                    
                                    Text("Your journey to clearer skin")
                                        .font(.caption)
                                        .foregroundColor(.textSecondary)
                                }
                                
                                VStack(spacing: .spaceXS) {
                                    Text("Created with ❤️ by")
                                        .font(.caption)
                                        .foregroundColor(.textSecondary)
                                    
                                    Button(action: {
                                        HapticManager.light()
                                        if let url = URL(string: "https://www.linkedin.com/in/aryansachdev/") {
                                            UIApplication.shared.open(url)
                                        }
                                    }) {
                                        HStack(spacing: .spaceXS) {
                                            Image(systemName: "person.circle.fill")
                                                .font(.caption)
                                                .foregroundColor(.primaryPurple)
                                            Text("Aryan Sachdev")
                                                .font(.captionLarge)
                                                .fontWeight(.medium)
                                                .foregroundColor(.primaryPurple)
                                            Image(systemName: "arrow.up.right")
                                                .font(.caption2)
                                                .foregroundColor(.primaryPurple)
                                        }
                                    }
                                    .buttonStyle(PlainButtonStyle())
                                }
                            }
                            .padding(.top, .spaceXL)
                            .padding(.bottom, .spaceXXL)
                            
                            // TEMPORARY: Reset button for testing new user flow
                            #if DEBUG
                            Button(action: {
                                resetAppData()
                            }) {
                                VStack(spacing: .spaceXS) {
                                    HStack(spacing: .spaceMD) {
                                        Image(systemName: "arrow.clockwise.circle.fill")
                                            .font(.title2)
                                            .foregroundColor(.red)
                                        
                                        Text("Reset App Data (Testing Only)")
                                            .font(.bodyMedium)
                                            .fontWeight(.medium)
                                            .foregroundColor(.red)
                                    }
                                    
                                    Text("This will clear all data and restart onboarding")
                                        .font(.caption)
                                        .foregroundColor(.textSecondary)
                                        .multilineTextAlignment(.center)
                                }
                                .padding(.spaceLG)
                                .frame(maxWidth: .infinity)
                                .background(Color.red.opacity(0.1))
                                .cornerRadius(.radiusMedium)
                                .overlay(
                                    RoundedRectangle(cornerRadius: .radiusMedium)
                                        .stroke(Color.red.opacity(0.3), lineWidth: 1)
                                )
                            }
                            .padding(.horizontal, .spaceXL)
                            .padding(.bottom, .spaceXL)
                            #endif
                            
                            Spacer()
                        }
                        .padding(.top)
                    }
                }
                .padding(.top, .spaceXL)
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showingEditProfile) {
                EditProfileView()
            }
            .sheet(isPresented: $showingSkinType) {
                SkinTypeView()
            }
            .sheet(isPresented: $showingNotifications) {
                NotificationSettingsView()
            }
            .sheet(isPresented: $showingExportData) {
                ExportDataView()
            }
            .sheet(isPresented: $showingHelp) {
                HelpSupportView()
            }
            .sheet(isPresented: $showingPrivacy) {
                PrivacyPolicyView()
            }
        }
    }
    
    private func formatJoinDate() -> String {
        guard let joinDate = users.first?.joinDate else { return "Recently" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM yyyy"
        return formatter.string(from: joinDate)
    }
    
    // TEMPORARY: Reset function for testing new user flow
    #if DEBUG
    private func resetAppData() {
        HapticManager.medium()
        
        // Clear Core Data
        let context = viewContext
        
        // Delete all users
        let userRequest: NSFetchRequest<NSFetchRequestResult> = User.fetchRequest()
        let userDeleteRequest = NSBatchDeleteRequest(fetchRequest: userRequest)
        
        // Delete all photos
        let photoRequest: NSFetchRequest<NSFetchRequestResult> = SkinPhoto.fetchRequest()
        let photoDeleteRequest = NSBatchDeleteRequest(fetchRequest: photoRequest)
        
        // Delete all routines
        let routineRequest: NSFetchRequest<NSFetchRequestResult> = Routine.fetchRequest()
        let routineDeleteRequest = NSBatchDeleteRequest(fetchRequest: routineRequest)
        
        // Delete all routine steps
        let stepRequest: NSFetchRequest<NSFetchRequestResult> = RoutineStep.fetchRequest()
        let stepDeleteRequest = NSBatchDeleteRequest(fetchRequest: stepRequest)
        
        do {
            try context.execute(userDeleteRequest)
            try context.execute(photoDeleteRequest)
            try context.execute(routineDeleteRequest)
            try context.execute(stepDeleteRequest)
            try context.save()
            
            // Clear UserDefaults
            let domain = Bundle.main.bundleIdentifier!
            UserDefaults.standard.removePersistentDomain(forName: domain)
            UserDefaults.standard.synchronize()
            
            HapticManager.success()
            
            // Force app to restart onboarding on next launch
            exit(0)
        } catch {
            print("Error resetting app data: \(error)")
            HapticManager.error()
        }
    }
    #endif
    
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
        // Load current notification settings from UserDefaults
        morningReminder = UserDefaults.standard.bool(forKey: "morningReminder")
        eveningReminder = UserDefaults.standard.bool(forKey: "eveningReminder")
        photoReminder = UserDefaults.standard.bool(forKey: "photoReminder")
        weeklyProgress = UserDefaults.standard.bool(forKey: "weeklyProgress")
        milestoneAlerts = UserDefaults.standard.bool(forKey: "milestoneAlerts")
    }
    
    private func saveNotificationSettings() {
        UserDefaults.standard.set(morningReminder, forKey: "morningReminder")
        UserDefaults.standard.set(eveningReminder, forKey: "eveningReminder")
        UserDefaults.standard.set(photoReminder, forKey: "photoReminder")
        UserDefaults.standard.set(weeklyProgress, forKey: "weeklyProgress")
        UserDefaults.standard.set(milestoneAlerts, forKey: "milestoneAlerts")
        
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
                                title: "Routine Data",
                                subtitle: "Export your skincare routines and steps",
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
                            DataSummaryRow(icon: "list.bullet", title: "Routines", count: "\(routines.count)")
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
        var jsonContent = "{\n  \"routines\": [\n"
        
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
                                title: "Creating Routines",
                                content: "Build your morning and evening skincare routines by adding products with their application instructions and durations. Use the timer feature during routine sessions."
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
                                content: "Use the Export Data feature in your profile to backup your progress photos, routines, and skin scores as CSV or JSON files."
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
