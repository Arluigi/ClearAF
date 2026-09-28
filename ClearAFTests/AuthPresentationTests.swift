import Foundation
import Testing
import Auth
@testable import ClearAF

struct AuthPresentationTests {
    @Test func validationKeepsTheExistingRules() {
        #expect(AuthForm.isValid(registering: false, name: "", email: "a", password: "b"))
        #expect(!AuthForm.isValid(registering: false, name: "", email: "", password: "b"))
        #expect(AuthForm.isValid(registering: true, name: "Sam", email: "sam@example.invalid", password: "12345678"))
        #expect(!AuthForm.isValid(registering: true, name: " S ", email: "sam@example.invalid", password: "12345678"))
        #expect(!AuthForm.isValid(registering: true, name: "Sam", email: "sam", password: "12345678"))
        #expect(!AuthForm.isValid(registering: true, name: "Sam", email: "sam@example.invalid", password: "1234567"))
    }

    @Test func labelsAreSentenceCaseAndNameTheWork() {
        #expect(AuthForm.submit(registering: false, loading: false) == "Sign in")
        #expect(AuthForm.submit(registering: false, loading: true) == "Signing in…")
        #expect(AuthForm.submit(registering: true, loading: false) == "Create account")
        #expect(AuthForm.submit(registering: true, loading: true) == "Creating account…")
        #expect(AuthForm.modeQuestion(registering: false) == "No account yet?")
        #expect(AuthForm.modeAction(registering: false) == "Create one")
        #expect(AuthForm.modeAction(registering: true) == "Sign in")
    }

    @Test func copyHasNoExclamationsPlaceholdersOrPromises() {
        let copy = [AuthForm.title(registering: false), AuthForm.title(registering: true), AuthForm.intro,
                    AuthForm.disabledReason(registering: false), AuthForm.disabledReason(registering: true),
                    AuthForm.message(.signIn), AuthForm.message(.register), AuthForm.message(.recovery),
                    AuthForm.confirmationSent, AuthForm.recoverySent, AuthForm.recoveryNeedsEmail,
                    AuthForm.offline, AuthForm.wrongCredentials]
        for line in copy {
            #expect(!line.contains("!"), "\(line)")
            #expect(!line.contains("Dr. Om"), "\(line)")
        }
        #expect(AuthForm.intro.contains("clinician assigned to you"))
    }

    @Test func recoveryNamesTheProblemBeforeSaving() {
        #expect(RecoveryForm.problem(password: "short", confirmation: "short") == "Use at least 8 characters.")
        #expect(RecoveryForm.problem(password: "long-enough", confirmation: "long-enougH") == "The two passwords don't match yet.")
        #expect(RecoveryForm.problem(password: "long-enough", confirmation: "long-enough") == nil)
    }

    @Test func failuresNameOfflineAndWrongCredentialsAndOtherwiseStayGeneral() throws {
        for code in [URLError.Code.notConnectedToInternet, .networkConnectionLost, .timedOut] {
            for step in [AuthForm.Failure.signIn, .register, .recovery] {
                #expect(AuthForm.failureMessage(for: URLError(code), during: step) == "You're offline. Check your connection and try again.")
            }
        }
        #expect(AuthForm.failureMessage(for: URLError(.badServerResponse), during: .signIn) == AuthForm.message(.signIn))
        struct Other: Error {}
        #expect(AuthForm.failureMessage(for: Other(), during: .register) == AuthForm.message(.register))

        let url = try #require(URL(string: "http://127.0.0.1:54321/auth/v1/token"))
        let response = try #require(HTTPURLResponse(url: url, statusCode: 400, httpVersion: nil, headerFields: nil))
        let wrong = AuthError.api(message: "Invalid login credentials", errorCode: .invalidCredentials, underlyingData: Data(), underlyingResponse: response)
        #expect(AuthForm.failureMessage(for: wrong, during: .signIn) == AuthForm.wrongCredentials)
        #expect(AuthForm.failureMessage(for: wrong, during: .register) == AuthForm.message(.register))
        let unknown = AuthError.api(message: "Unexpected", errorCode: .unexpectedFailure, underlyingData: Data(), underlyingResponse: response)
        #expect(AuthForm.failureMessage(for: unknown, during: .signIn) == AuthForm.message(.signIn))
    }

    @Test func keyboardFlowAndAutoFillArePinnedInSource() throws {
        let root = LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views")
        let auth = try String(contentsOf: root.appendingPathComponent("AuthenticationView.swift"), encoding: .utf8)
        let recovery = try String(contentsOf: root.appendingPathComponent("PasswordRecoveryView.swift"), encoding: .utf8)
        #expect(auth.contains(".textContentType(isRegistering ? .newPassword : .password)"))
        #expect(auth.contains(".submitLabel(.go)") && auth.contains(".submitLabel(.next)"))
        #expect(auth.contains(".onChange(of: showingPassword) { focus = .password }"))
        #expect(recovery.components(separatedBy: ".textContentType(.newPassword)").count == 3)
        #expect(recovery.contains(".submitLabel(.go)") && recovery.contains(".scrollDismissesKeyboard(.interactively)"))
    }
}
