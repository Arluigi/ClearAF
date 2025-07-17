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
    @State private var selectedTab = 0
    @State private var showingOnboarding = false
    @State private var hasCheckedOnboarding = false
    
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    
    var body: some View {
        ZStack {
            TabView(selection: $selectedTab) {
                DashboardViewEnhanced(selectedTab: $selectedTab)
                    .tabItem {
                        Image(systemName: "house.fill")
                        Text("Home")
                    }
                    .tag(0)
                
                TimelineView()
                    .tabItem {
                        Image(systemName: "clock.fill")
                        Text("Timeline")
                    }
                    .tag(1)
                
                RoutineView()
                    .tabItem {
                        Image(systemName: "list.bullet")
                        Text("Routines")
                    }
                    .tag(2)
                
                ProfileView()
                    .tabItem {
                        Image(systemName: "person.fill")
                        Text("Profile")
                    }
                    .tag(3)
            }
            .accentColor(.primaryPurple)
        }
        .onAppear {
            checkOnboardingStatus()
        }
        .fullScreenCover(isPresented: $showingOnboarding) {
            OnboardingView {
                showingOnboarding = false
            }
            .environment(\.managedObjectContext, viewContext)
        }
    }
    
    private func checkOnboardingStatus() {
        guard !hasCheckedOnboarding else { return }
        hasCheckedOnboarding = true
        
        // Check if any user exists with completed onboarding
        let hasCompletedUser = users.contains { $0.onboardingCompleted }
        
        if !hasCompletedUser {
            showingOnboarding = true
        }
    }
}

#Preview {
    ContentView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}
