//
//  DashboardViewEnhanced.swift
//  ClearAF
//
//  Enhanced Dashboard with premium UX/UI design based on expert analysis
//  Implements accessibility, haptic feedback, and wellness-focused psychology
//

import SwiftUI
import UIKit
import CoreData
import Combine

struct DashboardViewEnhanced: View {
    @Binding var selectedTab: Int
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    
    @State private var showingProfile = false
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: .spaceXL) {
                    // Header with improved accessibility and styling
                    HStack {
                        VStack(alignment: .leading, spacing: .spaceXS) {
                            Text(getTimeBasedGreeting())
                                .font(.dynamicHeadline())
                                .foregroundColor(.textSecondary)
                                .accessibilityLabel("Time-based greeting")
                            if let user = users.first {
                                Text(user.name ?? "There")
                                    .font(.displayMedium)
                                    .foregroundColor(.textPrimary)
                                    .accessibilityLabel("Welcome, \(user.name ?? "There")")
                            }
                        }
                        Spacer()
                        Button(action: {
                            HapticManager.light()
                            showingProfile = true
                        }) {
                            Image(systemName: "person.circle.fill")
                                .font(.system(size: 32))
                                .foregroundColor(.primaryPurple)
                                .frame(width: .touchTarget, height: .touchTarget)
                                .contentShape(Circle())
                        }
                        .accessibleButton(label: "Profile", hint: "Open your profile settings")
                    }
                    .padding(.horizontal, .spaceXL)
                    
                    // Daily Photo & Skin Score Card
                    DailyPhotoCardEnhanced(selectedTab: $selectedTab)
                    
                    DailyTasksCardEnhanced(selectedTab: $selectedTab)

                    // Prescription Refill Reminders
                    PrescriptionRemindersCard()
                    
                    // Your Dermatologist Section
                    YourDermatologistCard(selectedTab: $selectedTab)
                    
                    Spacer(minLength: .spaceHuge)
                }
                .padding(.top, .spaceXL)
            }
            .background(Color.backgroundSecondary.ignoresSafeArea())
            .navigationBarBackButtonHidden(true)
            .sheet(isPresented: $showingProfile) {
                ProfileView()
                    .environment(\.managedObjectContext, viewContext)
            }
        }
    }
    
    private func getTimeBasedGreeting() -> String {
        let hour = Calendar.current.component(.hour, from: Date())
        
        switch hour {
        case 5..<12:
            return "Good morning,"
        case 12..<17:
            return "Good afternoon,"
        case 17..<22:
            return "Good evening,"
        default:
            return "Good night,"
        }
    }
}

struct DailyPhotoCardEnhanced: View {
    @Binding var selectedTab: Int
    @FetchRequest(entity: SkinPhoto.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \SkinPhoto.captureDate, ascending: false)], animation: .default)
    private var photos: FetchedResults<SkinPhoto>
    @State private var showingCamera = false

    var body: some View {
        VStack(alignment: .leading, spacing: .spaceLG) {
            HStack {
                Text("Your photos").font(.headlineSmall)
                Spacer()
                Button("View all") { selectedTab = 1 }
            }
            PhotoDisplaySection(todayPhoto: photos.first, showingCamera: $showingCamera)
        }
        .wellnessCard(style: .elevated)
        .padding(.horizontal, .spaceXL)
        .sheet(isPresented: $showingCamera) { DurablePhotoCaptureView() }
    }
}

