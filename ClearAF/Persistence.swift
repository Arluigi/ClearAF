import CoreData

struct PersistenceController {
    // Core Data's generated subclass entity lookup requires a single model
    // instance. Containers and coordinators remain separate for each account.
    private static let model = NSPersistentContainer(name: "ClearAF").managedObjectModel
    static let shared = PersistenceController()

    static var preview: PersistenceController = {
        let result = PersistenceController(inMemory: true)
        let viewContext = result.container.viewContext
        
        // Create sample data for previews
        let user = User(context: viewContext)
        user.id = UUID()
        user.name = "John Doe"
        user.skinType = "Combination"
        user.currentSkinScore = 75
        user.streakCount = 7
        user.joinDate = Date()
        user.onboardingCompleted = true
        
        let morningRoutine = Routine(context: viewContext)
        morningRoutine.id = UUID()
        morningRoutine.name = "Morning Routine"
        morningRoutine.timeOfDay = "morning"
        morningRoutine.isActive = true
        morningRoutine.completedToday = false
        
        do {
            try viewContext.save()
        } catch {
            let nsError = error as NSError
            fatalError("Unresolved error \(nsError), \(nsError.userInfo)")
        }
        return result
    }()

    let container: NSPersistentContainer
    let accountID: UUID?

    /// Identity-free instances never open an on-disk store, including legacy callers.
    init(inMemory: Bool = true) {
        accountID = nil
        container = NSPersistentContainer(name: "ClearAF", managedObjectModel: Self.model)
        let description = NSPersistentStoreDescription()
        description.type = NSInMemoryStoreType
        container.persistentStoreDescriptions = [description]
        do {
            try container.persistentStoreCoordinator.addPersistentStore(
                ofType: NSInMemoryStoreType, configurationName: nil, at: nil)
        } catch {
            fatalError("Unable to create ephemeral persistence: \(error)")
        }
        container.viewContext.automaticallyMergesChangesFromParent = true
    }

    /// Each authenticated identity owns a separate container and immutable store URL.
    /// `directory` overrides the Application Support root for isolated tests.
    /// The former root ClearAF.sqlite is deliberately never opened or migrated.
    init(accountID: UUID, directory: URL? = nil) throws {
        self.accountID = accountID
        let root = try directory ?? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true)
        let accountDirectory = root.appendingPathComponent("Accounts", isDirectory: true)
            .appendingPathComponent(accountID.uuidString.lowercased(), isDirectory: true)
        try FileManager.default.createDirectory(at: accountDirectory, withIntermediateDirectories: true)
        let storeURL = accountDirectory.appendingPathComponent("ClearAF.sqlite")
        container = NSPersistentContainer(name: "ClearAF", managedObjectModel: Self.model)
        let description = NSPersistentStoreDescription(url: storeURL)
        description.shouldAddStoreAsynchronously = false
        container.persistentStoreDescriptions = [description]
        // Synchronous throwing setup ensures the caller never receives an unloaded
        // container or silently falls back to a different account's store.
        try container.persistentStoreCoordinator.addPersistentStore(
            ofType: NSSQLiteStoreType, configurationName: nil, at: storeURL,
            options: [NSMigratePersistentStoresAutomaticallyOption: true,
                      NSInferMappingModelAutomaticallyOption: true])
        container.viewContext.userInfo["accountID"] = accountID
        container.viewContext.automaticallyMergesChangesFromParent = true
    }
}
