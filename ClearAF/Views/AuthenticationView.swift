import Auth
import SwiftUI

/// Sign-in copy and validation (spec §6 #1, §5, §7). The rules are the ones the screen already enforced.
enum AuthForm {
    enum Failure { case signIn, register, recovery }

    static let intro = "Photos, routines and notes are shared only with the clinician assigned to you."
    static let confirmationSent = "Check your email to confirm your account, then sign in."
    static let recoverySent = "If an account exists, a password reset email is on its way. Open the link on this device."
    static let recoveryNeedsEmail = "Enter your email above, then choose Forgot password."
    static let offline = "You're offline. Check your connection and try again."
    static let wrongCredentials = "That email and password don't match. Check them and try again."

    static func isValid(registering: Bool, name: String, email: String, password: String) -> Bool {
        if registering {
            return name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 && email.contains("@") && password.count >= 8
        }
        return !email.isEmpty && !password.isEmpty
    }

    static func title(registering: Bool) -> String {
        registering ? "Create your account" : "A record of your skin, kept properly."
    }

    static func submit(registering: Bool, loading: Bool) -> String {
        switch (registering, loading) {
        case (false, false): "Sign in"
        case (false, true): "Signing in…"
        case (true, false): "Create account"
        case (true, true): "Creating account…"
        }
    }

    static func disabledReason(registering: Bool) -> String {
        registering ? "Enter your name, email and a password of at least 8 characters." : "Enter your email and password to sign in."
    }

    static func modeQuestion(registering: Bool) -> String { registering ? "Already have an account?" : "No account yet?" }
    static func modeAction(registering: Bool) -> String { registering ? "Sign in" : "Create one" }

    static func message(_ failure: Failure) -> String {
        switch failure {
        case .signIn: "Couldn't sign in. Check your email, password and connection, then try again."
        case .register: "Couldn't create your account. Check your details and connection, then try again."
        case .recovery: "Couldn't send a reset email. Check your connection and try again."
        }
    }

    /// Names the problem when the error says what it is; otherwise the general sentence for that step.
    /// Supabase Auth tags a wrong email or password with the `invalid_credentials` code, only on sign-in.
    static func failureMessage(for error: Error, during failure: Failure) -> String {
        if let urlError = error as? URLError,
           [.notConnectedToInternet, .networkConnectionLost, .timedOut].contains(urlError.code) {
            return offline
        }
        if failure == .signIn, let authError = error as? AuthError, authError.errorCode == .invalidCredentials {
            return wrongCredentials
        }
        return message(failure)
    }
}

/// Sign in and create account (spec §6 #1). Errors are inline and keep what was typed.
struct AuthenticationView: View {
    private enum Field { case name, email, password }
    @StateObject private var supabaseService = SupabaseService.shared
    @ObservedObject private var api = APIService.shared
    @State private var information = ""
    @State private var failure: String?
    @State private var isRegistering = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var showingPassword = false
    @State private var isLoading = false
    @FocusState private var focus: Field?

    let onAuthenticationSuccess: () -> Void