struct DailyTasksCardEnhanced: View {
    @Binding var selectedTab: Int
    @ObservedObject private var repository = APIService.shared.routines
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceLG) {
            Text("Assigned routines").font(.headlineLarge)
            Text(repository.localDate).font(.caption).foregroundStyle(.secondary)
            ForEach(RoutineTimeOfDay.allCases, id: \.self) { slot in
                Button { selectedTab = 2 } label: {
                    HStack(spacing: .spaceMD) {
                        Image(systemName: slot == .morning ? "sun.max" : "moon")
                        VStack(alignment: .leading, spacing: .spaceXS) {
                            Text(slot.title).font(.headline)
                            if let routine = repository.routine(for: slot), routine.isActive {
                                Text(routine.name).font(.subheadline)
                                Text(repository.status(for: routine).label).font(.caption)
                            } else {
                                Text(repository.snapshot == nil ? "Open routines to load assignments" : "No active assignment")
                                    .font(.caption)
                            }
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                    }
                    .foregroundStyle(Color.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityHint("Open your clinician-assigned routines")
            }
            if repository.lastError != nil {
                Text("Routines need attention. Open Routines to refresh or retry.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .wellnessCard(style: .elevated)
        .padding(.horizontal, .spaceXL)
    }
}

// Task Progress Indicator Component
struct TaskProgressIndicator: View {
    let completed: Int
    let total: Int
    
    var body: some View {
        HStack(spacing: .spaceXS) {
            Text("\(completed)/\(total)")
                .font(.captionLarge)
                .foregroundColor(.textSecondary)
            
            Circle()
                .fill(completed == total ? Color.scoreExcellent : Color.textTertiary)
                .frame(width: 8, height: 8)
                .scaleEffect(completed == total ? 1.2 : 1.0)
                .animation(.bouncy, value: completed)
        }
        .accessibilityLabel("\(completed) out of \(total) tasks completed")
    }
}

// Animated Score Display Component
struct AnimatedScoreDisplay: View {
    let score: Int
    @State private var animatedValue: Double = 0
    
    var body: some View {
        Text("\(Int(animatedValue))")
            .font(.displayLarge)
            .foregroundColor(scoreColor(for: score))
            .contentTransition(.numericText())
            .onAppear {
                withAnimation(.smooth.delay(0.2)) {
                    animatedValue = Double(score)
                }
            }
            .onChange(of: score) { _, newValue in
                withAnimation(.smooth) {
                    animatedValue = Double(newValue)
                }
            }
            .scoreAccessibility(score: score)
    }
}

// Streak Indicator Component
struct StreakIndicator: View {
    let count: Int
    @State private var isAnimating = false
    
    var body: some View {
        HStack(spacing: .spaceXS) {
            Text("🔥")
                .font(.body)
                .scaleEffect(isAnimating ? 1.1 : 1.0)
                .animation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true), value: isAnimating)
            
            Text("\(count) day streak!")
                .font(.captionLarge)
                .foregroundColor(.orange)
                .fontWeight(.medium)
        }
        .onAppear {
            isAnimating = true
        }
        .accessibilityLabel("Current streak: \(count) days")
    }
}

// Enhanced Progress Bar Component
struct EnhancedProgressBar: View {
    let progress: Double
    let score: Int
    @State private var animatedProgress: Double = 0
    
    var body: some View {
        VStack(spacing: .spaceXS) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Background track
                    RoundedRectangle(cornerRadius: .radiusSmall)
                        .fill(Color.borderSubtle)
                        .frame(height: 12)
                    
                    // Progress fill with dynamic gradient
                    RoundedRectangle(cornerRadius: .radiusSmall)
                        .fill(scoreGradient(for: score))
                        .frame(
                            width: geometry.size.width * animatedProgress,
                            height: 12
                        )
                        .animation(.smooth.delay(0.3), value: animatedProgress)
                }
            }
            .frame(height: 12)
            .onAppear {
                withAnimation(.smooth.delay(0.3)) {
                    animatedProgress = progress
                }
            }
            .onChange(of: progress) { _, newValue in
                withAnimation(.smooth) {
                    animatedProgress = newValue
                }
            }
        }
        .accessibilityLabel("Skin score progress bar")
        .accessibilityValue("\(Int(progress * 100)) percent")
    }
}

// Progress Insight Component
struct ProgressInsight: View {
    let currentScore: Int
    
    var body: some View {
        HStack(spacing: .spaceXS) {
            Image(systemName: "arrow.up.circle.fill")
                .foregroundColor(.scoreGood)
                .font(.caption)
            
            Text("+3 from last week")
                .font(.captionLarge)
                .foregroundColor(.scoreGood)
                .fontWeight(.medium)
        }
        .accessibilityLabel("Progress insight: 3 points improvement from last week")
    }
}

