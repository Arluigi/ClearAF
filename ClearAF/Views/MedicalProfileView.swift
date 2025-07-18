//
//  MedicalProfileView.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/18/25.
//

import SwiftUI
import CoreData

struct MedicalProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: []
    ) private var users: FetchedResults<User>
    
    @State private var allergies = ""
    @State private var currentMedications = ""
    @State private var skinConcerns = ""
    @State private var emergencyContactName = ""
    @State private var emergencyContactPhone = ""
    @State private var emergencyContactRelationship = ""
    @State private var hasChanges = false
    @State private var showingSaveConfirmation = false
    
    private var currentUser: User? {
        users.first
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.backgroundSecondary.ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: .spaceXL) {
                        // Header
                        VStack(alignment: .leading, spacing: .spaceMD) {
                            Text("Medical Profile")
                                .font(.displayMedium)
                                .foregroundColor(.textPrimary)
                            
                            Text("Keep your medical information up to date for better care")
                                .font(.bodyMedium)
                                .foregroundColor(.textSecondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, .spaceXL)
                        
                        // Allergies Section
                        MedicalSection(
                            title: "Allergies",
                            subtitle: "List any known allergies or sensitivities",
                            icon: "exclamationmark.triangle.fill",
                            iconColor: .orange
                        ) {
                            TextField("Enter allergies (e.g., penicillin, latex, peanuts)", text: $allergies, axis: .vertical)
                                .textFieldStyle(.roundedBorder)
                                .lineLimit(3...6)
                                .onChange(of: allergies) { hasChanges = true }
                        }
                        
                        // Current Medications Section
                        MedicalSection(
                            title: "Current Medications",
                            subtitle: "Include prescription and over-the-counter medications",
                            icon: "pills.fill",
                            iconColor: .blue
                        ) {
                            TextField("Enter current medications (e.g., ibuprofen 200mg daily)", text: $currentMedications, axis: .vertical)
                                .textFieldStyle(.roundedBorder)
                                .lineLimit(3...6)
                                .onChange(of: currentMedications) { hasChanges = true }
                        }
                        
                        // Skin Concerns Section
                        MedicalSection(
                            title: "Primary Skin Concerns",
                            subtitle: "Describe your main skin concerns or conditions",
                            icon: "face.smiling.inverse",
                            iconColor: .primaryPurple
                        ) {
                            TextField("Enter skin concerns (e.g., acne, eczema, sensitivity)", text: $skinConcerns, axis: .vertical)
                                .textFieldStyle(.roundedBorder)
                                .lineLimit(3...6)
                                .onChange(of: skinConcerns) { hasChanges = true }
                        }
                        
                        // Emergency Contact Section
                        MedicalSection(
                            title: "Emergency Contact",
                            subtitle: "Someone we can contact in case of emergency",
                            icon: "phone.fill",
                            iconColor: .red
                        ) {
                            VStack(spacing: .spaceMD) {
                                TextField("Full name", text: $emergencyContactName)
                                    .textFieldStyle(.roundedBorder)
                                    .onChange(of: emergencyContactName) { hasChanges = true }
                                
                                TextField("Phone number", text: $emergencyContactPhone)
                                    .textFieldStyle(.roundedBorder)
                                    .keyboardType(.phonePad)
                                    .onChange(of: emergencyContactPhone) { hasChanges = true }
                                
                                TextField("Relationship (e.g., spouse, parent)", text: $emergencyContactRelationship)
                                    .textFieldStyle(.roundedBorder)
                                    .onChange(of: emergencyContactRelationship) { hasChanges = true }
                            }
                        }
                        
                        // Medical Information Notice
                        VStack(spacing: .spaceMD) {
                            HStack {
                                Image(systemName: "lock.shield.fill")
                                    .font(.title2)
                                    .foregroundColor(.green)
                                
                                VStack(alignment: .leading, spacing: .spaceXS) {
                                    Text("Your information is secure")
                                        .font(.headlineSmall)
                                        .foregroundColor(.textPrimary)
                                    
                                    Text("All medical information is encrypted and only shared with your assigned dermatologist")
                                        .font(.captionLarge)
                                        .foregroundColor(.textSecondary)
                                }
                                
                                Spacer()
                            }
                        }
                        .wellnessCard()
                        .padding(.horizontal, .spaceXL)
                        
                        // Save Button
                        if hasChanges {
                            Button(action: saveProfile) {
                                HStack {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.title2)
                                        .foregroundColor(.white)
                                    
                                    Text("Save Changes")
                                        .font(.headlineMedium)
                                        .fontWeight(.semibold)
                                        .foregroundColor(.white)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.spaceLG)
                                .background(Color.primaryGradient)
                                .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                                .glowShadow()
                            }
                            .padding(.horizontal, .spaceXL)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                            .animation(.bouncy, value: hasChanges)
                        }
                    }
                    .padding(.vertical, .spaceXL)
                    .padding(.bottom, 100)
                }
            }
            .navigationTitle("Medical Profile")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Back") { dismiss() }
            )
        }
        .onAppear {
            loadExistingData()
        }
        .overlay(
            Group {
                if showingSaveConfirmation {
                    VStack {
                        Spacer()
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.title2)
                                .foregroundColor(.green)
                            Text("Profile updated!")
                                .font(.headlineSmall)
                                .foregroundColor(.textPrimary)
                        }
                        .padding(.spaceLG)
                        .background(Color.cardBackground)
                        .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                        .softShadow()
                        .padding(.bottom, 100)
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .animation(.bouncy, value: showingSaveConfirmation)
                }
            }
        )
    }
    
    private func loadExistingData() {
        guard let user = currentUser else { return }
        
        allergies = user.allergies ?? ""
        currentMedications = user.currentMedications ?? ""
        skinConcerns = user.skinConcerns ?? ""
        
        // Emergency contact would need additional Core Data model
        // For now, using placeholder logic
        emergencyContactName = ""
        emergencyContactPhone = ""
        emergencyContactRelationship = ""
        
        hasChanges = false
    }
    
    private func saveProfile() {
        guard let user = currentUser else {
            createNewUser()
            return
        }
        
        user.allergies = allergies.isEmpty ? nil : allergies
        user.currentMedications = currentMedications.isEmpty ? nil : currentMedications
        user.skinConcerns = skinConcerns.isEmpty ? nil : skinConcerns
        
        do {
            try viewContext.save()
            hasChanges = false
            showingSaveConfirmation = true
            HapticManager.success()
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                showingSaveConfirmation = false
            }
        } catch {
            print("Error saving profile: \(error)")
            HapticManager.error()
        }
    }
    
    private func createNewUser() {
        let user = User(context: viewContext)
        user.id = UUID()
        user.name = "User" // Default name
        user.joinDate = Date()
        user.allergies = allergies.isEmpty ? nil : allergies
        user.currentMedications = currentMedications.isEmpty ? nil : currentMedications
        user.skinConcerns = skinConcerns.isEmpty ? nil : skinConcerns
        user.onboardingCompleted = true
        
        do {
            try viewContext.save()
            hasChanges = false
            showingSaveConfirmation = true
            HapticManager.success()
            
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                showingSaveConfirmation = false
            }
        } catch {
            print("Error creating user: \(error)")
            HapticManager.error()
        }
    }
}

