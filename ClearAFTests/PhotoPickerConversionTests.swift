import XCTest
import UniformTypeIdentifiers
import CoreData
@testable import ClearAF

final class PhotoPickerConversionTests: XCTestCase {
    @MainActor func testProviderErrorAndCorruptBytesReachFailureWithoutSaving() async throws {
        for providerError in [false, true] {
            let persistence = PersistenceController(inMemory: true)
            let result = expectation(description: "Recoverable provider failure")
            var failed = false
            let picker = PhotoLibraryPicker { value in
                switch value {
                case .failed: failed = true
                case .selected(let bytes):
                    let photo = SkinPhoto(context: persistence.container.viewContext)
                    photo.id = UUID(); photo.photoData = bytes
                    try? persistence.container.viewContext.save()
                case .cancelled: XCTFail("Conversion failure must not become cancellation")
                }
                result.fulfill()
            }
            let provider = NSItemProvider()
            provider.registerDataRepresentation(forTypeIdentifier: UTType.image.identifier, visibility: .all) { completion in
                completion(Data([0, 1, 2, 3]), providerError ? NSError(domain: "SyntheticProvider", code: 1) : nil)
                return nil
            }
            let coordinator = picker.makeCoordinator()
            coordinator.load(provider: provider)
            await fulfillment(of: [result], timeout: 5)
            XCTAssertTrue(failed)
            XCTAssertEqual(try persistence.container.viewContext.count(for: SkinPhoto.fetchRequest()), 0)
        }
    }
}
