import SwiftUI

enum RecoveryForm {
    static let minimum = 8

    static func problem(password: String, confirmation: String) -> String? {
        if password.count < minimum { return "Use at least 8 characters." }
        if password != confirmation { return "The two passwords don't match yet." }
        return nil
    }
}

/// New password after a recovery link (adapted to spec §6 #1). The update call and sign-out after it are unchanged.
struct PasswordRecoveryView: View {
    private enum Field { case password, confirmation }
    @State private var password = ""
    @State private var confirmation = ""
    @State private var saving = false
    @State private var error = ""
    @FocusState private var focus: Field?

    private var canSave: Bool { !saving && RecoveryForm.problem(password: password, confirmation: confirmation) == nil }

    var body: some View {
        let problem = RecoveryForm.problem(password: password, confirmation: confirmation)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                LetterpressLockup(height: LetterpressLockup.signInHeight)
                    .padding(.top, Letterpress.Space.s28)
                Text("Choose a new password")
                    .font(Letterpress.display(34, relativeTo: .largeTitle))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s44)
                Text("You opened a reset link. Set a new password, then sign in with it.")
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s14)
                VStack(alignment: .leading, spacing: Letterpress.Space.s22) {
                    LetterpressLabeledField(label: "New password", isEmpty: password.isEmpty) {
                        SecureField(text: $password, prompt: nil) { Text("New password") }
                            .textContentType(.newPassword)
                            .focused($focus, equals: .password)
                            .submitLabel(.next)
                            .onSubmit { focus = .confirmation }
                            .accessibilityIdentifier("recoveryPassword")
                    }
                    LetterpressLabeledField(label: "Confirm password", isEmpty: confirmation.isEmpty) {
                        SecureField(text: $confirmation, prompt: nil) { Text("Confirm password") }
                            .textContentType(.newPassword)
                            .focused($focus, equals: .confirmation)
                            .submitLabel(.go)
                            .onSubmit { if canSave { save() } }
                            .accessibilityIdentifier("recoveryConfirmation")
                    }
                }
                .padding(.top, Letterpress.Space.s28)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Button(saving ? "Saving…" : "Update password", action: save)
                        .buttonStyle(.letterpress(.filled, fullWidth: true))
                        .disabled(!canSave)
                        .accessibilityIdentifier("recoverySubmit")
                    if !error.isEmpty {
                        Text(error)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                            .fixedSize(horizontal: false, vertical: true)
                    } else if let problem, !saving {
                        Text(problem)
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                    Button("Cancel and sign out") { APIService.shared.logout() }
                        .buttonStyle(.letterpress(.underline))
                        .disabled(saving)
                }
                .padding(.top, Letterpress.Space.s28)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Letterpress.canvas.ignoresSafeArea())
        .announcing(error)
    }

    private func save() {
        guard canSave else { return }
        saving = true
        error = ""
        Task { @MainActor in
            defer { saving = false }
            do { try await APIService.shared.updateRecoveredPassword(password) }
            catch { self.error = "Couldn't update your password. Try again or request a new reset email." }
        }
    }
}
