import SwiftUI
import UIKit
import AVFoundation
import CoreData
import Combine

struct OnboardingView: View {
    @StateObject private var saveState = AccountSaveState()
    @State private var userName = ""
    let onboardingComplete: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: .spaceXXL) {
                Image(systemName: "sparkles")
                    .font(.largeTitle)
                    .foregroundStyle(Color.primaryPurple)
                    .accessibilityHidden(true)
                Text("Welcome to Clear AF")
                    .font(.largeTitle.bold())
                Text("Keep a dated photo history and follow the morning or evening routines assigned by your clinician.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: .spaceLG) {
                    Label("Photos stay dated so you and your care team can review changes over time.", systemImage: "camera")
                    Label("Routines show only assignments from your clinician and let you record completion.", systemImage: "checklist")
                }
                .font(.body)
                .fixedSize(horizontal: false, vertical: true)
                VStack(alignment: .leading, spacing: .spaceSM) {
                    Text("Your name").font(.headline)
                    TextField("Your name", text: $userName)
                        .textContentType(.name)
                        .standardTextField()
                        .accessibilityIdentifier("onboardingName")
                    Text("Use between 2 and 100 characters.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Button(action: completeOnboarding) {
                    HStack {
                        if saveState.isSaving { SwiftUI.ProgressView().tint(.white) }
                        Text(saveState.isSaving ? "Saving…" : "Continue")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .accessibilityIdentifier("onboardingContinue")
                .disabled(!canSubmit)
                if let saveError = saveState.errorMessage {
                    VStack(alignment: .leading, spacing: .spaceSM) {
                        Text(saveError).foregroundStyle(.red).accessibilityIdentifier("onboardingError")
                        Button("Try again", action: completeOnboarding)
                            .accessibilityIdentifier("onboardingRetry")
                            .disabled(!canSubmit)
                    }
                }
            }
            .padding(.spaceXXL)
            .frame(maxWidth: 600, alignment: .leading)
        }
        .background(Color.backgroundPrimary.ignoresSafeArea())
        .onAppear {
            if userName.isEmpty { userName = APIService.shared.currentUser?.name ?? "" }
        }
    }

    private var canSubmit: Bool {
        AccountName.canSubmit(userName, isSaving: saveState.isSaving)
    }

    private func completeOnboarding() {
        let name = userName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard AccountName.canSubmit(name, isSaving: saveState.isSaving) else { return }
        Task { @MainActor in
            await saveState.perform(success: nil,
                failure: "Your profile could not be saved. Check your connection and try again.") {
                try await APIService.shared.finishOnboarding(name: name)
            }
            if saveState.errorMessage == nil {
                onboardingComplete()
            }
        }
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
                        description: "View clinician-assigned morning and evening routines and record completion"
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
