import Combine
import CoreData

/// Retains at most one page from the active account's context.
@MainActor final class PhotoPageStore: ObservableObject {
    static let pageSize = 24
    @Published private(set) var photos: [SkinPhoto] = []
    @Published private(set) var total = 0
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    @Published private(set) var page = 0
    let images = PhotoImageLoader()
    /// The detail sheet's 1600px decodes live apart from the grid's, so opening one photo never evicts thumbnails.
    let detailImages = PhotoImageLoader(byteLimit: 32 * 1024 * 1024, countLimit: 2)
    private var context: NSManagedObjectContext?
    private var accountID: UUID?
    private var changes: AnyCancellable?
    var hasPrevious: Bool { page > 0 }
    var hasNext: Bool { (page + 1) * Self.pageSize < total }

    func bind(context: NSManagedObjectContext) {
        let account = context.userInfo["accountID"] as? UUID
        if self.context === context && accountID == account { refresh(); return }
        dispose()
        guard let account else { return }
        self.context = context; accountID = account
        changes = NotificationCenter.default.publisher(for: .NSManagedObjectContextDidSave, object: context)
            .sink { [weak self] _ in self?.refresh() }
        refresh()
    }

    func refresh() {
        guard let context else { return }
        guard context.userInfo["accountID"] as? UUID == accountID else { dispose(); return }
        loading = true
        defer { loading = false }
        do {
            total = try context.count(for: SkinPhoto.fetchRequest())
            page = min(page, max(0, (total - 1) / Self.pageSize))
            photos = try context.fetch(Self.pageRequest(page: page, in: context))
            error = nil
        } catch {
            photos = []; total = 0; page = 0
            self.error = "Photos could not be loaded. Please try again."
        }
    }

    /// One page, newest first. Tiles read metadata only, so the photo bytes are left out of the fetch: a tile never
    /// faults a full JPEG into the main context. Bytes are read off the main thread by `PhotoBytes`.
    static func pageRequest(page: Int, in context: NSManagedObjectContext) -> NSFetchRequest<SkinPhoto> {
        let request = SkinPhoto.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(key: "captureDate", ascending: false), NSSortDescriptor(key: "id", ascending: false)]
        request.fetchLimit = pageSize; request.fetchOffset = page * pageSize
        request.fetchBatchSize = pageSize
        request.propertiesToFetch = PhotoBytes.metadataProperties(in: context)
        return request
    }

    func previous() { guard hasPrevious else { return }; page -= 1; refresh() }
    func next() { guard hasNext else { return }; page += 1; refresh() }
    func dispose() {
        changes = nil; context = nil; accountID = nil
        photos = []; total = 0; page = 0; error = nil; loading = false; images.clear(); detailImages.clear()
    }
}

/// Reads one photo's stored bytes off the main thread. The returned closure carries only the store coordinator and the
/// object ID (both safe to hand across threads) and reads through its own private-queue context, so no managed object
/// ever crosses threads and the main context never holds the bytes.
enum PhotoBytes {
    /// Every `SkinPhoto` attribute except `photoData`.
    static func metadataProperties(in context: NSManagedObjectContext) -> [NSPropertyDescription] {
        guard let entity = NSEntityDescription.entity(forEntityName: "SkinPhoto", in: context) else { return [] }
        return entity.attributesByName.filter { $0.key != "photoData" }.map(\.value)
    }

    /// Nil for a photo outside an account-bound context: an identity-free context is never read.
    @MainActor static func reader(for photo: SkinPhoto) -> (@Sendable () async -> Data?)? {
        guard let context = photo.managedObjectContext, context.userInfo["accountID"] is UUID,
              let coordinator = context.persistentStoreCoordinator else { return nil }
        // An unsaved photo is not in the store yet; its bytes are already in memory.
        if photo.objectID.isTemporaryID {
            let bytes = photo.photoData
            return { bytes }
        }
        return reader(for: photo.objectID, coordinator: coordinator)
    }

    static func reader(for id: NSManagedObjectID, coordinator: NSPersistentStoreCoordinator) -> @Sendable () async -> Data? {
        let store = Coordinator(value: coordinator)
        return {
            let context = NSManagedObjectContext(concurrencyType: .privateQueueConcurrencyType)
            context.persistentStoreCoordinator = store.value
            return await context.perform {
                defer { context.reset() }
                return (try? context.existingObject(with: id) as? SkinPhoto)?.photoData
            }
        }
    }

    /// A coordinator is safe to share between contexts on different queues; this only says so to the compiler.
    private struct Coordinator: @unchecked Sendable { let value: NSPersistentStoreCoordinator }
}
