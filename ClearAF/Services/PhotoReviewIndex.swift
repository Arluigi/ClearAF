import Combine
import CoreData
import Foundation

/// Which shared photos on the visible Record page a clinician has marked reviewed. Read-only display helper over
/// the existing `/photo-reviews/status` batch read (≤ 50 IDs). A failed or unverifiable lookup leaves tiles at "Shared".
@MainActor final class PhotoReviewIndex: ObservableObject {
    static let batchLimit = 50
    @Published private(set) var reviewed: Set<UUID> = []
    private let access: AccountAccess
    private let transport: any PhotoReviewTransport
    private var requestID = UUID()

    init(access: AccountAccess, transport: any PhotoReviewTransport) {
        self.access = access
        self.transport = transport
    }

    /// Server IDs of shared photos that belong to the signed-in account's store, without duplicates.
    static func sharedServerIDs(_ photos: [SkinPhoto], accountID: UUID) -> [UUID] {
        var seen = Set<UUID>()
        return photos.compactMap { photo in
            guard photo.uploadState == "shared",
                  photo.managedObjectContext?.userInfo["accountID"] as? UUID == accountID,
                  let raw = photo.serverID, let id = UUID(uuidString: raw),
                  seen.insert(id).inserted else { return nil }
            return id
        }
    }

    func isReviewed(_ photo: SkinPhoto) -> Bool {
        guard photo.uploadState == "shared", let raw = photo.serverID, let id = UUID(uuidString: raw) else { return false }
        return reviewed.contains(id)
    }

    func cancel() {
        requestID = UUID()
        reviewed = []
    }

    func load(photos: [SkinPhoto], ticket: AccountAccess.Ticket) async {
        let request = UUID()
        requestID = request
        let ids = Self.sharedServerIDs(photos, accountID: ticket.accountID)
        guard !ids.isEmpty else { reviewed = []; return }
        var found = Set<UUID>()
        do {
            for start in stride(from: 0, to: ids.count, by: Self.batchLimit) {
                let chunk = Array(ids[start..<min(start + Self.batchLimit, ids.count)])
                try access.require(ticket)
                let response = try await transport.fetchPhotoReviews(photoIDs: chunk, ticket: ticket)
                try access.require(ticket)
                try Task.checkCancellation()
                guard requestID == request else { return }
                let requested = Set(chunk)
                guard response.reviews.allSatisfy({ requested.contains($0.photoId) && $0.date != nil }) else {
                    throw URLError(.cannotParseResponse)
                }
                found.formUnion(response.reviews.map(\.photoId))
            }
            reviewed = found
        } catch {
            guard requestID == request else { return }
            reviewed = []
        }
    }
}
