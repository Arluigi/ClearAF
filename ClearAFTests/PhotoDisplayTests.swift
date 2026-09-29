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

    private static func jpeg(width: Int, height: Int) -> Data {
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
            .jpegData(withCompressionQuality: 0.8) { UIColor.purple.setFill(); $0.fill(CGRect(x: 0, y: 0, width: width, height: height)) }
    }

    @Test func downsampleKeepsAspectAndCapsTheLongSide() throws {
        let bytes = Self.jpeg(width: 3000, height: 2000)
        let image = try #require(PhotoImageLoader.downsample(bytes, maxPixelSize: 400)?.cgImage)
        let pixels = PixelBuffer(image)
        #expect(pixels.width == 400 && pixels.height == 267)
        #expect(PhotoImageLoader.nativePixelSize(bytes) == 3000)
        let native = try #require(PhotoImageLoader.downsample(bytes, maxPixelSize: 3000)?.cgImage)
        #expect(native.width == 3000 && native.height == 2000)
        #expect(PhotoImageLoader.downsample(Data([1, 2]), maxPixelSize: 400) == nil)
        #expect(PhotoImageLoader.nativePixelSize(Data([1, 2])) == nil)
    }

    @Test func imagesDecodeOffMainAndCacheEvictsByDecodedCostAndCount() async throws {
        let bytes = Self.jpeg(width: 3000, height: 2000)
        let access = AccountAccess(); _ = access.activate(UUID())
        let loader = PhotoImageLoader(byteLimit: 700_000, countLimit: 2, access: access)
        let first = try #require(await loader.image(for: "a", maxPixelSize: 400, data: { bytes }))
        #expect(first.cgImage!.width <= 400 && first.cgImage!.height <= 400)
        // A cache hit never reads the bytes again.
        let hit = await loader.image(for: "a", maxPixelSize: 400, data: { Issue.record("a cache hit read bytes"); return nil })
        #expect(hit === first)
        _ = await loader.image(for: "b", maxPixelSize: 400, data: { bytes })
        _ = await loader.image(for: "c", maxPixelSize: 400, data: { bytes })
        #expect(loader.cachedCount <= 2 && loader.decodedCost <= 700_000)
        #expect(!loader.contains(key: "a", maxPixelSize: 400))
        loader.clear()
        #expect(loader.cachedCount == 0 && loader.decodedCost == 0)
        #expect(await loader.image(for: "bad", maxPixelSize: 400, data: { Data([1, 2]) }) == nil)
        #expect(await loader.image(for: "none", maxPixelSize: 400, data: { nil }) == nil)
        let full = try #require(await loader.fullImage(data: { bytes })?.cgImage)
        #expect(full.width == 3000 && full.height == 2000)
        #expect(loader.cachedCount == 0, "a full-size decode is never cached")
    }

    /// A zoomed-in decode is the photo's own size up to 4096px on the long side (a 24 MP photo would be ~96 MB).
    @Test func fullResolutionIsCappedAt4096() async throws {
        #expect(PhotoImageLoader.fullResolutionLimit == 4096)
        #expect(PhotoImageLoader.fullPixelSize(native: 3000) == 3000)
        #expect(PhotoImageLoader.fullPixelSize(native: 6000) == 4096)
        let access = AccountAccess(); _ = access.activate(UUID())
        let bytes = Self.jpeg(width: 5000, height: 2500)
        let full = try #require(await PhotoImageLoader(access: access).fullImage(data: { bytes })?.cgImage)
        #expect(full.width == 4096 && full.height == 2048)
    }

    /// Review focus 4: a decode that finishes after the account changed, or after its cache was cleared, is dropped.
    @Test func aDecodeInFlightDuringAnAccountSwitchOrClearIsDropped() async throws {
        let bytes = Self.jpeg(width: 800, height: 1000)
        let access = AccountAccess(); _ = access.activate(UUID())
        let loader = PhotoImageLoader(access: access)
        let switched = await loader.image(for: "a", maxPixelSize: 400, data: { _ = access.activate(UUID()); return bytes })
        #expect(switched == nil && loader.cachedCount == 0)
        let signedOut = await loader.image(for: "a", maxPixelSize: 400, data: { access.invalidate(); return bytes })
        #expect(signedOut == nil && loader.cachedCount == 0)
        // Signed out: nothing is read at all.
        #expect(await loader.image(for: "a", maxPixelSize: 400, data: { Issue.record("read while signed out"); return bytes }) == nil)
        #expect(await loader.fullImage(data: { Issue.record("read while signed out"); return bytes }) == nil)
        _ = access.activate(UUID())
        // A caller that is cancelled (a restarted `.task(id:)`) cancels the background read and keeps nothing.
        let cancelled = Task { await loader.image(for: "a", maxPixelSize: 400, data: { try? await Task.sleep(for: .seconds(30)); return bytes }) }
        cancelled.cancel()
        #expect(await cancelled.value == nil && loader.cachedCount == 0)
        let cleared = await loader.image(for: "a", maxPixelSize: 400, data: { await loader.clear(); return bytes })
        #expect(cleared == nil && loader.cachedCount == 0)
        #expect(await loader.image(for: "a", maxPixelSize: 400, data: { bytes }) != nil, "an undisturbed decode is kept")
        #expect(loader.cachedCount == 1)
    }

    /// Grid tiles fetch metadata only; bytes are read by object ID through a background context.
    @Test func pagesLeaveBytesOutAndReadThemOffMain() async throws {
        let persistence = PersistenceController(inMemory: true)
        let context = persistence.container.viewContext
        context.userInfo["accountID"] = UUID()
        let bytes = Self.jpeg(width: 40, height: 50)
        let photo = SkinPhoto(context: context)
        photo.id = UUID(); photo.captureDate = Date(); photo.photoData = bytes; photo.notes = "Chin"; photo.uploadState = "pending"
        #expect(await PhotoBytes.reader(for: photo)?() == bytes, "an unsaved photo's bytes come from memory")
        try context.save()

        let request = PhotoPageStore.pageRequest(page: 0, in: context)
        let names = Set((request.propertiesToFetch ?? []).compactMap { ($0 as? NSPropertyDescription)?.name })
        let entity = try #require(NSEntityDescription.entity(forEntityName: "SkinPhoto", in: context))
        #expect(names == Set(entity.attributesByName.keys).subtracting(["photoData"]))
        #expect(names.isSuperset(of: ["captureDate", "uploadState", "notes", "serverID", "id"]), "what tiles and rows read")

        let id = photo.objectID
        context.reset()
        let fetched = try #require(try context.fetch(request).first)
        #expect(fetched.objectID == id && fetched.notes == "Chin" && fetched.uploadState == "pending")
        let reader = try #require(PhotoBytes.reader(for: fetched))
        #expect(await reader() == bytes)

        let anonymous = PersistenceController(inMemory: true)
        let stray = SkinPhoto(context: anonymous.container.viewContext); stray.photoData = bytes
        #expect(PhotoBytes.reader(for: stray) == nil, "an identity-free context is never read")
    }

    /// Views never decode in `body`: they load in `.task(id:)` and show the mat until then.
    @Test func photoViewsDecodeInATaskNotInBody() throws {
        let views = LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views")
        let record = try String(contentsOf: views.appendingPathComponent("PhotoRecordDisplay.swift"), encoding: .utf8)
        let progress = try String(contentsOf: views.appendingPathComponent("ProgressView.swift"), encoding: .utf8)
        let review = try String(contentsOf: views.appendingPathComponent("PhotoReviewSheet.swift"), encoding: .utf8)
        func body(of type: String, in text: String) throws -> Substring {
            let start = try #require(text.range(of: "struct \(type): View {"))
            let rest = text[start.upperBound...]
            let end = rest.range(of: "\n}\n")?.lowerBound ?? rest.endIndex
            return rest[..<end]
        }
        for (type, text) in [("PhotoFrame", record), ("PhotoDetailView", progress), ("PhotoReviewSheet", review)] {
            let source = try body(of: type, in: text)
            #expect(!source.contains("photoData") && !source.contains("images.image(data:"), "\(type) decodes on main")
            #expect(source.contains(".task(id:") && source.contains("await images.image(for:"), "\(type) loads in a task")
            let fade = type == "PhotoDetailView" ? ".animation(reduceMotion ? nil : .smooth(duration: 0.2), value: image != nil)"
                                                 : ".animation(.smooth(duration: 0.2), value: image != nil)"
            #expect(source.contains(fade), "\(type) fades the photo in")
        }
        // Already-decoded photos show on the first frame: seeded from the cache in init, never decoded there.
        #expect(record.contains("_image = State(initialValue: images.cached(key: PhotoImageKey.of(photo), maxPixelSize: maxPixelSize))"))
        #expect(progress.contains("_image = State(initialValue: images.cached(key: PhotoImageKey.of(photo), maxPixelSize: Self.pixelSize) ?? preview)"))
        #expect(progress.components(separatedBy: "preview: images.cached(key: PhotoImageKey.of(photo), maxPixelSize: PhotoFrame.tilePixelSize))").count - 1 == 2)
        // The full-size decode is a cancellable task keyed on the zoom request, checked against the shown photo.
        #expect(progress.contains(".task(id: wantsFull) { await loadFullResolution() }"))
        #expect(progress.contains("onZoomIn: { wantsFull = shownKey })"))
        #expect(progress.contains("guard !Task.isCancelled, key == shownKey else { return }"))
        #expect(progress.contains("PhotoDetailView(photo: photo, images: detailImages"), "the detail sheet has its own cache")
    }

    /// Design audit C3: a photo's sheet grows out of the tile it was opened from; a cross-fade under Reduce Motion.
    @Test func photosOpenFromTheirThumbnail() throws {
        let views = LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views")
        let record = try String(contentsOf: views.appendingPathComponent("PhotoRecordDisplay.swift"), encoding: .utf8)
        #expect(record.contains("if reduceMotion, #available(iOS 27, *) { navigationTransition(.crossFade) }"))
        #expect(record.contains("else { navigationTransition(.zoom(sourceID: id, in: ns)) }"))
        let progress = try String(contentsOf: views.appendingPathComponent("ProgressView.swift"), encoding: .utf8)
        #expect(progress.components(separatedBy: ".matchedTransitionSource(id: photo.objectID, in: photoZoom)").count - 1 == 2, "grid tile and list row")
        #expect(progress.components(separatedBy: ".photoZoomTransition(id: photo.objectID, in: photoZoom, reduceMotion: reduceMotion)").count - 1 == 2)
        #expect(progress.components(separatedBy: "@Namespace private var photoZoom").count - 1 == 2)
        #expect(progress.contains(".sheet(isPresented: $showingDetail)"), "the existing sheet presentation is kept")
        let compare = try String(contentsOf: views.appendingPathComponent("CompareView.swift"), encoding: .utf8)
        #expect(compare.contains(".matchedTransitionSource(id: photo.id, in: photoZoom)"), "each side-by-side pane")
        #expect(compare.contains(".photoZoomTransition(id: photo.id, in: photoZoom, reduceMotion: reduceMotion)"))
        #expect(compare.contains(".fullScreenCover") == false && progress.contains(".fullScreenCover(isPresented: comparing)"),
                "Compare itself stays a full-screen cover")
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
