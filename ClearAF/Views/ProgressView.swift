import SwiftUI
import UIKit
import CoreData

enum PhotoRecordLayout: Hashable { case grid, list, compare }

/// Record (spec §6 #5): month rules over the existing 24-photo pages, 4:5 tiles with named states, native Grid/List/Compare.
struct ProgressView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @StateObject private var store = PhotoPageStore()
    @StateObject private var reviews = PhotoReviewIndex(access: APIService.shared.access, transport: APIService.shared)
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var layout = PhotoRecordLayout.grid
    @State private var browsingLayout = PhotoRecordLayout.grid
    @State private var sharedCount: Int?
    @State private var capturing = false
    /// Latched when the Compare segment is selected, from `store.total` at that instant — never read live
    /// from `store.total` afterwards, so `store.dispose()` (fired on `onDisappear`, including the one SwiftUI
    /// fires on the presenting view when a full-screen cover appears) can't flip presentation back off.
    @State private var comparePresentable = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    LetterpressPicker(title: "Photo layout", selection: $layout) {
                        Text("Grid").tag(PhotoRecordLayout.grid)
                        Text("List").tag(PhotoRecordLayout.list)
                        Text("Compare").tag(PhotoRecordLayout.compare)
                    }
                    .padding(.top, Letterpress.Space.s14)
                    content
                        .padding(.top, Letterpress.Space.s18)
                    if !store.photos.isEmpty && !PhotoRecordLayout.showsCompareEmpty(layout, total: store.total) {
                        pagination.padding(.top, Letterpress.Space.s22)
                    }
                }
                .padding(.horizontal, Letterpress.Space.s22)
                .padding(.bottom, Letterpress.Space.s28)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Letterpress.canvas.ignoresSafeArea())
            .navigationTitle("Record")
            .refreshable { store.refresh() }
            .photoCaptureSheet(isPresented: $capturing, onDismiss: { if layout == .compare { layout = browsingLayout } })
            .fullScreenCover(isPresented: comparing) {
                ComparePhotosView().environment(\.managedObjectContext, viewContext)
            }
            .onChange(of: layout) { _, next in
                if next != .compare { browsingLayout = next }
                if next == .compare { comparePresentable = store.total >= 2 }
            }
            .onAppear { store.bind(context: viewContext) }
            .onDisappear { store.dispose(); reviews.cancel() }
            .task(id: reviewKey) { await loadReviews() }
        }
    }

    private var header: some View {
        HStack(spacing: Letterpress.Space.s6) {
            Text(PhotoRecordCounts.headline(total: store.total))
                .accessibilityIdentifier("photoCount")
            if let sharedCount, store.total > 0 {
                Text("· \(sharedCount) shared")
            }
        }
        .font(Letterpress.data(12, weight: .regular, relativeTo: .footnote))
        .foregroundStyle(Letterpress.inkTertiary)
    }

    @ViewBuilder private var content: some View {
        if store.loading && store.photos.isEmpty {
            Text("Loading your photos")
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.inkSecondary)
        } else if let error = store.error {
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Text(error).font(Letterpress.ui(15, relativeTo: .body)).foregroundStyle(Letterpress.error)
                Button("Try again") { store.refresh() }.buttonStyle(.letterpress(.outlined))
            }
        } else if PhotoRecordLayout.showsCompareEmpty(layout, total: store.total) {
            CompareEmptyState(total: store.total) { capturing = true }
                .padding(.bottom, emptyStateBottomInset)
        } else if store.photos.isEmpty {
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Text("No photos yet")
                    .font(Letterpress.display(28, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                Text("Take the first one today. Photos are saved on this device first, then shared with your care team.")
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Take a photo") { capturing = true }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .padding(.top, Letterpress.Space.s6)
            }
            .padding(.bottom, emptyStateBottomInset)
        } else {
            let groups = PhotoMonthGroup<SkinPhoto>.group(store.photos, date: { $0.captureDate })
            ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
                monthRule(group.title, first: index == 0)
                if layout.browsing(fallback: browsingLayout) == .grid {
                    LazyVGrid(columns: columns, alignment: .leading, spacing: Letterpress.Space.s14) {
                        ForEach(group.items, id: \.objectID) { photo in
                            PhotoGridCell(photo: photo, images: store.images, detailImages: store.detailImages, reviewed: reviews.isReviewed(photo))
                        }
                    }
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(group.items, id: \.objectID) { photo in
                            PhotoListRow(photo: photo, images: store.images, detailImages: store.detailImages, reviewed: reviews.isReviewed(photo))
                        }
                    }
                }
            }
        }
    }

    /// Extra room below the empty states' filled button so it clears the floating tab bar at the largest
    /// accessibility text sizes: the button's own content can grow tall enough that it lands in the gap
    /// between the safe area this screen is given and the taller tab bar actually drawn there (screenshots
    /// in the PR7 verification report). Standard sizes need none — the tab bar's normal safe area is enough.
    private var emptyStateBottomInset: CGFloat {
        dynamicTypeSize.isAccessibilitySize ? Letterpress.Space.s44 : 0
    }

    private var columns: [GridItem] {
        let count = dynamicTypeSize.isAccessibilitySize ? 1 : 3
        return Array(repeating: GridItem(.flexible(), spacing: Letterpress.Space.s6, alignment: .top), count: count)
    }

    /// Compare is presented while its segment is selected; closing it returns the segment to Grid or List.
    /// `comparePresentable` (not `store.total`) decides whether it can present, so `store.dispose()` never
    /// dismisses the cover on its own — see the comment on `comparePresentable`.
    private var comparing: Binding<Bool> {
        Binding(get: { PhotoRecordLayout.presentsCompare(layout, capturing: capturing, presentable: comparePresentable) },
                set: { if !$0 { layout = browsingLayout } })
    }

    private func monthRule(_ title: String, first: Bool) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            if !first { LetterpressRule() }
            Text(title).letterpressEyebrow()
        }
        .padding(.top, first ? 0 : Letterpress.Space.s18)
        .padding(.bottom, Letterpress.Space.s10)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private var pagination: some View {
        let pages = PhotoRecordCounts.pages(total: store.total, pageSize: PhotoPageStore.pageSize)
        let stack = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: Letterpress.Space.s10))
            : AnyLayout(HStackLayout(spacing: Letterpress.Space.s10))
        return stack {
            Button("Previous") { store.previous() }
                .buttonStyle(.letterpress(.outlined, fullWidth: true))
                .disabled(!store.hasPrevious)
            Text("Page \(store.page + 1) of \(pages)")
                .font(Letterpress.data(12, weight: .regular, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: true, vertical: true)
            Button("Next") { store.next() }
                .buttonStyle(.letterpress(.outlined, fullWidth: true))
                .disabled(!store.hasNext)
        }
    }

    private var reviewKey: String {
        guard let ticket = APIService.shared.access.snapshot() else { return "none" }
        let ids = PhotoReviewIndex.sharedServerIDs(store.photos, accountID: ticket.accountID)
        return "\(ticket.generation.uuidString)-\(store.total)-\(ids.map(\.uuidString).joined(separator: ","))"
    }

    private func loadReviews() async {
        guard let ticket = APIService.shared.access.snapshot(),
              viewContext.userInfo["accountID"] as? UUID == ticket.accountID else {
            reviews.cancel(); sharedCount = nil; return
        }
        sharedCount = PhotoRecordCounts.shared(in: viewContext)
        await reviews.load(photos: store.photos, ticket: ticket)
    }
}

