import Foundation
import Testing
import SwiftUI
import UIKit
@testable import ClearAF

struct CheckInFlowTests {
    let better = CheckInOption(id: UUID(), label: "Better than last week")
    let worse = CheckInOption(id: UUID(), label: "Worse than last week")
    let owner = UUID()

    private var choice: CheckInQuestion {
        CheckInQuestion(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!, prompt: "How is the dryness this week?",
                        type: .choice, required: true, options: [better, worse])
    }
    private var text: CheckInQuestion {
        CheckInQuestion(id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!, prompt: "Anything to add?",
                        type: .text, required: false, options: [])
    }
    private func draft(_ answers: [CheckInAnswer], submitted: Bool = false) -> CheckInDraft {
        let form = CheckInForm(id: UUID(), userId: owner, version: 2, createdBy: UUID(), createdAt: "2026-09-13T12:00:00.000Z",
                               title: "Weekly check-in", isActive: true, questions: [choice, text])
        return CheckInDraft(id: UUID(), form: form, answers: answers, submittedAt: submitted ? "2026-09-15T07:12:00.000Z" : nil)
    }

    @Test func requiredQuestionsBlockNextUntilAnswered() {
        #expect(!CheckInFlow.canAdvance(choice, in: []))
        #expect(CheckInFlow.canAdvance(choice, in: [CheckInAnswer(questionId: choice.id, text: nil, optionId: better.id)]))
        #expect(CheckInFlow.canAdvance(text, in: []))
        let long = CheckInAnswer(questionId: text.id, text: String(repeating: "a", count: 2001), optionId: nil)
        #expect(CheckInFlow.isTooLong(text, in: [long]))
        #expect(!CheckInFlow.canAdvance(text, in: [long]))
        let requiredText = CheckInQuestion(id: UUID(), prompt: "Describe it", type: .text, required: true, options: [])
        #expect(!CheckInFlow.canAdvance(requiredText, in: [CheckInAnswer(questionId: requiredText.id, text: "   ", optionId: nil)]))
    }

    @Test func resumeStartsAtTheFirstUnansweredQuestionOrReview() {
        #expect(CheckInFlow.resumeIndex(draft([])) == 0)
        #expect(CheckInFlow.resumeIndex(draft([CheckInAnswer(questionId: choice.id, text: nil, optionId: worse.id)])) == 1)
        let both = [CheckInAnswer(questionId: choice.id, text: nil, optionId: worse.id), CheckInAnswer(questionId: text.id, text: "Chin", optionId: nil)]
        #expect(CheckInFlow.resumeIndex(draft(both)) == 2)
        #expect(CheckInFlow.resumeIndex(draft([CheckInAnswer(questionId: choice.id, text: nil, optionId: worse.id)], submitted: true)) == 2)
    }

    @Test func progressEyebrowAndSummariesUseWords() {
        #expect(CheckInFlow.progress(index: 1, count: 4) == "2 OF 4")
        #expect(CheckInFlow.progress(index: 4, count: 4) == "REVIEW")
        #expect(CheckInFlow.eyebrow(draft([]).form) == "Weekly check-in · V2")
        #expect(CheckInFlow.requirement(choice) == "Required. Your clinician reads these alongside your photos.")
        #expect(CheckInFlow.summary(choice, in: []) == "Not answered · required")
        #expect(CheckInFlow.summary(text, in: []) == "Not answered")
        #expect(CheckInFlow.summary(choice, in: [CheckInAnswer(questionId: choice.id, text: nil, optionId: better.id)]) == "Better than last week")
        #expect(CheckInFlow.count("Chin still flaky") == "16 / 2000")
    }

    @Test func statusAndSendLabelsNameWhereTheWorkIs() {
        #expect(CheckInFlow.status(.draft) == "Draft saved on this device")
        #expect(CheckInFlow.status(.failed) == "Couldn't send. Your answers are saved on this device.")
        #expect(CheckInFlow.sendLabel(.draft, submitted: false) == "Send check-in")
        #expect(CheckInFlow.sendLabel(.failed, submitted: true) == "Retry sending")
        #expect(CheckInFlow.sendLabel(.sending, submitted: true) == "Sending…")
        for copy in [CheckInFlow.advanceReason, CheckInFlow.sendReason, CheckInFlow.footnote, CheckInFlow.lengthReason] {
            #expect(!copy.contains("!"))
        }
    }
}

