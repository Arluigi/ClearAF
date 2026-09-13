import UIKit
import ImageIO

/// Decoded images only. Each account view owns a cache, never the original upload bytes.
@MainActor final class PhotoImageLoader {
    private struct Entry { let image: UIImage; let cost: Int }
    private var entries: [String: Entry] = [:]
    private var order: [String] = []
    private let byteLimit: Int
    private let countLimit: Int
    private(set) var decodedCost = 0
    var cachedCount: Int { entries.count }

    init(byteLimit: Int = 16 * 1024 * 1024, countLimit: Int = 32) {
        self.byteLimit = max(0, byteLimit); self.countLimit = max(0, countLimit)
    }

    func contains(key: String, maxPixelSize: Int) -> Bool { entries[cacheKey(key, maxPixelSize)] != nil }

    func image(data: Data, key: String, maxPixelSize: Int) -> UIImage? {
        guard maxPixelSize > 0 else { return nil }
        let key = cacheKey(key, maxPixelSize)
        if let entry = entries[key] {
            order.removeAll { $0 == key }; order.append(key)
            return entry.image
        }
        guard let source = CGImageSourceCreateWithData(data as CFData,
            [kCGImageSourceShouldCache: false] as CFDictionary), CGImageSourceGetCount(source) > 0,
              let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
                kCGImageSourceShouldCacheImmediately: true
              ] as CFDictionary) else { return nil }
        let image = UIImage(cgImage: cgImage)
        let cost = cgImage.bytesPerRow * cgImage.height
        if cost <= byteLimit && countLimit > 0 {
            while !order.isEmpty && (decodedCost + cost > byteLimit || entries.count >= countLimit) {
                let oldest = order.removeFirst()
                if let removed = entries.removeValue(forKey: oldest) { decodedCost -= removed.cost }
            }
            entries[key] = Entry(image: image, cost: cost); order.append(key); decodedCost += cost
        }
        return image
    }

    func clear() { entries.removeAll(); order.removeAll(); decodedCost = 0 }
    private func cacheKey(_ key: String, _ size: Int) -> String { "\(key):\(size)" }
}
