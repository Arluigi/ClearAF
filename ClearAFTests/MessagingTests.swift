import Foundation
import Testing
@testable import ClearAF

@MainActor struct MessagingTests {
    @Test func lostResponseRetainsFrozenPairAndUUIDAcrossSameAccountResume() async throws {
        let access = AccountAccess(); let ticket = access.activate(UUID()); let transport = MessagingFake(patient: ticket.accountID)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let repo = MessagingRepository(access: access, transport: transport, directory: directory)
        try repo.resume(ticket); await repo.openCurrent(); try repo.edit(" hello "); await repo.send()
        let pending = try #require(repo.draft)
        #expect(pending.attempted); #expect(pending.content == "hello")
        repo.cancel(); try repo.resume(access.activate(ticket.accountID)); await repo.openCurrent()
        #expect(repo.draft == pending)
        transport.failSend = false; await repo.send()
        #expect(transport.sentIDs == [pending.id, pending.id]); #expect(repo.draft == nil)
    }
    @Test func pagesMergeAndOnlyVisibleReceivedIDsAreAcknowledged() async throws {
        let access = AccountAccess(); let ticket = access.activate(UUID()); let transport = MessagingFake(patient: ticket.accountID)
        let repo = MessagingRepository(access: access, transport: transport, directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        try repo.resume(ticket); await repo.openCurrent()
        #expect(transport.acked.isEmpty); #expect(repo.nextCursor == "older")
        await repo.acknowledgeVisible([transport.newest.id]); #expect(transport.acked == [transport.newest.id])
        await repo.load(older: true); #expect(repo.messages.map(\.id) == [transport.oldest.id, transport.newest.id])
        await repo.load(); #expect(repo.messages.count == 2); #expect(repo.nextCursor == nil)
    }
    @Test func editingAttemptedBodyCreatesNewIDAndReassignmentNeverRetargetsRetry() async throws {
        let access = AccountAccess(); let ticket = access.activate(UUID()); let transport = MessagingFake(patient: ticket.accountID)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let repo = MessagingRepository(access: access, transport: transport, directory: directory)
        try repo.resume(ticket); await repo.openCurrent(); try repo.edit("first"); await repo.send()
        let original = try #require(repo.draft)
        try repo.edit("changed"); #expect(repo.draft?.id != original.id)
        await repo.send(); let attempts = transport.sentIDs
        transport.currentOverride = AssignedConversation(patientId: ticket.accountID, clinicianId: UUID(), patientName: nil, clinicianName: "Replacement", lastMessage: nil, unreadCount: 0)
        await repo.openCurrent(); await repo.send()
        #expect(repo.conversation == nil); #expect(repo.messages.isEmpty); #expect(transport.sentIDs == attempts)
        repo.cancel(); try repo.resume(access.activate(ticket.accountID)); await repo.openCurrent()
        #expect(repo.conversation == nil); #expect(repo.draft == nil)
        repo.cancel(); try repo.resume(access.activate(UUID())); #expect(repo.draft == nil)
    }
    @Test func mismatchedSendResponseNeverClearsRetry() async throws {
        let access = AccountAccess(); let ticket = access.activate(UUID()); let transport = MessagingFake(patient: ticket.accountID)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let repo = MessagingRepository(access: access, transport: transport, directory: directory)
        try repo.resume(ticket); await repo.openCurrent(); try repo.edit("hello")
        transport.failSend = false; transport.wrongResponse = true
        await repo.send(); #expect(repo.draft?.attempted == true); #expect(repo.error != nil)
    }
    @Test func nonOverlappingRefreshResetsCursorWithoutLosingDraft() async throws {
        let access = AccountAccess(); let ticket = access.activate(UUID()); let transport = MessagingFake(patient: ticket.accountID)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let repo = MessagingRepository(access: access, transport: transport, directory: directory)
        try repo.resume(ticket); await repo.openCurrent(); await repo.load(older: true); try repo.edit("saved draft")
        let saved = repo.draft
        let new = AssignedMessage(id: UUID(), patientId: transport.pair.patientId, clinicianId: transport.pair.clinicianId, senderId: transport.pair.clinicianId, senderType: "dermatologist", recipientId: ticket.accountID, recipientType: "patient", content: "New page after a gap", sentAt: "2026-09-14T12:00:00.000Z", unreadForMe: true, reference: nil, origin: "native")
        transport.pageOverride = AssignedMessagePage(conversation: transport.pair, messages: [new], nextCursor: "gap-cursor")
        await repo.load()
        #expect(repo.messages.map(\.id) == [new.id]); #expect(repo.nextCursor == "gap-cursor"); #expect(repo.draft == saved)
        transport.pageOverride = nil; await repo.load(older: true)
        #expect(transport.requestedCursors.last! == "gap-cursor")
        #expect(repo.messages.map(\.id) == [transport.oldest.id, new.id])
    }
    @Test func visibleReadAcknowledgementsSerializeAndDrainNewlyVisibleIDs() async throws {
        let access = AccountAccess(); let ticket = access.activate(UUID()); let transport = MessagingFake(patient: ticket.accountID)
        let repo = MessagingRepository(access: access, transport: transport)
        try repo.resume(ticket); await repo.openCurrent(); await repo.load(older: true)
        transport.suspendReads = true
        let first = Task { await repo.acknowledgeVisible([transport.newest.id]) }
        while transport.readContinuations.isEmpty { await Task.yield() }
        await repo.acknowledgeVisible([transport.oldest.id])
        #expect(transport.readContinuations.count == 1); #expect(transport.readBatches == [[transport.newest.id]])
        transport.readContinuations[0].resume(returning: MessageReadResponse(acknowledgedIds: [transport.newest.id], unreadCount: 1))
        while transport.readContinuations.count < 2 { await Task.yield() }
        #expect(repo.conversation?.unreadCount == 1); #expect(transport.readBatches == [[transport.newest.id], [transport.oldest.id]])
        transport.readContinuations[1].resume(returning: MessageReadResponse(acknowledgedIds: [transport.oldest.id], unreadCount: 0))
        await first.value
        #expect(repo.conversation?.unreadCount == 0); #expect(repo.messages.allSatisfy { !$0.unreadForMe })
    }
    /// Today's foreground refresh already calls `openCurrent()` before Notes opens. Notes' own `.task` calls
    /// `openCurrent()` again and must still be able to acknowledge an already-visible message afterward — the
    /// repository must not drop or duplicate-fail on the already-known message when reopened a second time.
    @Test func openCurrentAfterAlreadyLoadedStillAcknowledgesKnownVisibleIDs() async throws {
        let access = AccountAccess(); let ticket = access.activate(UUID()); let transport = MessagingFake(patient: ticket.accountID)
        let repo = MessagingRepository(access: access, transport: transport)
        try repo.resume(ticket)
        await repo.openCurrent() // Today's foreground refresh.
        #expect(repo.messages.map(\.id) == [transport.newest.id])
        await repo.openCurrent() // Notes' own `.task` reopening the same, already-loaded conversation.
        await repo.acknowledgeVisible([transport.newest.id])
        #expect(transport.acked == [transport.newest.id])
        #expect(repo.messages.first { $0.id == transport.newest.id }?.unreadForMe == false)
    }
    @Test func accountChangeRejectsLateHistory() async throws {
        let access = AccountAccess(); let ticket = access.activate(UUID()); let transport = MessagingFake(patient: ticket.accountID)
        let repo = MessagingRepository(access: access, transport: transport)
        try repo.resume(ticket); transport.onFetch = { access.invalidate(); repo.cancel() }
        await repo.openCurrent(); #expect(repo.messages.isEmpty); #expect(repo.conversation == nil)
    }
}
@MainActor private final class MessagingFake: MessagingTransport {
    let pair: AssignedConversation
    let newest: AssignedMessage; let oldest: AssignedMessage
    var pageOverride: AssignedMessagePage?; var requestedCursors: [String?] = []
    var suspendReads = false; var readBatches: [[UUID]] = []
    var readContinuations: [CheckedContinuation<MessageReadResponse, any Error>] = []
    var currentOverride: AssignedConversation?; var wrongResponse = false
    var failSend = true; var sentIDs: [UUID] = []; var acked: [UUID] = []; var onFetch: (() -> Void)?
    init(patient: UUID) {
        let clinician = UUID()
        pair = AssignedConversation(patientId: patient, clinicianId: clinician, patientName: nil, clinicianName: "Dr Test", lastMessage: nil, unreadCount: 2)
        newest = AssignedMessage(id: UUID(), patientId: patient, clinicianId: clinician, senderId: clinician, senderType: "dermatologist", recipientId: patient, recipientType: "patient", content: "New", sentAt: "2026-09-13T12:00:00.000Z", unreadForMe: true, reference: nil, origin: "native")
        oldest = AssignedMessage(id: UUID(), patientId: patient, clinicianId: clinician, senderId: clinician, senderType: "dermatologist", recipientId: patient, recipientType: "patient", content: "Old", sentAt: "2026-09-12T12:00:00.000Z", unreadForMe: true, reference: nil, origin: "native")
    }
    func currentMessages(ticket: AccountAccess.Ticket) async throws -> AssignedConversation? { currentOverride ?? pair }
    func messagePage(pair: AssignedConversation, before: String?, ticket: AccountAccess.Ticket) async throws -> AssignedMessagePage {
        onFetch?(); requestedCursors.append(before); if let pageOverride { return pageOverride }; return AssignedMessagePage(conversation: pair, messages: before == nil ? [newest] : [oldest], nextCursor: before == nil ? "older" : nil)
    }
    func putMessage(_ draft: MessageDraft, ticket: AccountAccess.Ticket) async throws -> AssignedMessage {
        sentIDs.append(draft.id); if failSend { throw URLError(.networkConnectionLost) }
        return AssignedMessage(id: wrongResponse ? UUID() : draft.id, patientId: pair.patientId, clinicianId: pair.clinicianId, senderId: pair.patientId, senderType: "patient", recipientId: pair.clinicianId, recipientType: "dermatologist", content: draft.content, sentAt: "2026-09-13T13:00:00.000Z", unreadForMe: false, reference: nil, origin: "native")
    }
    func readMessages(pair: AssignedConversation, ids: [UUID], ticket: AccountAccess.Ticket) async throws -> MessageReadResponse {
        acked += ids; readBatches.append(ids)
        if suspendReads { return try await withCheckedThrowingContinuation { readContinuations.append($0) } }
        return MessageReadResponse(acknowledgedIds: ids, unreadCount: 1)
    }
}
