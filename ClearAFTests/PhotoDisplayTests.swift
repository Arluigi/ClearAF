import CoreData
import Testing
import UIKit
import AVFoundation
import PhotosUI
@testable import ClearAF

@MainActor struct PhotoDisplayTests {
    @Test func pagesAreBoundedStableAndRefreshAfterChangesAndAccountReplacement() throws {
        let a = PersistenceController(inMemory: true), b = PersistenceController(inMemory: true)
        let context = a.container.viewContext
        context.userInfo["accountID"] = UUID(); b.container.viewContext.userInfo["accountID"] = UUID()
        for index in 0..<53 {
            let photo = SkinPhoto(context: context)
            photo.id = UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", index))
            photo.captureDate = Date(timeIntervalSince1970: 100)
        }
        try context.save()
        let store = PhotoPageStore()
        store.bind(context: context)
        #expect(store.total == 53)
        #expect(store.photos.count == 24)
        let first = store.photos.map(\.id)
        store.next(); let second = store.photos.map(\.id)
        #expect(second.count == 24)
        #expect(Set(first).isDisjoint(with: Set(second)))
        store.next()
        #expect(store.photos.count == 5)
        #expect(!store.hasNext && store.hasPrevious)
        for photo in store.photos { context.delete(photo) }
        try context.save(); store.refresh()
        #expect(store.total == 48)
        #expect(store.photos.count == 24)
        store.previous()
        #expect(store.photos.map(\.id) == first)
        let newest = SkinPhoto(context: context); newest.id = UUID(); newest.captureDate = Date()
        try context.save(); store.refresh()
        #expect(store.total == 49)
        #expect(store.photos.first?.id == newest.id)
        store.bind(context: b.container.viewContext)
        #expect(store.photos.isEmpty && store.total == 0)
        #expect(!store.hasPrevious && !store.hasNext)
        store.dispose()
        #expect(store.photos.isEmpty)
    }

    @Test func imagesDownsampleAndCacheEvictsByDecodedCostAndCount() throws {
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let bytes = UIGraphicsImageRenderer(size: CGSize(width: 3000, height: 2000), format: format)
            .jpegData(withCompressionQuality: 0.8) { UIColor.purple.setFill(); $0.fill(CGRect(x: 0, y: 0, width: 3000, height: 2000)) }
        let loader = PhotoImageLoader(byteLimit: 700_000, countLimit: 2)
        let first = try #require(loader.image(data: bytes, key: "a", maxPixelSize: 400))
        #expect(first.cgImage!.width <= 400 && first.cgImage!.height <= 400)
        _ = loader.image(data: bytes, key: "b", maxPixelSize: 400)
        _ = loader.image(data: bytes, key: "c", maxPixelSize: 400)
        #expect(loader.cachedCount <= 2 && loader.decodedCost <= 700_000)
        #expect(!loader.contains(key: "a", maxPixelSize: 400))
        loader.clear()
        #expect(loader.cachedCount == 0 && loader.decodedCost == 0)
        #expect(loader.image(data: Data([1, 2]), key: "bad", maxPixelSize: 400) == nil)
    }

    @Test func cancelledAndFailedPickersIgnoreLateSelectedCallbacks() {
        for first in [PhotoPickerResult.cancelled, .failed] {
            let delivery = PhotoPickerDelivery()
            var selected = 0, terminals = 0
            let receive: (PhotoPickerResult) -> Void = { result in
                terminals += 1
                if case .selected = result { selected += 1 }
            }
            delivery.finish(first, deliver: receive)
            delivery.finish(.selected(Data([1])), deliver: receive)
            #expect(terminals == 1 && selected == 0)
        }
        let delivery = PhotoPickerDelivery()
        var selected = 0
        for _ in 0..<3 { delivery.finish(.selected(Data([1]))) { _ in selected += 1 } }
        #expect(selected == 1)
    }

    @Test func dismantledPickerDiscardsLateSelectedData() {
        var selected = 0, terminals = 0
        let picker = PhotoLibraryPicker { result in
            terminals += 1
            if case .selected = result { selected += 1 }
        }
        let coordinator = picker.makeCoordinator()
        let controller = PHPickerViewController(configuration: PHPickerConfiguration())
        PhotoLibraryPicker.dismantleUIViewController(controller, coordinator: coordinator)
        coordinator.delivery.finish(.selected(Data([1]))) { _ in selected += 1 }
        #expect(terminals == 1 && selected == 0)
    }

    @Test func cameraAccessExplainsDeniedRestrictedAndUnavailable() {
        #expect(PhotoCameraAccess.state(available: false, authorization: .authorized) == .unavailable)
        #expect(PhotoCameraAccess.state(available: true, authorization: .denied) == .denied)
        #expect(PhotoCameraAccess.state(available: true, authorization: .restricted) == .restricted)
        #expect(PhotoCameraAccess.state(available: true, authorization: .notDetermined) == .request)
        #expect(PhotoCameraAccess.state(available: true, authorization: .authorized) == .ready)
    }
}
