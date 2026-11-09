import Combine
import CoreData
import UIKit

enum CaptureIntent { case shared(String), uploaded, upload(String) }

@MainActor protocol PhotoTransport {
    func intent(captureID: UUID, ticket: AccountAccess.Ticket) async throws -> CaptureIntent
    func upload(_ bytes: Data, signedURL: String, ticket: AccountAccess.Ticket) async throws
    func complete(captureID: UUID, date: Date, notes: String, ticket: AccountAccess.Ticket) async throws -> String
}

enum PhotoCaptureFailure: LocalizedError {
    case invalidImage, invalidMetadata, saveFailed
    var errorDescription: String? {
        switch self {
        case .invalidImage: return "Choose a JPEG photo no larger than 10 MB."
        case .invalidMetadata: return "The photo needs a capture date and notes of 10,000 characters or fewer."
        case .saveFailed: return "Your photo could not be saved on this device. Please try again."
        }
    }
}

/// Bytes and upload intent are committed together before any network work starts.
/// A foreground-only worker retains the capture ID through every retry.
@MainActor final class PhotoRepository: ObservableObject {
    /// Shared with `PhotoReviewDraft.noteLimit` so the review sheet names the same limit this validates against.
    /// `nonisolated` because it's an immutable `Int` literal, safe to read from any context.
    nonisolated static let noteLimit = 10_000
    @Published var lastError: String?
    private let access: AccountAccess
    private let transport: any PhotoTransport
    private let retryInterval: TimeInterval
    private var context: NSManagedObjectContext?
    private var ticket: AccountAccess.Ticket?
    private var worker: Task<Void, Never>?
    private var timer: Task<Void, Never>?
    private var runID = UUID()

    init(access: AccountAccess, transport: any PhotoTransport, retryInterval: TimeInterval = 30) {
        self.access = access; self.transport = transport; self.retryInterval = max(1, retryInterval)
    }

    func resume(context: NSManagedObjectContext, ticket: AccountAccess.Ticket) {
        guard access.snapshot() == ticket, context.userInfo["accountID"] as? UUID == ticket.accountID else { return }
        if self.context !== context || self.ticket != ticket {
            cancel(); self.context = context; self.ticket = ticket
        }
        startWorker()
    }

    func cancel() {
        runID = UUID()
        worker?.cancel(); timer?.cancel()
        worker = nil; timer = nil; context = nil; ticket = nil; lastError = nil
    }

    @discardableResult func capture(_ bytes: Data, date: Date = Date(), notes: String = "", ticket expected: AccountAccess.Ticket?) throws -> SkinPhoto {
        try access.require(expected)
        let (context, _) = try binding()
        try validate(bytes, date: date, notes: notes)
        let photo = SkinPhoto(context: context)
        photo.id = UUID(); photo.captureDate = date; photo.photoData = bytes; photo.notes = notes
        photo.uploadState = "pending"
        try save(photo, in: context)
        startWorker()
        return photo
    }

    func share(_ photo: SkinPhoto) throws {
        let (context, _) = try binding()
        guard photo.managedObjectContext === context, !photo.isDeleted else { throw AccountFailure.accountChanged }
        guard photo.uploadState != "shared" else { return }
        guard let date = photo.captureDate, photo.id != nil else { throw PhotoCaptureFailure.invalidMetadata }
        try validate(photo.photoData ?? Data(), date: date, notes: photo.notes ?? "")
        photo.uploadState = "pending"; photo.retryAfter = nil
        try save(photo, in: context)
        startWorker()
    }

    private func binding() throws -> (NSManagedObjectContext, AccountAccess.Ticket) {
        try access.require(ticket)
        guard let context, let ticket, context.userInfo["accountID"] as? UUID == ticket.accountID else {
            throw AccountFailure.accountChanged
        }
        return (context, ticket)
    }

    private func validate(_ bytes: Data, date: Date, notes: String) throws {
        guard !bytes.isEmpty, bytes.count <= 10 * 1024 * 1024,
              bytes.starts(with: [0xff, 0xd8, 0xff]), UIImage(data: bytes) != nil else {
            throw PhotoCaptureFailure.invalidImage
        }
        guard date.timeIntervalSince1970.isFinite, notes.utf16.count <= Self.noteLimit else {
            throw PhotoCaptureFailure.invalidMetadata
        }
    }

