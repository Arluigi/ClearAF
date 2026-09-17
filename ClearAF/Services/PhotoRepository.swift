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
