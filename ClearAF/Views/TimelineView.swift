import SwiftUI
import UIKit
import CoreData

struct TimelineView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: SkinPhoto.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \SkinPhoto.captureDate, ascending: false)],
        animation: .default)
    private var photos: FetchedResults<SkinPhoto>
    
    @State private var selectedViewMode = 0
    @State private var showingCamera = false
    
    var body: some View {
        NavigationView {
            ZStack {
                // Dark background
                Color.backgroundSecondary.ignoresSafeArea()
                
                VStack(spacing: .spaceXL) {
                    // Enhanced header with photo count
                    HStack {
                        Text("Timeline")
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
                        EnhancedEmptyTimelineView()
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
            .sheet(isPresented: $showingCamera) {
                CameraView()
            }
        }
    }
}

struct EmptyTimelineView: View {
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Image(systemName: "camera")
                .font(.system(size: 60))
                .foregroundColor(.gray)
            
            Text("No photos yet")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Take your first progress photo to start tracking your skin journey")
                .font(.body)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            
            Spacer()
        }
    }
}

struct PhotoGridView: View {
    let photos: [SkinPhoto]
    
    let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible())
    ]
    
    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(photos, id: \.id) { photo in
                    PhotoGridItem(photo: photo)
                }
            }
            .padding(.horizontal)
        }
    }
}

struct PhotoGridItem: View {
    let photo: SkinPhoto
    @State private var showingPhotoDetail = false
    @State private var showingEditScore = false
    @Environment(\.managedObjectContext) private var viewContext
    
    var body: some View {
        VStack(spacing: 4) {
            if let imageData = photo.photoData,
               let uiImage = UIImage(data: imageData) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 100, height: 100)
                    .clipped()
                    .cornerRadius(8)
            } else {
                Rectangle()
                    .fill(Color(.systemGray5))
                    .frame(width: 100, height: 100)
                    .cornerRadius(8)
                    .overlay(
                        Image(systemName: "photo")
                            .foregroundColor(.gray)
                    )
            }
            
            Text(formatDate(photo.captureDate))
                .font(.caption2)
                .foregroundColor(.gray)
            
            HStack {
                Text("\(photo.skinScore)")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(scoreColor(for: photo.skinScore))
                    .foregroundColor(.white)
                    .cornerRadius(4)
            }
        }
        .onTapGesture {
            showingPhotoDetail = true
        }
        .contextMenu {
            Button(action: {
                showingPhotoDetail = true
            }) {
                Label("View Details", systemImage: "eye")
            }
            
            Button(action: {
                showingEditScore = true
            }) {
                Label("Edit Score", systemImage: "pencil")
            }
            
            Button(action: {
                deletePhoto()
            }) {
                Label("Delete", systemImage: "trash")
            }
            .foregroundColor(.red)
        }
        .sheet(isPresented: $showingPhotoDetail) {
            PhotoDetailView(photo: photo)
        }
        .sheet(isPresented: $showingEditScore) {
            EditScoreView(photo: photo)
        }
    }
    
    private func deletePhoto() {
        withAnimation {
            viewContext.delete(photo)
            do {
                try viewContext.save()
            } catch {
                print("Error deleting photo: \(error)")
            }
        }
    }
    
    private func formatDate(_ date: Date?) -> String {
        guard let date = date else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM dd"
        return formatter.string(from: date)
    }
    
    private func scoreColor(for score: Int16) -> Color {
        switch score {
        case 0..<30:
            return .red
        case 30..<70:
            return .orange
        default:
            return .green
        }
    }
}

struct PhotoListView: View {
    let photos: [SkinPhoto]
    
    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(photos, id: \.id) { photo in
                    PhotoListItem(photo: photo)
                }
            }
            .padding(.horizontal)
        }
    }
}

struct PhotoListItem: View {
    let photo: SkinPhoto
    @State private var showingPhotoDetail = false
    @State private var showingEditScore = false
    @Environment(\.managedObjectContext) private var viewContext
    
