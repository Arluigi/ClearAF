import Foundation
import Combine

@MainActor protocol CheckInTransport {
    func sendCheckIn(_ draft: CheckInDraft, ticket: AccountAccess.Ticket) async throws -> CheckInResponse
}
@MainActor final class CheckInRepository: ObservableObject {
    enum Status: String, Codable { case draft, pending, sending, failed, sent }
    @Published private(set) var draft: CheckInDraft?
    @Published private(set) var status: Status = .draft
    @Published private(set) var error: String?
    private let access: AccountAccess
    private let transport: any CheckInTransport
    private let directory: URL?
    private var ticket: AccountAccess.Ticket?
    private var file: URL?
    init(access: AccountAccess, transport: any CheckInTransport, directory: URL? = nil) {
        self.access = access; self.transport = transport; self.directory = directory
    }
    func resume(_ ticket: AccountAccess.Ticket) throws {
        try access.require(ticket)
        if self.ticket == ticket { return }
        cancel()
        let root = try directory ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let folder = root.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let path = folder.appendingPathComponent("check-in.json"); file = path
        if FileManager.default.fileExists(atPath: path.path) {
            let bytes = try Data(contentsOf: path)
            guard bytes.count <= 1024 * 1024 else { throw RoutineFailure.invalidData }
            let saved = try JSONDecoder().decode(Saved.self, from: bytes)
            guard CheckInValidation.form(saved.draft.form, owner: ticket.accountID), saved.draft.submittedAt == nil || (RoutineDates.instant(saved.draft.submittedAt!) != nil && CheckInValidation.answers(saved.draft.answers, questions: saved.draft.form.questions)) else { throw RoutineFailure.invalidData }
            draft = saved.draft; status = saved.status == .sending ? .pending : saved.status
        }
        self.ticket = ticket
    }
    func cancel() { ticket = nil; file = nil; draft = nil; status = .draft; error = nil }
    private func require(_ expected: AccountAccess.Ticket) throws {
        try access.require(expected); guard ticket == expected else { throw AccountFailure.accountChanged }
    }
    func start(_ form: CheckInForm, ticket: AccountAccess.Ticket) throws {
        try require(ticket)
        guard CheckInValidation.form(form, owner: ticket.accountID), form.isActive else { throw RoutineFailure.invalidData }
        guard draft == nil || status == .sent else { return }
        try save(CheckInDraft(id: UUID(), form: form, answers: [], submittedAt: nil), status: .draft)
    }
    func update(_ answer: CheckInAnswer, ticket: AccountAccess.Ticket) throws {
        try require(ticket)
        guard var draft, draft.submittedAt == nil else { throw RoutineFailure.invalidData }
        draft.answers.removeAll { $0.questionId == answer.questionId }
        if answer.text.map({ !$0.isEmpty }) == true || answer.optionId != nil { draft.answers.append(answer) }
        try save(draft, status: .draft)
    }
    func prepare(ticket: AccountAccess.Ticket) throws {
        try require(ticket)
        guard status != .sending, status != .sent, var draft, CheckInValidation.answers(draft.answers, questions: draft.form.questions) else { throw RoutineFailure.invalidData }
        if draft.submittedAt == nil { draft.submittedAt = RoutineDates.timestamp(Date()) }
        try save(draft, status: .pending)
    }
    func send(ticket: AccountAccess.Ticket) async {
        guard (try? require(ticket)) != nil, let draft, draft.submittedAt != nil, status != .sending, status != .sent else { return }
        do {
            try save(draft, status: .sending)
            let response = try await transport.sendCheckIn(draft, ticket: ticket)
            try require(ticket)
            guard response.id == draft.id, response.userId == ticket.accountID, response.form == draft.form,
                  response.formId == draft.form.id, response.answers == draft.answers,
                  RoutineDates.instant(response.submittedAt) == RoutineDates.instant(draft.submittedAt!), RoutineDates.instant(response.receivedAt) != nil else { throw RoutineFailure.invalidData }
            try save(draft, status: .sent); error = nil
        } catch {
            guard (try? require(ticket)) != nil else { return }
            try? save(draft, status: .failed)
            self.error = "Check-in could not be sent. Your original response is saved on this device. Retry when connected."
        }
    }
    private struct Saved: Codable { let draft: CheckInDraft; let status: Status }
    private func save(_ draft: CheckInDraft, status: Status) throws {
        guard let file, let ticket else { throw AccountFailure.accountChanged }; try require(ticket)
        let bytes = try JSONEncoder().encode(Saved(draft: draft, status: status))
        guard bytes.count <= 1024 * 1024 else { throw RoutineFailure.writeFailed }
        try bytes.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        self.draft = draft; self.status = status
    }
}