    private func save(_ photo: SkinPhoto, in context: NSManagedObjectContext) throws {
        do { try context.save(); lastError = nil }
        catch {
            if photo.isInserted { context.delete(photo) }
            else { context.refresh(photo, mergeChanges: false) }
            lastError = PhotoCaptureFailure.saveFailed.localizedDescription
            throw PhotoCaptureFailure.saveFailed
        }
    }

    private func startWorker() {
        guard worker == nil, let context, let ticket, access.snapshot() == ticket else { return }
        timer?.cancel(); timer = nil
        let run = runID
        worker = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.drain(context: context, ticket: ticket, run: run)
            guard self.runID == run else { return }
            self.worker = nil
            // A failed local save needs deliberate retry; never repeatedly claim success.
            guard self.lastError == nil else { return }
            self.timer = Task { @MainActor [weak self] in
                guard let interval = self?.retryInterval else { return }
                do { try await Task.sleep(for: .seconds(interval)) } catch { return }
                self?.startWorker()
            }
        }
    }

    private func require(_ ticket: AccountAccess.Ticket, run: UUID) throws {
        try Task.checkCancellation()
        try access.require(ticket)
        guard runID == run, self.ticket == ticket else { throw AccountFailure.accountChanged }
    }

    private func drain(context: NSManagedObjectContext, ticket: AccountAccess.Ticket, run: UUID) async {
        do {
            while true {
                try require(ticket, run: run)
                let request = SkinPhoto.fetchRequest()
                request.sortDescriptors = [NSSortDescriptor(key: "captureDate", ascending: true)]
                // Nil status is a legacy, local-only photo. Terminal errors have no retry date.
                request.predicate = NSPredicate(format: "uploadState == 'pending' OR (uploadState == 'error' AND retryAfter != nil AND retryAfter <= %@)", Date() as NSDate)
                request.fetchLimit = 1
                guard let photo = try context.fetch(request).first else { return }
                do {
                    guard let id = photo.id, let date = photo.captureDate else { throw PhotoCaptureFailure.invalidMetadata }
                    let bytes = photo.photoData ?? Data(), notes = photo.notes ?? ""
                    try validate(bytes, date: date, notes: notes)
                    let intent = try await transport.intent(captureID: id, ticket: ticket)
                    try require(ticket, run: run)
                    let serverID: String
                    switch intent {
                    case .shared(let id): serverID = id
                    case .uploaded:
                        serverID = try await transport.complete(captureID: id, date: date, notes: notes, ticket: ticket)
                        try require(ticket, run: run)
                    case .upload(let url):
                        try await transport.upload(bytes, signedURL: url, ticket: ticket)
                        try require(ticket, run: run)
                        serverID = try await transport.complete(captureID: id, date: date, notes: notes, ticket: ticket)
                        try require(ticket, run: run)
                    }
                    photo.serverID = serverID; photo.uploadState = "shared"; photo.retryAfter = nil
                    try save(photo, in: context)
                } catch {
                    try require(ticket, run: run)
                    if case PhotoCaptureFailure.saveFailed = error { return }
                    photo.uploadState = "error"
                    photo.retryAfter = Self.isTransient(error) ? Date().addingTimeInterval(retryInterval) : nil
                    try save(photo, in: context)
                }
            }
        } catch {
            guard runID == run, access.snapshot() == ticket, !Task.isCancelled else { return }
            lastError = PhotoCaptureFailure.saveFailed.localizedDescription
        }
    }

    private static func isTransient(_ error: Error) -> Bool { AccountFailure.isTransient(error) }
}

