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
}
