import Foundation
import Combine

struct PhotoReview: Decodable, Equatable {
    let photoId: UUID
    let reviewerName: String
    let reviewedAt: String

    var date: Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: reviewedAt) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: reviewedAt)
    }
}

struct PhotoReviewResponse: Decodable { let reviews: [PhotoReview] }

@MainActor protocol PhotoReviewTransport {
    func fetchPhotoReviews(photoIDs: [UUID], ticket: AccountAccess.Ticket) async throws -> PhotoReviewResponse
}

@MainActor final class PhotoReviewRepository: ObservableObject {
    enum State: Equatable { case loading, unavailable, notReviewed, reviewed(PhotoReview) }
    @Published private(set) var state: State = .unavailable
    private let access: AccountAccess
    private let transport: PhotoReviewTransport
    private var requestID = UUID()

    init(access: AccountAccess, transport: PhotoReviewTransport) {
        self.access = access
        self.transport = transport
    }

    func cancel() {
        requestID = UUID()
        state = .unavailable
    }

    func load(photoID: UUID, ticket: AccountAccess.Ticket) async {
        let request = UUID()
        requestID = request
        state = .loading
        do {
            try access.require(ticket)
            let response = try await transport.fetchPhotoReviews(photoIDs: [photoID], ticket: ticket)
            try access.require(ticket)
            try Task.checkCancellation()
            guard requestID == request else { return }
            guard response.reviews.allSatisfy({ $0.photoId == photoID && $0.date != nil }),
                  response.reviews.count <= 1 else { throw URLError(.cannotParseResponse) }
            state = response.reviews.first.map(State.reviewed) ?? .notReviewed
        } catch {
            guard requestID == request else { return }
            state = .unavailable
        }
    }
}
