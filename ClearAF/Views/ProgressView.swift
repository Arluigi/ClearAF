import SwiftUI
import UIKit
import CoreData

enum PhotoRecordLayout: Hashable { case grid, list }

/// Record (spec §6 #5): month rules over the existing 24-photo pages, 4:5 tiles with named states, native Grid/List.
struct ProgressView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @StateObject private var store = PhotoPageStore()
    @StateObject private var reviews = PhotoReviewIndex(access: APIService.shared.access, transport: APIService.shared)
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var layout = PhotoRecordLayout.grid
    @State private var sharedCount: Int?
    @State private var capturing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    LetterpressPicker(title: "Photo layout", selection: $layout) {
                        Text("Grid").tag(PhotoRecordLayout.grid)
                        Text("List").tag(PhotoRecordLayout.list)
                    }
                    .padding(.top, Letterpress.Space.s14)
                    content
                        .padding(.top, Letterpress.Space.s18)
                    if !store.photos.isEmpty {
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
            .sheet(isPresented: $capturing) { DurablePhotoCaptureView() }
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
        } else {
            let groups = PhotoMonthGroup<SkinPhoto>.group(store.photos, date: { $0.captureDate })
            ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
                monthRule(group.title, first: index == 0)
                if layout == .grid {
                    LazyVGrid(columns: columns, alignment: .leading, spacing: Letterpress.Space.s14) {
                        ForEach(group.items, id: \.objectID) { photo in
                            PhotoGridCell(photo: photo, images: store.images, reviewed: reviews.isReviewed(photo))
                        }
                    }
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(group.items, id: \.objectID) { photo in
                            PhotoListRow(photo: photo, images: store.images, reviewed: reviews.isReviewed(photo))
                        }
                    }
                }
            }
        }
    }

    private var columns: [GridItem] {
        let count = dynamicTypeSize.isAccessibilitySize ? 1 : 3
        return Array(repeating: GridItem(.flexible(), spacing: Letterpress.Space.s6, alignment: .top), count: count)
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
    let reviewed: Bool
    @State private var showingDetail = false

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
            Button { showingDetail = true } label: {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    PhotoFrame(photo: photo, images: images, maxPixelSize: 400)
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
        .sheet(isPresented: $showingDetail) { PhotoDetailView(photo: photo, images: images, reviewed: reviewed) }
    }
}

private struct PhotoListRow: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    let reviewed: Bool
    @State private var showingDetail = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let stack = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s10))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Letterpress.Space.s14))
        stack {
            Button { showingDetail = true } label: {
                PhotoFrame(photo: photo, images: images, maxPixelSize: 400).frame(width: 72)
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
        .sheet(isPresented: $showingDetail) { PhotoDetailView(photo: photo, images: images, reviewed: reviewed) }
    }
}

struct PhotoSharingStatusView: View {
    @ObservedObject var photo: SkinPhoto
    var compact = false
    var reviewed = false
    @State private var errorMessage: String?

    var body: some View {
        let state = PhotoTileState.of(uploadState: photo.uploadState, reviewed: reviewed)
        VStack(alignment: .leading, spacing: 0) {
            Text(state.label)
                .font(Letterpress.ui(compact ? 11 : 13, weight: .regular, relativeTo: .caption))
                .foregroundStyle(state.color)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("photoSharingStatus")
            if let action = state.action(compact: compact) {
                Button(action) {
                    do { try APIService.shared.photos.share(photo) }
                    catch { errorMessage = error.localizedDescription }
                }
                .buttonStyle(.letterpress(.underline))
            }
        }
        .alert("Unable to share photo", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: { Text(errorMessage ?? "") }
    }
}

struct PhotoDetailView: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    var reviewed = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                    if let bytes = photo.photoData,
                       let image = images.image(data: bytes, key: photo.objectID.uriRepresentation().absoluteString, maxPixelSize: 1600) {
                        Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("Full photo")
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
            }
            .navigationTitle("Photo details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .letterpressSheetBackground()
    }
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
