import SwiftUI
import UIKit
import CoreData

struct ProgressView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: SkinPhoto.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \SkinPhoto.captureDate, ascending: false)],
        animation: .default)
    private var photos: FetchedResults<SkinPhoto>
    
    @State private var selectedViewMode = 0
    @State private var showingCamera = false
    @State private var showingPhotoTakenMessage = false
    
    var body: some View {
        NavigationView {
            ZStack {
                // Dark background
                Color.backgroundSecondary.ignoresSafeArea()
                
                VStack(spacing: .spaceXL) {
                    // Enhanced header with photo count
                    HStack {
                        Text("Photos")
                            .font(.displayMedium)
                            .foregroundColor(.textPrimary)
                        Spacer()
                        Text("\(photos.count) photos")
                            .font(.captionLarge)
                            .foregroundColor(.textSecondary)
                            .padding(.horizontal, .spaceMD)
                            .padding(.vertical, .spaceXS)
                            .background(Color.cardBackground)
                            .clipShape(Capsule())
                    }
                    .padding(.horizontal, .spaceXL)
                    
                    // Enhanced segmented control
                    EnhancedSegmentedControl(
                        selection: $selectedViewMode,
                        options: ["Grid", "List"]
                    )
                    .padding(.horizontal, .spaceXL)
                    
                    if photos.isEmpty {
                        EnhancedEmptyProgressView()
                    } else {
                        if selectedViewMode == 0 {
                            EnhancedPhotoGridView(photos: Array(photos))
                        } else {
                            EnhancedPhotoListView(photos: Array(photos))
                        }
                    }
                }
                .navigationBarHidden(true)
                .padding(.top, .spaceXL)
                
                // Enhanced Floating Action Button
                EnhancedFloatingActionButton(showingCamera: $showingCamera)
            }
            .sheet(isPresented: $showingCamera) { DurablePhotoCaptureView() }
        }
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
    
    let columns = [
        GridItem(.flexible(), spacing: .spaceSM),
        GridItem(.flexible(), spacing: .spaceSM),
        GridItem(.flexible(), spacing: .spaceSM)
    ]
    
    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: .spaceMD) {
                ForEach(photos, id: \.id) { photo in
                    EnhancedPhotoGridItem(photo: photo)
                }
            }
            .padding(.horizontal, .spaceXL)
            .padding(.bottom, 100)
        }
    }
}

struct EnhancedPhotoGridItem: View {
    @ObservedObject var photo: SkinPhoto
    @State private var showingPhotoDetail = false
    var body: some View {
        VStack(spacing: .spaceXS) {
            Button { showingPhotoDetail = true } label: {
                VStack {
                    ProgressPhotoThumbnail(photo: photo, size: 100)
                    if let date = photo.captureDate { Text(date, style: .date).font(.caption) }
                }
            }.buttonStyle(.plain)
            PhotoSharingStatusView(photo: photo, compact: true)
        }
        .padding(.spaceXS)
        .sheet(isPresented: $showingPhotoDetail) { PhotoDetailView(photo: photo) }
    }
}

struct EnhancedPhotoListView: View {
    let photos: [SkinPhoto]
    
    var body: some View {
        ScrollView {
            LazyVStack(spacing: .spaceLG) {
                ForEach(photos, id: \.id) { photo in
                    EnhancedPhotoListItem(photo: photo)
                }
            }
            .padding(.horizontal, .spaceXL)
            .padding(.bottom, 100)
        }
    }
}

struct EnhancedPhotoListItem: View {
    @ObservedObject var photo: SkinPhoto
    @State private var showingPhotoDetail = false
    var body: some View {
        HStack(spacing: .spaceLG) {
            Button { showingPhotoDetail = true } label: { ProgressPhotoThumbnail(photo: photo, size: 80) }
                .buttonStyle(.plain).accessibilityLabel("View photo details")
            VStack(alignment: .leading, spacing: .spaceXS) {
                if let date = photo.captureDate { Text(date, style: .date).font(.headlineSmall) }
                if let notes = photo.notes, !notes.isEmpty { Text(notes).font(.bodyMedium).lineLimit(2) }
                PhotoSharingStatusView(photo: photo)
            }
            Spacer()
        }
        .wellnessCard(style: .elevated)
        .sheet(isPresented: $showingPhotoDetail) { PhotoDetailView(photo: photo) }
    }
}

private struct ProgressPhotoThumbnail: View {
    @ObservedObject var photo: SkinPhoto
    let size: CGFloat
    var body: some View {
        Group {
            if let bytes = photo.photoData, let image = UIImage(data: bytes) {
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
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if let bytes = photo.photoData, let image = UIImage(data: bytes) {
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
