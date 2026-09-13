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
            let request = SkinPhoto.fetchRequest()
            request.sortDescriptors = [NSSortDescriptor(key: "captureDate", ascending: false), NSSortDescriptor(key: "id", ascending: false)]
            request.fetchLimit = Self.pageSize; request.fetchOffset = page * Self.pageSize
            request.fetchBatchSize = Self.pageSize
            photos = try context.fetch(request)
            error = nil
        } catch {
            photos = []; total = 0; page = 0
            self.error = "Photos could not be loaded. Please try again."
        }
    }

    func previous() { guard hasPrevious else { return }; page -= 1; refresh() }
    func next() { guard hasNext else { return }; page += 1; refresh() }
    func dispose() {
        changes = nil; context = nil; accountID = nil
        photos = []; total = 0; page = 0; error = nil; loading = false; images.clear()
    }
}
