import SwiftUI
import UIKit
import CoreData

struct ProgressView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @StateObject private var store = PhotoPageStore()
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var selectedViewMode = 0
    @State private var showingCamera = false

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: Letterpress.Space.s18) {
                    Text("\(store.total) photos").font(Letterpress.data(12, relativeTo: .footnote))
                        .accessibilityIdentifier("photoCount")
                    LetterpressPicker(title: "Photo layout", selection: $selectedViewMode) {
                        Text("Grid").tag(0)
                        Text("List").tag(1)
                    }
                    if store.loading { SwiftUI.ProgressView("Loading photos") }
                    if let error = store.error {
                        Text(error)
                        Button("Try again") { store.refresh() }
                    } else if store.photos.isEmpty {
                        EnhancedEmptyProgressView()
                    } else if selectedViewMode == 0 {
                        EnhancedPhotoGridView(photos: store.photos, images: store.images)
                    } else {
                        EnhancedPhotoListView(photos: store.photos, images: store.images)
                    }
                    if dynamicTypeSize.isAccessibilitySize { photoActions }
                }.padding(20)
            }
            .foregroundStyle(Letterpress.ink)
            .tint(Letterpress.action)
            .background(Letterpress.canvas.ignoresSafeArea())
            .navigationTitle("Photos")
            .safeAreaInset(edge: .bottom) {
                if !dynamicTypeSize.isAccessibilitySize {
                    photoActions.padding(20).background(Letterpress.canvas)
                }
            }
            .refreshable { store.refresh() }
            .sheet(isPresented: $showingCamera, onDismiss: { store.refresh() }) { DurablePhotoCaptureView() }
            .onAppear { store.bind(context: viewContext) }
            .onDisappear { store.dispose() }
        }
    }
    private var photoActions: some View {
        VStack(spacing: 12) {
            pagination
            Button { showingCamera = true } label: {
                Label("Take a photo", systemImage: "camera")
            }
            .buttonStyle(.letterpress(.filled, fullWidth: true))
            .accessibilityLabel("Capture photo")
        }
    }

    private var pagination: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: Letterpress.Space.s14))
            : AnyLayout(HStackLayout(spacing: Letterpress.Space.s14))
        return layout {
            Button { store.previous() } label: { Text("Previous").foregroundStyle(Letterpress.ink) }
                .frame(maxWidth: .infinity).disabled(!store.hasPrevious)
            Text("Page \(store.page + 1)").font(.caption)
            Button { store.next() } label: { Text("Next").foregroundStyle(Letterpress.ink) }
                .frame(maxWidth: .infinity).disabled(!store.hasNext)
        }
        .buttonStyle(.letterpress(.outlined, fullWidth: true))
        .fixedSize(horizontal: false, vertical: true)
    }

}

// MARK: - Enhanced Progress Components

struct EnhancedEmptyProgressView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("No photos yet").font(.title2).foregroundStyle(Letterpress.ink)
            Text("Take a photo to start your care record. Photos stay on this device until you share them.")
                .foregroundStyle(Letterpress.inkSecondary)
            Text("Use consistent lighting when possible.")
                .font(.footnote).foregroundStyle(Letterpress.inkSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 24)
    }
}

struct EnhancedPhotoGridView: View {
    let photos: [SkinPhoto]
    let images: PhotoImageLoader
    
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var columns: [GridItem] {
        dynamicTypeSize.isAccessibilitySize
            ? [GridItem(.flexible())]
            : [GridItem(.adaptive(minimum: 108), spacing: Letterpress.Space.s10)]
    }
    
    var body: some View {
        Group {
            LazyVGrid(columns: columns, spacing: Letterpress.Space.s14) {
                ForEach(photos, id: \.id) { photo in
                    EnhancedPhotoGridItem(photo: photo, images: images)
                }
            }

        }
    }
}

struct EnhancedPhotoGridItem: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    @State private var showingPhotoDetail = false
    var body: some View {
        VStack(spacing: Letterpress.Space.s4) {
            Button { showingPhotoDetail = true } label: {
                VStack {
                    ProgressPhotoThumbnail(photo: photo, images: images, size: 100)
                    if let date = photo.captureDate { Text(date, style: .date).font(.caption).fixedSize(horizontal: false, vertical: true) }
                }
            }.buttonStyle(.plain)
            PhotoSharingStatusView(photo: photo, compact: true)
        }
        .padding(Letterpress.Space.s4)
        .sheet(isPresented: $showingPhotoDetail) { PhotoDetailView(photo: photo, images: images) }
    }
}

