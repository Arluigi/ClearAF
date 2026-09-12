import CoreData
import Testing
import UIKit
@testable import ClearAF

@MainActor struct PhotoRepositoryTests {
    @Test func originalStoreMigratesWithoutLosingCapture() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let account = UUID(), capture = UUID()
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        let bytes = Data([1, 2, 3, 4])
        let modelURL = try #require(Bundle.main.url(forResource: "ClearAF", withExtension: "momd"))
        let original = try #require(NSManagedObjectModel(contentsOf: modelURL.appendingPathComponent("ClearAF.mom")))
        let directory = root.appendingPathComponent("Accounts/\(account.uuidString.lowercased())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let coordinator = NSPersistentStoreCoordinator(managedObjectModel: original)
        let disk = try coordinator.addPersistentStore(ofType: NSSQLiteStoreType, configurationName: nil,
            at: directory.appendingPathComponent("ClearAF.sqlite"))
        let oldContext = NSManagedObjectContext(concurrencyType: .mainQueueConcurrencyType)
        oldContext.persistentStoreCoordinator = coordinator
        let old = NSEntityDescription.insertNewObject(forEntityName: "SkinPhoto", into: oldContext)
        old.setValue(capture, forKey: "id"); old.setValue(bytes, forKey: "photoData")
        old.setValue(date, forKey: "captureDate")
        try oldContext.save()
        oldContext.reset()
        try coordinator.remove(disk)
        let reopened = try PersistenceController(accountID: account, directory: root)
        defer { close(reopened) }
        let photo = try #require(reopened.container.viewContext.fetch(SkinPhoto.fetchRequest()).first)
        #expect(photo.id == capture)
        #expect(photo.photoData == bytes)
        #expect(photo.captureDate == date)
        #expect(photo.entity.attributesByName["uploadState"]?.isOptional == true)
        #expect(photo.entity.attributesByName["serverID"]?.isOptional == true)
    }
}

@MainActor private final class CaptureTransport: PhotoTransport {
    var offline = true
    var loseCompletion = false
    var loseUpload = false
    var failure: Error?
    var pauseComplete = false
    var intents: [UUID] = []
    var records: [UUID: String] = [:]
    var pause: CheckedContinuation<Void, Never>?
    var pauseIntent = false
    var uploaded: Set<UUID> = []
    var uploads = 0
    func intent(captureID: UUID, ticket: AccountAccess.Ticket) async throws -> CaptureIntent {
        intents.append(captureID)
        if pauseIntent { await withCheckedContinuation { pause = $0 } }
        if let failure { throw failure }
        if offline { throw URLError(.notConnectedToInternet) }
        if let id = records[captureID] { return .shared(id) }
        return uploaded.contains(captureID) ? .uploaded : .upload("synthetic-upload")
    }
    func upload(_ bytes: Data, signedURL: String, ticket: AccountAccess.Ticket) async throws {
        uploads += 1
        uploaded.insert(intents.last!)
        if loseUpload { loseUpload = false; throw URLError(.networkConnectionLost) }
    }
    func complete(captureID: UUID, date: Date, notes: String, ticket: AccountAccess.Ticket) async throws -> String {
        if pauseComplete { await withCheckedContinuation { pause = $0 } }
        let id = records[captureID] ?? UUID().uuidString
        records[captureID] = id
        if loseCompletion { loseCompletion = false; throw URLError(.networkConnectionLost) }
        return id
    }
}

