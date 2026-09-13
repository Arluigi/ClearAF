import SwiftUI
import CoreData

struct ContentView: View {
    @StateObject private var apiService = APIService.shared
    @State private var selectedTab = 0
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
            case .onboarding:
                OnboardingView {}
                    .overlay(alignment: .topTrailing) { Button("Sign out") { apiService.logout() }.padding() }
            case .ready:
                TabView(selection: $selectedTab) {
                    DashboardViewEnhanced(selectedTab: $selectedTab)
                        .tabItem {
                            Image(systemName: "house.fill")
                            Text("Today")
                        }
                        .tag(0)
                    
                    ProgressView()
                        .tabItem {
                            Image(systemName: "chart.line.uptrend.xyaxis")
                            Text("Photos")
                        }
                        .tag(1)
                    
                    RoutineView()
                        .tabItem {
                            Image(systemName: "list.bullet")
                            Text("Routines")
                        }
                        .tag(2)
                }
                .tint(.primaryPurple)
            }
        }
        .environment(\.managedObjectContext, apiService.persistence.container.viewContext)
        .id(apiService.access.snapshot()?.generation)
        .task { apiService.start(); resumeRepositories() }
        .onChange(of: apiService.phase) { _, _ in resumeRepositories() }
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
        apiService.photos.resume(context: apiService.persistence.container.viewContext, ticket: ticket)
        apiService.routines.resume(accountID: ticket.accountID, ticket: ticket)
    }
}

private struct PhotoPersistenceErrorView: View {
    @ObservedObject var repository: PhotoRepository
    var body: some View {
        if let error = repository.lastError {
            Text(error).font(.callout).padding().background(.regularMaterial).cornerRadius(12).padding()
        }
    }
}
