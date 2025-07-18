//
//  AppointmentDetailView.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/18/25.
//

import SwiftUI
import CoreData

struct AppointmentDetailView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    
    let appointment: Appointment
    @State private var showingVideoCall = false
    @State private var showingPhotoPicker = false
    @State private var showingCamera = false
    @State private var showingPhotoTakenMessage = false
    @State private var visitNotes = ""
    @State private var selectedPhotos: [Data] = []
    
    private let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        formatter.timeStyle = .short
        return formatter
    }()
    
    private let statusFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.backgroundSecondary.ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: .spaceXL) {
                        // Appointment status card
                        VStack(alignment: .leading, spacing: .spaceLG) {
                            HStack {
                                VStack(alignment: .leading, spacing: .spaceXS) {
                                    Text(appointment.concern ?? "Appointment")
                                        .font(.headlineLarge)
                                        .foregroundColor(.textPrimary)
                                    
                                    if let scheduledDate = appointment.scheduledDate {
                                        Text(dateFormatter.string(from: scheduledDate))
                                            .font(.bodyMedium)
                                            .foregroundColor(.textSecondary)
                                    }
                                }
                                
                                Spacer()
                                
                                AppointmentStatusBadge(status: appointment.status ?? "scheduled")
                            }
                            
                            // Video call button for upcoming appointments
                            if appointment.status == "scheduled" && isUpcoming {
                                Button(action: {
                                    showingVideoCall = true
                                    HapticManager.light()
                                }) {
                                    HStack {
                                        Image(systemName: "video.fill")
                                            .font(.title2)
                                            .foregroundColor(.white)
                                        
                                        Text("Join Video Call")
                                            .font(.headlineMedium)
                                            .foregroundColor(.white)
                                        
                                        Spacer()
                                        
                                        Image(systemName: "arrow.up.right")
                                            .font(.caption)
                                            .foregroundColor(.white.opacity(0.8))
                                    }
                                    .padding(.cardPadding)
                                    .background(Color.primaryGradient)
                                    .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                                    .glowShadow()
                                }
                            }
                        }
                        .wellnessCard()
                        .padding(.horizontal, .spaceXL)
                        
                        // Appointment details
                        VStack(alignment: .leading, spacing: .spaceLG) {
                            Text("Appointment Details")
                                .font(.headlineLarge)
                                .foregroundColor(.textPrimary)
                            
                            VStack(spacing: .spaceMD) {
                                DetailRow(label: "Type", value: appointment.type?.capitalized ?? "Virtual")
                                DetailRow(label: "Duration", value: "\(appointment.duration) minutes")
                                DetailRow(label: "Status", value: appointment.status?.capitalized ?? "Scheduled")
                                
                                if let dermatologist = appointment.dermatologist {
                                    DetailRow(label: "Doctor", value: dermatologist.name ?? "Dr. Amit Om")
                                }
                                
                                if let createdDate = appointment.createdDate {
                                    DetailRow(label: "Booked", value: statusFormatter.string(from: createdDate))
                                }
                            }
                        }
                        .wellnessCard()
                        .padding(.horizontal, .spaceXL)
                        
                        // Visit notes section
                        VStack(alignment: .leading, spacing: .spaceLG) {
                            Text("Visit Notes")
                                .font(.headlineLarge)
                                .foregroundColor(.textPrimary)
                            
                            if appointment.status == "completed" {
                                // Show completed visit notes
                                if let notes = appointment.visitNotes, !notes.isEmpty {
                                    Text(notes)
                                        .font(.bodyMedium)
                                        .foregroundColor(.textPrimary)
                                        .padding(.spaceMD)
                                        .background(Color.backgroundPrimary)
                                        .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
                                } else {
                                    Text("No notes available for this visit")
                                        .font(.bodyMedium)
                                        .foregroundColor(.textSecondary)
                                        .italic()
                                }
                            } else {
                                // Show preparation notes for upcoming appointments
                                VStack(alignment: .leading, spacing: .spaceMD) {
                                    Text("Preparation Notes")
                                        .font(.headlineSmall)
                                        .foregroundColor(.textPrimary)
                                    
                                    if let notes = appointment.notes, !notes.isEmpty {
                                        Text(notes)
                                            .font(.bodyMedium)
                                            .foregroundColor(.textPrimary)
                                    } else {
                                        Text("No additional notes")
                                            .font(.bodyMedium)
                                            .foregroundColor(.textSecondary)
                                            .italic()
                                    }
                                }
                            }
                        }
                        .wellnessCard()
                        .padding(.horizontal, .spaceXL)
                        
                        // Related photos section
                        VStack(alignment: .leading, spacing: .spaceLG) {
                            HStack {
                                Text("Related Photos")
                                    .font(.headlineLarge)
                                    .foregroundColor(.textPrimary)
                                
                                Spacer()
                                
                                if appointment.status != "completed" {
                                    Button("Add Photo") {
                                        showingCamera = true
                                        HapticManager.light()
                                    }
                                    .font(.captionLarge)
                                    .foregroundColor(.primaryPurple)
                                }
                            }
                            
                            if let photos = appointment.relatedPhotos?.allObjects as? [SkinPhoto], !photos.isEmpty {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: .spaceMD) {
                                        ForEach(photos, id: \.id) { photo in
                                            AppointmentPhotoCard(photo: photo)
                                        }
                                    }
                                    .padding(.horizontal, .spaceXL)
                                }
                                .padding(.horizontal, -.spaceXL)
                            } else {
                                VStack(spacing: .spaceMD) {
                                    HStack {
                                        Image(systemName: "photo.circle")
                                            .font(.title2)
                                            .foregroundColor(.textSecondary)
                                        
                                        VStack(alignment: .leading, spacing: .spaceXS) {
                                            Text("No photos attached")
                                                .font(.headlineMedium)
                                                .foregroundColor(.textPrimary)
                                            
                                            Text("Add photos to help document your concern")
                                                .font(.bodyMedium)
                                                .foregroundColor(.textSecondary)
                                        }
                                        
                                        Spacer()
                                    }
                                }
                            }
                        }
                        .wellnessCard()
                        .padding(.horizontal, .spaceXL)
                        
                        // Action buttons for completed appointments
                        if appointment.status == "completed" {
                            VStack(spacing: .spaceMD) {
                                Button("Book Follow-up") {
                                    // TODO: Navigate to appointment booking
                                    HapticManager.light()
                                }
                                .font(.headlineMedium)
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.spaceLG)
                                .background(Color.primaryGradient)
                                .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                                
                                Button("Message Doctor") {
                                    // TODO: Navigate to messaging
                                    HapticManager.light()
                                }
                                .font(.headlineMedium)
                                .foregroundColor(.primaryPurple)
                                .frame(maxWidth: .infinity)
                                .padding(.spaceLG)
                                .background(Color.buttonSecondary)
                                .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
                            }
                            .padding(.horizontal, .spaceXL)
                        }
                    }
                    .padding(.vertical, .spaceXL)
                    .padding(.bottom, 100)
                }
            }
            .navigationTitle("Appointment")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Back") { dismiss() }
            )
        }
        .sheet(isPresented: $showingVideoCall) {
            VideoCallView(appointment: appointment)
        }
        .sheet(isPresented: $showingCamera) {
            PhotoCaptureView(
                title: "Take Photo",
                subtitle: "Document your skin concern"
            ) { imageData in
                addPhotoToAppointment(imageData)
                showingCamera = false
                showingPhotoTakenMessage = true
                HapticManager.success()
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    showingPhotoTakenMessage = false
                }
            }
        }
        .overlay(
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
    
    private var isUpcoming: Bool {
        guard let scheduledDate = appointment.scheduledDate else { return false }
        return scheduledDate > Date()
    }
    
    private func addPhotoToAppointment(_ imageData: Data) {
        let photo = SkinPhoto(context: viewContext)
        photo.id = UUID()
        photo.photoData = imageData
        photo.captureDate = Date()
        photo.relatedAppointment = appointment
        photo.notes = "Added during appointment preparation"
        
        do {
            try viewContext.save()
        } catch {
            print("Error saving photo: \(error)")
        }
    }
}

