import SwiftUI

/// Sign-in copy and validation (spec §6 #1, §5, §7). The rules are the ones the screen already enforced.
enum AuthForm {
    enum Failure { case signIn, register, recovery }

    static let intro = "Photos, routines and notes are shared only with the clinician assigned to you."
    static let confirmationSent = "Check your email to confirm your account, then sign in."
    static let recoverySent = "If an account exists, a password reset email is on its way. Open the link on this device."
    static let recoveryNeedsEmail = "Enter your email above, then choose Forgot password."

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
}

/// Text wordmark until the identity PR ships the mark (spec §10.3: Newsreader 300, lowercase, 0.18em, italic "af").
struct ClearAFWordmark: View {
    static let size: CGFloat = 22
    static let trackingEm: CGFloat = 0.18

    var body: some View {
        Text("clear\(Text("af").font(Letterpress.display(Self.size, italic: true, relativeTo: .title2)))")
            .font(Letterpress.display(Self.size, relativeTo: .title2))
            .tracking(Self.size * Self.trackingEm)
            .foregroundStyle(Letterpress.ink)
            .accessibilityLabel("ClearAF")
            .accessibilityAddTraits(.isHeader)
    }
}

/// Sign in and create account (spec §6 #1). Errors are inline and keep what was typed.
struct AuthenticationView: View {
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

    let onAuthenticationSuccess: () -> Void

    private var valid: Bool { AuthForm.isValid(registering: isRegistering, name: name, email: email, password: password) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ClearAFWordmark()
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
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s22) {
            if isRegistering {
                LetterpressLabeledField(label: "Full name", isEmpty: name.isEmpty) {
                    TextField(text: $name, prompt: nil) { Text("Full name") }
                        .textContentType(.name)
                        .textInputAutocapitalization(.words)
                        .accessibilityIdentifier("authName")
                }
            }
            LetterpressLabeledField(label: "Email", isEmpty: email.isEmpty) {
                TextField(text: $email, prompt: Text("name@example.com")) { Text("Email") }
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
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
            Button(AuthForm.submit(registering: isRegistering, loading: isLoading)) {
                isRegistering ? registerUser() : loginUser()
            }
            .buttonStyle(.letterpress(.filled, fullWidth: true))
            .disabled(!valid || isLoading)
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
                failure = AuthForm.message(.register)
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
            catch { failure = AuthForm.message(.signIn) }
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
                failure = AuthForm.message(.recovery)
            }
        }
    }

    private func clearForm() {
        email = ""
        password = ""
        name = ""
        failure = nil
        showingPassword = false
    }
}

#Preview {
    AuthenticationView {}
}