    private var valid: Bool { AuthForm.isValid(registering: isRegistering, name: name, email: email, password: password) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                LetterpressLockup(height: LetterpressLockup.signInHeight)
                    .padding(.top, Letterpress.Space.s28)
                Text(AuthForm.title(registering: isRegistering))
                    .font(Letterpress.display(34, relativeTo: .largeTitle))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s44)
                Text(AuthForm.intro)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s14)
                fields
                    .padding(.top, Letterpress.Space.s28)
                actions
                    .padding(.top, Letterpress.Space.s28)
                ViewThatFits(in: .horizontal) {
                    HStack {
                        forgotButton
                        Spacer(minLength: Letterpress.Space.s10)
                        modeButton
                    }
                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                        forgotButton
                        modeButton
                    }
                }
                .padding(.top, Letterpress.Space.s18)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Letterpress.canvas.ignoresSafeArea())
        // Swapping SecureField and TextField drops focus; put it back so typing can continue.
        .onChange(of: showingPassword) { focus = .password }
        .sensoryFeedback(.error, trigger: failure) { _, new in new != nil }
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s22) {
            if isRegistering {
                LetterpressLabeledField(label: "Full name", isEmpty: name.isEmpty) {
                    TextField(text: $name, prompt: nil) { Text("Full name") }
                        .textContentType(.name)
                        .textInputAutocapitalization(.words)
                        .focused($focus, equals: .name)
                        .submitLabel(.next)
                        .onSubmit { focus = .email }
                        .accessibilityIdentifier("authName")
                }
            }
            LetterpressLabeledField(label: "Email", isEmpty: email.isEmpty) {
                TextField(text: $email, prompt: Text("name@example.com")) { Text("Email") }
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focus = .password }
                    .accessibilityIdentifier("authEmail")
            }
            LetterpressLabeledField(label: "Password", isEmpty: password.isEmpty) {
                HStack(spacing: Letterpress.Space.s10) {
                    Group {
                        if showingPassword {
                            TextField(text: $password, prompt: nil) { Text("Password") }
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        } else {
                            SecureField(text: $password, prompt: nil) { Text("Password") }
                        }
                    }
                    .textContentType(isRegistering ? .newPassword : .password)
                    .focused($focus, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { if canSubmit { submit() } }
                    .accessibilityIdentifier("authPassword")
                    Button(showingPassword ? "Hide" : "Show") { showingPassword.toggle() }
                        .buttonStyle(.letterpress(.underline))
                        .accessibilityLabel(showingPassword ? "Hide password" : "Show password")
                        .accessibilityIdentifier("authShowPassword")
                }
            }
        }
    }

    private var actions: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Button(AuthForm.submit(registering: isRegistering, loading: isLoading), action: submit)
            .buttonStyle(.letterpress(.filled, fullWidth: true))
            .disabled(!canSubmit)
            .accessibilityIdentifier("authSubmit")
            if let failure {
                Text(failure)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("authError")
            } else if !valid && !isLoading {
                Text(AuthForm.disabledReason(registering: isRegistering))
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !information.isEmpty {
                Text(information)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("authInformation")
            }
            if !api.accountError.isEmpty {
                Text(api.accountError)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder private var forgotButton: some View {
        if !isRegistering {
            Button("Forgot password", action: recoverPassword)
                .buttonStyle(.letterpress(.underline))
                .disabled(isLoading)
                .accessibilityIdentifier("authForgotPassword")
        }
    }

    private var modeButton: some View {
        Button {
            isRegistering.toggle()
            clearForm()
        } label: {
            Text("\(AuthForm.modeQuestion(registering: isRegistering)) \(Text(AuthForm.modeAction(registering: isRegistering)).underline().foregroundStyle(Letterpress.ink))")
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.inkSecondary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minHeight: Letterpress.minTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
        .accessibilityIdentifier("authMode")
    }

    private var canSubmit: Bool { valid && !isLoading }

    private func submit() {
        guard canSubmit else { return }
        isRegistering ? registerUser() : loginUser()
    }

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func registerUser() {
        isLoading = true
        failure = nil
        information = ""
        Task { @MainActor in
            defer { isLoading = false }
            do {
                let hasSession = try await supabaseService.signUp(email: trimmedEmail, password: password,
                                                                  name: name.trimmingCharacters(in: .whitespacesAndNewlines))
                if !hasSession {
                    information = AuthForm.confirmationSent
                    isRegistering = false
                    password = ""
                }
            } catch {
                failure = AuthForm.failureMessage(for: error, during: .register)
            }
        }
    }

    private func loginUser() {
        isLoading = true
        failure = nil
        information = ""
        Task { @MainActor in
            defer { isLoading = false }
            do { try await supabaseService.signIn(email: trimmedEmail, password: password) }
            catch { failure = AuthForm.failureMessage(for: error, during: .signIn) }
        }
    }

    private func recoverPassword() {
        failure = nil
        guard !trimmedEmail.isEmpty else {
            information = AuthForm.recoveryNeedsEmail
            return
        }
        isLoading = true
        information = ""
        Task { @MainActor in
            defer { isLoading = false }
            do {
                try await supabaseService.requestRecovery(email: trimmedEmail)
                information = AuthForm.recoverySent
            } catch {
                failure = AuthForm.failureMessage(for: error, during: .recovery)
            }
        }
    }

    /// Switching between sign in and create account keeps what was typed except the password.
    /// `showingPassword` is left alone: changing it moves focus to the password field.
    private func clearForm() {
        password = ""
        information = ""
        failure = nil
    }
}

#Preview {
    AuthenticationView {}
}
