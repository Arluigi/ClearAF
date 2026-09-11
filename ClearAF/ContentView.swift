import SwiftUI
import CoreData

struct ContentView: View {
    @StateObject private var apiService = APIService.shared
    @State private var selectedTab = 0
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
                            Text("Home")
                        }
                        .tag(0)
                    
                    ProgressView()
                        .tabItem {
                            Image(systemName: "chart.line.uptrend.xyaxis")
                            Text("Progress")
                        }
                        .tag(1)
                    
                    RoutineView()
                        .tabItem {
                            Image(systemName: "list.bullet")
                            Text("Routines")
                        }
                        .tag(2)
                    
                    CareView()
                        .tabItem {
                            Image(systemName: "stethoscope")
                            Text("Care")
                        }
                        .tag(3)
                    
                    ShopView()
                        .tabItem {
                            Image(systemName: "bag.fill")
                            Text("Shop")
                        }
                        .tag(4)
                }
                .tint(.primaryPurple)
            }
        }
        .environment(\.managedObjectContext, apiService.persistence.container.viewContext)
        .id(apiService.access.snapshot()?.generation)
        .task { apiService.start() }
        .onOpenURL { url in
            Task { @MainActor in
                do { try await SupabaseService.shared.handleCallback(url) }
                catch { apiService.accountError = "This link is invalid or expired. Request a new one." }
            }
        }
    }
}
