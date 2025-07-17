import SwiftUI
import UIKit
import AVFoundation
import CoreData

struct OnboardingView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @State private var currentPage = 0
    @State private var userName = ""
    @State private var selectedSkinType = "Normal"
    @State private var showingImagePicker = false
    @State private var cameraPermissionGranted = false
    
    let onboardingComplete: () -> Void
    
    let skinTypes = ["Normal", "Dry", "Oily", "Combination", "Sensitive"]
    
    var body: some View {
        ZStack {
            Color.backgroundPrimary.ignoresSafeArea()
            
            TabView(selection: $currentPage) {
                // Welcome Screen
                WelcomeScreen()
                    .tag(0)
                
                // App Explanation
                AppExplanationScreen()
                    .tag(1)
                
                // Profile Setup
                ProfileSetupScreen(userName: $userName, selectedSkinType: $selectedSkinType)
                    .tag(2)
                
                // Camera Permissions
                CameraPermissionsScreen(cameraPermissionGranted: $cameraPermissionGranted)
                    .tag(3)
                
                // First Photo Guidance
                FirstPhotoScreen(showingImagePicker: $showingImagePicker)
                    .tag(4)
            }
            .tabViewStyle(PageTabViewStyle(indexDisplayMode: .never))
            .animation(.easeInOut, value: currentPage)
            
            // Navigation Controls
            VStack {
                Spacer()
                
                HStack {
                    // Back Button
                    if currentPage > 0 {
                        Button(action: {
                            HapticManager.light()
                            withAnimation {
                                currentPage -= 1
                            }
                        }) {
                            HStack {
                                Image(systemName: "chevron.left")
                                Text("Back")
                            }
                            .font(.headlineMedium)
                            .foregroundColor(.primaryPurple)
                            .padding(.horizontal, .spaceXL)
                            .padding(.vertical, .spaceLG)
                            .background(Color.backgroundSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                        }
                    } else {
                        Spacer()
                    }
                    
                    Spacer()
                    
                    // Page Indicator
                    HStack(spacing: .spaceXS) {
                        ForEach(0..<5, id: \.self) { index in
                            Circle()
                                .fill(index == currentPage ? Color.primaryPurple : Color.backgroundSecondary)
                                .frame(width: 8, height: 8)
                                .animation(.easeInOut, value: currentPage)
                        }
                    }
                    
                    Spacer()
                    
                    // Next/Complete Button
                    Button(action: nextAction) {
                        Text(nextButtonText)
                            .font(.headlineMedium)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)
                            .padding(.horizontal, .spaceXL)
                            .padding(.vertical, .spaceLG)
                            .background(
                                isNextButtonEnabled ? 
                                AnyView(Color.primaryGradient) : 
                                AnyView(Color.buttonDisabled)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                    }
                    .disabled(!isNextButtonEnabled)
                }
                .padding(.horizontal, .spaceXXL)
                .padding(.bottom, .spaceHuge)
            }
        }
        .sheet(isPresented: $showingImagePicker) {
            CameraView()
        }
    }
    
    private var nextButtonText: String {
        switch currentPage {
        case 4: return "Get Started"
        default: return "Next"
        }
    }
    
    private var isNextButtonEnabled: Bool {
        switch currentPage {
        case 2: 
            let trimmedName = userName.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmedName.count >= 2 && !selectedSkinType.isEmpty
        case 3: return cameraPermissionGranted
        default: return true
        }
    }
    
    private func nextAction() {
        HapticManager.medium()
        
        if currentPage == 4 {
            // Complete onboarding
            completeOnboarding()
        } else {
            withAnimation {
                currentPage += 1
            }
        }
    }
    
    private func completeOnboarding() {
        // Validate input
        let trimmedName = userName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedName.count >= 2, !selectedSkinType.isEmpty else {
            print("Validation failed: Name too short or skin type not selected")
            return
        }
        
        // Create user profile
        let newUser = User(context: viewContext)
        newUser.id = UUID()
        newUser.name = trimmedName
        newUser.skinType = selectedSkinType
        newUser.currentSkinScore = 50 // Starting baseline score
        newUser.streakCount = 0
        newUser.joinDate = Date()
        newUser.onboardingCompleted = true
        
        do {
            try viewContext.save()
            HapticManager.success()
            onboardingComplete()
        } catch {
            print("Error completing onboarding: \(error)")
            HapticManager.error()
            // Could add user-facing error handling here
        }
    }
    
    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

// MARK: - Onboarding Screens

struct WelcomeScreen: View {
    var body: some View {
        VStack(spacing: .spaceHuge) {
            Spacer()
            
            VStack(spacing: .spaceXXL) {
                // App Icon/Logo
                ZStack {
                    Circle()
                        .fill(Color.primaryGradient)
                        .frame(width: 120, height: 120)
                        .glowShadow()
                    
                    Image(systemName: "sparkles")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundColor(.white)
                }
                
                VStack(spacing: .spaceLG) {
                    Text("Welcome to")
                        .font(.headlineLarge)
                        .foregroundColor(.textSecondary)
                    
                    Text("Clear AF")
                        .font(.displayLarge)
                        .fontWeight(.bold)
                        .foregroundColor(.textPrimary)
                    
                    Text("Your journey to clearer skin starts here")
                        .font(.bodyLarge)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, .spaceHuge)
                }
            }
            
            Spacer()
        }
    }
}

