import CoreData
import Testing
@testable import ClearAF

@MainActor
struct AccountPersistenceTests {
    @Test func typedFetchesResolveOneModelAcrossAccountContainers() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let signedOut = PersistenceController()
        let account = try PersistenceController(accountID: UUID(), directory: root)
        #expect(signedOut.container.managedObjectModel === account.container.managedObjectModel)
        #expect(User.entity() === account.container.managedObjectModel.entitiesByName["User"])
        #expect(SkinPhoto.entity() === account.container.managedObjectModel.entitiesByName["SkinPhoto"])
        #expect(Routine.entity() === account.container.managedObjectModel.entitiesByName["Routine"])
    }

    @Test func accountsIsolateEveryEntityAndSurviveColdReopen() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let accountA = UUID()
        let accountB = UUID()
        let markerA = UUID()
        let markerB = UUID()
        var a: PersistenceController? = try PersistenceController(accountID: accountA, directory: root)
        let b = try PersistenceController(accountID: accountB, directory: root)
        try seed(try #require(a), marker: markerA)
        try expectRows(b, marker: nil)
        try seed(b, marker: markerB)
        try expectRows(try #require(a), marker: markerA)
        try expectRows(b, marker: markerB)
        // An old context stays bound to A, even while B is active.
        #expect(a?.container.viewContext !== b.container.viewContext)
        let coordinator = try #require(a).container.persistentStoreCoordinator
        a?.container.viewContext.reset()
        for store in coordinator.persistentStores { try coordinator.remove(store) }
        a = nil
        let reopened = try PersistenceController(accountID: accountA, directory: root)
        try expectRows(reopened, marker: markerA)
        #expect(reopened.accountID == accountA)
    }

    @Test func identityFreeControllersAreEmptyAndEphemeral() throws {
        let first = PersistenceController()
        try seed(first, marker: UUID())
        let signedOut = PersistenceController()
        try expectRows(signedOut, marker: nil)
        #expect(signedOut.accountID == nil)
        #expect(signedOut.container.persistentStoreCoordinator.persistentStores.allSatisfy { $0.type == NSInMemoryStoreType })
        #expect(PersistenceController.shared.accountID == nil)
        #expect(PersistenceController(inMemory: false).container.persistentStoreCoordinator.persistentStores.allSatisfy { $0.type == NSInMemoryStoreType })
    }

    @Test func legacyUnownedFilesAreNeverOpenedOrChanged() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let bytes = Data("synthetic unowned legacy data".utf8)
        for suffix in ["", "-wal", "-shm"] {
            try bytes.write(to: root.appendingPathComponent("ClearAF.sqlite" + suffix))
        }
        let controller = try PersistenceController(accountID: UUID(), directory: root)
        try expectRows(controller, marker: nil)
        try seed(controller, marker: UUID())
        for suffix in ["", "-wal", "-shm"] {
            #expect(try Data(contentsOf: root.appendingPathComponent("ClearAF.sqlite" + suffix)) == bytes)
        }
    }

    @Test func invalidAccountDirectoryThrowsWithoutFallback() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try Data([0]).write(to: root)
        defer { try? FileManager.default.removeItem(at: root) }
        #expect(throws: (any Error).self) {
            try PersistenceController(accountID: UUID(), directory: root)
        }
    }

    @Test func preferencesDoNotAdoptGlobalOrOtherAccountValues() throws {
        let suite = "AccountPersistenceTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set(true, forKey: "morningReminder")
        let id = UUID()
        let a = AccountPreferences(accountID: id, defaults: defaults)
        let b = AccountPreferences(accountID: UUID(), defaults: defaults)
        #expect(!a.bool(forKey: "morningReminder"))
        a.set(true, forKey: "morningReminder")
        #expect(!b.bool(forKey: "morningReminder"))
        #expect(AccountPreferences(accountID: id, defaults: defaults).bool(forKey: "morningReminder"))
        a.removeObject(forKey: "morningReminder")
        #expect(!a.bool(forKey: "morningReminder"))
        #expect(defaults.bool(forKey: "morningReminder"))
    }

    private func seed(_ controller: PersistenceController, marker: UUID) throws {
        let context = controller.container.viewContext
        for entity in controller.container.managedObjectModel.entities {
            let object = NSManagedObject(entity: entity, insertInto: context)
            object.setValue(marker, forKey: "id")
        }
        try context.save()
    }

    private func expectRows(_ controller: PersistenceController, marker: UUID?) throws {
        for entity in controller.container.managedObjectModel.entities {
            let name = try #require(entity.name)
            let rows = try controller.container.viewContext.fetch(NSFetchRequest<NSManagedObject>(entityName: name))
            #expect(rows.count == (marker == nil ? 0 : 1), "Entity: \(name)")
            if let marker { #expect(rows.first?.value(forKey: "id") as? UUID == marker, "Entity: \(name)") }
        }
    }
}
