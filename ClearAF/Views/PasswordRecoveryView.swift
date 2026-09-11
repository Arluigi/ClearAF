import SwiftUI

struct PasswordRecoveryView: View {
    @State private var password = ""
    @State private var confirmation = ""
    @State private var saving = false
    @State private var error = ""
    var body: some View {
        VStack(spacing: 20) {
            Text("Choose a new password").font(.title)
            SecureField("New password (at least 8 characters)", text: $password).textContentType(.newPassword)
            SecureField("Confirm new password", text: $confirmation).textContentType(.newPassword)
            if !error.isEmpty { Text(error) }
            Button(saving ? "Saving…" : "Update password") {
                saving = true
                Task { @MainActor in
                    defer { saving = false }
                    do { try await APIService.shared.updateRecoveredPassword(password) }
                    catch { self.error = "Password could not be updated. Try again or request a new reset email." }
                }
            }.disabled(saving || password.count < 8 || password != confirmation)
            Button("Cancel and sign out") { APIService.shared.logout() }.disabled(saving)
        }.textFieldStyle(.roundedBorder).padding()
    }
}