    var body: some View {
        HStack(spacing: 12) {
            if let imageData = photo.photoData,
               let uiImage = UIImage(data: imageData) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 80, height: 80)
                    .clipped()
                    .cornerRadius(8)
            } else {
                Rectangle()
                    .fill(Color(.systemGray5))
                    .frame(width: 80, height: 80)
                    .cornerRadius(8)
                    .overlay(
                        Image(systemName: "photo")
                            .foregroundColor(.gray)
                    )
            }
            
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(formatFullDate(photo.captureDate))
                        .font(.headline)
                    Spacer()
                    Text("\(photo.skinScore)")
                        .font(.headline)
                        .fontWeight(.bold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(scoreColor(for: photo.skinScore))
                        .foregroundColor(.white)
                        .cornerRadius(6)
                }
                
                if let notes = photo.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.body)
                        .foregroundColor(.gray)
                        .lineLimit(2)
                } else {
                    Text("No notes")
                        .font(.body)
                        .foregroundColor(.gray)
                        .italic()
                }
            }
            
            Spacer()
        }
        .padding()
        .background(Color(UIColor.systemGray6))
        .cornerRadius(12)
        .onTapGesture {
            showingPhotoDetail = true
        }
        .contextMenu {
            Button(action: {
                showingPhotoDetail = true
            }) {
                Label("View Details", systemImage: "eye")
            }
            
            Button(action: {
                showingEditScore = true
            }) {
                Label("Edit Score", systemImage: "pencil")
            }
            
            Button(action: {
                deletePhoto()
            }) {
                Label("Delete", systemImage: "trash")
            }
            .foregroundColor(.red)
        }
        .sheet(isPresented: $showingPhotoDetail) {
            PhotoDetailView(photo: photo)
        }
        .sheet(isPresented: $showingEditScore) {
            EditScoreView(photo: photo)
        }
    }
    
    private func deletePhoto() {
        withAnimation {
            viewContext.delete(photo)
            do {
                try viewContext.save()
            } catch {
                print("Error deleting photo: \(error)")
            }
        }
    }
    
    private func formatFullDate(_ date: Date?) -> String {
        guard let date = date else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM dd, yyyy"
        return formatter.string(from: date)
    }
    
    private func scoreColor(for score: Int16) -> Color {
        switch score {
        case 0..<30:
            return .red
        case 30..<70:
            return .orange
        default:
            return .green
        }
    }
}

struct PhotoDetailView: View {
    let photo: SkinPhoto
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    // Photo
                    if let imageData = photo.photoData,
                       let uiImage = UIImage(data: imageData) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(maxHeight: 400)
                            .cornerRadius(16)
                    }
                    
                    // Score and Date
                    VStack(spacing: 12) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text("Skin Score")
                                    .font(.headline)
                                Text("\(photo.skinScore)")
                                    .font(.largeTitle)
                                    .fontWeight(.bold)
                                    .foregroundColor(scoreColor(for: photo.skinScore))
                            }
                            
                            Spacer()
                            
                            VStack(alignment: .trailing) {
                                Text("Date Taken")
                                    .font(.headline)
                                Text(formatFullDate(photo.captureDate))
                                    .font(.title3)
                                    .fontWeight(.medium)
                            }
                        }
                        .padding()
                        .background(Color(UIColor.systemGray6))
                        .cornerRadius(12)
                        
                        // Notes
                        if let notes = photo.notes, !notes.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Notes")
                                    .font(.headline)
                                Text(notes)
                                    .font(.body)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                            .background(Color(UIColor.systemGray6))
                            .cornerRadius(12)
                        }
                    }
                    
                    Spacer()
                }
                .padding()
            }
            .navigationTitle("Photo Details")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(trailing: 
                Button("Done") {
                    dismiss()
                }
            )
        }
    }
    
    private func formatFullDate(_ date: Date?) -> String {
        guard let date = date else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM dd, yyyy"
        return formatter.string(from: date)
    }
    
    private func scoreColor(for score: Int16) -> Color {
        switch score {
        case 0..<30:
            return .red
        case 30..<70:
            return .orange
        default:
            return .green
        }
    }
}