struct AppExplanationScreen: View {
    var body: some View {
        VStack(spacing: .spaceHuge) {
            Spacer()
            
            VStack(spacing: .spaceXXL) {
                Text("Track Your Progress")
                    .font(.displayMedium)
                    .fontWeight(.bold)
                    .foregroundColor(.textPrimary)
                    .multilineTextAlignment(.center)
                
                VStack(spacing: .spaceXXL) {
                    FeatureCard(
                        icon: "camera.fill",
                        title: "Daily Photos",
                        description: "Take progress photos to see your skin improve over time"
                    )
                    
                    FeatureCard(
                        icon: "list.bullet.clipboard.fill",
                        title: "Skincare Routines",
                        description: "Create and follow personalized morning and evening routines"
                    )
                    
                    FeatureCard(
                        icon: "chart.line.uptrend.xyaxis",
                        title: "Track Improvements",
                        description: "Monitor your skin score and maintain your streak"
                    )
                }
            }
            
            Spacer()
        }
        .padding(.horizontal, .spaceXXL)
    }
}

struct ProfileSetupScreen: View {
    @Binding var userName: String
    @Binding var selectedSkinType: String
    
    let skinTypes = [
        ("Normal", "Balanced, neither too oily nor too dry"),
        ("Dry", "Feels tight, flaky, or rough"),
        ("Oily", "Shiny, greasy, prone to breakouts"),
        ("Combination", "Oily T-zone, dry or normal cheeks"),
        ("Sensitive", "Easily irritated, reacts to products")
    ]
    
    var body: some View {
        VStack(spacing: .spaceHuge) {
            Spacer()
            
            VStack(spacing: .spaceXXL) {
                Text("Let's Get Started")
                    .font(.displayMedium)
                    .fontWeight(.bold)
                    .foregroundColor(.textPrimary)
                
                VStack(spacing: .spaceXL) {
                    VStack(alignment: .leading, spacing: .spaceMD) {
                        Text("What's your name?")
                            .font(.headlineMedium)
                            .foregroundColor(.textPrimary)
                        
                        TextField("Enter your name", text: $userName)
                            .font(.bodyLarge)
                            .standardTextField()
                            .submitLabel(.done)
                            .onSubmit {
                                hideKeyboard()
                            }
                    }
                    
                    VStack(alignment: .leading, spacing: .spaceMD) {
                        Text("What's your skin type?")
                            .font(.headlineMedium)
                            .foregroundColor(.textPrimary)
                        
                        VStack(spacing: .spaceSM) {
                            ForEach(skinTypes, id: \.0) { skinType in
                                Button(action: {
                                    HapticManager.light()
                                    selectedSkinType = skinType.0
                                }) {
                                    HStack {
                                        Image(systemName: selectedSkinType == skinType.0 ? "checkmark.circle.fill" : "circle")
                                            .foregroundColor(selectedSkinType == skinType.0 ? .primaryPurple : .textTertiary)
                                        
                                        VStack(alignment: .leading, spacing: .spaceXS) {
                                            Text(skinType.0)
                                                .font(.bodyLarge)
                                                .fontWeight(.medium)
                                                .foregroundColor(.textPrimary)
                                            
                                            Text(skinType.1)
                                                .font(.bodyMedium)
                                                .foregroundColor(.textSecondary)
                                        }
                                        
                                        Spacer()
                                    }
                                    .padding(.spaceLG)
                                    .background(
                                        selectedSkinType == skinType.0 ? 
                                        Color.primaryPurple.opacity(0.1) : Color.backgroundSecondary
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
                                }
                                .buttonStyle(PlainButtonStyle())
                            }
                        }
                    }
                }
            }
            
            Spacer()
        }
        .padding(.horizontal, .spaceXXL)
        .onTapGesture {
            hideKeyboard()
        }
    }
    
    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

struct CameraPermissionsScreen: View {
    @Binding var cameraPermissionGranted: Bool
    
    var body: some View {
        VStack(spacing: .spaceHuge) {
            Spacer()
            
            VStack(spacing: .spaceXXL) {
                ZStack {
                    Circle()
                        .fill(Color.primaryPurple.opacity(0.2))
                        .frame(width: 120, height: 120)
                    
                    Image(systemName: "camera.fill")
                        .font(.system(size: 48))
                        .foregroundColor(.primaryPurple)
                }
                
                VStack(spacing: .spaceLG) {
                    Text("Camera Access")
                        .font(.displayMedium)
                        .fontWeight(.bold)
                        .foregroundColor(.textPrimary)
                    
                    Text("To track your skin progress, Clear AF needs access to your camera and photo library")
                        .font(.bodyLarge)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, .spaceXL)
                }
                
                VStack(spacing: .spaceLG) {
                    PermissionFeature(
                        icon: "camera.fill",
                        title: "Take Progress Photos",
                        description: "Capture daily photos to track improvements"
                    )
                    
                    PermissionFeature(
                        icon: "photo.on.rectangle.angled",
                        title: "Access Photo Library",
                        description: "Choose existing photos for your timeline"
                    )
                    
                    PermissionFeature(
                        icon: "lock.shield.fill",
                        title: "Privacy Protected",
                        description: "Your photos stay on your device"
                    )
                }
                
                Button(action: requestCameraPermission) {
                    Text(cameraPermissionGranted ? "Permission Granted" : "Grant Camera Access")
                        .font(.headlineMedium)
                        .fontWeight(.semibold)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, .spaceLG)
                        .background(
                            cameraPermissionGranted ? 
                            AnyView(Color.scoreExcellent) : 
                            AnyView(Color.primaryGradient)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                }
                .disabled(cameraPermissionGranted)
            }
            
            Spacer()
        }
        .padding(.horizontal, .spaceXXL)
    }
    
    private func requestCameraPermission() {
        HapticManager.medium()
        
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                cameraPermissionGranted = granted
                if granted {
                    HapticManager.success()
                }
            }
        }
    }
}

