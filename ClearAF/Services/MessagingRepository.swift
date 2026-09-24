import Foundation
import Combine

struct MessageReference: Codable, Equatable { let type: String; let id: UUID; let available: Bool; let label: String?; let occurredAt: String? }
struct AssignedMessage: Codable, Equatable, Identifiable {
    let id: UUID; let patientId: UUID; let clinicianId: UUID; let senderId: UUID; let senderType: String
    let recipientId: UUID; let recipientType: String; let content: String; let sentAt: String
    var unreadForMe: Bool; let reference: MessageReference?; let origin: String
}
/// Additive on `AssignedConversation`. `reason` mirrors the API's `'reply-window' | 'weekly'`, kept as a plain
/// string (same convention as `MessageReference.type`) rather than an enum that would fail to decode a future value.
struct MessageLimit: Codable, Equatable { let canSend: Bool; let nextAllowedAt: String?; let reason: String }
struct AssignedConversation: Codable, Equatable {
    let patientId: UUID; let clinicianId: UUID; let patientName: String?; let clinicianName: String
    let lastMessage: AssignedMessage?; var unreadCount: Int
    // Optional so an older API with no `limit` field decodes to `nil`; `canSendMessage` then treats that as "can send".
    var limit: MessageLimit? = nil
    var path: String { "/assigned-messages/patients/\(patientId.uuidString.lowercased())/clinicians/\(clinicianId.uuidString.lowercased())" }
    var canSendMessage: Bool { limit?.canSend ?? true }
    func matches(_ other: Self) -> Bool { patientId == other.patientId && clinicianId == other.clinicianId }
}
struct AssignedMessagePage: Decodable { let conversation: AssignedConversation; let messages: [AssignedMessage]; let nextCursor: String? }
struct MessageReadResponse: Decodable { let acknowledgedIds: [UUID]; let unreadCount: Int }
struct MessageDraft: Codable, Equatable { let id: UUID; let pair: AssignedConversation; var content: String; var attempted: Bool }
struct MessageReferenceDetail: Decodable {
    let reference: MessageReference; let routine: Revision?; let photo: Photo?
    struct Revision: Decodable { let id: UUID; let userId: UUID; let timeOfDay: String; let version: Int; let name: String; let steps: [CareRoutineStep]; let createdAt: String }
    struct Photo: Decodable { let id: UUID; let captureDate: String; let createdAt: String }
}
@MainActor protocol MessagingTransport {
    func currentMessages(ticket: AccountAccess.Ticket) async throws -> AssignedConversation?
    func messagePage(pair: AssignedConversation, before: String?, ticket: AccountAccess.Ticket) async throws -> AssignedMessagePage
    func putMessage(_ draft: MessageDraft, ticket: AccountAccess.Ticket) async throws -> AssignedMessage
    func readMessages(pair: AssignedConversation, ids: [UUID], ticket: AccountAccess.Ticket) async throws -> MessageReadResponse
}
@MainActor final class MessagingRepository: ObservableObject {
    @Published private(set) var conversation: AssignedConversation?
    @Published private(set) var messages: [AssignedMessage] = []
    @Published private(set) var draft: MessageDraft?
    @Published private(set) var nextCursor: String?
    @Published private(set) var error: String?
    @Published private(set) var loading = false
    @Published private(set) var sending = false
    @Published private(set) var opened = false
    private let access: AccountAccess; private let transport: any MessagingTransport; private let directory: URL?
    private var ticket: AccountAccess.Ticket?; private var file: URL?; private var epoch = UUID(); private var queuedReadIDs: Set<UUID> = []; private var reading = false
    init(access: AccountAccess, transport: any MessagingTransport, directory: URL? = nil) { self.access = access; self.transport = transport; self.directory = directory }
    func resume(_ ticket: AccountAccess.Ticket) throws {
        try access.require(ticket); if self.ticket == ticket { return }; cancel()
        let root = try directory ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let folder = root.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("message-draft.json")
        if FileManager.default.fileExists(atPath: file.path) {
            let bytes = try Data(contentsOf: file); guard bytes.count < 100_000 else { throw RoutineFailure.invalidData }
            let saved = try JSONDecoder().decode(MessageDraft.self, from: bytes)
            guard saved.pair.patientId == ticket.accountID, saved.content.count <= 4000 else { throw RoutineFailure.invalidData }; draft = saved
        }
        self.ticket = ticket; self.file = file
    }
    func cancel() { epoch = UUID(); ticket = nil; file = nil; draft = nil; conversation = nil; messages = []; nextCursor = nil; loading = false; sending = false; opened = false; error = nil; queuedReadIDs = []; reading = false }
    private func require(_ t: AccountAccess.Ticket, _ e: UUID) throws { try access.require(t); guard ticket == t && epoch == e else { throw AccountFailure.accountChanged } }
    private func save(_ value: MessageDraft?) throws {
        guard let ticket, let file else { throw AccountFailure.accountChanged }; try require(ticket, epoch)
        if let value { try JSONEncoder().encode(value).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
        else if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
        draft = value
    }
    func edit(_ text: String) throws {
        guard let conversation, !sending, text.count <= 4000 else { return }
        let id = draft.flatMap { !$0.attempted ? $0.id : nil } ?? UUID()
        try save(MessageDraft(id: id, pair: conversation, content: text, attempted: false))
    }
    func openCurrent() async {
        guard let ticket, !loading, !sending else { return }; let e = epoch; loading = true
        defer { if epoch == e { loading = false } }
        do {
            let current = try await transport.currentMessages(ticket: ticket); try require(ticket, e)
            if let existing = conversation, current.map({ !existing.matches($0) }) ?? true {
                conversation = nil; messages = []; nextCursor = nil; opened = false; self.draft = nil
                error = "Your assigned clinician changed. Open the current conversation to continue."; return
            }
            if let draft, current.map({ !draft.pair.matches($0) }) ?? true {
                // Preserve the old pair's file; explicitly open a replacement before composing.
                self.draft = nil; conversation = nil; messages = []; nextCursor = nil; opened = false
                error = "Your saved message belongs to a previous assignment. Open the current conversation to continue."; return
            }
            conversation = current; opened = true; error = nil
        } catch { if (try? require(ticket, e)) != nil { self.error = "Messages could not be refreshed. Try again." }; return }
        loading = false
        if conversation != nil { await load() }
    }
    private func valid(_ message: AssignedMessage, pair: AssignedConversation) -> Bool {
        message.patientId == pair.patientId && message.clinicianId == pair.clinicianId && RoutineDates.instant(message.sentAt) != nil &&
        ((message.senderType == "patient" && message.senderId == pair.patientId && message.recipientType == "dermatologist" && message.recipientId == pair.clinicianId && !message.unreadForMe) ||
         (message.senderType == "dermatologist" && message.senderId == pair.clinicianId && message.recipientType == "patient" && message.recipientId == pair.patientId))
    }
    private func merge(_ rows: [AssignedMessage]) {
        var values = Dictionary(uniqueKeysWithValues: messages.map { ($0.id, $0) }); for row in rows { values[row.id] = row }
        messages = values.values.sorted { $0.sentAt == $1.sentAt ? $0.id.uuidString < $1.id.uuidString : $0.sentAt < $1.sentAt }
    }
    func load(older: Bool = false) async {
        guard let ticket, let pair = conversation, !loading, !older || nextCursor != nil else { return }
        let e = epoch; let before = older ? nextCursor : nil; loading = true
        defer { if epoch == e { loading = false } }
        do {
            let page = try await transport.messagePage(pair: pair, before: before, ticket: ticket); try require(ticket, e)
            guard page.conversation.matches(pair), page.messages.count <= 50, page.messages.allSatisfy({ valid($0, pair: pair) }) else { throw RoutineFailure.invalidData }
            let overlaps = page.messages.contains { row in messages.contains { $0.id == row.id } }
            if !older && !overlaps { messages = [] }
            conversation = page.conversation; merge(page.messages)
            if older || !overlaps { nextCursor = page.nextCursor }; error = nil
        } catch { if (try? require(ticket, e)) != nil { self.error = "Conversation unavailable or offline. Refresh to try again."; if case AccountFailure.requestFailed(404) = error { conversation = nil; messages = []; self.draft = nil; nextCursor = nil; opened = false } } }
    }
    func send() async {
        guard let ticket, let pair = conversation, var draft, draft.pair.matches(pair), !sending else { return }
        let e = epoch; draft.content = draft.content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...4000).contains(draft.content.count) else { return }
        do {
            draft.attempted = true; try save(draft); sending = true
            let response = try await transport.putMessage(draft, ticket: ticket); try require(ticket, e)
            guard valid(response, pair: pair), response.id == draft.id, response.senderType == "patient", response.content == draft.content, response.reference == nil, response.origin == "native" else { throw RoutineFailure.invalidData }
            try save(nil); merge([response]); error = nil
        } catch {
            if (try? require(ticket, e)) != nil {
                // The limit state changed underneath (e.g. another device already sent this week's message):
                // reflect the block and keep the typed draft — never lose what they wrote.
                if case AccountFailure.patientMessageLimit(let nextAllowedAt) = error {
                    conversation?.limit = MessageLimit(canSend: false, nextAllowedAt: nextAllowedAt, reason: "weekly")
                } else {
                    self.error = "Message was not confirmed. Your original message is saved. Retry explicitly when connected."
                }
            }
        }
        if epoch == e { sending = false }
    }
    func acknowledgeVisible(_ ids: Set<UUID>) async {
        guard let ticket, conversation != nil else { return }; let e = epoch
        queuedReadIDs.formUnion(messages.filter { ids.contains($0.id) && $0.unreadForMe && $0.recipientId == ticket.accountID }.map(\.id))
        guard !reading else { return }; reading = true
        defer { if epoch == e { reading = false } }
        while (try? require(ticket, e)) != nil, let pair = conversation {
            let received = Array(messages.filter { queuedReadIDs.contains($0.id) && $0.unreadForMe && $0.recipientId == ticket.accountID }.prefix(50).map(\.id))
            guard !received.isEmpty else { queuedReadIDs = []; return }
            queuedReadIDs.subtract(received)
            do {
                let result = try await transport.readMessages(pair: pair, ids: received, ticket: ticket)
                try require(ticket, e)
                guard conversation?.matches(pair) == true else { continue }
                guard Set(result.acknowledgedIds) == Set(received), result.acknowledgedIds.count == received.count, result.unreadCount >= 0 else { throw RoutineFailure.invalidData }
                for index in messages.indices where received.contains(messages[index].id) { messages[index].unreadForMe = false }
                conversation?.unreadCount = result.unreadCount
            } catch { /* Failed IDs retry only after another visible acknowledgement request. */ }
        }
    }
}
