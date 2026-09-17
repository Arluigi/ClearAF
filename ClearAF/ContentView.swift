import SwiftUI
import CoreData

struct ContentView: View {
    @StateObject private var apiService = APIService.shared
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            switch apiService.phase {
            case .loading:
                VStack { SwiftUI.ProgressView(); Text("Opening your account…") }
            case .signedOut:
                AuthenticationView {}
            case .profileError:
                VStack(spacing: 20) {
                    Text("Unable to open your account").font(.title2)
                    Text(apiService.accountError).multilineTextAlignment(.center)
                    Button("Try again") { apiService.retryProfile() }
                    Button("Sign out") { apiService.logout() }
                }.padding()
            case .recovery:
                PasswordRecoveryView()
            case .enrollment:
                EnrollmentView()
            case .onboarding:
                OnboardingView {}
            case .ready:
                ReadyTabs()
            }
        }
        .environment(\.managedObjectContext, apiService.persistence.container.viewContext)
        .id(apiService.access.snapshot()?.generation)
        .task { apiService.start(); resumeRepositories() }
        .onChange(of: apiService.phase) { _, _ in
            resumeRepositories()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { resumeRepositories() }
            else { apiService.photos.cancel(); apiService.routines.cancel() }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
            guard scenePhase == .active, apiService.phase == .ready else { return }
            let ticket = apiService.access.snapshot()
            Task { @MainActor in
                guard apiService.access.snapshot() == ticket else { return }
                await apiService.routines.refresh()
            }
        }
        .overlay(alignment: .bottom) { PhotoPersistenceErrorView(repository: apiService.photos) }
        .onOpenURL { url in
            Task { @MainActor in
                do { try await SupabaseService.shared.handleCallback(url) }
                catch { apiService.accountError = "This link is invalid or expired. Request a new one." }
            }
        }
    }
    private func resumeRepositories() {
        guard scenePhase == .active, (apiService.phase == .ready || apiService.phase == .onboarding), let ticket = apiService.access.snapshot() else { return }
        Task { @MainActor in
            await apiService.reminders.resume(ticket: ticket)
            await apiService.reminders.refreshPermission()
        }
        apiService.photos.resume(context: apiService.persistence.container.viewContext, ticket: ticket)
        apiService.routines.resume(accountID: ticket.accountID, ticket: ticket)
    }
}

/// Native tab bar (spec §6): four destinations, capture fused in the centre as an action, ink tint, unread badge on Notes.
private struct ReadyTabs: View {
    @State private var selection: AppTab = .today
    @State private var capturing = false
    @ObservedObject private var messaging = APIService.shared.messaging

    var body: some View {
        TabView(selection: Binding(get: { selection }, set: { requested in
            let route = AppTab.route(requested, from: selection)
            selection = route.selection
            if route.startsCapture { capturing = true }
        })) {
            Tab(AppTab.today.title, systemImage: AppTab.today.systemImage, value: AppTab.today) {
                DashboardViewEnhanced(selectedTab: $selection)
            }
            Tab(AppTab.record.title, systemImage: AppTab.record.systemImage, value: AppTab.record) {
                ProgressView()
            }
            Tab(AppTab.capture.title, systemImage: AppTab.capture.systemImage, value: AppTab.capture) {
                Letterpress.canvas.ignoresSafeArea().accessibilityHidden(true)
            }
            .accessibilityHint("Opens the camera")
            Tab(AppTab.plan.title, systemImage: AppTab.plan.systemImage, value: AppTab.plan) {
                RoutineView()
            }
            Tab(AppTab.notes.title, systemImage: AppTab.notes.systemImage, value: AppTab.notes) {
                MessagingView()
            }
            .badge(messaging.conversation?.unreadCount ?? 0)
        }
        .tint(Letterpress.ink)
        .sheet(isPresented: $capturing) { DurablePhotoCaptureView() }
    }
}

private struct PhotoPersistenceErrorView: View {
    @ObservedObject var repository: PhotoRepository
    var body: some View {
        if let error = repository.lastError {
            Text(error)
                .font(.callout)
                .padding()
                .background(Letterpress.surface, in: RoundedRectangle(cornerRadius: Letterpress.Radius.sheet))
                .overlay(RoundedRectangle(cornerRadius: Letterpress.Radius.sheet).strokeBorder(Letterpress.rule, lineWidth: 1))
                .padding()
        }
    }
}
