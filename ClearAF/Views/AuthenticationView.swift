import SwiftUI
import Combine

struct AuthenticationView: View {
    @StateObject private var supabaseService = SupabaseService.shared
    @State private var information = ""
    @State private var isRegistering = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var isLoading = false
    @State private var errorMessage = ""
    @State private var showError = false

    let onAuthenticationSuccess: () -> Void

    var body: some View {
        ZStack {
            Letterpress.canvas.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 32) {
                    // Header
                    VStack(spacing: 16) {
                        Image(systemName: "cross.case.fill")
                            .font(.system(size: 60))
                            .foregroundColor(Letterpress.ink)

                        Text("Clear AF")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(Letterpress.ink)

                        Text(isRegistering ? "Create your account" : "Welcome back")
                            .font(.title2)
                            .foregroundColor(Letterpress.inkSecondary)
                    }
                    .padding(.top, 50)

                    // Form
                    VStack(spacing: 20) {
                        if isRegistering {
                            CustomTextField(
                                title: "Full Name",
                                text: $name,
                                placeholder: "Enter your full name"
                            )
                        }

                        CustomTextField(
                            title: "Email",
                            text: $email,
                            placeholder: "Enter your email", keyboardType: .emailAddress, autocapitalization: .never
                        )
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)

                        CustomTextField(
                            title: "Password",
                            text: $password,
                            placeholder: "Enter your password",
                            isSecure: true
                        )
                    }
                    .padding(.horizontal, 24)

                    // Action Button
                    Button(action: {
                        if isRegistering {
                            registerUser()
                        } else {
                            loginUser()
                        }
                    }) {
                        HStack {
                            if isLoading {
                                SwiftUI.ProgressView()
                                    .tint(Letterpress.inkTertiary)
                            } else {
                                Text(isRegistering ? "Create Account" : "Sign In")
                            }
                        }
                    }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .accessibilityIdentifier("authSubmit")
                    .disabled(!isFormValid || isLoading)
                    .padding(.horizontal, 24)

                    if !information.isEmpty { Text(information).padding(.horizontal, 24).accessibilityIdentifier("authInformation") }
                    if !APIService.shared.accountError.isEmpty { Text(APIService.shared.accountError).padding(.horizontal, 24) }
                    if !isRegistering {
                        Button("Forgot password?", action: recoverPassword)
                            .disabled(email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading)
                    }
                    // Toggle Authentication Mode
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            isRegistering.toggle()
                            clearForm()
                        }
                    }) {
                        HStack(spacing: 4) {
                            Text(isRegistering ? "Already have an account?" : "Don't have an account?")
                                .foregroundColor(Letterpress.inkSecondary)
                            Text(isRegistering ? "Sign In" : "Sign Up")
                                .foregroundColor(Letterpress.ink)
                                .fontWeight(.semibold)
                                .underline()
                        }
                    }

                    .accessibilityIdentifier("authMode")
                    .disabled(isLoading)

                    Spacer(minLength: 50)
                }
            }
        }
        .alert("Error", isPresented: $showError) {
            Button("OK") { }
        } message: {
            Text(errorMessage)
        }
    }

    private var isFormValid: Bool {
        if isRegistering {
            return name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 && email.contains("@") && password.count >= 8
        } else {
            return !email.isEmpty && !password.isEmpty
        }
    }

    private func registerUser() {
        isLoading = true
        Task { @MainActor in
            defer { isLoading = false }
            do {
                let hasSession = try await supabaseService.signUp(email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                    password: password, name: name.trimmingCharacters(in: .whitespacesAndNewlines))
                if !hasSession {
                    information = "Check your email to confirm your account, then sign in."
                    isRegistering = false
                    password = ""
                }
            } catch { handleError(error) }
        }
    }
    private func loginUser() {
        isLoading = true
        Task { @MainActor in
            defer { isLoading = false }
            do { try await supabaseService.signIn(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password) }
            catch { handleError(error) }
        }
    }
    private func recoverPassword() {
        isLoading = true
        Task { @MainActor in
            defer { isLoading = false }
            do {
                try await supabaseService.requestRecovery(email: email.trimmingCharacters(in: .whitespacesAndNewlines))
                information = "If an account exists, a password reset email is on its way. Open the link on this device."
            } catch { handleError(error) }
        }
    }

    private func handleError(_ error: Error) {
        errorMessage = "Unable to continue. Check your details and connection, then try again."
        showError = true
    }

    private func clearForm() {
        email = ""
        password = ""
        name = ""
        errorMessage = ""
    }
}

// MARK: - Custom Text Field
struct CustomTextField: View {
    let title: String
    @Binding var text: String
    let placeholder: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .words

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .letterpressEyebrow()

            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .keyboardType(keyboardType)
                        .textInputAutocapitalization(autocapitalization)
                }
            }
            .letterpressField(isEmpty: text.isEmpty)
        }
    }
}

// MARK: - Preview
struct AuthenticationView_Previews: PreviewProvider {
    static var previews: some View {
        AuthenticationView {
            print("Authentication successful")
        }
    }
}
