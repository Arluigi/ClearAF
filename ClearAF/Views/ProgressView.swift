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
                        Text("Progress")
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
            .sheet(isPresented: $showingCamera) {
                PhotoCaptureView(
                    title: "Track Your Progress",
                    subtitle: "Take a photo to track your skin's journey"
                ) { imageData in
                    saveProgressPhoto(imageData: imageData)
                    showingCamera = false
                    showingPhotoTakenMessage = true
                    HapticManager.success()
                    
                    // Hide message after 2 seconds
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        showingPhotoTakenMessage = false
                    }
                }
            }
            .overlay(
                // Photo taken confirmation message
                Group {
                    if showingPhotoTakenMessage {
                        VStack {
                            Spacer()
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.title2)
                                    .foregroundColor(.green)
                                Text("Photo captured!")
                                    .font(.headlineSmall)
                                    .foregroundColor(.textPrimary)
                            }
                            .padding(.spaceLG)
                            .background(Color.cardBackground)
                            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                            .softShadow()
                            .padding(.bottom, 100)
                        }
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .animation(.bouncy, value: showingPhotoTakenMessage)
                    }
                }
            )
        }
    }
    
    private func saveProgressPhoto(imageData: Data) {
        let photo = SkinPhoto(context: viewContext)
        photo.id = UUID()
        photo.captureDate = Date()
        photo.photoData = imageData
        photo.skinScore = 50 // Default score, user can edit later
        
        do {
            try viewContext.save()
        } catch {
            print("Error saving photo: \(error)")
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
                                
                                // Dermatologist visit marker (bottom left)
                                if isDermatologistVisitDate(photo.captureDate) {
                                    HStack {
                                        Image(systemName: "stethoscope")
                                            .font(.caption)
                                            .foregroundColor(.white)
                                            .padding(4)
                                            .background(Color.primaryTeal)
                                            .clipShape(Circle())
                                            .padding(.spaceXS)
                                        Spacer()
                                    }
                                }
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
            
            Button(action: {
                // TODO: Share with dermatologist
                HapticManager.light()
            }) {
                Label("Share with Dermatologist", systemImage: "square.and.arrow.up")
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
                    VStack(alignment: .leading, spacing: .spaceXS) {
                        Text(formatFullDate(photo.captureDate))
                            .font(.headlineSmall)
                            .foregroundColor(.textPrimary)
                        
                        // Dermatologist visit marker
                        if isDermatologistVisitDate(photo.captureDate) {
                            HStack(spacing: .spaceXS) {
                                Image(systemName: "stethoscope")
                                    .font(.caption2)
                                    .foregroundColor(.primaryTeal)
                                Text("Dermatologist Visit")
                                    .font(.caption2)
                                    .foregroundColor(.primaryTeal)
                                    .fontWeight(.medium)
                            }
                        }
                    }
                    
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
            
            Button(action: {
                // TODO: Share with dermatologist
                HapticManager.light()
            }) {
                Label("Share with Dermatologist", systemImage: "square.and.arrow.up")
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

// MARK: - Photo Detail Views (keep existing PhotoDetailView and EditScoreView from original file)

struct PhotoDetailView: View {
    let photo: SkinPhoto
    @State private var showingEditScore = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    if let imageData = photo.photoData,
                       let uiImage = UIImage(data: imageData) {
                        Image(uiImage: uiImage)
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(maxHeight: 400)
                            .cornerRadius(12)
                    }
                    
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Text("Skin Score")
                                .font(.headline)
                            Spacer()
                            Button(action: {
                                showingEditScore = true
                            }) {
                                HStack {
                                    Text("\(photo.skinScore)")
                                        .font(.title2)
                                        .fontWeight(.bold)
                                    Image(systemName: "pencil")
                                        .font(.caption)
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .background(scoreColor(for: Int(photo.skinScore)))
                                .foregroundColor(.white)
                                .cornerRadius(8)
                            }
                        }
                        
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Date")
                                .font(.headline)
                            Text(formatDetailDate(photo.captureDate))
                                .font(.body)
                                .foregroundColor(.gray)
                        }
                        
                        if let notes = photo.notes, !notes.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Notes")
                                    .font(.headline)
                                Text(notes)
                                    .font(.body)
                                    .foregroundColor(.gray)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color(UIColor.systemGray6))
                    .cornerRadius(12)
                }
                .padding()
            }
            .navigationTitle("Photo Details")
            .navigationBarItems(trailing: Button("Done") {
                dismiss()
            })
        }
        .sheet(isPresented: $showingEditScore) {
            EditScoreView(photo: photo)
        }
    }
    
    private func formatDetailDate(_ date: Date?) -> String {
        guard let date = date else { return "" }
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

struct EditScoreView: View {
    @ObservedObject var photo: SkinPhoto
    @State private var tempScore: Double
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    
    init(photo: SkinPhoto) {
        self.photo = photo
        self._tempScore = State(initialValue: Double(photo.skinScore))
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Text("Rate your skin condition")
                    .font(.title2)
                    .fontWeight(.semibold)
                
                Text("\(Int(tempScore))")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundColor(scoreColor(for: Int(tempScore)))
                
                Slider(value: $tempScore, in: 0...100, step: 1)
                    .padding(.horizontal, 20)
                
                Text("0 = Very poor • 100 = Perfect")
                    .font(.caption)
                    .foregroundColor(.gray)
                
                Spacer()
            }
            .padding()
            .navigationTitle("Edit Score")
            .navigationBarItems(
                leading: Button("Cancel") {
                    dismiss()
                },
                trailing: Button("Save") {
                    saveScore()
                }
            )
        }
    }
    
    private func saveScore() {
        photo.skinScore = Int16(tempScore)
        
        do {
            try viewContext.save()
            dismiss()
        } catch {
            // Handle error appropriately
            print("Error saving score: \(error)")
        }
    }
}


// MARK: - Helper Functions

/// Checks if a given date is a dermatologist visit date
/// For now, this is a placeholder that marks certain dates as visit dates
/// In a real implementation, this would check against Core Data Appointment entities
private func isDermatologistVisitDate(_ date: Date?) -> Bool {
    guard let date = date else { return false }
    
    // Placeholder logic: Mark every 30th day as a visit date for demo purposes
    // TODO: Replace with actual Core Data query for Appointment entities
    let calendar = Calendar.current
    let dayOfYear = calendar.ordinality(of: .day, in: .year, for: date) ?? 0
    return dayOfYear % 30 == 0
}

#Preview {
    ProgressView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
        .preferredColorScheme(.dark)
}