struct EnhancedPhotoListView: View {
    let photos: [SkinPhoto]
    let images: PhotoImageLoader
    
    var body: some View {
        Group {
            LazyVStack(spacing: Letterpress.Space.s18) {
                ForEach(photos, id: \.id) { photo in
                    EnhancedPhotoListItem(photo: photo, images: images)
                }
            }

        }
    }
}

struct EnhancedPhotoListItem: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    @State private var showingPhotoDetail = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s18))
            : AnyLayout(HStackLayout(spacing: Letterpress.Space.s18))
        layout {
            Button { showingPhotoDetail = true } label: { ProgressPhotoThumbnail(photo: photo, images: images, size: 80) }
                .buttonStyle(.plain).accessibilityLabel("View photo details")
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                if let date = photo.captureDate { Text(date, style: .date).font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline)) }
                if let notes = photo.notes, !notes.isEmpty { Text(notes).font(Letterpress.ui(16, relativeTo: .callout)).lineLimit(2) }
                PhotoSharingStatusView(photo: photo)
            }
            Spacer()
        }
        .letterpressSurface()
        .sheet(isPresented: $showingPhotoDetail) { PhotoDetailView(photo: photo, images: images) }
    }
}

private struct ProgressPhotoThumbnail: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    let size: CGFloat
    var body: some View {
        Group {
            if let bytes = photo.photoData, let image = images.image(data: bytes, key: photo.objectID.uriRepresentation().absoluteString, maxPixelSize: 400) {
                Image(uiImage: image).resizable().scaledToFill()
            } else { Image(systemName: "photo") }
        }
        .frame(width: size, height: size)
        .clipShape(Rectangle())
        .accessibilityLabel("Dated photo")
    }
}

struct PhotoSharingStatusView: View {
    @ObservedObject var photo: SkinPhoto
    var compact = false
    @State private var errorMessage: String?
    private var label: String {
        switch photo.uploadState {
        case "pending": return "Waiting to share"
        case "shared": return "Shared"
        case "error": return "Couldn't share"
        default: return "Saved on device"
        }
    }
    var body: some View {
        VStack(alignment: compact ? .center : .leading, spacing: 4) {
            Text(label).font(.caption).foregroundColor(photo.uploadState == "error" ? Letterpress.error : Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("photoSharingStatus")
            if photo.uploadState != "shared" {
                Button(photo.uploadState == nil ? "Share" : "Retry") {
                    do { try APIService.shared.photos.share(photo) }
                    catch { errorMessage = error.localizedDescription }
                }.font(.caption).buttonStyle(.letterpress(.outlined))
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
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let bytes = photo.photoData, let image = images.image(data: bytes, key: photo.objectID.uriRepresentation().absoluteString, maxPixelSize: 1600) {
                        Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("Full photo")
                    }
                    if let date = photo.captureDate { Text(date.formatted(date: .complete, time: .shortened)) }
                    PhotoSharingStatusView(photo: photo)
                    PhotoReviewStatusView(photo: photo)
                    if let notes = photo.notes, !notes.isEmpty { Text(notes) }
                    Text("Photo removal is not available yet.").font(.caption).foregroundColor(Letterpress.inkSecondary)
                }.padding()
            }
            .navigationTitle("Photo Details")
            .navigationBarItems(trailing: Button { dismiss() } label: { Text("Done").font(.body) })
        }
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
        VStack(alignment: .leading, spacing: 8) {
            Text("Clinician review").font(.headline)
            if photo.uploadState != "shared" {
                Text("This photo has not been shared with your care team.")
            } else {
                switch reviews.state {
                case .loading:
                    SwiftUI.ProgressView("Loading review status")
                case .unavailable:
                    Text("Review status is unavailable.")
                    Button("Retry review status") { retry += 1 }.buttonStyle(.letterpress(.outlined))
                case .notReviewed:
                    Text("Not yet marked reviewed.")
                case .reviewed(let review):
                    Text("Reviewed by \(review.reviewerName)")
                    if let date = review.date { Text(date.formatted(date: .abbreviated, time: .shortened)) }
                }
            }
        }
        .font(.subheadline)
        .foregroundStyle(Letterpress.inkSecondary)
        .accessibilityIdentifier("photoReviewStatus")
        .task(id: "\(sharedID?.uuidString ?? "none")-\(api.access.snapshot()?.generation.uuidString ?? "none")-\(retry)") {
            reviews.cancel()
            guard let id = sharedID, let ticket = api.access.snapshot() else { return }
            await reviews.load(photoID: id, ticket: ticket)
        }
        .onDisappear { reviews.cancel() }
    }
}
