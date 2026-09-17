import SwiftUI
import UIKit
import CoreData

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var showingRemovalInfo = false
    @State private var name = ""
    @StateObject private var saveState = AccountSaveState()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s22) {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                        Text("Name").font(.headline)
                        TextField("Your name", text: $name, axis: .vertical)
                            .textContentType(.name)
                            .letterpressField(isEmpty: name.isEmpty)
                            .accessibilityIdentifier("profileName")
                        Button(action: saveName) {
                            HStack {
                                if saveState.isSaving { SwiftUI.ProgressView().tint(Letterpress.inkTertiary) }
                                Text(saveState.isSaving ? "Saving…" : "Save name")
                            }.frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.letterpress(.filled, fullWidth: true))
                        .accessibilityIdentifier("profileSaveName")
                        .disabled(!validName || saveState.isSaving)
                        if let saveError = saveState.errorMessage {
                            Text(saveError).foregroundStyle(Letterpress.error).accessibilityIdentifier("profileSaveError")
                        }
                        if let saveConfirmation = saveState.successMessage {
                            Text(saveConfirmation).foregroundStyle(Letterpress.inkSecondary).accessibilityIdentifier("profileSaveConfirmation")
                        }
                    }
                    VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                        Text("Email").font(.headline)
                        Text(APIService.shared.currentUser?.email ?? "Unavailable")
                            .font(.body)
                            .textSelection(.enabled)
                            .accessibilityLabel("Email")
                            .accessibilityValue(APIService.shared.currentUser?.email ?? "Unavailable")
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("profileEmail")
                    }
                    NavigationLink("Reminders") { ReminderSettingsView() }
                    Button("Account removal") { showingRemovalInfo = true }
                        .accessibilityHint("Explains the current account removal process")
                    Button(role: .destructive) { APIService.shared.logout() } label: {
                        Text("Sign out").foregroundStyle(Letterpress.error)
                    }
                        .accessibilityIdentifier("profileSignOut")
                }
                .padding(Letterpress.Space.s22)
                .frame(maxWidth: 600, alignment: .leading)
            }
            .navigationTitle("Profile")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: { dismiss() }) { Text("Close").font(.body) }
                        .accessibilityLabel("Close profile")
                }
            }
            .alert("Account removal is not available yet", isPresented: $showingRemovalInfo) {
                Button("OK") {}
            } message: {
                Text("The practice must finalize its record-retention and deletion process before account removal is enabled. Signing out ends access on this device; it does not delete your account or clinical records.")
            }
            .onAppear { name = APIService.shared.currentUser?.name ?? "" }
        }
    }

    private var validName: Bool {
        (2...100).contains(name.trimmingCharacters(in: .whitespacesAndNewlines).count)
    }

    private func saveName() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (2...100).contains(trimmed.count), !saveState.isSaving else { return }
        Task { @MainActor in
            await saveState.perform(success: "Name saved",
                failure: "Your name could not be saved. Check your connection and try again.") {
                try await APIService.shared.updateName(trimmed)
            }
            if saveState.errorMessage == nil {
                name = trimmed
            }
        }
    }
}

#Preview {
    ProfileView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
        .preferredColorScheme(.dark)
}