struct EditScoreView: View {
    let photo: SkinPhoto
    @State private var newScore: Double
    @Environment(\.managedObjectContext) private var viewContext
    @Environment(\.dismiss) private var dismiss
    
    init(photo: SkinPhoto) {
        self.photo = photo
        self._newScore = State(initialValue: Double(photo.skinScore))
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 24) {
                // Photo preview
                if let imageData = photo.photoData,
                   let uiImage = UIImage(data: imageData) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(height: 200)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .padding(.horizontal)
                }
                
                VStack(spacing: 16) {
                    Text("Edit Skin Score")
                        .font(.title2)
                        .fontWeight(.semibold)
                    
                    Text("\(Int(newScore))")
                        .font(.system(size: 48, weight: .bold))
                        .foregroundColor(scoreColor(for: Int16(newScore)))
                    
                    Slider(value: $newScore, in: 0...100, step: 1)
                        .accentColor(.purple)
                        .padding(.horizontal)
                    
                    HStack {
                        Text("0")
                            .font(.caption)
                            .foregroundColor(.gray)
                        Spacer()
                        Text("100")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    .padding(.horizontal)
                }
                .padding()
                .background(Color(UIColor.systemGray6))
                .cornerRadius(16)
                .padding(.horizontal)
                
                Spacer()
            }
            .navigationTitle("Edit Score")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() },
                trailing: Button("Save") { saveScore() }
                    .fontWeight(.semibold)
            )
        }
    }
    
    private func saveScore() {
        photo.skinScore = Int16(newScore)
        do {
            try viewContext.save()
            dismiss()
        } catch {
            print("Error saving score: \(error)")
        }
    }
    
    private func scoreColor(for score: Int16) -> Color {
        switch score {
        case 0..<30:
            return .red
        case 30..<70:
            return .orange
        default:
            return .green
        }
    }
}

// MARK: - Enhanced Timeline Components

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

struct EnhancedEmptyTimelineView: View {
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
                    TimelinePhotoTip(icon: "lightbulb.fill", text: "Take photos in consistent lighting")
                    TimelinePhotoTip(icon: "clock.fill", text: "Same time each day for accuracy")
                    TimelinePhotoTip(icon: "face.smiling", text: "Use front camera for face tracking")
                }
            }
            .frame(maxWidth: .infinity)
            .wellnessCard(style: .flat)
            .padding(.horizontal, .spaceXL)
            
            Spacer()
        }
    }
}

// Timeline Photo Tip Component
struct TimelinePhotoTip: View {
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
    let photo: SkinPhoto
    @State private var showingPhotoDetail = false
    @State private var showingEditScore = false
    @Environment(\.managedObjectContext) private var viewContext
    
