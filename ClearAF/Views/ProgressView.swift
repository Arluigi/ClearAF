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
                VStack(spacing: .spaceLG) {
                    Text("\(store.total) photos").font(.captionLarge)
                        .accessibilityIdentifier("photoCount")
                    CareJournalPicker(title: "Photo layout", selection: $selectedViewMode) {
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
            .foregroundStyle(CareJournal.textPrimary)
            .tint(CareJournal.actionPrimary)
            .background(CareJournal.canvas.ignoresSafeArea())
            .navigationTitle("Photos")
            .safeAreaInset(edge: .bottom) {
                if !dynamicTypeSize.isAccessibilitySize {
                    photoActions.padding(20).background(CareJournal.canvas)
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
                    .frame(maxWidth: .infinity).padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent).tint(CareJournal.actionPrimary)
            .foregroundStyle(CareJournal.onPrimary)
            .accessibilityLabel("Capture photo")
        }
    }

    private var pagination: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: .spaceMD))
            : AnyLayout(HStackLayout(spacing: .spaceMD))
        return layout {
            Button { store.previous() } label: { Text("Previous").foregroundStyle(CareJournal.textPrimary) }
                .frame(maxWidth: .infinity).disabled(!store.hasPrevious)
            Text("Page \(store.page + 1)").font(.caption)
            Button { store.next() } label: { Text("Next").foregroundStyle(CareJournal.textPrimary) }
                .frame(maxWidth: .infinity).disabled(!store.hasNext)
        }
        .buttonStyle(.bordered)
        .fixedSize(horizontal: false, vertical: true)
    }

}

// MARK: - Enhanced Progress Components

struct EnhancedEmptyProgressView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("No photos yet").font(.title2).foregroundStyle(CareJournal.textPrimary)
            Text("Take a photo to start your care record. Photos stay on this device until you share them.")
                .foregroundStyle(CareJournal.textSecondary)
            Text("Use consistent lighting when possible.")
                .font(.footnote).foregroundStyle(CareJournal.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 24)
    }
}

// Progress Photo Tip Component
struct ProgressPhotoTip: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(spacing: .spaceMD) {
            Image(systemName: icon)
                .font(.captionLarge)
                .foregroundColor(CareJournal.actionPrimary)
                .frame(width: 20)
            
            Text(text)
                .font(.bodyMedium)
                .foregroundColor(CareJournal.textSecondary)
            
            Spacer()
        }
    }
}

struct EnhancedPhotoGridView: View {
    let photos: [SkinPhoto]
    let images: PhotoImageLoader
    
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var columns: [GridItem] {
        dynamicTypeSize.isAccessibilitySize
            ? [GridItem(.flexible())]
            : [GridItem(.adaptive(minimum: 108), spacing: .spaceSM)]
    }
    
    var body: some View {
        Group {
            LazyVGrid(columns: columns, spacing: .spaceMD) {
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
        VStack(spacing: .spaceXS) {
            Button { showingPhotoDetail = true } label: {
                VStack {
                    ProgressPhotoThumbnail(photo: photo, images: images, size: 100)
                    if let date = photo.captureDate { Text(date, style: .date).font(.caption).fixedSize(horizontal: false, vertical: true) }
                }
            }.buttonStyle(.plain)
            PhotoSharingStatusView(photo: photo, compact: true)
        }
        .padding(.spaceXS)
        .sheet(isPresented: $showingPhotoDetail) { PhotoDetailView(photo: photo, images: images) }
    }
}

struct EnhancedPhotoListView: View {
    let photos: [SkinPhoto]
    let images: PhotoImageLoader
    
    var body: some View {
        Group {
            LazyVStack(spacing: .spaceLG) {
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
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: .spaceLG))
            : AnyLayout(HStackLayout(spacing: .spaceLG))
        layout {
            Button { showingPhotoDetail = true } label: { ProgressPhotoThumbnail(photo: photo, images: images, size: 80) }
                .buttonStyle(.plain).accessibilityLabel("View photo details")
            VStack(alignment: .leading, spacing: .spaceXS) {
                if let date = photo.captureDate { Text(date, style: .date).font(.headlineSmall) }
                if let notes = photo.notes, !notes.isEmpty { Text(notes).font(.bodyMedium).lineLimit(2) }
                PhotoSharingStatusView(photo: photo)
            }
            Spacer()
        }
        .careJournalSurface()
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
        .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
        .accessibilityLabel("Dated photo")
    }
}

struct EnhancedFloatingActionButton: View {
    @Binding var showingCamera: Bool
    @State private var isPressed = false
    
    var body: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                Button(action: {
                    HapticManager.medium()
                    showingCamera = true
                }) {
                    Image(systemName: "camera.fill")
                        .font(.title2)
                        .foregroundColor(.white)
                        .frame(width: 64, height: 64)
                        .background(Color.primaryGradient)
                        .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                        .glowShadow()
                }
                .accessibilityLabel("Capture photo")
                .scaleEffect(isPressed ? 0.9 : 1.0)
                .animation(.bouncy, value: isPressed)
                .onLongPressGesture(minimumDuration: 0.1) {
                    // Trigger on release
                } onPressingChanged: { pressing in
                    withAnimation(.quick) {
                        isPressed = pressing
                    }
                }
                .padding(.trailing, .spaceXL)
                .padding(.bottom, .spaceXXL)
            }
        }
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
            Text(label).font(.caption).foregroundColor(photo.uploadState == "error" ? .retainedErrorText : .textSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("photoSharingStatus")
            if photo.uploadState != "shared" {
                Button(photo.uploadState == nil ? "Share" : "Retry") {
                    do { try APIService.shared.photos.share(photo) }
                    catch { errorMessage = error.localizedDescription }
                }.font(.caption).buttonStyle(.bordered)
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
                    if photo.uploadState == "shared" { Text("Shared with your care team. This does not indicate clinician review.").font(.caption) }
                    if let notes = photo.notes, !notes.isEmpty { Text(notes) }
                    Text("Photo removal is not available yet.").font(.caption).foregroundColor(CareJournal.textSecondary)
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