// MARK: - Supporting Views

struct AppointmentStatusBadge: View {
    let status: String
    
    private var statusColor: Color {
        switch status.lowercased() {
        case "scheduled": return .blue
        case "completed": return .green
        case "cancelled": return .red
        case "in_progress": return .orange
        default: return .gray
        }
    }
    
    var body: some View {
        Text(status.capitalized)
            .font(.captionLarge)
            .fontWeight(.semibold)
            .foregroundColor(.white)
            .padding(.horizontal, .spaceMD)
            .padding(.vertical, .spaceXS)
            .background(statusColor)
            .clipShape(RoundedRectangle(cornerRadius: .radiusSmall))
    }
}

struct DetailRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .font(.bodyMedium)
                .foregroundColor(.textSecondary)
            
            Spacer()
            
            Text(value)
                .font(.bodyMedium)
                .foregroundColor(.textPrimary)
                .fontWeight(.medium)
                .multilineTextAlignment(.trailing)
        }
    }
}

struct AppointmentPhotoCard: View {
    let photo: SkinPhoto
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceXS) {
            if let photoData = photo.photoData, let uiImage = UIImage(data: photoData) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 120, height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
            } else {
                RoundedRectangle(cornerRadius: .radiusMedium)
                    .fill(Color.backgroundSecondary)
                    .frame(width: 120, height: 120)
                    .overlay(
                        Image(systemName: "photo")
                            .font(.title2)
                            .foregroundColor(.textSecondary)
                    )
            }
            
            if let captureDate = photo.captureDate {
                Text(captureDate, style: .date)
                    .font(.captionMedium)
                    .foregroundColor(.textSecondary)
                    .lineLimit(1)
            }
        }
        .frame(width: 120)
    }
}

