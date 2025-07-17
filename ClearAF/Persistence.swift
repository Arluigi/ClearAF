import CoreData

struct PersistenceController {
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

    init(inMemory: Bool = false) {
        container = NSPersistentContainer(name: "ClearAF")
        if inMemory {
            container.persistentStoreDescriptions.first!.url = URL(fileURLWithPath: "/dev/null")
        }
        container.loadPersistentStores(completionHandler: { (storeDescription, error) in
            if let error = error as NSError? {
                fatalError("Unresolved error \(error), \(error.userInfo)")
            }
        })
        container.viewContext.automaticallyMergesChangesFromParent = true
    }
}