    var body: some View {
        VStack(spacing: .spaceXS) {
            ZStack {
                if let imageData = photo.photoData,
                   let uiImage = UIImage(data: imageData) {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 100, height: 100)
                        .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
                        .overlay(
                            VStack {
                                HStack {
                                    Spacer()
                                    Text("\(photo.skinScore)")
                                        .font(.captionLarge)
                                        .fontWeight(.bold)
                                        .foregroundColor(.white)
                                        .padding(.horizontal, .spaceXS)
                                        .padding(.vertical, 2)
                                        .background(scoreColor(for: Int(photo.skinScore)))
                                        .clipShape(Capsule())
                                        .padding(.spaceXS)
                                }
                                Spacer()
                            }
                        )
                } else {
                    RoundedRectangle(cornerRadius: .radiusMedium)
                        .fill(Color.cardBackground)
                        .frame(width: 100, height: 100)
                        .overlay(
                            Image(systemName: "photo")
                                .foregroundColor(.textTertiary)
                        )
                }
            }
            
            Text(formatDate(photo.captureDate))
                .font(.captionLarge)
                .foregroundColor(.textSecondary)
                .fontWeight(.medium)
        }
        .padding(.spaceXS)
        .background(Color.backgroundSecondary.opacity(0.3))
        .cornerRadius(.radiusMedium)
        .onTapGesture {
            HapticManager.light()
            showingPhotoDetail = true
        }
        .contextMenu {
            Button(action: { showingPhotoDetail = true }) {
                Label("View Details", systemImage: "eye")
            }
            
            Button(action: { showingEditScore = true }) {
                Label("Edit Score", systemImage: "pencil")
            }
            
            Button(action: deletePhoto) {
                Label("Delete", systemImage: "trash")
            }
            .foregroundColor(.red)
        }
        .sheet(isPresented: $showingPhotoDetail) {
            PhotoDetailView(photo: photo)
        }
        .sheet(isPresented: $showingEditScore) {
            EditScoreView(photo: photo)
        }
    }
    
    private func deletePhoto() {
        withAnimation(.smooth) {
            viewContext.delete(photo)
            do {
                try viewContext.save()
                HapticManager.success()
            } catch {
                HapticManager.error()
                print("Error deleting photo: \(error)")
            }
        }
    }
    
    private func formatDate(_ date: Date?) -> String {
        guard let date = date else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM dd"
        return formatter.string(from: date)
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
    let photo: SkinPhoto
    @State private var showingPhotoDetail = false
    @State private var showingEditScore = false
    @Environment(\.managedObjectContext) private var viewContext
    
    var body: some View {
        HStack(spacing: .spaceLG) {
            // Photo thumbnail
            if let imageData = photo.photoData,
               let uiImage = UIImage(data: imageData) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 80, height: 80)
                    .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
            } else {
                RoundedRectangle(cornerRadius: .radiusMedium)
                    .fill(Color.cardBackground)
                    .frame(width: 80, height: 80)
                    .overlay(
                        Image(systemName: "photo")
                            .foregroundColor(.textTertiary)
                    )
            }
            
            // Content
            VStack(alignment: .leading, spacing: .spaceXS) {
                HStack {
                    Text(formatFullDate(photo.captureDate))
                        .font(.headlineSmall)
                        .foregroundColor(.textPrimary)
                    Spacer()
                    Text("\(photo.skinScore)")
                        .font(.bodyLarge)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                        .padding(.horizontal, .spaceMD)
                        .padding(.vertical, .spaceXS)
                        .background(scoreColor(for: Int(photo.skinScore)))
                        .clipShape(Capsule())
                }
                
                if let notes = photo.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.bodyMedium)
                        .foregroundColor(.textSecondary)
                        .lineLimit(2)
                } else {
                    Text("No notes")
                        .font(.bodyMedium)
                        .foregroundColor(.textTertiary)
                        .italic()
                }
            }
            
            Spacer()
        }
        .wellnessCard(style: .elevated)
        .onTapGesture {
            HapticManager.light()
            showingPhotoDetail = true
        }
        .contextMenu {
            Button(action: { showingPhotoDetail = true }) {
                Label("View Details", systemImage: "eye")
            }
            
            Button(action: { showingEditScore = true }) {
                Label("Edit Score", systemImage: "pencil")
            }
            
            Button(action: deletePhoto) {
                Label("Delete", systemImage: "trash")
            }
            .foregroundColor(.red)
        }
        .sheet(isPresented: $showingPhotoDetail) {
            PhotoDetailView(photo: photo)
        }
        .sheet(isPresented: $showingEditScore) {
            EditScoreView(photo: photo)
        }
    }
    
    private func deletePhoto() {
        withAnimation(.smooth) {
            viewContext.delete(photo)
            do {
                try viewContext.save()
                HapticManager.success()
            } catch {
                HapticManager.error()
                print("Error deleting photo: \(error)")
            }
        }
    }
    
    private func formatFullDate(_ date: Date?) -> String {
        guard let date = date else { return "" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM dd, yyyy"
        return formatter.string(from: date)
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

#Preview {
    TimelineView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
        .preferredColorScheme(.dark)
}