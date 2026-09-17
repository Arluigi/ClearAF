import CoreData
import Foundation
import Testing
import UIKit
@testable import ClearAF

@MainActor struct ComparePhotoStripTests {
    private static let bytes: Data = {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: 400, height: 500), format: format)
            .jpegData(withCompressionQuality: 0.8) { $0.fill(CGRect(x: 0, y: 0, width: 400, height: 500)) }
    }()

    /// Dictionary fetches need the SQLite store the app uses, so tests open a throwaway account store.
    private func store(_ account: UUID) throws -> (PersistenceController, URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ComparePhotoStripTests-\(UUID().uuidString)")
        return (try PersistenceController(accountID: account, directory: root), root)
    }

    @Test func pagesNewestFirstWithoutHoldingPhotosOrBytes() throws {
        let (persistence, root) = try store(UUID())
        defer { try? FileManager.default.removeItem(at: root) }
        let context = persistence.container.viewContext
        for index in 0..<60 {
            let photo = SkinPhoto(context: context)
            photo.id = UUID()
            photo.captureDate = Date(timeIntervalSince1970: 1_788_000_000 + Double(index) * 86_400)
            photo.photoData = Self.bytes
            photo.uploadState = "shared"
        }
        try context.save()
        context.reset()

        let strip = ComparePhotoStrip()
        strip.bind(context: context)
        #expect(strip.total == 60 && strip.photos.count == 24 && strip.hasMore)
        #expect(strip.photos.first?.captureDate == Date(timeIntervalSince1970: 1_788_000_000 + 59 * 86_400))
        #expect(context.registeredObjects.isEmpty, "the strip keeps IDs and dates, not managed photos or their bytes")
        strip.loadMore(); strip.loadMore(); strip.loadMore()
        #expect(strip.photos.count == 60 && !strip.hasMore)
        #expect(Set(strip.photos.map(\.id)).count == 60)
        #expect(zip(strip.photos, strip.photos.dropFirst()).allSatisfy { ($0.captureDate ?? .distantPast) >= ($1.captureDate ?? .distantPast) })

        let first = try #require(strip.photos.first)
        #expect(strip.imageData(for: first) == Self.bytes)
        let thumb = try #require(strip.image(for: first, maxPixelSize: ComparePhotoStrip.thumbnailPixelSize, in: strip.thumbnails))
        #expect(max(thumb.cgImage!.width, thumb.cgImage!.height) <= ComparePhotoStrip.thumbnailPixelSize)
        #expect(strip.thumbnails.contains(key: first.id.uriRepresentation().absoluteString, maxPixelSize: ComparePhotoStrip.thumbnailPixelSize))
        #expect(strip.image(for: first, maxPixelSize: ComparePhotoStrip.thumbnailPixelSize, in: strip.thumbnails) === thumb, "a cached decode is reused")
        #expect(context.registeredObjects.isEmpty)
        #expect(strip.skinPhoto(for: first)?.photoData == Self.bytes, "the detail sheet still gets the full photo")

        strip.dispose()
        #expect(strip.photos.isEmpty && strip.total == 0 && strip.thumbnails.cachedCount == 0)
    }

    @Test func aContextThatChangedAccountOrHasNoAccountReadsNothing() throws {
        let (persistence, root) = try store(UUID())
        defer { try? FileManager.default.removeItem(at: root) }
        let context = persistence.container.viewContext
        let photo = SkinPhoto(context: context)
        photo.id = UUID(); photo.captureDate = Date(); photo.photoData = Self.bytes
        try context.save()

        let strip = ComparePhotoStrip()
        strip.bind(context: context)
        let item = try #require(strip.photos.first)
        context.userInfo["accountID"] = UUID()
        #expect(strip.imageData(for: item) == nil)
        #expect(strip.skinPhoto(for: item) == nil)
        strip.loadMore()
        #expect(strip.photos.isEmpty && strip.total == 0, "a context that changed account is dropped")

        let unbound = ComparePhotoStrip()
        #expect(unbound.imageData(for: item) == nil)
        let anonymous = PersistenceController(inMemory: true)
        unbound.bind(context: anonymous.container.viewContext)
        #expect(unbound.photos.isEmpty && unbound.total == 0, "an identity-free context is never read")
    }
}