// Photo Display Section Component
struct PhotoDisplaySection: View {
    let todayPhoto: SkinPhoto?
    @Binding var showingCamera: Bool
    var body: some View {
        VStack(spacing: .spaceMD) {
            if let photo = todayPhoto {
                DashboardPhotoPreview(photo: photo)
            } else {
                Image(systemName: "camera.fill").font(.largeTitle).foregroundColor(.primaryPurple)
                Text("Start your photo history").foregroundColor(.textSecondary)
            }
            Button { showingCamera = true } label: {
                Label(todayPhoto == nil ? "Take a photo" : "Take another photo", systemImage: "camera")
            }
            .accessibilityLabel("Take daily progress photo")
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct DashboardPhotoPreview: View {
    @ObservedObject var photo: SkinPhoto
    var body: some View {
        VStack(spacing: .spaceSM) {
            if let bytes = photo.photoData, let image = UIImage(data: bytes) {
                Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 200)
                    .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
                    .accessibilityLabel("Latest progress photo")
            }
            if let date = photo.captureDate { Text(date, style: .date).font(.caption) }
            PhotoSharingStatusView(photo: photo)
        }
    }
}

struct YourDermatologistCard: View {
    @Binding var selectedTab: Int
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceLG) {
            Text("Your Dermatologist")
                .font(.headlineLarge)
                .foregroundColor(.textPrimary)
            
            HStack(spacing: .spaceLG) {
                // Dermatologist Photo Placeholder
                Image(systemName: "person.circle.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.primaryPurple)
                    .background(Color.skinPeach)
                    .clipShape(Circle())
                
                VStack(alignment: .leading, spacing: .spaceXS) {
                    Text("Dr. Amit Om")
                        .font(.headlineMedium)
                        .foregroundColor(.textPrimary)
                    
                    Text("Dermatologist • 8 years exp.")
                        .font(.bodySmall)
                        .foregroundColor(.textSecondary)
                    
                    HStack(spacing: .spaceMD) {
                        Button(action: {
                            HapticManager.light()
                            selectedTab = 3 // Navigate to Care tab
                        }) {
                            HStack(spacing: .spaceXS) {
                                Image(systemName: "message.fill")
                                    .font(.caption)
                                Text("Message")
                                    .font(.captionLarge)
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, .spaceMD)
                            .padding(.vertical, .spaceXS)
                            .background(Color.primaryPurple)
                            .clipShape(RoundedRectangle(cornerRadius: .radiusSmall))
                        }
                        
                        Button(action: {
                            HapticManager.light()
                            selectedTab = 3 // Navigate to Care tab
                        }) {
                            HStack(spacing: .spaceXS) {
                                Image(systemName: "calendar.badge.plus")
                                    .font(.caption)
                                Text("Book")
                                    .font(.captionLarge)
                            }
                            .foregroundColor(.primaryPurple)
                            .padding(.horizontal, .spaceMD)
                            .padding(.vertical, .spaceXS)
                            .background(Color.buttonSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: .radiusSmall))
                        }
                    }
                }
                
                Spacer()
            }
        }
        .wellnessCard()
        .padding(.horizontal, .spaceXL)
    }
}

// Prescription Refill Reminders Card Component
struct PrescriptionRemindersCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceLG) {
            HStack {
                Text("Prescription Refills")
                    .font(.headlineLarge)
                    .foregroundColor(.textPrimary)
                
                Spacer()
                
                Button(action: {
                    HapticManager.light()
                    // TODO: Navigate to Shop tab
                }) {
                    Text("View All")
                        .font(.captionLarge)
                        .foregroundColor(.primaryPurple)
                }
            }
            
            VStack(spacing: .spaceMD) {
                HStack {
                    Image(systemName: "pills.circle")
                        .font(.title2)
                        .foregroundColor(.primaryTeal)
                    
                    VStack(alignment: .leading, spacing: .spaceXS) {
                        Text("No prescriptions yet")
                            .font(.headlineMedium)
                            .foregroundColor(.textPrimary)
                        
                        Text("Prescribed medications will appear here")
                            .font(.bodySmall)
                            .foregroundColor(.textSecondary)
                    }
                    
                    Spacer()
                }
            }
        }
        .wellnessCard()
        .padding(.horizontal, .spaceXL)
    }
}


#Preview {
    DashboardViewEnhanced(selectedTab: .constant(0))
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}