private func datedPhotoLabel(_ photo: SkinPhoto) -> String {
    photo.captureDate.map { "Dated photo, \(LetterpressFormat.dayMonthYear($0))" } ?? "Dated photo"
}

private struct PhotoGridCell: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    let detailImages: PhotoImageLoader
    let reviewed: Bool
    @State private var showingDetail = false
    @Namespace private var photoZoom
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
            Button { showingDetail = true } label: {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    PhotoFrame(photo: photo, images: images, maxPixelSize: PhotoFrame.tilePixelSize)
                        .matchedTransitionSource(id: photo.objectID, in: photoZoom)
                    if let date = photo.captureDate {
                        Text(LetterpressFormat.stamp(date))
                            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                            .foregroundStyle(Letterpress.inkTertiary)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(datedPhotoLabel(photo))
            PhotoSharingStatusView(photo: photo, compact: true, reviewed: reviewed)
        }
        .sheet(isPresented: $showingDetail) {
            PhotoDetailView(photo: photo, images: detailImages, reviewed: reviewed,
                            preview: images.cached(key: PhotoImageKey.of(photo), maxPixelSize: PhotoFrame.tilePixelSize))
                .photoZoomTransition(id: photo.objectID, in: photoZoom, reduceMotion: reduceMotion)
        }
    }
}

