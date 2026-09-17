import CoreData
import Foundation
import Testing
@testable import ClearAF

@MainActor struct PhotoRecordTests {
    @Test func tileStatesAreNamedInWords() {
        #expect(PhotoTileState.of(uploadState: nil, reviewed: false) == .onDevice)
        #expect(PhotoTileState.of(uploadState: "pending", reviewed: true) == .waitingToShare)
        #expect(PhotoTileState.of(uploadState: "error", reviewed: false) == .couldNotShare)
        #expect(PhotoTileState.of(uploadState: "shared", reviewed: false) == .shared)
        #expect(PhotoTileState.of(uploadState: "shared", reviewed: true) == .reviewed)
        #expect([PhotoTileState.onDevice, .waitingToShare, .shared, .reviewed].map(\.label) == ["On device", "Waiting to share", "Shared", "Reviewed"])
        #expect(PhotoTileState.couldNotShare.label == "Couldn't share")
    }

    @Test func tilesOfferOnlyRetryWhileRowsKeepShareAndRetry() {
        #expect(PhotoTileState.couldNotShare.action(compact: true) == "Retry")
        for state in [PhotoTileState.onDevice, .waitingToShare, .shared, .reviewed] {
            #expect(state.action(compact: true) == nil)
        }
        #expect(PhotoTileState.onDevice.action(compact: false) == "Share")
        #expect(PhotoTileState.waitingToShare.action(compact: false) == "Retry")
        #expect(PhotoTileState.couldNotShare.action(compact: false) == "Retry")
        #expect(PhotoTileState.shared.action(compact: false) == nil)
        #expect(PhotoTileState.reviewed.action(compact: false) == nil)
    }

    @Test func pagePhotosAreGroupedUnderMonthRules() {
        let iso = ISO8601DateFormatter()
        let dates: [Date?] = ["2026-09-15T07:12:00Z", "2026-09-01T07:00:00Z", "2026-08-31T21:00:00Z", "2025-08-30T08:00:00Z"]
            .map { iso.date(from: $0) } + [nil]
        let groups = PhotoMonthGroup<Date?>.group(dates, date: { $0 }, locale: Locale(identifier: "en_US"), timeZone: TimeZone(identifier: "UTC")!)
        #expect(groups.map(\.title) == ["September 2026", "August 2026", "August 2025", "Undated"])
        #expect(groups.map(\.items.count) == [2, 1, 1, 1])
        #expect(Set(groups.map(\.id)).count == groups.count)
    }

    @Test func countsAndPagesKeepExistingPagination() throws {
        #expect(PhotoRecordCounts.headline(total: 1) == "1 photo")
        #expect(PhotoRecordCounts.headline(total: 46) == "46 photos")
        #expect(PhotoRecordCounts.pages(total: 0, pageSize: 24) == 1)
        #expect(PhotoRecordCounts.pages(total: 24, pageSize: 24) == 1)
        #expect(PhotoRecordCounts.pages(total: 49, pageSize: 24) == 3)
        let store = PersistenceController(inMemory: true)
        let context = store.container.viewContext
        for state in ["shared", "shared", "pending", "error"] { _ = photo(context, state: state, server: nil) }
        try context.save()
        #expect(PhotoRecordCounts.shared(in: context) == 2)
    }

    @Test func reviewIndexMarksOnlyConfirmedSharedPhotos() async {
        let access = AccountAccess(), ticket = access.activate(UUID())
        let store = PersistenceController(inMemory: true)
        let context = store.container.viewContext
        context.userInfo["accountID"] = ticket.accountID
        let reviewedID = UUID(), sharedID = UUID()
        let reviewed = photo(context, state: "shared", server: reviewedID)
        let shared = photo(context, state: "shared", server: sharedID)
        let pending = photo(context, state: "pending", server: nil)
        let transport = ReviewFake()
        transport.reviewedIDs = [reviewedID]
        let index = PhotoReviewIndex(access: access, transport: transport)
        await index.load(photos: [reviewed, shared, pending], ticket: ticket)
        #expect(transport.calls == [[reviewedID, sharedID]])
        #expect(index.isReviewed(reviewed))
        #expect(!index.isReviewed(shared))
        #expect(!index.isReviewed(pending))
        transport.extra = UUID()
        await index.load(photos: [reviewed, shared], ticket: ticket)
        #expect(!index.isReviewed(reviewed), "a response naming a photo that was not requested is discarded")
    }

    @Test func reviewIndexFallsBackToSharedOnFailureAndNeverCrossesAccounts() async {
        let access = AccountAccess(), ticket = access.activate(UUID())
        let store = PersistenceController(inMemory: true)
        let context = store.container.viewContext
        context.userInfo["accountID"] = ticket.accountID
        let id = UUID()
        let reviewed = photo(context, state: "shared", server: id)
        let transport = ReviewFake()
        transport.reviewedIDs = [id]
        let index = PhotoReviewIndex(access: access, transport: transport)
        await index.load(photos: [reviewed], ticket: ticket)
        #expect(index.isReviewed(reviewed))
        transport.fail = true
        await index.load(photos: [reviewed], ticket: ticket)
        #expect(!index.isReviewed(reviewed))
        transport.fail = false
        let other = access.activate(UUID())
        await index.load(photos: [reviewed], ticket: other)
        #expect(!index.isReviewed(reviewed))
        await index.load(photos: [reviewed], ticket: ticket)
        #expect(!index.isReviewed(reviewed), "a replaced ticket cannot publish")
        #expect(transport.calls.count == 2, "another account's photo IDs and a stale ticket never reach the network")
    }

    @Test func reviewIndexBatchesAtTheEndpointLimit() async {
        let access = AccountAccess(), ticket = access.activate(UUID())
        let store = PersistenceController(inMemory: true)
        let context = store.container.viewContext
        context.userInfo["accountID"] = ticket.accountID
        let photos = (0..<60).map { _ in photo(context, state: "shared", server: UUID()) }
        let transport = ReviewFake()
        let index = PhotoReviewIndex(access: access, transport: transport)
        await index.load(photos: photos, ticket: ticket)
        #expect(transport.calls.map(\.count) == [50, 10])
    }

    private func photo(_ context: NSManagedObjectContext, state: String?, server: UUID?) -> SkinPhoto {
        let photo = SkinPhoto(context: context)
        photo.id = UUID()
        photo.captureDate = Date()
        photo.uploadState = state
        photo.serverID = server?.uuidString.lowercased()
        return photo
    }
}

@MainActor private final class ReviewFake: PhotoReviewTransport {
    var reviewedIDs: Set<UUID> = []
    var calls: [[UUID]] = []
    var extra: UUID?
    var fail = false
    func fetchPhotoReviews(photoIDs: [UUID], ticket: AccountAccess.Ticket) async throws -> PhotoReviewResponse {
        calls.append(photoIDs)
        if fail { throw URLError(.notConnectedToInternet) }
        var rows = photoIDs.filter(reviewedIDs.contains)
            .map { PhotoReview(photoId: $0, reviewerName: "Synthetic Clinician", reviewedAt: "2026-09-15T08:02:00.000Z") }
        if let extra { rows.append(PhotoReview(photoId: extra, reviewerName: "Synthetic Clinician", reviewedAt: "2026-09-15T08:02:00.000Z")) }
        return PhotoReviewResponse(reviews: rows)
    }
}
