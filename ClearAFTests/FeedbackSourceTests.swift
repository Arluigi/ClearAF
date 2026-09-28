import Foundation
import Testing

/// Haptics mark outcomes, never navigation (design audit B1). A unit test can only see this in source.
struct FeedbackSourceTests {
    static func view(_ name: String) throws -> String {
        try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views/\(name).swift"), encoding: .utf8)
    }

    @Test func hapticManagerIsGone() throws {
        #expect(try LetterpressSweepTests.offences(#"HapticManager|UIImpactFeedbackGenerator|UINotificationFeedbackGenerator|UISelectionFeedbackGenerator"#,
                                                   in: ["ClearAF"]) == [])
        #expect(try Self.view("InteractionHelpers").contains("func accessibleButton("))
    }

    @Test func openingProfileIsNotAnOutcome() throws {
        let today = try Self.view("DashboardViewEnhanced")
        #expect(!today.contains(".sensoryFeedback("))
        #expect(today.contains("showingProfile = true"))
    }

    @Test func eachOutcomeHasItsFeedback() throws {
        let sites: [(file: String, pins: [String])] = [
            ("RoutineChecklist", [".sensoryFeedback(.selection, trigger: ticked)",
                                  ".sensoryFeedback(.success, trigger: status) { old, new in old == .unrecorded && new != .unrecorded }"]),
            ("MessagingView", [".modifier(NoteSendFeedback(lastOwnID: repository.messages.last { $0.senderType == \"patient\" }?.id",
                               ".sensoryFeedback(.success, trigger: lastOwnID) { (_: UUID?, new: UUID?) in new != nil && new == sendingID }",
                               ".sensoryFeedback(.error, trigger: sending) { old, new in old && !new && draftHeld }"]),
            ("CheckInView", [".sensoryFeedback(.selection, trigger: CheckInFlow.answer(for: question, in: answers)?.optionId)",
                             ".modifier(CheckInSendFeedback(status: repository.status))",
                             ".sensoryFeedback(.success, trigger: status) { old, new in old == Status.sending && new == Status.sent }",
                             ".sensoryFeedback(.error, trigger: status) { old, new in old == Status.sending && new == Status.failed }"]),
            ("UrgentReportView", [".sensoryFeedback(.success, trigger: repository.sent?.id) { _, new in new != nil }",
                                  ".sensoryFeedback(.error, trigger: repository.error) { _, new in new != nil }"]),
            ("AuthenticationView", [".sensoryFeedback(.error, trigger: failure) { _, new in new != nil }"]),
            ("PhotoCaptureManager", [".sensoryFeedback(.success, trigger: saved) { _, new in new }",
                                     ".sensoryFeedback(.error, trigger: errorMessage) { _, new in new != nil && !attachmentFailed }"]),
            ("CompareView", [".sensoryFeedback(.selection, trigger: showingLater)",
                             ".sensoryFeedback(.selection, trigger: pair) { old, new in abs(old.picks.count - new.picks.count) < 2 }"]),
        ]
        for site in sites {
            let text = try Self.view(site.file)
            for pin in site.pins { #expect(text.contains(pin), "\(site.file) is missing \(pin)") }
        }
    }

    /// Design audit B5: status and errors that appear in place are also spoken, once, when they change.
    @Test func statusAndErrorsAreAnnounced() throws {
        let helpers = try Self.view("InteractionHelpers")
        #expect(helpers.contains("func announcing(_ message: String?) -> some View"))
        #expect(helpers.contains("AccessibilityNotification.Announcement(new).post()"))
        let sites: [(file: String, pins: [String])] = [
            ("AuthenticationView", [".announcing(failure)"]),
            ("PasswordRecoveryView", [".announcing(error)"]),
            ("CheckInView", [".announcing(error)", ".announcing(repository.status == .failed ? repository.error : nil)",
                             ".announcing(repository.status == .sent ? CheckInFlow.sentAnnouncement : nil)"]),
            ("UrgentReportView", [".announcing(repository.error)", ".announcing(repository.sent == nil ? nil : UrgentReportCopy.sent)"]),
            ("EnrollmentView", [".announcing(repository.error)"]),
            ("MessagingView", [".announcing(repository.sending ? nil : repository.error)", "? NotesCopy.limitSentence("]),
            ("RoutineView", [".announcing(actionError ?? repository.lastError)"]),
            ("ProfileView", [".announcing(saveState.errorMessage)", ".announcing(saveState.successMessage)"]),
            ("ReminderSettingsView", [".announcing(saveResult)", "saveResult = ReminderCopy.status(repository.state)"]),
            ("OnboardingView", [".announcing(reminderAdvanceFailed ? OnboardingCopy.reminderFailure : nil)", ".announcing(saveState.errorMessage)"]),
        ]
        for site in sites {
            let text = try Self.view(site.file)
            for pin in site.pins { #expect(text.contains(pin), "\(site.file) is missing \(pin)") }
        }
        // Photo errors are announced once, in ContentView, never again per tab.
        let content = try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/ContentView.swift"), encoding: .utf8)
        #expect(!content.contains(".announcing("))
    }
}
