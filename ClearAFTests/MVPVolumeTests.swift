import CoreData
import Testing
import UIKit
@testable import ClearAF

@MainActor struct MVPVolumeTests {
    /// Parent supplies exactly the two generated fixture accounts after UI sign-out/termination.
    @Test func cleanupPhysicalIsolationFixture() async throws {
        guard let input = ProcessInfo.processInfo.environment["CLEARAF_MVP_ISOLATION_CLEANUP"] else { return }
        struct Fixture: Decodable { let run: UUID; let accountIDs: [UUID] }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(input.utf8))
        try #require(fixture.accountIDs.count == 2 && Set(fixture.accountIDs).count == 2)
        for _ in 0..<50 where APIService.shared.phase == .loading {
            try await Task.sleep(for: .milliseconds(100))
        }
        try #require(APIService.shared.phase == .signedOut)
        try #require(APIService.shared.currentUser == nil && APIService.shared.persistence.accountID == nil)
        try #require(APIService.shared.access.snapshot() == nil)
        try #require(SupabaseService.shared.client.auth.currentSession == nil)
        let files = FileManager.default
        let support = try files.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
        let accounts = support.appendingPathComponent("Accounts", isDirectory: true)
        let owned = Set(fixture.accountIDs.map { $0.uuidString.lowercased() })
        let before = Set(files.fileExists(atPath: accounts.path) ? try files.contentsOfDirectory(atPath: accounts.path) : [])
        for id in owned {
            let path = accounts.appendingPathComponent(id, isDirectory: true)
            if files.fileExists(atPath: path.path) { try files.removeItem(at: path) }
        }
        let after = Set(files.fileExists(atPath: accounts.path) ? try files.contentsOfDirectory(atPath: accounts.path) : [])
        #expect(after == before.subtracting(owned))
        let documents = try files.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let export = documents.appendingPathComponent("MVPIsolationExport/\(fixture.run.uuidString.lowercased())")
        if files.fileExists(atPath: export.path) { try files.removeItem(at: export) }
        let evidence: [String: Any] = ["accountIDs": owned.sorted(), "remainingOwnedDirectories": after.intersection(owned).count,
            "unrelatedDirectoryCount": after.count, "unrelatedDirectoryNamesPreserved": after == before.subtracting(owned),
            "exportAbsent": !files.fileExists(atPath: export.path), "signedOut": true]
        try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys])
            .write(to: documents.appendingPathComponent("MVPIsolationCleanup.json"), options: .atomic)
        print("MVP exact two-account cleanup verified; unrelated directory names preserved; no container reset")
    }

    /// One generated local record for physical A→B evidence; no server upload or personal media.
    @Test func exportPhysicalIsolationFixture() throws {
        guard let input = ProcessInfo.processInfo.environment["CLEARAF_MVP_ISOLATION_INPUT"] else { return }
        struct Fixture: Decodable { let run: UUID; let accountID: UUID; let photoID: UUID }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: input)))
        let files = FileManager.default
        let documents = try files.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let root = documents.appendingPathComponent("MVPIsolationExport/\(fixture.run.uuidString.lowercased())")
        try #require(!files.fileExists(atPath: root.path), "Never overwrite an existing export")
        let persistence = try PersistenceController(accountID: fixture.accountID, directory: root)
        let context = persistence.container.viewContext
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let bytes = UIGraphicsImageRenderer(size: CGSize(width: 640, height: 480), format: format)
            .jpegData(withCompressionQuality: 0.8) { UIColor.systemTeal.setFill(); $0.fill(CGRect(x: 0, y: 0, width: 640, height: 480)) }
        let photo = SkinPhoto(context: context)
        photo.id = fixture.photoID; photo.serverID = fixture.photoID.uuidString.lowercased()
        // Terminal local fixture state prevents any synthetic upload to an API.
        photo.uploadState = "shared"; photo.photoData = bytes
        photo.captureDate = Date(timeIntervalSince1970: 1767225600)
        photo.notes = "Generated account isolation fixture"
        try context.save(); context.reset()
        let request = SkinPhoto.fetchRequest()
        #expect(try context.count(for: request) == 1)
        for store in persistence.container.persistentStoreCoordinator.persistentStores {
            try persistence.container.persistentStoreCoordinator.remove(store)
        }
        let manifest: [String: Any] = ["run": fixture.run.uuidString.lowercased(),
            "accountID": fixture.accountID.uuidString.lowercased(), "photoIDs": [fixture.photoID.uuidString.lowercased()],
            "photos": 1, "relativeStore": "Accounts/\(fixture.accountID.uuidString.lowercased())/ClearAF.sqlite",
            "generatedJPEGBytes": bytes.count, "serverUpload": false]
        try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
            .write(to: root.appendingPathComponent("manifest.json"), options: .atomic)
        print("MVP isolation fixture exported one generated local photo with coordinator closed")
    }

    /// Read-only CoreData metadata export, without fetching photo bytes or modifying records.
    @Test func exportPhysicalCaptureMetadata() throws {
        guard let raw = ProcessInfo.processInfo.environment["CLEARAF_MVP_CAPTURE_ACCOUNT_ID"] else { return }
        let account = try #require(UUID(uuidString: raw))
        let files = FileManager.default
        let support = try files.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: false)
        let storeURL = support.appendingPathComponent("Accounts/\(account.uuidString.lowercased())/ClearAF.sqlite")
        #expect(files.fileExists(atPath: storeURL.path))
        guard files.fileExists(atPath: storeURL.path) else { return }
        let container = NSPersistentContainer(name: "ClearAF", managedObjectModel: PersistenceController().container.managedObjectModel)
        let store = try container.persistentStoreCoordinator.addPersistentStore(ofType: NSSQLiteStoreType,
            configurationName: nil, at: storeURL, options: [NSReadOnlyPersistentStoreOption: true])
        defer { try? container.persistentStoreCoordinator.remove(store) }
        let request = NSFetchRequest<NSDictionary>(entityName: "SkinPhoto")
        request.resultType = .dictionaryResultType
        request.propertiesToFetch = ["id", "serverID", "uploadState", "captureDate"]
        request.sortDescriptors = [NSSortDescriptor(key: "captureDate", ascending: false)]
        let rows = try container.viewContext.fetch(request).map { row -> [String: String] in
            var result: [String: String] = [:]
            if let id = row["id"] as? UUID { result["id"] = id.uuidString.lowercased() }
            if let server = row["serverID"] as? String { result["serverID"] = server }
            if let state = row["uploadState"] as? String { result["uploadState"] = state }
            if let date = row["captureDate"] as? Date { result["captureDate"] = date.ISO8601Format() }
            return result
        }
        let documents = try files.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = documents.appendingPathComponent("MVPPhysicalCaptureMetadata")
        try files.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONSerialization.data(withJSONObject: ["accountID": account.uuidString.lowercased(), "photos": rows], options: [.prettyPrinted, .sortedKeys])
            .write(to: directory.appendingPathComponent(account.uuidString.lowercased() + ".json"), options: .atomic)
        print("MVP read-only physical metadata exported \(rows.count) capture identities; no image bytes")
    }

    /// Opt-in test-target writer. Exports an isolated store, never opens the live account store.
    @Test func exportSyntheticAccountHistory() throws {
        let environment = ProcessInfo.processInfo.environment
        guard let input = environment["CLEARAF_MVP_NATIVE_INPUT"] else { return }
        struct Fixture: Decodable { let run: UUID; let accountID: UUID; let photoIDs: [UUID] }
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: URL(fileURLWithPath: input)))
        #expect(fixture.photoIDs.count == 1000)
        #expect(Set(fixture.photoIDs).count == 1000)
        guard fixture.photoIDs.count == 1000 && Set(fixture.photoIDs).count == 1000 else { return }
        let documents = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let root = documents.appendingPathComponent("MVPVolumeExport").appendingPathComponent(fixture.run.uuidString.lowercased())
        #expect(!FileManager.default.fileExists(atPath: root.path))
        guard !FileManager.default.fileExists(atPath: root.path) else { return }
        let persistence = try PersistenceController(accountID: fixture.accountID, directory: root)
        let context = persistence.container.viewContext
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let bytes = UIGraphicsImageRenderer(size: CGSize(width: 1600, height: 1200), format: format)
            .jpegData(withCompressionQuality: 0.8) { UIColor(red: 0.45, green: 0.58, blue: 0.53, alpha: 1).setFill(); $0.fill(CGRect(x: 0, y: 0, width: 1600, height: 1200)) }
        for (index, id) in fixture.photoIDs.enumerated() {
            let photo = SkinPhoto(context: context)
            photo.id = id; photo.serverID = id.uuidString.lowercased(); photo.uploadState = "shared"
            photo.captureDate = Date(timeIntervalSince1970: 1767225600 + Double(index) * 60)
            photo.photoData = bytes; photo.notes = "Generated synthetic volume fixture"
            if index % 50 == 49 { try context.save(); context.reset() }
        }
        try context.save(); context.reset()
        let pages = PhotoPageStore(); pages.bind(context: context)
        #expect(pages.total == 1000 && pages.photos.count == 24)
        let loader = PhotoImageLoader()
        var samples: [[String: Int]] = []
        for index in 0..<21 {
            #expect(pages.photos.count <= 24)
            for photo in pages.photos {
                let data = try #require(photo.photoData)
                let id = try #require(photo.id)
                let image = try #require(loader.image(data: data, key: id.uuidString, maxPixelSize: 400))
                #expect(image.cgImage!.width <= 400 && image.cgImage!.height <= 400)
            }
            samples.append(["page": index + 1, "records": pages.photos.count, "cacheCount": loader.cachedCount, "decodedBytes": loader.decodedCost])
            #expect(loader.cachedCount <= 32 && loader.decodedCost <= 16 * 1024 * 1024)
            pages.next()
        }
        pages.dispose(); loader.clear(); context.reset()
        // Closing coordinator checkpoints WAL through CoreData before any stopped-app transfer.
        for store in persistence.container.persistentStoreCoordinator.persistentStores {
            try persistence.container.persistentStoreCoordinator.remove(store)
        }
        let manifest: [String: Any] = ["run": fixture.run.uuidString.lowercased(), "accountID": fixture.accountID.uuidString.lowercased(),
            "photoIDs": fixture.photoIDs.map { $0.uuidString.lowercased() }, "photos": 1000, "pages": 42,
            "generatedJPEGBytes": bytes.count, "samples": samples,
            "relativeStore": "Accounts/\(fixture.accountID.uuidString.lowercased())/ClearAF.sqlite"]
        try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
            .write(to: root.appendingPathComponent("manifest.json"), options: .atomic)
        print("MVP native exported 1000 records, 42 pages; 21 actual page/cache samples in isolated export manifest")
    }
}