struct VideoCallView: View {
    @Environment(\.dismiss) private var dismiss
    let appointment: Appointment
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()
                
                VStack {
                    Spacer()
                    
                    VStack(spacing: .spaceLG) {
                        Image(systemName: "video.slash")
                            .font(.system(size: 60))
                            .foregroundColor(.white)
                        
                        Text("Video Call Placeholder")
                            .font(.headlineLarge)
                            .foregroundColor(.white)
                        
                        Text("This would integrate with a video calling service")
                            .font(.bodyMedium)
                            .foregroundColor(.white.opacity(0.7))
                            .multilineTextAlignment(.center)
                    }
                    
                    Spacer()
                    
                    HStack(spacing: .spaceLG) {
                        Button("End Call") {
                            dismiss()
                        }
                        .font(.headlineMedium)
                        .foregroundColor(.white)
                        .padding(.spaceLG)
                        .background(Color.red)
                        .clipShape(Circle())
                        
                        Button("Mute") {
                            // TODO: Implement mute
                        }
                        .font(.headlineMedium)
                        .foregroundColor(.white)
                        .padding(.spaceLG)
                        .background(Color.gray)
                        .clipShape(Circle())
                    }
                    .padding(.bottom, 50)
                }
            }
            .navigationBarHidden(true)
        }
    }
}

#Preview {
    let context = PersistenceController.preview.container.viewContext
    
    // Create sample appointment
    let appointment = Appointment(context: context)
    appointment.id = UUID()
    appointment.concern = "Acne breakout"
    appointment.scheduledDate = Date().addingTimeInterval(3600) // 1 hour from now
    appointment.status = "scheduled"
    appointment.type = "virtual"
    appointment.duration = 30
    appointment.notes = "Please prepare photos of affected areas"
    appointment.createdDate = Date()
    
    return AppointmentDetailView(appointment: appointment)
        .environment(\.managedObjectContext, context)
}