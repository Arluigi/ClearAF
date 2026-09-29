import UIKit
import ImageIO

/// Decoded images only. Each account view owns a cache, never the original upload bytes. Reading and decoding run off
/// the main thread; only the bounded LRU cache lives on the main actor.
@MainActor final class PhotoImageLoader {
    private struct Entry { let image: UIImage; let cost: Int }
    private var entries: [String: Entry] = [:]
    private var order: [String] = []
    private let byteLimit: Int
    private let countLimit: Int
    private let access: AccountAccess
    /// Bumped by `clear()`, so a decode that was in flight when the cache was cleared (sign-out, account switch,
    /// the owning view leaving) is dropped instead of repopulating it.
    private var epoch = 0
    private(set) var decodedCost = 0
    var cachedCount: Int { entries.count }

    init(byteLimit: Int = 16 * 1024 * 1024, countLimit: Int = 32, access: AccountAccess = APIService.shared.access) {
        self.byteLimit = max(0, byteLimit); self.countLimit = max(0, countLimit); self.access = access
    }

    func contains(key: String, maxPixelSize: Int) -> Bool { entries[cacheKey(key, maxPixelSize)] != nil }

    /// A cached decode, marked most recently used. Never reads or decodes.
    func cached(key: String, maxPixelSize: Int) -> UIImage? {
        let key = cacheKey(key, maxPixelSize)
        guard let entry = entries[key] else { return nil }
        order.removeAll { $0 == key }; order.append(key)
        return entry.image
    }

    /// An aspect-preserving downsample no larger than `maxPixelSize` on its long side. A cache hit returns at once;
    /// otherwise `data` is read and decoded on a background task. The result is dropped (nil, not cached) if the
    /// signed-in account changed or the cache was cleared while it was in flight.
    func image(for key: String, maxPixelSize: Int, data: @escaping @Sendable () async -> Data?) async -> UIImage? {
        guard maxPixelSize > 0 else { return nil }
        if let hit = cached(key: key, maxPixelSize: maxPixelSize) { return hit }
        let size = CGFloat(maxPixelSize)
        guard let image = await decode(data, { Self.downsample($0, maxPixelSize: size) }) else { return nil }
        insert(image, key: cacheKey(key, maxPixelSize))
        return image
    }

    /// The photo at its own pixel size, for zooming in. Never cached: one full-size decode can be larger than the
    /// whole cache and would evict every smaller image.
    func fullImage(data: @escaping @Sendable () async -> Data?) async -> UIImage? {
        await decode(data) { bytes in Self.nativePixelSize(bytes).flatMap { Self.downsample(bytes, maxPixelSize: $0) } }
    }

    func clear() { entries.removeAll(); order.removeAll(); decodedCost = 0; epoch += 1 }

    /// Pure ImageIO: safe on any thread. Honours EXIF orientation; nil for bytes that are not an image.
    nonisolated static func downsample(_ data: Data, maxPixelSize: CGFloat) -> UIImage? {
        guard maxPixelSize > 0,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) > 0,
              let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
                kCGImageSourceShouldCacheImmediately: true
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    /// The larger of the stored image's pixel dimensions, read from its header without decoding it.
    nonisolated static func nativePixelSize(_ data: Data) -> CGFloat? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? CGFloat,
              let height = properties[kCGImagePropertyPixelHeight] as? CGFloat else { return nil }
        return max(width, height)
    }

    private func decode(_ data: @escaping @Sendable () async -> Data?,
                        _ decoder: @escaping @Sendable (Data) -> UIImage?) async -> UIImage? {
        let ticket = access.snapshot(), epoch = epoch
        let image = await Task.detached(priority: .userInitiated) {
            await data().flatMap(decoder)
        }.value
        guard access.snapshot() == ticket, self.epoch == epoch else { return nil }
        return image
    }

    private func insert(_ image: UIImage, key: String) {
        guard let cgImage = image.cgImage else { return }
        let cost = cgImage.bytesPerRow * cgImage.height
        guard cost <= byteLimit && countLimit > 0 else { return }
        if let previous = entries.removeValue(forKey: key) { decodedCost -= previous.cost; order.removeAll { $0 == key } }
        while !order.isEmpty && (decodedCost + cost > byteLimit || entries.count >= countLimit) {
            let oldest = order.removeFirst()
            if let removed = entries.removeValue(forKey: oldest) { decodedCost -= removed.cost }
        }
        entries[key] = Entry(image: image, cost: cost); order.append(key); decodedCost += cost
    }

    private func cacheKey(_ key: String, _ size: Int) -> String { "\(key):\(size)" }
}
