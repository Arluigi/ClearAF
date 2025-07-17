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

struct DashboardViewEnhanced: View {
    @Binding var selectedTab: Int
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    
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
                            // TODO: Show notifications sheet
                        }) {
                            Image(systemName: "bell")
                                .font(.system(size: .iconSize))
                                .foregroundColor(.textSecondary)
                                .frame(width: .touchTarget, height: .touchTarget)
                                .contentShape(Rectangle())
                        }
                        .accessibleButton(label: "Notifications", hint: "View your notifications and reminders")
                    }
                    .padding(.horizontal, .spaceXL)
                    
                    // Daily Photo & Skin Score Card
                    DailyPhotoCardEnhanced(selectedTab: $selectedTab)
                    
                    // Daily Tasks
                    DailyTasksCardEnhanced(selectedTab: $selectedTab)
                    
                    Spacer(minLength: .spaceHuge)
                }
                .padding(.top, .spaceXL)
            }
            .background(Color.backgroundSecondary.ignoresSafeArea())
            .navigationBarBackButtonHidden(true)
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
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    
    @FetchRequest(
        entity: SkinPhoto.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \SkinPhoto.captureDate, ascending: false)],
        animation: .default)
    private var photos: FetchedResults<SkinPhoto>
    
    @State private var showingCamera = false
    @State private var animatedScore: Double = 0
    
    var body: some View {
        VStack(spacing: .spaceXL) {
            // Enhanced Skin Score with Animation
            VStack(spacing: .spaceMD) {
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: .spaceXS) {
                        Text("Skin Score")
                            .font(.headlineSmall)
                            .foregroundColor(.textSecondary)
                            .accessibilityLabel("Current skin score section")
                        
                        // Animated streak with better design
                        StreakIndicator(count: Int(users.first?.streakCount ?? 0))
                    }
                    Spacer()
                    
                    // Animated score display
                    VStack(alignment: .trailing, spacing: .spaceXXS) {
                        AnimatedScoreDisplay(score: Int(users.first?.currentSkinScore ?? 0))
                        Text(scoreDescription(for: Int(users.first?.currentSkinScore ?? 0)))
                            .font(.captionLarge)
                            .foregroundColor(scoreColor(for: Int(users.first?.currentSkinScore ?? 0)))
                            .animation(.gentle, value: users.first?.currentSkinScore)
                    }
                }
                
                // Enhanced Progress Bar with Animation
                EnhancedProgressBar(
                    progress: Double(users.first?.currentSkinScore ?? 0) / 100.0,
                    score: Int(users.first?.currentSkinScore ?? 0)
                )
                
                // Progress insight
                ProgressInsight(currentScore: Int(users.first?.currentSkinScore ?? 0))
            }
            
            // Enhanced Photo Section
            PhotoDisplaySection(
                todayPhoto: getTodayPhoto(),
                showingCamera: $showingCamera
            )
        }
        .wellnessCard(style: .elevated)
        .padding(.horizontal, .spaceXL)
        .sheet(isPresented: $showingCamera) {
            CameraView()
        }
    }
    
    private func getTodayPhoto() -> SkinPhoto? {
        let today = Calendar.current.startOfDay(for: Date())
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: today)!
        
        return photos.first { photo in
            guard let captureDate = photo.captureDate else { return false }
            return captureDate >= today && captureDate < tomorrow
        }
    }
}

struct DailyTasksCardEnhanced: View {
    @Binding var selectedTab: Int
    @State private var morningCompleted = false
    @State private var photoCompleted = false
    @State private var eveningCompleted = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceLG) {
            HStack {
                Text("Today's Tasks")
                    .font(.headlineLarge)
                    .foregroundColor(.textPrimary)
                Spacer()
                TaskProgressIndicator(
                    completed: completedTasksCount,
                    total: 3
                )
            }
            
            VStack(spacing: .spaceSM) {
                EnhancedTaskRow(
                    title: "Morning Routine",
                    isCompleted: $morningCompleted,
                    time: "8 min",
                    icon: "sun.max",
                    selectedTab: $selectedTab,
                    targetTab: 2,
                    routineType: "morning"
                )
                
                EnhancedTaskRow(
                    title: "Take Progress Photo",
                    isCompleted: $photoCompleted,
                    time: "2 min",
                    icon: "camera",
                    selectedTab: $selectedTab,
                    targetTab: -1,
                    isCameraTask: true
                )
                
                EnhancedTaskRow(
                    title: "Evening Routine",
                    isCompleted: $eveningCompleted,
                    time: "12 min",
                    icon: "moon",
                    selectedTab: $selectedTab,
                    targetTab: 2,
                    routineType: "evening"
                )
            }
        }
        .wellnessCard(style: .elevated)
        .padding(.horizontal, .spaceXL)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Daily tasks section")
    }
    
    private var completedTasksCount: Int {
        [morningCompleted, photoCompleted, eveningCompleted].filter { $0 }.count
    }
}

