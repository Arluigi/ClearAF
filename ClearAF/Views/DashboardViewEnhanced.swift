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
                    NavigationLink("Check-in") { CheckInView() }
                    // Header with improved accessibility and styling
                    HStack {
                        VStack(alignment: .leading, spacing: .spaceXS) {
                            Text(getTimeBasedGreeting())
                                .font(.headline)
                                .foregroundColor(CareJournal.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                            if let user = users.first {
                                Text(user.name ?? "There")
                                    .font(CareJournal.display)
                                    .foregroundColor(CareJournal.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }.frame(maxWidth: .infinity, alignment: .leading)
                        Button(action: {
                            HapticManager.light()
                            showingProfile = true
                        }) {
                            Image(systemName: "person.circle.fill")
                                .font(.system(size: 32))
                                .foregroundColor(CareJournal.actionPrimary)
                                .frame(width: .touchTarget, height: .touchTarget)
                                .contentShape(Circle())
                        }
                        .accessibleButton(label: "Profile", hint: "Open your profile settings")
                    }
                    .padding(.horizontal, 20)
                    
                    // Daily Photo & Skin Score Card
                    DailyPhotoCardEnhanced(selectedTab: $selectedTab)
                    
                    DailyTasksCardEnhanced(selectedTab: $selectedTab)

                    Spacer(minLength: .spaceHuge)
                }
                .padding(.top, .spaceXL)
            }
            .foregroundStyle(CareJournal.textPrimary)
            .tint(CareJournal.actionPrimary)
            .background(CareJournal.canvas.ignoresSafeArea())
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
    @FetchRequest(fetchRequest: Self.latestPhotoRequest(), animation: .default)
    private var photos: FetchedResults<SkinPhoto>
    @State private var showingCamera = false
    @State private var images = PhotoImageLoader()

    private static func latestPhotoRequest() -> NSFetchRequest<SkinPhoto> {
        let request = SkinPhoto.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(key: "captureDate", ascending: false), NSSortDescriptor(key: "id", ascending: false)]
        request.fetchLimit = 1
        return request
    }

    var body: some View {
        VStack(alignment: .leading, spacing: .spaceLG) {
            HStack {
                Text("Your photos").font(.headlineSmall)
                Spacer()
                Button("View all") { selectedTab = 1 }
            }
            PhotoDisplaySection(todayPhoto: photos.first, images: images, showingCamera: $showingCamera)
        }
        .careJournalSurface()
        .padding(.horizontal, 20)
        .sheet(isPresented: $showingCamera) { DurablePhotoCaptureView() }
        .onDisappear { images.clear() }
    }
}

struct DailyTasksCardEnhanced: View {
    @Binding var selectedTab: Int
    @ObservedObject private var repository = APIService.shared.routines
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceLG) {
            Text("Assigned routines").font(.headlineLarge)
            Text(Date.now, format: .dateTime.weekday().month().day()).font(.caption).foregroundStyle(CareJournal.textSecondary)
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
                    .foregroundStyle(CareJournal.textPrimary)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityHint("Open your clinician-assigned routines")
            }
            if repository.lastError != nil {
                Text("Routines need attention. Open Routines to refresh or retry.")
                    .font(.caption).foregroundStyle(CareJournal.textSecondary)
            }
        }
        .careJournalSurface()
        .padding(.horizontal, 20)
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
                .foregroundColor(CareJournal.textSecondary)
            
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

// The prominent Today action uses the same white-on-action pairing as Photos and Capture.
enum TodayPhotoActionAppearance {
    static let tint = CareJournal.actionPrimary
    static let foreground = CareJournal.onPrimary
}

// Photo Display Section Component
struct PhotoDisplaySection: View {
    let todayPhoto: SkinPhoto?
    let images: PhotoImageLoader
    @Binding var showingCamera: Bool
    var body: some View {
        VStack(spacing: .spaceMD) {
            if let photo = todayPhoto {
                DashboardPhotoPreview(photo: photo, images: images)
            } else {
                Image(systemName: "camera.fill").font(.largeTitle).foregroundColor(CareJournal.actionPrimary)
                Text("Start your photo history").foregroundColor(CareJournal.textSecondary)
            }
            Button { showingCamera = true } label: {
                Label(todayPhoto == nil ? "Take a photo" : "Take another photo", systemImage: "camera")
                    .foregroundStyle(TodayPhotoActionAppearance.foreground)
            }
            .accessibilityLabel("Take daily progress photo")
            .buttonStyle(.borderedProminent)
            .tint(TodayPhotoActionAppearance.tint)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct DashboardPhotoPreview: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    var body: some View {
        VStack(spacing: .spaceSM) {
            if let bytes = photo.photoData, let image = images.image(data: bytes, key: photo.objectID.uriRepresentation().absoluteString, maxPixelSize: 800) {
                Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 200)
                    .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
                    .accessibilityLabel("Latest progress photo")
            }
            if let date = photo.captureDate { Text(date, style: .date).font(.caption) }
            PhotoSharingStatusView(photo: photo)
        }
    }
}

#Preview {
    DashboardViewEnhanced(selectedTab: .constant(0))
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}
