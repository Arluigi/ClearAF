import Foundation
import Combine

struct LaunchEnrollmentDraft: Codable, Equatable {
    let caseId: UUID; var expectedRevision: Int; let revisionId: UUID
    var answers: LaunchMedicalDraft; var captureIDs: [LaunchPhotoSlot: UUID]
    var questionnaireVersion: String? = nil
}
@MainActor final class LaunchEnrollmentRepository: ObservableObject {
    @Published private(set) var state: LaunchEnrollmentResponse?
    @Published private(set) var catalog: LaunchCatalog?
    @Published private(set) var draft: LaunchEnrollmentDraft?
    @Published private(set) var loading = false
    @Published private(set) var saving = false
    @Published private(set) var error: String?
    @Published private(set) var medicalNeedsReapply = false
    @Published private(set) var intakeV2Draft: [String: IntakeValue]?
    @Published private(set) var intakeV2DraftRevision: Int?
    private let access: AccountAccess; private let transport: any LaunchTransport; private let directory: URL?
    private var epoch = UUID(); private var ticket: AccountAccess.Ticket?; private var file: URL?
    init(access: AccountAccess, transport: any LaunchTransport, directory: URL? = nil) {
        self.access = access; self.transport = transport; self.directory = directory
    }
    func cancel() { intakeV2Draft = nil; intakeV2DraftRevision = nil; medicalNeedsReapply = false; epoch = UUID(); ticket = nil; file = nil; state = nil; catalog = nil; draft = nil; loading = false; saving = false; error = nil }
    func resume(ticket: AccountAccess.Ticket) throws {
        try access.require(ticket)
        guard self.ticket != ticket else { return }
        cancel()
        let root = try directory ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let folder = root.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let path = folder.appendingPathComponent("launch-enrollment.json")
        self.ticket = ticket; file = path
        let v2Path = path.deletingLastPathComponent().appendingPathComponent("intake-v2.json")
        if let bytes = try? Data(contentsOf: v2Path), bytes.count <= 1024 * 1024, let saved = try? JSONDecoder().decode(IntakeV2LocalDraft.self, from: bytes) { intakeV2Draft = saved.answers; intakeV2DraftRevision = saved.revision }
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
            let data = try await transport.sendCaptureCatalogRequest(LaunchRequest(path: "/enrollment", questionnaireVersion: "2.2-pending-review"), ticket: ticket)
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
        medicalNeedsReapply = draft.map { $0.caseId == next.case.id && ($0.expectedRevision != next.case.revision || ($0.questionnaireVersion != nil && $0.questionnaireVersion != next.case.questionnaireVersion)) } ?? false
    }
    func loadCatalog(ticket: AccountAccess.Ticket) async {
        do { try resume(ticket: ticket) } catch { return }
        let current = epoch
        do {
            let bytes = try await transport.sendCaptureCatalogRequest(LaunchRequest(path: "/catalog", questionnaireVersion: state?.case.questionnaireVersion ?? "2.2-pending-review"), ticket: ticket)
            try require(ticket, epoch: current)
            let next = try JSONDecoder().decode(LaunchCatalog.self, from: bytes)
            guard next.contractVersion == 1, next.hasCompatibleCaptureGuidance else { throw LaunchFailure.invalidData }
            catalog = next
        } catch { if (try? require(ticket, epoch: current)) != nil { self.error = error.localizedDescription } }
    }
    @discardableResult func mutate(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async -> Bool {
        guard !saving, (try? require(ticket, epoch: epoch)) != nil else { return false }
        let current = epoch; let priorRevision = state?.case.revision; saving = true; error = nil
        defer { if epoch == current { saving = false } }
        do {
            // Once dispatched, a write can commit even if SwiftUI cancels its
            // debounce task after the next edit. Finish receiving that write's
            // acknowledgement so the next save uses the committed revision.
            // Account/epoch checks below still reject a late account response.
            let bytes = try await Task { try await transport.send(request, ticket: ticket) }.value
            try require(ticket, epoch: current)
            try apply(JSONDecoder().decode(LaunchEnrollmentResponse.self, from: bytes))
            if intakeV2DraftRevision == priorRevision { intakeV2DraftRevision = state?.case.revision; if let intakeV2Draft { try stageIntakeV2(intakeV2Draft, ticket: ticket) } }
            return true
        } catch {
            guard (try? require(ticket, epoch: current)) != nil else { return false }
            if case LaunchFailure.server(let status, _) = error, status == 409 { _ = await refresh(ticket: ticket) }
            self.error = error.localizedDescription
            return false
        }
    }

    private struct IntakeV2LocalDraft: Codable { let answers: [String: IntakeValue]; let revision: Int }
    func stageIntakeV2(_ answers: [String: IntakeValue], ticket: AccountAccess.Ticket) throws {
        try require(ticket, epoch: epoch)
        guard let file, let current = state else { throw LaunchFailure.invalidData }
        let revision = intakeV2DraftRevision ?? current.case.revision
        let bytes = try JSONEncoder().encode(IntakeV2LocalDraft(answers: answers, revision: revision))
        guard bytes.count <= 1024 * 1024 else { throw LaunchFailure.invalidData }
        try bytes.write(to: file.deletingLastPathComponent().appendingPathComponent("intake-v2.json"), options: [.atomic, .completeFileProtection])
        intakeV2Draft = answers; intakeV2DraftRevision = revision
    }
    @discardableResult func saveIntakeV2(_ answers: [String: IntakeValue], ticket: AccountAccess.Ticket, reapply: Bool = false, advance: Bool? = nil) async -> Bool {
        guard let current = state, IntakeV2Routing.isV2(current.case.questionnaireVersion) else { return false }
        guard reapply || intakeV2DraftRevision == nil || intakeV2DraftRevision == current.case.revision else { return false }
        struct Body: Encodable { let expectedRevision: Int; let questionnaireVersion: String; let answers: [String: IntakeValue]; let advance: Bool? }
        do {
            let cleaned = IntakeV2Rules.cleaned(answers, questions: (catalog?.eligibilityQuestions ?? []) + (catalog?.medicalQuestions ?? []))
            let request = try LaunchRequest.json("/enrollment/\(current.case.id.uuidString.lowercased())/medical/\(UUID().uuidString.lowercased())", Body(expectedRevision: current.case.revision, questionnaireVersion: current.case.questionnaireVersion, answers: cleaned, advance: advance))
            guard await mutate(request, ticket: ticket), let latest = state else { return false }
            intakeV2DraftRevision = latest.case.revision
            try stageIntakeV2(cleaned, ticket: ticket)
            return true
        } catch { return false }
    }
    func rebaseIntakeV2Draft(ticket: AccountAccess.Ticket) throws {
        try require(ticket, epoch: epoch)
        intakeV2DraftRevision = state?.case.revision
        if let intakeV2Draft { try stageIntakeV2(intakeV2Draft, ticket: ticket) }
    }

    var canEditMedical: Bool {
        guard let state, let membership = state.membership,
              [.paidPendingReview, .active].contains(membership.status) else { return false }
        return state.case.status == .medicalHistory || state.case.status == .needsChanges
    }
    func stageMedical(_ answers: LaunchMedicalDraft, ticket: AccountAccess.Ticket) throws {
        try require(ticket, epoch: epoch)
        guard canEditMedical, let current = state else { throw LaunchFailure.invalidData }
        var next = answers; next.clearHiddenBranches()
        guard LaunchMedicalValidation.validDraft(next) else { throw LaunchFailure.invalidData }
        let previous = draft.flatMap { $0.caseId == current.case.id ? $0 : nil }
        let revision = previous?.expectedRevision ?? current.case.revision
        let unchanged = previous?.answers == next
        try saveDraft(.init(caseId: current.case.id, expectedRevision: revision, revisionId: unchanged ? previous!.revisionId : UUID(), answers: next, captureIDs: previous?.captureIDs ?? [:], questionnaireVersion: previous?.questionnaireVersion ?? current.case.questionnaireVersion), ticket: ticket)
        medicalNeedsReapply = revision != current.case.revision
    }
    func reapplyMedical(ticket: AccountAccess.Ticket) throws {
        try require(ticket, epoch: epoch)
        guard canEditMedical, let current = state, let draft, draft.caseId == current.case.id else { throw LaunchFailure.invalidData }
        if draft.questionnaireVersion != nil && draft.questionnaireVersion != current.case.questionnaireVersion {
            guard catalog?.questionnaireVersion == current.case.questionnaireVersion else { throw LaunchFailure.invalidData }
        }
        try saveDraft(.init(caseId: current.case.id, expectedRevision: current.case.revision, revisionId: UUID(), answers: draft.answers, captureIDs: draft.captureIDs, questionnaireVersion: current.case.questionnaireVersion), ticket: ticket)
        medicalNeedsReapply = false
    }
    @discardableResult func saveMedical(ticket: AccountAccess.Ticket) async -> Bool {
        guard canEditMedical, !medicalNeedsReapply, let draft, let current = state, draft.caseId == current.case.id else { return false }
        struct Body: Encodable { let expectedRevision: Int; let questionnaireVersion: String; let answers: LaunchMedicalDraft }
        do {
            let request = try LaunchRequest.json("/enrollment/\(draft.caseId.uuidString.lowercased())/medical/\(draft.revisionId.uuidString.lowercased())", Body(expectedRevision: draft.expectedRevision, questionnaireVersion: draft.questionnaireVersion ?? current.case.questionnaireVersion, answers: draft.answers))
            let saved = await mutate(request, ticket: ticket)
            if !saved, state?.case.questionnaireVersion != draft.questionnaireVersion { await loadCatalog(ticket: ticket) }
            if saved, let latest = state {
                // A person can keep typing while an upload is in flight. Preserve those newer local edits,
                // rebased only to our own acknowledged save; nothing is submitted automatically.
                let local = self.draft.flatMap { $0.caseId == draft.caseId ? $0 : nil } ?? draft
                try saveDraft(.init(caseId: draft.caseId, expectedRevision: latest.case.revision, revisionId: UUID(), answers: local.answers, captureIDs: local.captureIDs, questionnaireVersion: latest.case.questionnaireVersion), ticket: ticket)
                medicalNeedsReapply = false
            }
            return saved
        } catch { return false }
    }
    @discardableResult func saveDestination(_ destination: LaunchDestination, ticket: AccountAccess.Ticket) async -> Bool {
        guard let state, LaunchDestinationValidation.valid(destination) else { return false }
        struct Body: Encodable { let expectedRevision: Int; let destination: LaunchDestination }
        do { return await mutate(try .json("/enrollment/\(state.case.id.uuidString.lowercased())/destination", Body(expectedRevision: state.case.revision, destination: destination)), ticket: ticket) }
        catch { return false }
    }

}