// MARK: - Launch photo sets
// Launch captures use API-mediated bytes; they never obtain a direct Storage upload URL.
struct LaunchPhotoEntry: Codable, Equatable, Identifiable {
    var id: LaunchPhotoSlot { slot }
    let slot: LaunchPhotoSlot
    let captureId: UUID
    let captureDate: Date
    let bytes: Data
    var photoId: UUID?
}
enum LaunchPhotoRules {
    static func required(sites: [String]) -> [LaunchPhotoSlot] {
        [.front, .left, .right] + (sites.contains("chest") ? [.chest] : []) + (sites.contains("back") ? [.back] : [])
    }
    static func complete(_ set: LaunchPhotoSet) -> Bool {
        let slots = set.items.map(\.slot)
        return !set.requiredSlots.isEmpty && Set(set.requiredSlots).isSubset(of: Set(slots)) &&
            Set(slots).count == slots.count && Set(set.items.map(\.photoId)).count == slots.count &&
            Set(set.items.map(\.captureId)).count == slots.count
    }
}
@MainActor final class LaunchPhotoSetRepository: ObservableObject {
    @Published private(set) var entries: [LaunchPhotoEntry] = []
    @Published private(set) var photoSet: LaunchPhotoSet?
    @Published private(set) var requiredSlots: [LaunchPhotoSlot] = []
    @Published private(set) var saving = false
    @Published private(set) var error: String?
    private let access: AccountAccess
    private let transport: any LaunchTransport
    private let directory: URL?
    private var ticket: AccountAccess.Ticket?
    private var targetId: UUID?
    private var purpose: LaunchPhotoSet.Purpose = .enrollment
    private var setId = UUID()
    private var epoch = UUID()
    private var file: URL?
    private var immutable = false
    private var correctionFrom: UUID?
    init(access: AccountAccess, transport: any LaunchTransport, directory: URL? = nil) { self.access = access; self.transport = transport; self.directory = directory }
    private struct Saved: Codable { let targetId: UUID; let purpose: LaunchPhotoSet.Purpose; let setId: UUID; let requiredSlots: [LaunchPhotoSlot]; let entries: [LaunchPhotoEntry]; let photoSet: LaunchPhotoSet?; let correctionFrom: UUID? }
    var acknowledgedSlots: Set<LaunchPhotoSlot> {
        guard let photoSet else { return [] }
        return Set(photoSet.items.filter { item in entries.contains { $0.slot == item.slot && $0.captureId == item.captureId && $0.photoId == item.photoId } }.map(\.slot))
    }
    var isComplete: Bool {
        guard let photoSet else { return false }
        // Optional photos matter too: a failed removal must never send an image the person removed.
        return LaunchPhotoRules.complete(photoSet) && Set(requiredSlots).isSubset(of: acknowledgedSlots) &&
            photoSet.items.count == entries.count && acknowledgedSlots.count == entries.count && entries.allSatisfy { $0.photoId != nil }
    }
    /// Derived from durable state, so a failed optional removal remains retryable after relaunch.
    var associationNeedsRetry: Bool {
        let uploaded = entries.filter { $0.photoId != nil }
        guard let photoSet else { return !uploaded.isEmpty }
        return photoSet.items.count != uploaded.count || !photoSet.items.allSatisfy { item in
            uploaded.contains { $0.slot == item.slot && $0.photoId == item.photoId && $0.captureId == item.captureId }
        }
    }
    var isReadOnly: Bool { immutable }
    func cancel() { epoch = UUID(); ticket = nil; targetId = nil; file = nil; entries = []; photoSet = nil; requiredSlots = []; saving = false; error = nil; immutable = false; correctionFrom = nil }
    func resume(ticket: AccountAccess.Ticket, targetId: UUID, purpose: LaunchPhotoSet.Purpose, requiredSlots: [LaunchPhotoSlot], serverSet: LaunchPhotoSet? = nil) throws {
        try access.require(ticket)
        if self.ticket == ticket && self.targetId == targetId && self.purpose == purpose {
            try reconcile(serverSet, requirements: requiredSlots)
            try persist()
            return
        }
        cancel(); self.ticket = ticket; self.targetId = targetId; self.purpose = purpose
        let root = try directory ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let folder = root.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())/LaunchPhotos")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("\(purpose.rawValue)-\(targetId.uuidString.lowercased()).json"); self.file = file
        if FileManager.default.fileExists(atPath: file.path) {
            let bytes = try Data(contentsOf: file)
            guard bytes.count <= 30 * 1024 * 1024 else { throw LaunchFailure.invalidData }
            let saved = try JSONDecoder().decode(Saved.self, from: bytes)
            guard saved.targetId == targetId, saved.purpose == purpose, saved.entries.count <= LaunchPhotoSlot.allCases.count,
                  Set(saved.entries.map(\.slot)).count == saved.entries.count,
                  saved.entries.allSatisfy({ $0.bytes.count <= LaunchSkinPhotoEncoder.imageLimit }) else { throw LaunchFailure.invalidData }
            setId = saved.setId; entries = saved.entries; photoSet = saved.photoSet; correctionFrom = saved.correctionFrom
            immutable = saved.photoSet?.status == .submitted || saved.photoSet?.status == .reviewed
        } else { setId = UUID() }
        try reconcile(serverSet, requirements: requiredSlots)
        try persist()
    }
    private func reconcile(_ serverSet: LaunchPhotoSet?, requirements: [LaunchPhotoSlot]) throws {
        if let serverSet { guard serverSet.purpose == purpose else { throw LaunchFailure.invalidData } }
        if let serverSet, serverSet.status == .needsChanges {
            // Corrections get a new draft identity, never a PUT against the immutable earlier submission.
            if correctionFrom != serverSet.id {
                setId = UUID(); entries = []; photoSet = nil; correctionFrom = serverSet.id
            }
            immutable = false
            // The old set's sensitive-site snapshot does not require removed sites in this new revision.
            let currentSnapshot = photoSet.flatMap { $0.id == setId && $0.id != serverSet.id ? $0.requiredSlots : nil } ?? []
            requiredSlots = LaunchPhotoSlot.allCases.filter { requirements.contains($0) || currentSnapshot.contains($0) }
            return
        }
        if let serverSet, serverSet.status == .submitted || serverSet.status == .reviewed {
            let old = entries
            setId = serverSet.id; photoSet = serverSet; immutable = true
            entries = serverSet.items.map { item in
                let retained = old.first { $0.captureId == item.captureId && $0.photoId == item.photoId }
                return .init(slot: item.slot, captureId: item.captureId, captureDate: retained?.captureDate ?? .distantPast, bytes: retained?.bytes ?? Data(), photoId: item.photoId)
            }
        } else if let serverSet, entries.isEmpty || (immutable && setId != serverSet.id) {
            setId = serverSet.id; photoSet = serverSet; immutable = false
            entries = serverSet.items.map { .init(slot: $0.slot, captureId: $0.captureId, captureDate: .distantPast, bytes: Data(), photoId: $0.photoId) }
        } else if let serverSet, setId != serverSet.id {
            // A different device changed the set. Preserve this device's draft rather than attaching it blindly.
            throw LaunchFailure.invalidData
        }
        let matching = serverSet.flatMap { $0.id == setId ? $0.requiredSlots : nil } ?? photoSet.flatMap { $0.id == setId ? $0.requiredSlots : nil } ?? []
        requiredSlots = LaunchPhotoSlot.allCases.filter { requirements.contains($0) || matching.contains($0) }
    }
    private func require(_ ticket: AccountAccess.Ticket, _ epoch: UUID) throws {
        try access.require(ticket)
        guard self.ticket == ticket, self.epoch == epoch else { throw AccountFailure.accountChanged }
    }
    private func persist() throws {
        guard let ticket, let targetId, let file else { throw AccountFailure.accountChanged }
        try require(ticket, epoch)
        let bytes = try JSONEncoder().encode(Saved(targetId: targetId, purpose: purpose, setId: setId, requiredSlots: requiredSlots, entries: entries, photoSet: photoSet, correctionFrom: correctionFrom))
        guard bytes.count <= 30 * 1024 * 1024 else { throw LaunchFailure.invalidData }
        try bytes.write(to: file, options: [.atomic, .completeFileProtection])
    }
    func stage(_ input: Data, slot: LaunchPhotoSlot, date: Date = .now, ticket: AccountAccess.Ticket) throws {
        try require(ticket, epoch)
        guard !saving, !immutable, date.timeIntervalSince1970.isFinite else { throw LaunchFailure.invalidData }
        let bytes = try LaunchSkinPhotoEncoder.jpeg(input)
        guard !entries.contains(where: { $0.slot != slot && $0.bytes == bytes }) else { throw LaunchFailure.invalidData }
        let old = entries
        entries.removeAll { $0.slot == slot }
        entries.append(.init(slot: slot, captureId: UUID(), captureDate: date, bytes: bytes, photoId: nil))
        do { try persist(); error = nil } catch { entries = old; throw error }
    }
    @discardableResult func upload(_ slot: LaunchPhotoSlot, ticket: AccountAccess.Ticket) async -> Bool {
        guard (try? require(ticket, epoch)) != nil, !saving, !immutable, let entry = entries.first(where: { $0.slot == slot }) else { return false }
        let current = epoch; saving = true; error = nil
        defer { if epoch == current { saving = false } }
        do {
            if entry.photoId == nil {
                let boundary = "UNZIT-\(UUID().uuidString)"
                guard let targetId else { throw LaunchFailure.invalidData }
                let body = try LaunchSkinPhotoEncoder.multipart(entry.bytes, date: entry.captureDate, purpose: purpose, targetId: targetId, boundary: boundary)
                let data = try await transport.send(.init(path: "/photo-captures/\(entry.captureId.uuidString.lowercased())", method: "POST", body: body, contentType: "multipart/form-data; boundary=\(boundary)"), ticket: ticket)
                try require(ticket, current)
                struct Response: Decodable { let capture: LaunchCapture }
                let capture = try JSONDecoder().decode(Response.self, from: data).capture
                guard capture.captureId == entry.captureId, LaunchDates.instant(capture.uploadedAt) != nil, LaunchDates.instant(capture.captureDate) != nil,
                      let index = entries.firstIndex(where: { $0.captureId == entry.captureId }) else { throw LaunchFailure.invalidData }
                entries[index].photoId = capture.id; try persist()
            }
            try await associate(ticket: ticket, epoch: current)
            return true
        } catch {
            if (try? require(ticket, current)) != nil { self.error = "Couldn't share this photo set. Your photos are saved on this device. Retry when connected." }
            return false
        }
    }
    @discardableResult func retake(_ slot: LaunchPhotoSlot, ticket: AccountAccess.Ticket) async -> Bool {
        guard (try? require(ticket, epoch)) != nil, !saving, !immutable else { return false }
        let current = epoch; saving = true
        defer { if epoch == current { saving = false } }
        do {
            let old = entries; entries.removeAll { $0.slot == slot }
            do { try persist() } catch { entries = old; throw error }
            if photoSet != nil { try await associate(ticket: ticket, epoch: current) }
            error = nil; return true
        } catch {
            if (try? require(ticket, current)) != nil { self.error = "Couldn't update the photo set. Retry before continuing." }
            return false
        }
    }
    @discardableResult func retryAssociation(ticket: AccountAccess.Ticket) async -> Bool {
        guard (try? require(ticket, epoch)) != nil, !saving, !immutable else { return false }
        let current = epoch; saving = true
        defer { if epoch == current { saving = false } }
        do {
            try await associate(ticket: ticket, epoch: current)
            error = nil; return true
        } catch {
            if (try? require(ticket, current)) != nil { self.error = "Couldn't update the photo set. Your changes are saved on this device. Retry when connected." }
            return false
        }
    }
    private func associate(ticket: AccountAccess.Ticket, epoch: UUID) async throws {
        guard let targetId else { throw LaunchFailure.invalidData }
        struct Item: Encodable { let slot: LaunchPhotoSlot; let photoId: String; let captureId: String }
        struct Body: Encodable { let purpose: LaunchPhotoSet.Purpose; let targetId: String; let items: [Item] }
        let items = entries.compactMap { entry -> Item? in guard let photoId = entry.photoId else { return nil }; return .init(slot: entry.slot, photoId: photoId.uuidString.lowercased(), captureId: entry.captureId.uuidString.lowercased()) }
        guard Set(items.map(\.photoId)).count == items.count, Set(items.map(\.captureId)).count == items.count else { throw LaunchFailure.invalidData }
        let bytes = try await transport.send(try .json("/photo-sets/\(setId.uuidString.lowercased())", Body(purpose: purpose, targetId: targetId.uuidString.lowercased(), items: items)), ticket: ticket)
        try require(ticket, epoch)
        struct Response: Decodable { let photoSet: LaunchPhotoSet }
        let set = try JSONDecoder().decode(Response.self, from: bytes).photoSet
        guard set.id == setId, set.purpose == purpose, set.status == .draft || set.status == .needsChanges,
              set.items.count == items.count, set.items.allSatisfy({ returned in items.contains { $0.slot == returned.slot && $0.photoId == returned.photoId.uuidString.lowercased() && $0.captureId == returned.captureId.uuidString.lowercased() } }) else { throw LaunchFailure.invalidData }
        photoSet = set
        requiredSlots = LaunchPhotoSlot.allCases.filter { requiredSlots.contains($0) || set.requiredSlots.contains($0) }
        try persist()
    }
}