private struct PhotoListRow: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    let detailImages: PhotoImageLoader
    let reviewed: Bool
    @State private var showingDetail = false
    @Namespace private var photoZoom
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let stack = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s10))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Letterpress.Space.s14))
        stack {
            Button { showingDetail = true } label: {
                PhotoFrame(photo: photo, images: images, maxPixelSize: PhotoFrame.tilePixelSize).frame(width: 72)
                    .matchedTransitionSource(id: photo.objectID, in: photoZoom)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(datedPhotoLabel(photo))
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                if let date = photo.captureDate {
                    Text(LetterpressFormat.dayMonthYear(date))
                        .font(Letterpress.ui(16, weight: .medium, relativeTo: .headline))
                        .foregroundStyle(Letterpress.ink)
                }
                if let notes = photo.notes, !notes.isEmpty {
                    Text(notes)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .lineLimit(2)
                }
                PhotoSharingStatusView(photo: photo, reviewed: reviewed)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, Letterpress.Space.s14)
        .overlay(alignment: .top) { LetterpressRule() }
        .sheet(isPresented: $showingDetail) {
            PhotoDetailView(photo: photo, images: detailImages, reviewed: reviewed,
                            preview: images.cached(key: PhotoImageKey.of(photo), maxPixelSize: PhotoFrame.tilePixelSize))
                .photoZoomTransition(id: photo.objectID, in: photoZoom, reduceMotion: reduceMotion)
        }
    }
}

struct PhotoSharingStatusView: View {
    @ObservedObject var photo: SkinPhoto
    var compact = false
    var reviewed = false
    /// Share or Retry could not start. Shown in place (spec §5), not as an alert: the tile already carries its state.
    @State private var shareFailed = false

    var body: some View {
        let state = PhotoTileState.of(uploadState: photo.uploadState, reviewed: reviewed)
        VStack(alignment: .leading, spacing: 0) {
            Text(state.label)
                .font(Letterpress.ui(compact ? 11 : 13, weight: .regular, relativeTo: .caption))
                .foregroundStyle(state.color)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("photoSharingStatus")
            if shareFailed {
                Text(PhotoTileState.shareFailed)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let action = state.action(compact: compact) {
                Button(shareFailed ? "Retry" : action) {
                    shareFailed = false
                    do { try APIService.shared.photos.share(photo) }
                    catch {
                        shareFailed = true
                        // A failed device save is already spoken once by ContentView's photo error announcer.
                        if error as? PhotoCaptureFailure != .saveFailed {
                            AccessibilityNotification.Announcement(PhotoTileState.shareFailed).post()
                        }
                    }
                }
                .buttonStyle(.letterpress(.underline))
            }
        }
        .onChange(of: photo.uploadState) { shareFailed = false }
    }
}

struct PhotoDetailView: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    var reviewed = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var image: UIImage?
    @State private var unreadable = false
    /// The photo `load()` last loaded; a late full-size decode for any other key is dropped.
    @State private var shownKey: String?
    /// Set to `shownKey` the first time the photo is zoomed past 1.5×; drives the full-size decode's `.task(id:)`,
    /// which is cancelled when the sheet closes or the photo changes.
    @State private var wantsFull: String?
    @State private var fullImage: UIImage?

    /// Seeded synchronously from the cache (a lookup, never a decode), or from the tile's own smaller decode, so the
    /// sheet opens on the photo at its own aspect ratio instead of an empty 4:5 mat that then resizes.
    init(photo: SkinPhoto, images: PhotoImageLoader, reviewed: Bool = false, preview: UIImage? = nil) {
        _photo = ObservedObject(wrappedValue: photo)
        self.images = images
        self.reviewed = reviewed
        _image = State(initialValue: images.cached(key: PhotoImageKey.of(photo), maxPixelSize: Self.pixelSize) ?? preview)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                    if let image {
                        // Sits on the same `sunk` mat as `PhotoFrame` (spec §4.5) instead of the reading-surface
                        // canvas behind it, and keeps the photo's own aspect ratio since this is the uncropped view.
                        // Pinch or double-tap to zoom; the image view is VoiceOver's labelled photo element.
                        Rectangle()
                            .fill(Letterpress.sunk)
                            .aspectRatio(image.size, contentMode: .fit)
                            .overlay {
                                ZoomablePhotoView(image: fullImage ?? image, label: PhotoLabel.photo(photo.captureDate),
                                                  photoID: PhotoImageKey.of(photo), onZoomIn: { wantsFull = shownKey },
                                                  needsFullResolution: fullImage == nil)
                            }
                            .transition(.opacity)
                    } else {
                        // Quiet placeholder while the photo is read and decoded off the main thread.
                        Rectangle()
                            .fill(Letterpress.sunk)
                            .aspectRatio(4 / 5, contentMode: .fit)
                            .overlay {
                                if unreadable {
                                    Image(systemName: "photo").foregroundStyle(Letterpress.inkTertiary).accessibilityHidden(true)
                                }
                            }
                    }
                    if let date = photo.captureDate {
                        Text(LetterpressFormat.stampYearTime(date))
                            .font(Letterpress.data(12, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.ink)
                    }
                    // `reviewed` is the page's batch PhotoReviewIndex lookup (fail-closed: any error clears it back
                    // to "Shared"); PhotoReviewStatusView below does its own live, per-photo lookup. The two can
                    // transiently disagree — e.g. a batch failure hides "Reviewed" here while the live check still
                    // succeeds below — by design: the label above never claims more than the fail-closed batch can
                    // back up, and the live section underneath is the authoritative answer for this one photo.
                    PhotoSharingStatusView(photo: photo, reviewed: reviewed)
                    LetterpressRule()
                    PhotoReviewStatusView(photo: photo)
                    if let notes = photo.notes, !notes.isEmpty {
                        LetterpressRule()
                        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                            Text("Your note").letterpressEyebrow()
                            Text(notes).font(Letterpress.ui(16, relativeTo: .body)).foregroundStyle(Letterpress.ink)
                        }
                    }
                    Text("Photo removal is not available yet.")
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                .padding(Letterpress.Space.s22)
                .frame(maxWidth: .infinity, alignment: .leading)
                // Under Reduce Motion the mat doesn't animate from 4:5 to the photo's own shape (rare: only when the
                // sheet opens before the tile had decoded anything to seed it with).
                .animation(reduceMotion ? nil : .smooth(duration: 0.2), value: image != nil)
            }
            .task(id: PhotoImageKey.of(photo)) { await load() }
            .task(id: wantsFull) { await loadFullResolution() }
            .navigationTitle("Photo details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .letterpressSheetBackground()
    }

