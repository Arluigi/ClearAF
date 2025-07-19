//
//  ContentView.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/15/25.
//

import SwiftUI
import CoreData

struct ContentView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @StateObject private var apiService = APIService.shared
    @State private var selectedTab = 0
    @State private var showingAuthentication = false
    @State private var showingOnboarding = false
    @State private var hasCheckedAuth = false
    
    var body: some View {
        ZStack {
            if apiService.isLoggedIn {
                // Main App Interface
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
                .accentColor(.primaryPurple)
            }
        }
        .onAppear {
            checkAuthenticationStatus()
        }
        .fullScreenCover(isPresented: $showingAuthentication) {
            AuthenticationView {
                showingAuthentication = false
                checkOnboardingStatus()
            }
        }
        .fullScreenCover(isPresented: $showingOnboarding) {
            OnboardingView {
                showingOnboarding = false
            }
            .environment(\.managedObjectContext, viewContext)
        }
    }
    
    private func checkAuthenticationStatus() {
        guard !hasCheckedAuth else { return }
        hasCheckedAuth = true
        
        if !apiService.isLoggedIn {
            showingAuthentication = true
        } else {
            checkOnboardingStatus()
        }
    }
    
    private func checkOnboardingStatus() {
        // Check if current API user has completed onboarding
        if let user = apiService.currentUser, !user.onboardingCompleted {
            showingOnboarding = true
        }
    }
}

#Preview {
    ContentView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}
