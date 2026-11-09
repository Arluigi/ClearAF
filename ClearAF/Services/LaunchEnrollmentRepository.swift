import Foundation
import Combine

struct LaunchEnrollmentDraft: Codable, Equatable {
    let caseId: UUID; var expectedRevision: Int; let revisionId: UUID
    var answers: LaunchMedicalDraft; var captureIDs: [LaunchPhotoSlot: UUID]
}
@MainActor final class LaunchEnrollmentRepository: ObservableObject {
    @Published private(set) var state: LaunchEnrollmentResponse?
    @Published private(set) var catalog: LaunchCatalog?
    @Published private(set) var draft: LaunchEnrollmentDraft?
    @Published private(set) var loading = false
    @Published private(set) var saving = false
    @Published private(set) var error: String?
    private let access: AccountAccess; private let transport: any LaunchTransport; private let directory: URL?
    private var epoch = UUID(); private var ticket: AccountAccess.Ticket?; private var file: URL?
    init(access: AccountAccess, transport: any LaunchTransport, directory: URL? = nil) {
        self.access = access; self.transport = transport; self.directory = directory
    }
    func cancel() { epoch = UUID(); ticket = nil; file = nil; state = nil; catalog = nil; draft = nil; loading = false; saving = false; error = nil }
    func resume(ticket: AccountAccess.Ticket) throws {
        try access.require(ticket)
        guard self.ticket != ticket else { return }
        cancel()
        let root = try directory ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let folder = root.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let path = folder.appendingPathComponent("launch-enrollment.json")
        self.ticket = ticket; file = path
        if FileManager.default.fileExists(atPath: path.path) {
            let bytes = try Data(contentsOf: path)
            guard bytes.count <= 1024 * 1024 else { throw LaunchFailure.invalidData }
            draft = try JSONDecoder().decode(LaunchEnrollmentDraft.self, from: bytes)
        }
    }
    private func require(_ ticket: AccountAccess.Ticket, epoch: UUID) throws {
        try access.require(ticket)
        guard self.ticket == ticket, self.epoch == epoch else { throw AccountFailure.accountChanged }
    }
    func saveDraft(_ draft: LaunchEnrollmentDraft, ticket: AccountAccess.Ticket) throws {
        try require(ticket, epoch: epoch)
        guard let file, draft.expectedRevision >= 0 else { throw LaunchFailure.invalidData }
        let bytes = try JSONEncoder().encode(draft)
        guard bytes.count <= 1024 * 1024 else { throw LaunchFailure.invalidData }
        try bytes.write(to: file, options: [.atomic, .completeFileProtection])
        self.draft = draft
    }
    @discardableResult func refresh(ticket: AccountAccess.Ticket) async -> Bool {
        do { try resume(ticket: ticket) } catch { return false }
        let current = epoch; loading = true
        defer { if current == epoch { loading = false } }
        do {
            let data = try await transport.send(LaunchRequest(path: "/enrollment"), ticket: ticket)
            try require(ticket, epoch: current)
            let next = try JSONDecoder().decode(LaunchEnrollmentResponse.self, from: data)
            try apply(next)
            error = nil; return true
        } catch {
            if (try? require(ticket, epoch: current)) != nil { self.error = error.localizedDescription }
            return false
        }
    }
    private func apply(_ next: LaunchEnrollmentResponse) throws {
        guard next.case.revision >= 0 else { throw LaunchFailure.invalidData }
        if let membership = next.membership {
            guard membership.amountCents >= 0, membership.currency == "usd" else { throw LaunchFailure.invalidData }
        }
        if let current = state {
            guard current.case.id == next.case.id else { throw LaunchFailure.invalidData }
            // A foreground GET can finish after a save. The server revision is authoritative.
            guard next.case.revision >= current.case.revision else { return }
        }
        state = next
    }
    func loadCatalog(ticket: AccountAccess.Ticket) async {
        do { try resume(ticket: ticket) } catch { return }
        let current = epoch
        do {
            let bytes = try await transport.send(LaunchRequest(path: "/catalog"), ticket: ticket)
            try require(ticket, epoch: current)
            let next = try JSONDecoder().decode(LaunchCatalog.self, from: bytes)
            guard next.contractVersion == 1 else { throw LaunchFailure.invalidData }
            catalog = next
        } catch { if (try? require(ticket, epoch: current)) != nil { self.error = error.localizedDescription } }
    }
    @discardableResult func mutate(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async -> Bool {
        guard !saving, (try? require(ticket, epoch: epoch)) != nil else { return false }
        let current = epoch; saving = true; error = nil
        defer { if epoch == current { saving = false } }
        do {
            let bytes = try await transport.send(request, ticket: ticket)
            try require(ticket, epoch: current)
            try apply(JSONDecoder().decode(LaunchEnrollmentResponse.self, from: bytes))
            return true
        } catch {
            guard (try? require(ticket, epoch: current)) != nil else { return false }
            if case LaunchFailure.server(let status, _) = error, status == 409 { _ = await refresh(ticket: ticket) }
            self.error = error.localizedDescription
            return false
        }
    }
}
