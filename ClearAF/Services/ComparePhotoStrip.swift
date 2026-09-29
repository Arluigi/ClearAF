import Combine
import CoreData
import UIKit

/// One photo in the Compare filmstrip: its object ID and capture date, nothing else.
struct ComparePhoto: Identifiable, Equatable {
    let id: NSManagedObjectID
    let captureDate: Date?
}

/// The signed-in account's photos for Compare, newest first in pages of 24 (Record's order). Rows are dictionary
/// fetches, so no `SkinPhoto` or image bytes stay registered; bytes are read one photo at a time, off the main
/// thread, and decoded into bounded caches. Record's `PhotoPageStore` and its pagination are untouched.
@MainActor final class ComparePhotoStrip: ObservableObject {
    static let pageSize = PhotoPageStore.pageSize
    static let thumbnailPixelSize = 160
    static let stagePixelSize = 1600

    @Published private(set) var photos: [ComparePhoto] = []
    @Published private(set) var total = 0
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    let thumbnails = PhotoImageLoader(byteLimit: 8 * 1024 * 1024, countLimit: 72)
    let stageImages = PhotoImageLoader(byteLimit: 64 * 1024 * 1024, countLimit: 4)
    private var context: NSManagedObjectContext?
    private var accountID: UUID?

    var hasMore: Bool { photos.count < total }

    func bind(context: NSManagedObjectContext) {
        let account = context.userInfo["accountID"] as? UUID
        if self.context === context && accountID == account { return }
        dispose()
        guard let account else { return }
        self.context = context
        accountID = account
        reload()
    }

    func reload() {
        photos = []
        total = 0
        error = nil
        loadMore()
    }

    func loadMore() {
        guard let context, !loading else { return }
        guard context.userInfo["accountID"] as? UUID == accountID else { dispose(); return }
        guard photos.isEmpty || hasMore else { return }
        loading = true
        defer { loading = false }
        do {
            total = try context.count(for: SkinPhoto.fetchRequest())
            let objectID = NSExpressionDescription()
            objectID.name = "objectID"
            objectID.expression = .expressionForEvaluatedObject()
            objectID.expressionResultType = .objectIDAttributeType
            let request = NSFetchRequest<NSDictionary>(entityName: "SkinPhoto")
            request.resultType = .dictionaryResultType
            request.propertiesToFetch = [objectID, "captureDate"]
            request.sortDescriptors = [NSSortDescriptor(key: "captureDate", ascending: false), NSSortDescriptor(key: "id", ascending: false)]
            request.fetchOffset = photos.count
            request.fetchLimit = Self.pageSize
            let known = Set(photos.map(\.id))
            let page = try context.fetch(request).compactMap { row -> ComparePhoto? in
                guard let id = row["objectID"] as? NSManagedObjectID, !known.contains(id) else { return nil }
                return ComparePhoto(id: id, captureDate: row["captureDate"] as? Date)
            }
            photos += page
            error = nil
        } catch {
            self.error = CompareCopy.photosError
        }
    }

    /// Reads one photo's stored bytes off the main thread, for a single decode. Nil for another account's context.
    func bytesReader(for photo: ComparePhoto) -> (@Sendable () async -> Data?)? {
        guard let context, context.userInfo["accountID"] as? UUID == accountID, accountID != nil,
              let coordinator = context.persistentStoreCoordinator else { return nil }
        return PhotoBytes.reader(for: photo.id, coordinator: coordinator)
    }

    /// A decoded, aspect-preserving downsample, read and decoded off the main thread. A cached decode is returned
    /// without reading bytes again.
    func image(for photo: ComparePhoto, maxPixelSize: Int, in loader: PhotoImageLoader) async -> UIImage? {
        let key = photo.id.uriRepresentation().absoluteString
        if let hit = loader.cached(key: key, maxPixelSize: maxPixelSize) { return hit }
        guard let data = bytesReader(for: photo) else { return nil }
        return await loader.image(for: key, maxPixelSize: maxPixelSize, data: data)
    }

    /// The managed photo for the existing detail sheet, which shows the whole, uncropped photo. Fetched without its
    /// bytes, which the sheet reads off the main thread.
    func skinPhoto(for photo: ComparePhoto) -> SkinPhoto? {
        guard let context, context.userInfo["accountID"] as? UUID == accountID, accountID != nil else { return nil }
        if let registered = context.registeredObject(for: photo.id) as? SkinPhoto { return registered }
        let request = SkinPhoto.fetchRequest()
        request.predicate = NSPredicate(format: "SELF == %@", photo.id)
        request.propertiesToFetch = PhotoBytes.metadataProperties(in: context)
        request.fetchLimit = 1
        return (try? context.fetch(request))?.first
    }

    func dispose() {
        context = nil
        accountID = nil
        photos = []
        total = 0
        loading = false
        error = nil
        thumbnails.clear()
        stageImages.clear()
    }
}
