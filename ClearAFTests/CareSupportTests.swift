import Foundation
import Testing
@testable import ClearAF

@MainActor struct CareSupportTests {
    @Test func retryReopensExactOriginalRevisionAndBody() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = SupportFake()
        let form = CheckInForm(id: UUID(), userId: ticket.accountID, version: 1, createdBy: UUID(), createdAt: "2026-09-13T12:00:00Z", title: "Fixture", isActive: true, questions: [CheckInQuestion(id: UUID(), prompt: "Fixture prompt", type: .text, required: false, options: [])])
        let repo = CheckInRepository(access: access, transport: transport, directory: root)
        try repo.resume(ticket)
        try repo.start(form, ticket: ticket)
        try repo.prepare(ticket: ticket)
        let original = try #require(repo.draft)
        await repo.send(ticket: ticket)
        #expect(repo.status == .failed)
        repo.cancel()
        let reopened = CheckInRepository(access: access, transport: transport, directory: root)
        try reopened.resume(ticket)
        #expect(reopened.draft == original)
        transport.fail = false
        await reopened.send(ticket: ticket)
        #expect(reopened.status == .sent)
        #expect(transport.sent == [original, original])
        access.invalidate()
        #expect(throws: (any Error).self) { try reopened.start(form, ticket: ticket) }
    }
    @Test func oldAccountAcknowledgmentCannotPublishIntoNewLogin() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), first = access.activate(UUID()), transport = SupportFake()
        transport.fail = false; transport.hold = true
        let repo = CheckInRepository(access: access, transport: transport, directory: root)
        try repo.resume(first)
        let form = CheckInForm(id: UUID(), userId: first.accountID, version: 1, createdBy: UUID(), createdAt: "2026-09-13T12:00:00Z", title: "Fixture", isActive: true, questions: [CheckInQuestion(id: UUID(), prompt: "Fixture prompt", type: .text, required: false, options: [])])
        try repo.start(form, ticket: first); try repo.prepare(ticket: first)
        let task = Task { await repo.send(ticket: first) }
        while transport.continuation == nil { await Task.yield() }
        repo.cancel(); let second = access.activate(UUID()); try repo.resume(second)
        transport.continuation?.resume(); await task.value
        #expect(repo.draft == nil)
        #expect(repo.status == .draft)
    }
    @Test func replacementCannotRetargetStartedDraft() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = SupportFake()
        let repo = CheckInRepository(access: access, transport: transport, directory: root)
        try repo.resume(ticket)
        let q = CheckInQuestion(id: UUID(), prompt: "Original", type: .text, required: false, options: [])
        let original = CheckInForm(id: UUID(), userId: ticket.accountID, version: 1, createdBy: UUID(), createdAt: "2026-09-13T12:00:00Z", title: "Fixture", isActive: true, questions: [q])
        try repo.start(original, ticket: ticket)
        let replacement = CheckInForm(id: UUID(), userId: ticket.accountID, version: 2, createdBy: original.createdBy, createdAt: original.createdAt, title: "Replacement", isActive: true, questions: [q])
        try repo.start(replacement, ticket: ticket)
        #expect(repo.draft?.form == original)
        try repo.update(CheckInAnswer(questionId: q.id, text: "Saved draft", optionId: nil), ticket: ticket)
        repo.cancel(); try repo.resume(ticket)
        #expect(repo.draft?.answers.first?.text == "Saved draft")
        try repo.prepare(ticket: ticket)
        #expect(throws: (any Error).self) { try repo.update(CheckInAnswer(questionId: q.id, text: "Changed", optionId: nil), ticket: ticket) }
    }
    @Test func unreadableSavedFileCannotBeOverwrittenByNewDraft() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), ticket = access.activate(UUID())
        let folder = root.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("check-in.json"), bytes = Data("unreadable fixture".utf8)
        try bytes.write(to: file)
        let repo = CheckInRepository(access: access, transport: SupportFake(), directory: root)
        #expect(throws: (any Error).self) { try repo.resume(ticket) }
        #expect(throws: (any Error).self) { try repo.resume(ticket) }
        #expect(try Data(contentsOf: file) == bytes)
    }
    @Test func requiredChoiceAndTextValidation() {
        let q = CheckInQuestion(id: UUID(), prompt: "Fixture", type: .text, required: true, options: [])
        #expect(!CheckInValidation.answers([], questions: [q]))
        #expect(!CheckInValidation.answers([CheckInAnswer(questionId: q.id, text: String(repeating: "x", count: 2001), optionId: nil)], questions: [q]))
        #expect(CheckInValidation.answers([CheckInAnswer(questionId: q.id, text: "Saved", optionId: nil)], questions: [q]))
        let option = CheckInOption(id: UUID(), label: "Option")
        let choice = CheckInQuestion(id: UUID(), prompt: "Choose", type: .choice, required: true, options: [option])
        #expect(!CheckInValidation.answers([CheckInAnswer(questionId: choice.id, text: nil, optionId: UUID())], questions: [choice]))
        #expect(CheckInValidation.answers([CheckInAnswer(questionId: choice.id, text: nil, optionId: option.id)], questions: [choice]))
    }
    @Test func monthDaysUseReportedCalendarDate() {
        #expect(SupportDates.days("2024-02").count == 29)
        #expect(SupportDates.days("2026-09").first == "2026-09-01")
        #expect(SupportDates.days("2026-13").isEmpty)
    }
}
@MainActor private final class SupportFake: CheckInTransport {
    var hold = false
    var continuation: CheckedContinuation<Void, Never>?
    var fail = true
    var sent: [CheckInDraft] = []
    func sendCheckIn(_ draft: CheckInDraft, ticket: AccountAccess.Ticket) async throws -> CheckInResponse {
        sent.append(draft)
        if hold { await withCheckedContinuation { continuation = $0 } }
        if fail { throw URLError(.networkConnectionLost) }
        return CheckInResponse(id: draft.id, userId: ticket.accountID, formId: draft.form.id, submittedAt: draft.submittedAt!, receivedAt: draft.submittedAt!, answers: draft.answers, form: draft.form)
    }
}
