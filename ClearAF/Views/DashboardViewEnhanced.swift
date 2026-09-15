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
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: .spaceXL) {
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

                    UrgentReportEntry()

                    CareStatusSection()

                    // Daily Photo & Skin Score Card
                    DailyPhotoCardEnhanced(selectedTab: $selectedTab)
                    
                    DailyTasksCardEnhanced(selectedTab: $selectedTab)

                    CareLinksCard()

                    Spacer(minLength: .spaceHuge)
                }
                .padding(.top, .spaceXL)
            }
            .foregroundStyle(CareJournal.textPrimary)
            .tint(CareJournal.actionPrimary)
            .background(CareJournal.canvas.ignoresSafeArea())
            .navigationBarBackButtonHidden(true)
            .task { await refreshCareStatus() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await refreshCareStatus() } }
            }
            .sheet(isPresented: $showingProfile) {
                ProfileView()
                    .environment(\.managedObjectContext, viewContext)
            }
        }
    }
    
    /// Care status and urgent reports change on the clinician's side; refresh on appear and when the app returns to the foreground.
    private func refreshCareStatus() async {
        guard let ticket = APIService.shared.access.snapshot() else { return }
        await APIService.shared.careDecisions.load(ticket: ticket)
        await APIService.shared.urgentReports.load(ticket: ticket)
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

struct CareLinksCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceMD) {
            Text("Care team").font(.headlineLarge)
            NavigationLink { CheckInView() } label: {
                Label("Check-in from your clinician", systemImage: "list.clipboard")
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
        }
        .careJournalSurface()
        .padding(.horizontal, 20)
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