@MainActor struct LetterpressFormTests {
    @Test func radioRowKeepsA44PointTarget() {
        let size = UIHostingController(rootView: LetterpressRadioRow(title: "Yes", selected: false) {}
            .environment(\.dynamicTypeSize, .xSmall))
            .sizeThatFits(in: CGSize(width: 320, height: 1000))
        #expect(size.height >= 44)
    }

    @Test func progressRuleFillsReachedSteps() {
        #expect(LetterpressProgressRule.isFilled(0, completed: 2))
        #expect(LetterpressProgressRule.isFilled(1, completed: 2))
        #expect(!LetterpressProgressRule.isFilled(2, completed: 2))
        #expect(LetterpressProgressRule.height == 2)
    }

    @Test func questionOpenedFromReviewReturnsToReview() throws {
        #expect(CheckInFlow.advanceLabel(position: 0, count: 2, returningToReview: false) == "Next question")
        #expect(CheckInFlow.advanceLabel(position: 1, count: 2, returningToReview: false) == "Review answers")
        #expect(CheckInFlow.advanceLabel(position: 0, count: 2, returningToReview: true) == "Back to review")
        #expect(CheckInFlow.advanceLabel(position: 1, count: 2, returningToReview: true) == "Back to review")
        let source = try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views/CheckInView.swift"), encoding: .utf8)
        #expect(source.contains("go(to: returningToReview ? draft.form.questions.count : position + 1)"))
        #expect(source.contains(".scrollDismissesKeyboard(.interactively)"))
    }

    /// Small form fixes from the design audit: return key on onboarding, sentence-case capture copy, 13pt strip error.
    @Test func formsDismissTheKeyboardAndCaptureCopyIsSentenceCase() throws {
        let views = LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views")
        let onboarding = try String(contentsOf: views.appendingPathComponent("OnboardingView.swift"), encoding: .utf8)
        #expect(onboarding.contains(".submitLabel(.done)") && onboarding.contains(".onSubmit { if canAdvance { advance() } }"))
        #expect(onboarding.contains(".scrollDismissesKeyboard(.interactively)"))
        let capture = try String(contentsOf: views.appendingPathComponent("PhotoCaptureManager.swift"), encoding: .utf8)
        #expect(capture.contains("\"Take photo\"") && capture.contains("\"Choose from library\""))
        #expect(!capture.contains("Take Photo") && !capture.contains("Choose from Library"))
        let strip = try String(contentsOf: views.appendingPathComponent("AdherenceStrip.swift"), encoding: .utf8)
        #expect(strip.contains("failed ? Letterpress.ui(13, relativeTo: .footnote)"))
    }

    /// Design audit B4: onboarding and check-in pages slide the way you go (a cross-fade under Reduce Motion), and
    /// VoiceOver focus moves to the new title instead of an extra announcement.
    @Test func stepsMoveInTheDirectionYouGoAndFocusTheTitle() throws {
        let views = LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views")
        for (file, key) in [("OnboardingView.swift", "step"), ("CheckInView.swift", "index")] {
            let text = try String(contentsOf: views.appendingPathComponent(file), encoding: .utf8)
            #expect(text.contains(".id(\(key))"), "\(file)")
            #expect(text.contains("@State private var forward = true"), "\(file)")
            let squashed = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
            #expect(squashed.contains(".transition(reduceMotion ? .opacity : .asymmetric( "
                + "insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity), "
                + "removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity)))"), "\(file)")
            #expect(text.contains("withAnimation(.smooth) { \(key) = new"), "\(file)")
            #expect(text.contains("@AccessibilityFocusState private var titleFocused: Bool"), "\(file)")
            #expect(text.contains(".accessibilityFocused($titleFocused)"), "\(file)")
            #expect(text.contains("titleFocused = true"), "\(file)")
            #expect(!text.contains("AccessibilityNotification.Announcement"), "\(file): the focus move is the announcement")
        }
    }
}
