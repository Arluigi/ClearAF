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
                    .foregroundStyle(Letterpress.inkSecondary)
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
                        .letterpressField(isEmpty: userName.isEmpty)
                        .accessibilityIdentifier("onboardingName")
                    Text("Use between 2 and 100 characters.")
                        .font(.footnote)
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                Button(action: completeOnboarding) {
                    HStack {
                        if saveState.isSaving { SwiftUI.ProgressView().tint(Letterpress.inkTertiary) }
                        Text(saveState.isSaving ? "Saving…" : "Continue")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .accessibilityIdentifier("onboardingContinue")
                .disabled(!canSubmit)
                if let saveError = saveState.errorMessage {
                    VStack(alignment: .leading, spacing: .spaceSM) {
                        Text(saveError).foregroundStyle(Letterpress.error).accessibilityIdentifier("onboardingError")
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

#Preview {
    OnboardingView {
        print("Onboarding completed")
    }
    .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
    .preferredColorScheme(.dark)
}