struct FirstPhotoScreen: View {
    @Binding var showingImagePicker: Bool
    
    var body: some View {
        VStack(spacing: .spaceHuge) {
            Spacer()
            
            VStack(spacing: .spaceXXL) {
                ZStack {
                    Circle()
                        .fill(Color.scoreExcellent.opacity(0.2))
                        .frame(width: 120, height: 120)
                    
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(.scoreExcellent)
                }
                
                VStack(spacing: .spaceLG) {
                    Text("You're All Set!")
                        .font(.displayMedium)
                        .fontWeight(.bold)
                        .foregroundColor(.textPrimary)
                    
                    Text("Ready to start your skincare journey? Take your first progress photo to establish your baseline")
                        .font(.bodyLarge)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, .spaceXL)
                }
                
                VStack(spacing: .spaceLG) {
                    PhotoTip(
                        icon: "lightbulb.fill",
                        tip: "Take photos in consistent lighting for better progress tracking"
                    )
                    
                    PhotoTip(
                        icon: "arrow.clockwise",
                        tip: "Try to take photos at the same time each day"
                    )
                    
                    PhotoTip(
                        icon: "face.smiling",
                        tip: "Use the same angle and expression for consistency"
                    )
                }
                
                Button(action: {
                    HapticManager.medium()
                    showingImagePicker = true
                }) {
                    HStack {
                        Image(systemName: "camera.fill")
                        Text("Take First Photo")
                    }
                    .font(.headlineMedium)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, .spaceLG)
                    .background(Color.primaryGradient)
                    .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                }
            }
            
            Spacer()
        }
        .padding(.horizontal, .spaceXXL)
    }
}

// MARK: - Helper Components

struct FeatureCard: View {
    let icon: String
    let title: String
    let description: String
    
    var body: some View {
        HStack(spacing: .spaceLG) {
            ZStack {
                Circle()
                    .fill(Color.primaryPurple.opacity(0.2))
                    .frame(width: 60, height: 60)
                
                Image(systemName: icon)
                    .font(.system(size: 24))
                    .foregroundColor(.primaryPurple)
            }
            
            VStack(alignment: .leading, spacing: .spaceXS) {
                Text(title)
                    .font(.headlineMedium)
                    .foregroundColor(.textPrimary)
                
                Text(description)
                    .font(.bodyMedium)
                    .foregroundColor(.textSecondary)
            }
            
            Spacer()
        }
    }
}

struct PermissionFeature: View {
    let icon: String
    let title: String
    let description: String
    
    var body: some View {
        HStack(spacing: .spaceLG) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(.primaryPurple)
                .frame(width: 24)
            
            VStack(alignment: .leading, spacing: .spaceXS) {
                Text(title)
                    .font(.bodyLarge)
                    .fontWeight(.medium)
                    .foregroundColor(.textPrimary)
                
                Text(description)
                    .font(.bodyMedium)
                    .foregroundColor(.textSecondary)
            }
            
            Spacer()
        }
    }
}

struct PhotoTip: View {
    let icon: String
    let tip: String
    
    var body: some View {
        HStack(spacing: .spaceMD) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(.primaryTeal)
                .frame(width: 20)
            
            Text(tip)
                .font(.bodyMedium)
                .foregroundColor(.textSecondary)
            
            Spacer()
        }
        .padding(.spaceLG)
        .background(Color.primaryTeal.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
    }
}

#Preview {
    OnboardingView {
        print("Onboarding completed")
    }
    .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
    .preferredColorScheme(.dark)
}