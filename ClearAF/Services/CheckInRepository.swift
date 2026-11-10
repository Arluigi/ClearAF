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

// MARK: - Scheduled launch check-ins. Legacy clinician forms above retain their own drafts.
@MainActor final class LaunchCheckInRepository: ObservableObject {
    @Published private(set) var occurrences: [LaunchCheckIn] = []
    @Published private(set) var drafts: [UUID: LaunchCheckInDraft] = [:]
    @Published private(set) var membership: LaunchMembership?
    @Published private(set) var loading = false
    @Published private(set) var sending: UUID?
    @Published private(set) var error: String?
    @Published private(set) var page = 0
    @Published private(set) var totalPages = 0
    private let access: AccountAccess; private let transport: any LaunchTransport; private let directory: URL?
    private var ticket: AccountAccess.Ticket?; private var epoch = UUID(); private var file: URL?
    init(access: AccountAccess, transport: any LaunchTransport, directory: URL? = nil) { self.access = access; self.transport = transport; self.directory = directory }
    func photoRepository() -> LaunchPhotoSetRepository { LaunchPhotoSetRepository(access: access, transport: transport, directory: directory) }
    func cancel() { epoch = UUID(); ticket = nil; file = nil; occurrences = []; drafts = [:]; membership = nil; loading = false; sending = nil; error = nil; page = 0; totalPages = 0 }
    func resume(ticket: AccountAccess.Ticket) throws {
        try access.require(ticket); guard self.ticket != ticket else { return }
        cancel(); self.ticket = ticket
        let root = try directory ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let folder = root.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        file = folder.appendingPathComponent("launch-check-ins.json")
        if let file, FileManager.default.fileExists(atPath: file.path) {
            let bytes = try Data(contentsOf: file); guard bytes.count <= 1024 * 1024 else { throw LaunchFailure.invalidData }
            let saved = try JSONDecoder().decode([UUID: LaunchCheckInDraft].self, from: bytes)
            guard saved.count <= 100, saved.allSatisfy({ $0.key == $0.value.occurrenceId && LaunchFollowUpSchema.valid($0.value.form, owner: ticket.accountID) }) else { throw LaunchFailure.invalidData }
            drafts = saved
        }
    }
    private func require(_ ticket: AccountAccess.Ticket, _ epoch: UUID) throws { try access.require(ticket); guard self.ticket == ticket, self.epoch == epoch else { throw AccountFailure.accountChanged } }
    private func persist(_ next: [UUID: LaunchCheckInDraft], ticket: AccountAccess.Ticket) throws {
        try require(ticket, epoch); guard let file else { throw AccountFailure.accountChanged }
        let bytes = try JSONEncoder().encode(next); guard bytes.count <= 1024 * 1024, next.count <= 100 else { throw LaunchFailure.invalidData }
        try bytes.write(to: file, options: [.atomic, .completeFileProtection]); drafts = next
    }
    @discardableResult func refresh(ticket: AccountAccess.Ticket) async -> Bool { await load(page: 1, ticket: ticket) }
    @discardableResult func loadMore(ticket: AccountAccess.Ticket) async -> Bool { guard page < totalPages else { return false }; return await load(page: page + 1, ticket: ticket) }
    private func load(page requested: Int, ticket: AccountAccess.Ticket) async -> Bool {
        do { try resume(ticket: ticket) } catch { return false }; guard !loading else { return false }
        let current = epoch; loading = true; defer { if epoch == current { loading = false } }
        do {
            let billingBytes = try await transport.send(.init(path: "/billing"), ticket: ticket); try require(ticket, current)
            let billing = try JSONDecoder().decode(LaunchBillingResponse.self, from: billingBytes)
            let bytes = try await transport.send(.init(path: "/check-ins?page=\(requested)&limit=20"), ticket: ticket); try require(ticket, current)
            let result = try JSONDecoder().decode(SupportPage<LaunchCheckIn>.self, from: bytes)
            guard result.pagination.page == requested, result.pagination.limit <= 50,
                  Set(result.data.map(\.id)).count == result.data.count,
                  result.data.allSatisfy({ $0.form.userId == ticket.accountID && $0.form.id == $0.formId && LaunchDates.instant($0.dueAt) != nil && LaunchDates.instant($0.cadenceAnchor) != nil }) else { throw LaunchFailure.invalidData }
            membership = billing.membership
            if requested == 1 { occurrences = result.data } else { let ids = Set(result.data.map(\.id)); occurrences.removeAll { ids.contains($0.id) }; occurrences += result.data }
            page = requested; totalPages = result.pagination.totalPages; error = nil; return true
        } catch { if (try? require(ticket, current)) != nil { self.error = "Couldn't refresh your scheduled check-ins. Your saved answers remain on this device." }; return false }
    }
    func start(_ id: UUID, ticket: AccountAccess.Ticket, replacing: Bool = false) throws {
        try require(ticket, epoch)
        guard sending == nil, !loading, membership?.access == .care, let occurrence = occurrences.first(where: { $0.id == id }),
              [.due, .draft, .needsChanges].contains(occurrence.status), occurrence.form.isActive,
              LaunchFollowUpSchema.valid(occurrence.form, owner: ticket.accountID) else { throw LaunchFailure.invalidData }
        if let old = drafts[id], !replacing, !old.sent { return }
        var next = drafts
        next[id] = .init(occurrenceId: id, responseId: UUID(), form: occurrence.form, cadenceAnchor: occurrence.cadenceAnchor, input: .init(), photoSet: nil, frozen: false, sent: false)
        try persist(next, ticket: ticket)
    }
    func update(_ input: LaunchFollowUpInput, occurrenceId id: UUID, ticket: AccountAccess.Ticket) throws {
        try require(ticket, epoch); guard var draft = drafts[id], !draft.frozen, sending != id else { throw LaunchFailure.invalidData }
        var clean = input; clean.normalize(); draft.input = clean; var next = drafts; next[id] = draft; try persist(next, ticket: ticket)
    }
    func attach(_ set: LaunchPhotoSet, occurrenceId id: UUID, ticket: AccountAccess.Ticket) throws {
        try require(ticket, epoch); guard var draft = drafts[id], !draft.frozen, set.purpose == .checkIn, set.status == .draft, LaunchPhotoRules.complete(set) else { throw LaunchFailure.invalidData }
        draft.photoSet = set; var next = drafts; next[id] = draft; try persist(next, ticket: ticket)
    }
    func clearPhotos(occurrenceId id: UUID, ticket: AccountAccess.Ticket) throws {
        try require(ticket, epoch); guard var draft = drafts[id], !draft.frozen else { throw LaunchFailure.invalidData }
        draft.photoSet = nil; var next = drafts; next[id] = draft; try persist(next, ticket: ticket)
    }
    func isCurrent(_ draft: LaunchCheckInDraft, occurrence: LaunchCheckIn) -> Bool {
        draft.form.id == occurrence.formId && draft.form.version == occurrence.form.version && draft.form.questions == occurrence.form.questions && draft.cadenceAnchor == occurrence.cadenceAnchor && [.due, .draft, .needsChanges].contains(occurrence.status)
    }
    @discardableResult func send(_ id: UUID, ticket: AccountAccess.Ticket) async -> Bool {
        guard (try? require(ticket, epoch)) != nil, sending == nil, var draft = drafts[id], !draft.sent,
              let answers = draft.input.answers, let photos = draft.photoSet, photos.status == .draft, LaunchPhotoRules.complete(photos) else { return false }
        let current = epoch; sending = id; defer { if epoch == current { sending = nil } }
        do {
            draft.frozen = true; var next = drafts; next[id] = draft; try persist(next, ticket: ticket)
            guard await refresh(ticket: ticket) else { return false }; try require(ticket, current)
            // Current occurrences may appear after submitted history. Revalidate from fresh pages,
            // never from the cached row that opened this draft. Bound the foreground walk.
            var walked = 1
            while !occurrences.contains(where: { $0.id == id }), page < totalPages, walked < 50 {
                guard await loadMore(ticket: ticket) else { return false }; try require(ticket, current); walked += 1
            }
            guard let occurrence = occurrences.first(where: { $0.id == id }) else { error = "This occurrence could not be found in the current schedule. Refresh before trying again."; return false }
            // A successful response can be lost after the server committed it. Matching receipt IDs
            // reconcile without writing again, including after the membership became read-only.
            if [.submitted, .reviewed].contains(occurrence.status), occurrence.responseId == draft.responseId,
               occurrence.formId == draft.form.id, occurrence.answers == answers, occurrence.photoSet?.id == photos.id {
                draft.sent = true; next = drafts; next[id] = draft; try persist(next, ticket: ticket); error = nil; return true
            }
            guard membership?.access == .care, isCurrent(draft, occurrence: occurrence) else {
                error = "This check-in or your care access changed. Review the current schedule before starting again. Your earlier draft is preserved."; return false
            }
            struct Body: Encodable { let formId: String; let photoSetId: String; let answers: LaunchFollowUp }
            let request = try LaunchRequest.json("/check-ins/\(id.uuidString.lowercased())/submissions/\(draft.responseId.uuidString.lowercased())", Body(formId: draft.form.id.uuidString.lowercased(), photoSetId: photos.id.uuidString.lowercased(), answers: answers))
            let bytes = try await transport.send(request, ticket: ticket); try require(ticket, current)
            struct Response: Decodable { let checkIn: LaunchCheckIn }
            let result = try JSONDecoder().decode(Response.self, from: bytes).checkIn
            guard result.id == id, result.formId == draft.form.id, result.form.userId == ticket.accountID,
                  result.responseId == draft.responseId, result.answers == answers, result.photoSet?.id == photos.id,
                  [.submitted, .reviewed].contains(result.status) else { throw LaunchFailure.invalidData }
            if let index = occurrences.firstIndex(where: { $0.id == id }) { occurrences[index] = result } else { occurrences.append(result) }
            draft.sent = true; next = drafts; next[id] = draft; try persist(next, ticket: ticket); error = nil; return true
        } catch { if (try? require(ticket, current)) != nil { self.error = "Couldn't send your check-in. Your original answers and response ID are saved. Retry when connected." }; return false }
    }
}

