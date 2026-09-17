import CoreData
import SwiftUI

/// Photo tile states in words (spec §4.5). "Couldn't share" is the §5 error state and keeps Retry.
enum PhotoTileState: Equatable {
    case onDevice, waitingToShare, couldNotShare, shared, reviewed

    static func of(uploadState: String?, reviewed: Bool) -> PhotoTileState {
        switch uploadState {
        case "pending": return .waitingToShare
        case "error": return .couldNotShare
        case "shared": return reviewed ? .reviewed : .shared
        default: return .onDevice
        }
    }

    var label: String {
        switch self {
        case .onDevice: "On device"
        case .waitingToShare: "Waiting to share"
        case .couldNotShare: "Couldn't share"
        case .shared: "Shared"
        case .reviewed: "Reviewed"
        }
    }

    var color: Color {
        switch self {
        case .waitingToShare: Letterpress.attentionText
        case .couldNotShare: Letterpress.error
        case .onDevice, .shared, .reviewed: Letterpress.inkSecondary
        }
    }

    /// Compact grid tiles are state-in-words only and never offer an action (a 44pt hit area inside a 3-column
    /// tile, only ~6pt from its neighbours' own controls, would reach into the next tile — spec §4.5's tile is a
    /// tap target for the whole photo, not a button host). List rows and the detail sheet keep Share and Retry
    /// at their full pinned size.
    func action(compact: Bool) -> String? {
        guard !compact else { return nil }
        switch self {
        case .couldNotShare, .waitingToShare: return "Retry"
        case .onDevice: return "Share"
        case .shared, .reviewed: return nil
        }
    }
}

/// A run of photos from one capture month, in page order (newest first).
struct PhotoMonthGroup<Item>: Identifiable {
    let id: String
    let title: String
    let items: [Item]

    static func group(_ items: [Item], date: (Item) -> Date?, locale: Locale = .current, timeZone: TimeZone = .current) -> [PhotoMonthGroup<Item>] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        var groups: [(key: String, title: String, items: [Item])] = []
        for item in items {
            let key: String
            let title: String
            if let value = date(item) {
                let parts = calendar.dateComponents([.year, .month], from: value)
                key = String(format: "%04d-%02d", parts.year ?? 0, parts.month ?? 0)
                title = LetterpressFormat.monthYear(value, locale: locale, timeZone: timeZone)
            } else {
                key = "undated"
                title = "Undated"
            }
            if let last = groups.last, last.key == key {
                groups[groups.count - 1].items.append(item)
            } else {
                groups.append((key, title, [item]))
            }
        }
        return groups.enumerated().map { index, group in
            PhotoMonthGroup(id: "\(group.key)#\(index)", title: group.title, items: group.items)
        }
    }
}

enum PhotoRecordCounts {
    static func headline(total: Int) -> String { total == 1 ? "1 photo" : "\(total) photos" }

    static func pages(total: Int, pageSize: Int) -> Int { max(1, (total + pageSize - 1) / pageSize) }

    static func shared(in context: NSManagedObjectContext) -> Int? {
        let request = SkinPhoto.fetchRequest()
        request.predicate = NSPredicate(format: "uploadState == %@", "shared")
        return try? context.count(for: request)
    }
}

/// Compare is Record's third segment (spec §4.3). It opens full screen only with two photos and never over the camera.
extension PhotoRecordLayout {
    /// `presentable` is latched by the caller when the Compare segment is selected, not read live from a store
    /// total — a live total can be zeroed by an unrelated `dispose()` (e.g. the presenting view's `onDisappear`
    /// firing as the full-screen cover itself appears), which would otherwise flip this back to `false` and
    /// dismiss the cover in a loop without ever running the presentation binding's setter.
    static func presentsCompare(_ layout: PhotoRecordLayout, capturing: Bool, presentable: Bool) -> Bool {
        layout == .compare && presentable && !capturing
    }

    static func showsCompareEmpty(_ layout: PhotoRecordLayout, total: Int) -> Bool {
        layout == .compare && total < 2
    }

    /// The Grid or List layout drawn under Compare.
    func browsing(fallback: PhotoRecordLayout) -> PhotoRecordLayout {
        self == .compare ? fallback : self
    }
}

/// 4:5 neutral mat, square corners; the photo is fitted, never cropped or tinted (spec §4.5).
struct PhotoFrame: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    let maxPixelSize: Int

    var body: some View {
        Rectangle()
            .fill(Letterpress.sunk)
            .aspectRatio(4 / 5, contentMode: .fit)
            .overlay {
                if let bytes = photo.photoData,
                   let image = images.image(data: bytes, key: photo.objectID.uriRepresentation().absoluteString, maxPixelSize: maxPixelSize) {
                    Image(uiImage: image).resizable().scaledToFit()
                } else {
                    Image(systemName: "photo").foregroundStyle(Letterpress.inkTertiary).accessibilityHidden(true)
                }
            }
            .clipShape(Rectangle())
    }
}
