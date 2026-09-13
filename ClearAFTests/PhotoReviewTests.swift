import Foundation
import Testing
@testable import ClearAF

@MainActor struct PhotoReviewTests {
    @Test func batchDecodesAndMissingMeansNotReviewedOnlyOnSuccess() async throws {
        let id = UUID()
        let data = Data("{\"reviews\":[{\"photoId\":\"\(id)\",\"reviewerName\":\"Dr Test\",\"reviewedAt\":\"2026-09-13T12:00:00.000Z\"}]}".utf8)
        let response = try JSONDecoder().decode(PhotoReviewResponse.self, from: data)
        #expect(response.reviews.first?.photoId == id)
        let access = AccountAccess(); let ticket = access.activate(UUID())
        let transport = ReviewTestTransport(response: response)
        let repository = PhotoReviewRepository(access: access, transport: transport)
        await repository.load(photoID: id, ticket: ticket)
        #expect(repository.state == .reviewed(response.reviews[0]))
        transport.response = PhotoReviewResponse(reviews: [])
        await repository.load(photoID: id, ticket: ticket)
        #expect(repository.state == .notReviewed)
    }
    @Test func failureIsUnavailableAndCanRetry() async {
        let access = AccountAccess(); let ticket = access.activate(UUID())
        let transport = ReviewTestTransport(); transport.fail = true
        let repository = PhotoReviewRepository(access: access, transport: transport)
        await repository.load(photoID: UUID(), ticket: ticket)
        #expect(repository.state == .unavailable)
        transport.fail = false
        await repository.load(photoID: UUID(), ticket: ticket)
        #expect(repository.state == .notReviewed)
    }
    @Test func cancelledSuspendedLookupCannotReplaceNewPhotoStatus() async {
        let access = AccountAccess(); let ticket = access.activate(UUID())
        let transport = SuspendedReviewTransport()
        let repository = PhotoReviewRepository(access: access, transport: transport)
        let old = Task { await repository.load(photoID: UUID(), ticket: ticket) }
        while transport.continuation == nil { await Task.yield() }
        #expect(repository.state == .loading)
        repository.cancel()
        transport.continuation?.resume(returning: PhotoReviewResponse(reviews: []))
        await old.value
        #expect(repository.state == .unavailable)
    }
    @Test func unexpectedPhotoOrInvalidDateIsUnavailable() async {
        let access = AccountAccess(); let ticket = access.activate(UUID())
        let id = UUID()
        let transport = ReviewTestTransport(response: PhotoReviewResponse(reviews: [
            PhotoReview(photoId: UUID(), reviewerName: "Test", reviewedAt: "2026-09-13T12:00:00Z")
        ]))
        let repository = PhotoReviewRepository(access: access, transport: transport)
        await repository.load(photoID: id, ticket: ticket)
        #expect(repository.state == .unavailable)
        transport.response = PhotoReviewResponse(reviews: [PhotoReview(photoId: id, reviewerName: "Test", reviewedAt: "invalid")])
        await repository.load(photoID: id, ticket: ticket)
        #expect(repository.state == .unavailable)
    }
    @Test func lateResponseCannotCrossAccountGeneration() async {
        let access = AccountAccess(); let ticket = access.activate(UUID())
        let transport = ReviewTestTransport()
        transport.beforeReturn = { _ = access.activate(ticket.accountID) }
        let repository = PhotoReviewRepository(access: access, transport: transport)
        await repository.load(photoID: UUID(), ticket: ticket)
        #expect(repository.state == .unavailable)
        repository.cancel()
        #expect(repository.state == .unavailable)
    }
}

@MainActor private final class ReviewTestTransport: PhotoReviewTransport {
    var response = PhotoReviewResponse(reviews: [])
    var fail = false
    var beforeReturn: (() -> Void)?
    init(response: PhotoReviewResponse = PhotoReviewResponse(reviews: [])) { self.response = response }
    func fetchPhotoReviews(photoIDs: [UUID], ticket: AccountAccess.Ticket) async throws -> PhotoReviewResponse {
        beforeReturn?()
        if fail { throw URLError(.notConnectedToInternet) }
        return response
    }
}

@MainActor private final class SuspendedReviewTransport: PhotoReviewTransport {
    var continuation: CheckedContinuation<PhotoReviewResponse, Never>?
    func fetchPhotoReviews(photoIDs: [UUID], ticket: AccountAccess.Ticket) async throws -> PhotoReviewResponse {
        await withCheckedContinuation { continuation = $0 }
    }
}