@MainActor extension PhotoRepositoryTests {
    private func close(_ store: PersistenceController) {
        store.container.viewContext.reset()
        let coordinator = store.container.persistentStoreCoordinator
        for disk in coordinator.persistentStores { try? coordinator.remove(disk) }
    }
    private func jpeg() -> Data {
        UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).jpegData(withCompressionQuality: 0.8) { context in
            UIColor.purple.setFill(); context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }
    private func eventually(_ condition: () -> Bool) async throws {
        for _ in 0..<100 {
            if condition() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(condition())
    }
    @Test func offlineCaptureReopensAndLostCompletionRetriesSameIdentity() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), transport = CaptureTransport()
        let ticket = access.activate(UUID())
        var store: PersistenceController? = try PersistenceController(accountID: ticket.accountID, directory: root)
        let repository = PhotoRepository(access: access, transport: transport, retryInterval: 3600)
        repository.resume(context: store!.container.viewContext, ticket: ticket)
        let date = Date(timeIntervalSince1970: 1_700_000_000), bytes = jpeg()
        var photo: SkinPhoto? = try repository.capture(bytes, date: date, notes: "Synthetic capture", ticket: ticket)
        let captureID = try #require(photo?.id)
        #expect(photo?.uploadState == "pending")
        try await eventually { photo?.uploadState == "error" }
        repository.cancel()
        photo = nil; close(store!); store = nil
        store = try PersistenceController(accountID: ticket.accountID, directory: root)
        photo = try #require(store!.container.viewContext.fetch(SkinPhoto.fetchRequest()).first)
        #expect(photo?.id == captureID)
        #expect(photo?.photoData == bytes)
        #expect(photo?.captureDate == date)
        transport.offline = false; transport.loseCompletion = true
        repository.resume(context: store!.container.viewContext, ticket: ticket)
        try repository.share(photo!)
        try await eventually { transport.records[captureID] != nil && photo?.uploadState == "error" }
        #expect(photo?.serverID == nil)
        try repository.share(photo!)
        try repository.share(photo!)
        try await eventually { photo?.uploadState == "shared" }
        #expect(photo?.serverID == transport.records[captureID])
        #expect(Set(transport.intents) == [captureID])
        #expect(transport.uploads == 1)
        #expect(try store!.container.viewContext.count(for: SkinPhoto.fetchRequest()) == 1)
        repository.cancel(); photo = nil; close(store!); store = nil
        let sharedStore = try PersistenceController(accountID: ticket.accountID, directory: root)
        defer { close(sharedStore) }
        let shared = try #require(sharedStore.container.viewContext.fetch(SkinPhoto.fetchRequest()).first)
        #expect(shared.uploadState == "shared")
        #expect(shared.serverID != nil)
    }
    @Test func legacyRowsRequireExplicitSharing() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), transport = CaptureTransport()
        transport.offline = false
        let ticket = access.activate(UUID())
        let store = try PersistenceController(accountID: ticket.accountID, directory: root)
        defer { close(store) }
        let photo = SkinPhoto(context: store.container.viewContext)
        let id = UUID(); photo.id = id; photo.photoData = jpeg(); photo.captureDate = Date()
        try store.container.viewContext.save()
        let repository = PhotoRepository(access: access, transport: transport)
        repository.resume(context: store.container.viewContext, ticket: ticket)
        try await Task.sleep(for: .milliseconds(100))
        #expect(photo.uploadState == nil)
        #expect(transport.intents.isEmpty)
        try repository.share(photo)
        try await eventually { photo.uploadState == "shared" }
        #expect(photo.id == id)
        repository.cancel()
    }
    @Test func suspendedIntentCannotUploadOrMutateAfterAccountSwitch() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), transport = CaptureTransport()
        transport.offline = false; transport.pauseIntent = true
        let a = access.activate(UUID())
        let storeA = try PersistenceController(accountID: a.accountID, directory: root)
        defer { close(storeA) }
        let repository = PhotoRepository(access: access, transport: transport)
        repository.resume(context: storeA.container.viewContext, ticket: a)
        let photo = try repository.capture(jpeg(), ticket: access.snapshot())
        try await eventually { transport.pause != nil }
        repository.cancel()
        let b = access.activate(UUID())
        let storeB = try PersistenceController(accountID: b.accountID, directory: root)
        defer { close(storeB) }
        repository.resume(context: storeB.container.viewContext, ticket: b)
        #expect(throws: AccountFailure.self) { try repository.share(photo) }
        // A system picker can deliver A's bytes after B has logged in.
        #expect(throws: AccountFailure.self) { try repository.capture(jpeg(), ticket: a) }
        transport.pause?.resume(); transport.pause = nil
        try await Task.sleep(for: .milliseconds(100))
        #expect(transport.uploads == 0)
        #expect(photo.uploadState == "pending")
        #expect(photo.serverID == nil)
        #expect(try storeB.container.viewContext.count(for: SkinPhoto.fetchRequest()) == 0)
        repository.cancel()
    }
    @Test func lostUploadResumesAfterReopenWithoutAnotherUpload() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), transport = CaptureTransport()
        transport.offline = false; transport.loseUpload = true
        let ticket = access.activate(UUID())
        let first = try PersistenceController(accountID: ticket.accountID, directory: root)
        let repository = PhotoRepository(access: access, transport: transport, retryInterval: 1)
        repository.resume(context: first.container.viewContext, ticket: ticket)
        let photo = try repository.capture(jpeg(), ticket: access.snapshot())
        let id = try #require(photo.id)
        try await eventually { photo.uploadState == "error" }
        #expect(transport.uploads == 1)
        repository.cancel(); close(first)
        // The persisted backoff must prevent a tight retry loop across foreground transitions.
        let second = try PersistenceController(accountID: ticket.accountID, directory: root)
        defer { close(second) }
        let restored = try #require(second.container.viewContext.fetch(SkinPhoto.fetchRequest()).first)
        repository.resume(context: second.container.viewContext, ticket: ticket)
        try await Task.sleep(for: .milliseconds(100))
        #expect(restored.uploadState == "error")
        try await Task.sleep(for: .seconds(1))
        try await eventually { restored.uploadState == "shared" }
        #expect(restored.id == id)
        #expect(transport.uploads == 1)
        #expect(transport.records.count == 1)
        repository.cancel()
    }

    @Test func terminalFailureWaitsForDeliberateRetry() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), transport = CaptureTransport()
        transport.offline = false; transport.failure = AccountFailure.requestFailed(400)
        let ticket = access.activate(UUID())
        let store = try PersistenceController(accountID: ticket.accountID, directory: root)
        defer { close(store) }
        let repository = PhotoRepository(access: access, transport: transport, retryInterval: 1)
        repository.resume(context: store.container.viewContext, ticket: ticket)
        let photo = try repository.capture(jpeg(), ticket: access.snapshot())
        try await eventually { photo.uploadState == "error" }
        transport.failure = nil
        try await Task.sleep(for: .milliseconds(1200))
        #expect(photo.uploadState == "error")
        #expect(transport.intents.count == 1)
        try repository.share(photo)
        try await eventually { photo.uploadState == "shared" }
        repository.cancel()
    }

    @Test func oldCompletionCannotMarkSharedAfterSameAccountNewLogin() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), transport = CaptureTransport()
        transport.offline = false; transport.pauseComplete = true
        let first = access.activate(UUID())
        let store = try PersistenceController(accountID: first.accountID, directory: root)
        defer { close(store) }
        let repository = PhotoRepository(access: access, transport: transport)
        repository.resume(context: store.container.viewContext, ticket: first)
        let photo = try repository.capture(jpeg(), ticket: access.snapshot())
        try await eventually { transport.pause != nil }
        access.invalidate(); repository.cancel()
        _ = access.activate(first.accountID)
        transport.pause?.resume(); transport.pause = nil
        try await Task.sleep(for: .milliseconds(100))
        #expect(photo.uploadState == "pending")
        #expect(photo.serverID == nil)
        repository.cancel()
    }

    @Test func invalidBytesAndSaveFailureNeverClaimCaptureSuccess() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), transport = CaptureTransport()
        let ticket = access.activate(UUID())
        let store = try PersistenceController(accountID: ticket.accountID, directory: root)
        defer { close(store) }
        let repository = PhotoRepository(access: access, transport: transport)
        repository.resume(context: store.container.viewContext, ticket: ticket)
        #expect(throws: (any Error).self) { try repository.capture(Data(), ticket: ticket) }
        #expect(throws: (any Error).self) { try repository.capture(Data(repeating: 0, count: 10 * 1024 * 1024 + 1), ticket: ticket) }
        #expect(try store.container.viewContext.count(for: SkinPhoto.fetchRequest()) == 0)
        // Reopen the real SQLite store read-only to exercise an actual save error.
        let coordinator = store.container.persistentStoreCoordinator
        let disk = try #require(coordinator.persistentStores.first)
        let url = try #require(disk.url)
        try coordinator.remove(disk)
        _ = try coordinator.addPersistentStore(ofType: NSSQLiteStoreType, configurationName: nil,
            at: url, options: [NSReadOnlyPersistentStoreOption: true])
        #expect(throws: (any Error).self) { try repository.capture(jpeg(), ticket: access.snapshot()) }
        #expect(repository.lastError != nil)
        #expect(transport.intents.isEmpty)
        store.container.viewContext.rollback()
        repository.cancel()
    }
}
