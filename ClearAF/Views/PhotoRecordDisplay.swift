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

    /// Tiles show only the error recovery; list rows and the detail sheet keep the existing Share and Retry actions.
    func action(compact: Bool) -> String? {
        switch self {
        case .couldNotShare: "Retry"
        case .onDevice: compact ? nil : "Share"
        case .waitingToShare: compact ? nil : "Retry"
        case .shared, .reviewed: nil
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