// Enhanced Task Row Component
struct EnhancedTaskRow: View {
    let title: String
    @Binding var isCompleted: Bool
    let time: String
    let icon: String
    @Binding var selectedTab: Int
    let targetTab: Int
    let routineType: String?
    let isCameraTask: Bool
    @State private var showingCamera = false
    
    init(title: String, isCompleted: Binding<Bool>, time: String, icon: String, selectedTab: Binding<Int>, targetTab: Int, routineType: String? = nil, isCameraTask: Bool = false) {
        self.title = title
        self._isCompleted = isCompleted
        self.time = time
        self.icon = icon
        self._selectedTab = selectedTab
        self.targetTab = targetTab
        self.routineType = routineType
        self.isCameraTask = isCameraTask
    }
    
    var body: some View {
        HStack(spacing: .spaceMD) {
            // Enhanced checkbox with haptic feedback
            Button(action: {
                withAnimation(.bouncy) {
                    isCompleted.toggle()
                }
                HapticManager.success()
            }) {
                Image(systemName: isCompleted ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isCompleted ? .scoreExcellent : .textTertiary)
                    .font(.system(size: 24))
                    .frame(width: .touchTarget, height: .touchTarget)
                    .contentShape(Circle())
            }
            .accessibleButton(
                label: isCompleted ? "Completed: \(title)" : "Not completed: \(title)",
                hint: "Double tap to toggle completion"
            )
            
            // Task icon
            Image(systemName: icon)
                .foregroundColor(.primaryPurple)
                .font(.system(size: 18))
                .frame(width: 24)
            
            // Task content
            Button(action: {
                HapticManager.light()
                if isCameraTask {
                    showingCamera = true
                } else {
                    if let routineType = routineType {
                        NotificationCenter.default.post(name: NSNotification.Name("SetRoutineTab"), object: routineType)
                    }
                    selectedTab = targetTab
                }
            }) {
                VStack(alignment: .leading, spacing: .spaceXXS) {
                    Text(title)
                        .font(.bodyLarge)
                        .foregroundColor(.textPrimary)
                        .strikethrough(isCompleted)
                        .animation(.gentle, value: isCompleted)
                    
                    HStack {
                        Image(systemName: "clock")
                            .font(.caption)
                        Text(time)
                            .font(.captionLarge)
                    }
                    .foregroundColor(.textTertiary)
                }
            }
            .buttonStyle(PlainButtonStyle())
            .accessibleButton(
                label: title,
                hint: isCameraTask ? "Double tap to open camera" : "Double tap to start \(title.lowercased())"
            )
            
            Spacer()
            
            // Progress arrow
            Image(systemName: "chevron.right")
                .foregroundColor(.textTertiary)
                .font(.caption)
        }
        .padding(.vertical, .spaceSM)
        .padding(.horizontal, .spaceMD)
        .background(Color.backgroundSecondary.opacity(0.2))
        .cornerRadius(.radiusMedium)
        .sheet(isPresented: $showingCamera) {
            CameraView()
        }
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
            if let todayPhoto = todayPhoto {
                // Display today's photo with enhanced styling
                if let photoData = todayPhoto.photoData,
                   let uiImage = UIImage(data: photoData) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(maxWidth: .infinity)
                        .frame(height: 280)
                        .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                        .overlay(
                            VStack {
                                Spacer()
                                HStack {
                                    Spacer()
                                    Text("\(todayPhoto.skinScore)")
                                        .font(.captionLarge)
                                        .fontWeight(.bold)
                                        .foregroundColor(.white)
                                        .padding(.horizontal, .spaceMD)
                                        .padding(.vertical, .spaceXS)
                                        .background(Color.black.opacity(0.7))
                                        .clipShape(Capsule())
                                        .padding(.spaceMD)
                                }
                            }
                        )
                        .accessibleImage(label: "Today's progress photo with score \(todayPhoto.skinScore)")
                }
            } else {
                // Enhanced photo placeholder
                Button(action: {
                    HapticManager.light()
                    showingCamera = true
                }) {
                    VStack(spacing: .spaceLG) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 40))
                            .foregroundColor(.primaryPurple)
                        
                        VStack(spacing: .spaceXS) {
                            Text("Take your daily picture!")
                                .font(.headlineSmall)
                                .foregroundColor(.textPrimary)
                            Text("Track your progress with a quick selfie")
                                .font(.captionLarge)
                                .foregroundColor(.textSecondary)
                        }
                        .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 280)
                    .background(Color.backgroundTertiary)
                    .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                }
                .accessibleButton(
                    label: "Take daily progress photo",
                    hint: "Double tap to open camera and capture your daily skin photo"
                )
            }
            
            // Enhanced date display
            HStack {
                Image(systemName: "calendar")
                    .foregroundColor(.textTertiary)
                    .font(.caption)
                Text(formatDate(Date()))
                    .font(.captionLarge)
                    .foregroundColor(.textSecondary)
                    .fontWeight(.medium)
            }
            .accessibilityLabel("Today's date: \(formatDate(Date()))")
        }
    }
    
    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d"
        return formatter.string(from: date)
    }
}


#Preview {
    DashboardViewEnhanced(selectedTab: .constant(0))
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}