    private func load() async {
        let key = PhotoImageKey.of(photo)
        shownKey = key; wantsFull = nil; fullImage = nil; unreadable = false
        if let hit = images.cached(key: key, maxPixelSize: Self.pixelSize) { image = hit; return }
        // A seeded smaller decode stays on screen until the sharper one replaces it.
        guard let data = PhotoBytes.reader(for: photo) else { unreadable = image == nil; return }
        let loaded = await images.image(for: key, maxPixelSize: Self.pixelSize, data: data)
        guard !Task.isCancelled else { return }
        if let loaded { image = loaded } else { unreadable = image == nil }
    }

    private func loadFullResolution() async {
        guard let key = wantsFull, key == shownKey, fullImage == nil, let data = PhotoBytes.reader(for: photo) else { return }
        let full = await images.fullImage(data: data)
        // Dropped if another photo is showing by now; the loader already drops it after an account change or cancel.
        guard !Task.isCancelled, key == shownKey else { return }
        fullImage = full
        // A failed decode clears the request so the next zoom gesture can try once more (the sharper 1600px
        // photo stays on screen meanwhile).
        if full == nil { wantsFull = nil }
    }

    static let pixelSize = 1600
}

#Preview {
    ProgressView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
        .preferredColorScheme(.dark)
}

private struct PhotoReviewStatusView: View {
    @ObservedObject var photo: SkinPhoto
    @ObservedObject private var reviews = APIService.shared.photoReviews
    @ObservedObject private var api = APIService.shared
    @State private var retry = 0

    private var sharedID: UUID? {
        guard photo.uploadState == "shared",
              let account = api.access.snapshot()?.accountID,
              photo.managedObjectContext?.userInfo["accountID"] as? UUID == account,
              let id = photo.serverID else { return nil }
        return UUID(uuidString: id)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Text("Clinician review").letterpressEyebrow()
            Group {
                if photo.uploadState != "shared" {
                    Text("This photo has not been shared with your care team.")
                } else {
                    switch reviews.state {
                    case .loading:
                        Text("Loading review status")
                    case .unavailable:
                        Text("Review status is unavailable.")
                        Button("Retry review status") { retry += 1 }.buttonStyle(.letterpress(.outlined))
                    case .notReviewed:
                        Text("Not yet marked reviewed.")
                    case .reviewed(let review):
                        Text("Reviewed by \(review.reviewerName)")
                        if let date = review.date {
                            Text("\(LetterpressFormat.dayMonthYear(date)), \(LetterpressFormat.clock(date))")
                        }
                    }
                }
            }
            .font(Letterpress.ui(15, relativeTo: .subheadline))
            .foregroundStyle(Letterpress.inkSecondary)
        }
        .accessibilityIdentifier("photoReviewStatus")
        .task(id: "\(sharedID?.uuidString ?? "none")-\(api.access.snapshot()?.generation.uuidString ?? "none")-\(retry)") {
            reviews.cancel()
            guard let id = sharedID, let ticket = api.access.snapshot() else { return }
            await reviews.load(photoID: id, ticket: ticket)
        }
        .onDisappear { reviews.cancel() }
    }
}
