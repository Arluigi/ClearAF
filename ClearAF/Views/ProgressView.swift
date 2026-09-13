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
                    EnhancedSegmentedControl(selection: $selectedViewMode, options: ["Grid", "List"])
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
                    pagination
                }.padding()
            }
            .background(Color.backgroundSecondary.ignoresSafeArea())
            .navigationTitle("Photos")
            .safeAreaInset(edge: .bottom) {
                Button { showingCamera = true } label: {
                    Label("Add photo", systemImage: "camera.fill")
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent).tint(.primaryActionPurple)
                .accessibilityLabel("Capture photo")
                .padding().background(Color.backgroundSecondary)
            }
            .refreshable { store.refresh() }
            .sheet(isPresented: $showingCamera, onDismiss: { store.refresh() }) { DurablePhotoCaptureView() }
            .onAppear { store.bind(context: viewContext) }
            .onDisappear { store.dispose() }
        }
    }
    private var pagination: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: .spaceMD))
            : AnyLayout(HStackLayout(spacing: .spaceMD))
        return layout {
            Button("Previous") { store.previous() }
                .frame(maxWidth: .infinity).disabled(!store.hasPrevious)
            Text("Page \(store.page + 1)").font(.caption)
            Button("Next") { store.next() }
                .frame(maxWidth: .infinity).disabled(!store.hasNext)
        }
        .buttonStyle(.bordered)
        .fixedSize(horizontal: false, vertical: true)
    }

}

// MARK: - Enhanced Progress Components

struct EnhancedSegmentedControl: View {
    @Binding var selection: Int
    let options: [String]
    @Namespace private var namespace
    
    var body: some View {
        HStack(spacing: 0) {
            ForEach(0..<options.count, id: \.self) { index in
                Button(action: {
                    withAnimation(.bouncy) {
                        selection = index
                        HapticManager.selection()
                    }
                }) {
                    Text(options[index])
                        .font(.bodyLarge)
                        .fontWeight(.medium)
                        .foregroundColor(selection == index ? .white : .textSecondary)
                        .padding(.horizontal, .spaceXL)
                        .padding(.vertical, .spaceMD)
                        .frame(maxWidth: .infinity)
                        .background(
                            Group {
                                if selection == index {
                                    RoundedRectangle(cornerRadius: .radiusLarge)
                                        .fill(Color.primaryGradient)
                                        .matchedGeometryEffect(id: "selectedSegment", in: namespace)
                                }
                            }
                        )
                }
            }
        }
        .background(
            RoundedRectangle(cornerRadius: .radiusLarge)
                .fill(Color.backgroundSecondary)
                .overlay(
                    RoundedRectangle(cornerRadius: .radiusLarge)
                        .stroke(Color.borderSubtle, lineWidth: 1)
                )
                .softShadow()
        )
    }
}

struct EnhancedEmptyProgressView: View {
    var body: some View {
        VStack(spacing: .spaceXXL) {
            Spacer()
            
            VStack(spacing: .spaceLG) {
                // Consistent icon with Dashboard design
                ZStack {
                    Circle()
                        .fill(Color.primaryPurple.opacity(0.2))
                        .frame(width: 120, height: 120)
                    
                    Image(systemName: "camera.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.primaryPurple)
                }
                
                VStack(spacing: .spaceMD) {
                    Text("No photos yet")
                        .font(.headlineLarge)
                        .foregroundColor(.textPrimary)
                        .fontWeight(.semibold)
                    
                    Text("Start tracking your progress with consistent photos")
                        .font(.bodyLarge)
                        .foregroundColor(.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, .spaceXL)
                }
            }
            
            // Photo tips section
            VStack(spacing: .spaceMD) {
                Text("📸 Tips for best results")
                    .font(.headlineSmall)
                    .foregroundColor(.textPrimary)
                    .fontWeight(.medium)
                
                VStack(spacing: .spaceXS) {
                    ProgressPhotoTip(icon: "lightbulb.fill", text: "Take photos in consistent lighting")
                    ProgressPhotoTip(icon: "clock.fill", text: "Same time each day for accuracy")
                    ProgressPhotoTip(icon: "face.smiling", text: "Use front camera for face tracking")
                }
            }
            .frame(maxWidth: .infinity)
            .wellnessCard(style: .flat)
            .padding(.horizontal, .spaceXL)
            
            Spacer()
        }
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
                .foregroundColor(.primaryPurple)
                .frame(width: 20)
            
            Text(text)
                .font(.bodyMedium)
                .foregroundColor(.textSecondary)
            
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
                    if let date = photo.captureDate { Text(date, style: .date).font(.caption) }
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
        .wellnessCard(style: .elevated)
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
            Text(label).font(.caption).foregroundColor(photo.uploadState == "error" ? .orange : .textSecondary)
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
                    Text("Photo removal is not available yet.").font(.caption).foregroundColor(.secondary)
                }.padding()
            }
            .navigationTitle("Photo Details")
            .navigationBarItems(trailing: Button("Done") { dismiss() })
        }
    }
}

#Preview {
    ProgressView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
        .preferredColorScheme(.dark)
}