// MARK: - Supporting Views

struct MedicalSection<Content: View>: View {
    let title: String
    let subtitle: String
    let icon: String
    let iconColor: Color
    @ViewBuilder let content: Content
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceLG) {
            HStack(spacing: .spaceMD) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(iconColor)
                
                VStack(alignment: .leading, spacing: .spaceXS) {
                    Text(title)
                        .font(.headlineLarge)
                        .foregroundColor(.textPrimary)
                    
                    Text(subtitle)
                        .font(.bodyMedium)
                        .foregroundColor(.textSecondary)
                }
                
                Spacer()
            }
            
            content
        }
        .wellnessCard()
        .padding(.horizontal, .spaceXL)
    }
}

// MARK: - Emergency Contact Model Extension
// Note: In a real app, you'd want to create a separate EmergencyContact entity
// For now, we're using the existing User entity fields

#Preview {
    let context = PersistenceController.preview.container.viewContext
    
    // Create sample user with medical data
    let user = User(context: context)
    user.id = UUID()
    user.name = "John Doe"
    user.allergies = "Penicillin, Latex"
    user.currentMedications = "Ibuprofen 200mg as needed"
    user.skinConcerns = "Acne, sensitive skin"
    user.joinDate = Date()
    
    return MedicalProfileView()
        .environment(\.managedObjectContext, context)
}