@MainActor final class LaunchPrescriptionRepository: ObservableObject {
    @Published private(set) var records: [LaunchPrescription] = []
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    @Published private(set) var page = 0
    @Published private(set) var totalPages = 0
    private let access: AccountAccess; private let transport: any LaunchTransport
    private var ticket: AccountAccess.Ticket?; private var epoch = UUID()
    init(access: AccountAccess, transport: any LaunchTransport) { self.access = access; self.transport = transport }
    func cancel() { epoch = UUID(); ticket = nil; records = []; loading = false; error = nil; page = 0; totalPages = 0 }
    @discardableResult func load(ticket: AccountAccess.Ticket, next: Bool = false) async -> Bool {
        do { try access.require(ticket) } catch { return false }
        if self.ticket != ticket { cancel(); self.ticket = ticket }
        guard !loading, !next || page < totalPages else { return false }
        let current = epoch, requested = next ? page + 1 : 1
        loading = true; defer { if epoch == current { loading = false } }
        do {
            let bytes = try await transport.send(.init(path: "/prescriptions-sent?page=\(requested)&limit=20"), ticket: ticket)
            try access.require(ticket); guard self.ticket == ticket, epoch == current else { throw AccountFailure.accountChanged }
            let value = try JSONDecoder().decode(SupportPage<LaunchPrescription>.self, from: bytes)
            guard value.pagination.page == requested, value.pagination.limit <= 50,
                  value.data.allSatisfy({ $0.patientId == ticket.accountID && $0.source == "treatrx_external" && LaunchDates.instant($0.sentAt) != nil && LaunchDates.instant($0.recordedAt) != nil }), Set(value.data.map(\.id)).count == value.data.count else { throw LaunchFailure.invalidData }
            if next { let ids = Set(value.data.map(\.id)); records.removeAll { ids.contains($0.id) }; records += value.data } else { records = value.data }
            page = requested; totalPages = value.pagination.totalPages; error = nil; return true
        } catch { if self.ticket == ticket, epoch == current, access.snapshot() == ticket { self.error = "Couldn't load your prescription records. Refresh to try again." }; return false }
    }
}
