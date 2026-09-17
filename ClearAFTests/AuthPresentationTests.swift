import Testing
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
                    AuthForm.confirmationSent, AuthForm.recoverySent, AuthForm.recoveryNeedsEmail]
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

    @Test func wordmarkFollowsTheLockupType() {
        #expect(ClearAFWordmark.size == 22)
        #expect(ClearAFWordmark.trackingEm == 0.18)
    }
}
