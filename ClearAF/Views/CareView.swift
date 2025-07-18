//
//  CareView.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/17/25.
//

import SwiftUI
import CoreData

struct CareView: View {
    @Environment(\.managedObjectContext) private var viewContext
    
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: []
    ) private var users: FetchedResults<User>
    
    @State private var showingAppointmentBooking = false
    @State private var showingMessaging = false
    @State private var showingMedicalProfile = false
    
    private var assignedDermatologist: Dermatologist? {
        users.first?.assignedDermatologist
    }
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.backgroundSecondary.ignoresSafeArea()
                
                VStack(spacing: .spaceXL) {
                    // Enhanced header
                    HStack {
                        Text("Care")
                            .font(.displayMedium)
                            .foregroundColor(.textPrimary)
                        Spacer()
                    }
                    .padding(.horizontal, .spaceXL)
                    
                    ScrollView {
                        VStack(spacing: .spaceXL) {
                            // Book New Visit
                            Button(action: {
                                showingAppointmentBooking = true
                                HapticManager.light()
                            }) {
                                HStack {
                                    Image(systemName: "stethoscope")
                                        .font(.title2)
                                        .foregroundColor(.white)
                                    
                                    Text("Book New Visit")
                                        .font(.headlineMedium)
                                        .foregroundColor(.white)
                                    
                                    Spacer()
                                    
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundColor(.white.opacity(0.8))
                                }
                                .padding(.cardPadding)
                                .background(Color.primaryGradient)
                                .clipShape(RoundedRectangle(cornerRadius: .radiusXL))
                                .glowShadow()
                            }
                            .padding(.horizontal, .spaceXL)

                            // Upcoming Appointments Card
                            VStack(alignment: .leading, spacing: .spaceLG) {
                                Text("Upcoming Appointments")
                                    .font(.headlineLarge)
                                    .foregroundColor(.textPrimary)
                                
                                // Placeholder for upcoming appointment
                                VStack(spacing: .spaceMD) {
                                    HStack {
                                        Image(systemName: "calendar.circle.fill")
                                            .font(.title2)
                                            .foregroundColor(.primaryPurple)
                                        
                                        VStack(alignment: .leading, spacing: .spaceXS) {
                                            Text("No appointments scheduled")
                                                .font(.headlineMedium)
                                                .foregroundColor(.textPrimary)
                                            
                                            Text("Book your first appointment")
                                                .font(.bodyMedium)
                                                .foregroundColor(.textSecondary)
                                        }
                                        
                                        Spacer()
                                    }
                                }
                            }
                            .wellnessCard()
                            .padding(.horizontal, .spaceXL)
                    
                            // Visit History Section
                            VStack(alignment: .leading, spacing: .spaceLG) {
                                Text("Visit History")
                                    .font(.headlineLarge)
                                    .foregroundColor(.textPrimary)
                                
                                VStack(spacing: .spaceMD) {
                                    HStack {
                                        Image(systemName: "clock.circle")
                                            .font(.title2)
                                            .foregroundColor(.textSecondary)
                                        
                                        VStack(alignment: .leading, spacing: .spaceXS) {
                                            Text("No visits yet")
                                                .font(.headlineMedium)
                                                .foregroundColor(.textPrimary)
                                            
                                            Text("Your appointment history will appear here")
                                                .font(.bodyMedium)
                                                .foregroundColor(.textSecondary)
                                        }
                                        
                                        Spacer()
                                    }
                                }
                            }
                            .wellnessCard()
                            .padding(.horizontal, .spaceXL)
                    
                            // Messages Section
                            VStack(alignment: .leading, spacing: .spaceLG) {
                                Text("Messages")
                                    .font(.headlineLarge)
                                    .foregroundColor(.textPrimary)
                                
                                Button(action: {
                                    showingMessaging = true
                                    HapticManager.light()
                                }) {
                                    HStack {
                                        Image(systemName: "message.circle.fill")
                                            .font(.title2)
                                            .foregroundColor(.primaryPurple)
                                        
                                        VStack(alignment: .leading, spacing: .spaceXS) {
                                            Text("Message your dermatologist")
                                                .font(.headlineMedium)
                                                .foregroundColor(.textPrimary)
                                            
                                            Text("Ask questions anytime")
                                                .font(.bodyMedium)
                                                .foregroundColor(.textSecondary)
                                        }
                                        
                                        Spacer()
                                        
                                        Image(systemName: "chevron.right")
                                            .font(.caption)
                                            .foregroundColor(.textSecondary)
                                    }
                                    .clickableBackground()
                                }
                            }
                            .wellnessCard()
                            .padding(.horizontal, .spaceXL)
                    
                            // Medical Profile Section
                            VStack(alignment: .leading, spacing: .spaceLG) {
                                Text("Medical Profile")
                                    .font(.headlineLarge)
                                    .foregroundColor(.textPrimary)
                                
                                Button(action: {
                                    showingMedicalProfile = true
                                    HapticManager.light()
                                }) {
                                    HStack {
                                        Image(systemName: "person.text.rectangle")
                                            .font(.title2)
                                            .foregroundColor(.primaryPurple)
                                        
                                        VStack(alignment: .leading, spacing: .spaceXS) {
                                            Text("Update medical information")
                                                .font(.headlineMedium)
                                                .foregroundColor(.textPrimary)
                                            
                                            Text("Allergies, medications, concerns")
                                                .font(.bodyMedium)
                                                .foregroundColor(.textSecondary)
                                        }
                                        
                                        Spacer()
                                        
                                        Image(systemName: "chevron.right")
                                            .font(.caption)
                                            .foregroundColor(.textSecondary)
                                    }
                                    .clickableBackground()
                                }
                            }
                            .wellnessCard()
                            .padding(.horizontal, .spaceXL)
                        }
                        .padding(.bottom, 100)
                    }
                    
                    Spacer()
                }
                .padding(.top, .spaceXL)
            }
            .navigationBarHidden(true)
            .onAppear {
                setupSampleDermatologist()
            }
            .sheet(isPresented: $showingAppointmentBooking) {
                AppointmentBookingView()
            }
            .sheet(isPresented: $showingMessaging) {
                MessagingView(dermatologist: assignedDermatologist)
            }
            .sheet(isPresented: $showingMedicalProfile) {
                MedicalProfileView()
            }
        }
    }
    
    private func setupSampleDermatologist() {
        // Only create if no dermatologist exists
        guard assignedDermatologist == nil else { return }
        
        // Create sample dermatologist
        let dermatologist = Dermatologist(context: viewContext)
        dermatologist.id = UUID()
        dermatologist.name = "Dr. Amit Om"
        dermatologist.title = "MD, Dermatologist"
        dermatologist.specialization = "Medical & Cosmetic Dermatology"
        dermatologist.email = "a.om@clearaf.com"
        dermatologist.phone = "(555) 123-4567"
        dermatologist.isAvailable = true
        
        // Create or get user and assign dermatologist
        let user: User
        if let existingUser = users.first {
            user = existingUser
        } else {
            user = User(context: viewContext)
            user.id = UUID()
            user.name = "User"
            user.joinDate = Date()
            user.onboardingCompleted = true
        }
        
        user.assignedDermatologist = dermatologist
        
        do {
            try viewContext.save()
        } catch {
            print("Error setting up dermatologist: \(error)")
        }
    }
}

#Preview {
    CareView()
}
