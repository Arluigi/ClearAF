//
//  AppointmentBookingView.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/17/25.
//

import SwiftUI
import CoreData

struct AppointmentBookingView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    
    @State private var currentStep = 0
    @State private var selectedConcern = ""
    @State private var selectedPhotos: [Data] = []
    @State private var selectedDate = Date()
    @State private var selectedTimeSlot = ""
    @State private var additionalNotes = ""
    @State private var showingImagePicker = false
    @State private var showingCamera = false
    @State private var showingPhotoTakenMessage = false
    
    private let concerns = [
        "Acne breakout",
        "Skin irritation",
        "Suspicious mole",
        "Rash or redness",
        "Dry skin",
        "Routine check-up",
        "Follow-up visit",
        "Other concern"
    ]
    
    private let timeSlots = [
        "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM",
        "11:00 AM", "11:30 AM", "2:00 PM", "2:30 PM",
        "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM"
    ]
    
    var body: some View {
        NavigationView {
            ZStack {
                Color.backgroundSecondary.ignoresSafeArea()
                
                VStack(spacing: .spaceXL) {
                    // Progress indicator
                    BookingProgressIndicator(currentStep: currentStep, totalSteps: 4)
                        .padding(.horizontal, .spaceXL)
                    
                    // Step content
                    switch currentStep {
                    case 0:
                        ConcernSelectionStep(selectedConcern: $selectedConcern, concerns: concerns)
                    case 1:
                        PhotoUploadStep(
                            selectedPhotos: $selectedPhotos,
                            showingImagePicker: $showingImagePicker,
                            showingCamera: $showingCamera
                        )
                    case 2:
                        DateTimeSelectionStep(
                            selectedDate: $selectedDate,
                            selectedTimeSlot: $selectedTimeSlot,
                            timeSlots: timeSlots
                        )
                    case 3:
                        ConfirmationStep(
                            concern: selectedConcern,
                            date: selectedDate,
                            timeSlot: selectedTimeSlot,
                            photosCount: selectedPhotos.count,
                            additionalNotes: $additionalNotes
                        )
                    default:
                        EmptyView()
                    }
                    
                    Spacer()
                    
                    // Navigation buttons
                    BookingNavigationButtons(
                        currentStep: $currentStep,
                        canProceed: canProceed,
                        onComplete: bookAppointment
                    )
                }
                .padding(.top, .spaceXL)
            }
            .navigationTitle("Book Appointment")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() }
            )
        }
        .sheet(isPresented: $showingCamera) {
            PhotoCaptureView(
                title: "Take Photo",
                subtitle: "Capture a photo for your appointment"
            ) { imageData in
                selectedPhotos.append(imageData)
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
    
    private var canProceed: Bool {
        switch currentStep {
        case 0: return !selectedConcern.isEmpty
        case 1: return true // Photos are optional
        case 2: return !selectedTimeSlot.isEmpty
        case 3: return true
        default: return false
        }
    }
    
    private func bookAppointment() {
        // TODO: Create Appointment entity in Core Data
        let appointment = Appointment(context: viewContext)
        appointment.id = UUID()
        appointment.concern = selectedConcern
        appointment.scheduledDate = combineDateAndTime()
        appointment.status = "scheduled"
        appointment.type = "virtual"
        appointment.notes = additionalNotes
        appointment.createdDate = Date()
        
        do {
            try viewContext.save()
            HapticManager.success()
            dismiss()
        } catch {
            HapticManager.error()
            print("Error booking appointment: \(error)")
        }
    }
    
    private func combineDateAndTime() -> Date {
        let calendar = Calendar.current
        let timeComponents = selectedTimeSlot.components(separatedBy: " ")
        let timePart = timeComponents[0].components(separatedBy: ":")
        let hour = Int(timePart[0]) ?? 9
        let minute = Int(timePart[1]) ?? 0
        let isPM = timeComponents.count > 1 && timeComponents[1] == "PM"
        let adjustedHour = isPM && hour != 12 ? hour + 12 : (hour == 12 && !isPM ? 0 : hour)
        
        return calendar.date(bySettingHour: adjustedHour, minute: minute, second: 0, of: selectedDate) ?? selectedDate
    }
}

// MARK: - Progress Indicator

struct BookingProgressIndicator: View {
    let currentStep: Int
    let totalSteps: Int
    
    var body: some View {
        VStack(spacing: .spaceMD) {
            HStack {
                ForEach(0..<totalSteps, id: \.self) { step in
                    Circle()
                        .fill(step <= currentStep ? Color.primaryPurple : Color.backgroundSecondary)
                        .frame(width: 12, height: 12)
                        .overlay(
                            Circle()
                                .stroke(Color.primaryPurple, lineWidth: step == currentStep ? 2 : 0)
                        )
                    
                    if step < totalSteps - 1 {
                        Rectangle()
                            .fill(step < currentStep ? Color.primaryPurple : Color.backgroundSecondary)
                            .frame(height: 2)
                    }
                }
            }
            
            Text("Step \(currentStep + 1) of \(totalSteps)")
                .font(.captionLarge)
                .foregroundColor(.textSecondary)
        }
    }
}

// MARK: - Step 1: Concern Selection

struct ConcernSelectionStep: View {
    @Binding var selectedConcern: String
    let concerns: [String]
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceXL) {
            VStack(alignment: .leading, spacing: .spaceMD) {
                Text("What brings you in today?")
                    .font(.headlineLarge)
                    .foregroundColor(.textPrimary)
                
                Text("Select your primary concern to help us prepare for your visit")
                    .font(.bodyMedium)
                    .foregroundColor(.textSecondary)
            }
            .padding(.horizontal, .spaceXL)
            
            ScrollView {
                VStack(spacing: .spaceMD) {
                    ForEach(concerns, id: \.self) { concern in
                        ConcernOptionCard(
                            concern: concern,
                            isSelected: selectedConcern == concern
                        ) {
                            selectedConcern = concern
                            HapticManager.selection()
                        }
                    }
                }
                .padding(.horizontal, .spaceXL)
            }
        }
    }
}

struct ConcernOptionCard: View {
    let concern: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Text(concern)
                    .font(.bodyLarge)
                    .foregroundColor(.textPrimary)
                    .multilineTextAlignment(.leading)
                
                Spacer()
                
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title2)
                        .foregroundColor(.primaryPurple)
                }
            }
            .padding(.cardPadding)
            .background(
                RoundedRectangle(cornerRadius: .radiusLarge)
                    .fill(Color.cardBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: .radiusLarge)
                            .stroke(
                                isSelected ? Color.primaryPurple : Color.borderSubtle,
                                lineWidth: isSelected ? 2 : 1
                            )
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Step 2: Photo Upload

struct PhotoUploadStep: View {
    @Binding var selectedPhotos: [Data]
    @Binding var showingImagePicker: Bool
    @Binding var showingCamera: Bool
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceXL) {
            VStack(alignment: .leading, spacing: .spaceMD) {
                Text("Share photos (optional)")
                    .font(.headlineLarge)
                    .foregroundColor(.textPrimary)
                
                Text("Upload photos of your concern to help your dermatologist prepare")
                    .font(.bodyMedium)
                    .foregroundColor(.textSecondary)
            }
            .padding(.horizontal, .spaceXL)
            
            VStack(spacing: .spaceLG) {
                // Photo upload button
                PhotoUploadButton(
                    title: "Take Photo",
                    icon: "camera.fill",
                    action: { showingCamera = true }
                )
                .padding(.horizontal, .spaceXL)
                
                // Selected photos preview
                if !selectedPhotos.isEmpty {
                    VStack(alignment: .leading, spacing: .spaceMD) {
                        Text("\(selectedPhotos.count) photo(s) selected")
                            .font(.headlineSmall)
                            .foregroundColor(.textPrimary)
                            .padding(.horizontal, .spaceXL)
                        
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: .spaceMD) {
                                ForEach(0..<selectedPhotos.count, id: \.self) { index in
                                    PhotoThumbnail(data: selectedPhotos[index]) {
                                        selectedPhotos.remove(at: index)
                                    }
                                }
                            }
                            .padding(.horizontal, .spaceXL)
                        }
                    }
                }
            }
            
            Spacer()
        }
    }
}

struct PhotoUploadButton: View {
    let title: String
    let icon: String
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(.primaryPurple)
                
                Text(title)
                    .font(.headlineMedium)
                    .foregroundColor(.primaryPurple)
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundColor(.primaryPurple)
            }
            .padding(.cardPadding)
            .background(Color.buttonSecondary)
            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
            .overlay(
                RoundedRectangle(cornerRadius: .radiusLarge)
                    .stroke(Color.primaryPurple.opacity(0.2), lineWidth: 1)
            )
        }
    }
}

struct PhotoThumbnail: View {
    let data: Data
    let onRemove: () -> Void
    
    var body: some View {
        ZStack(alignment: .topTrailing) {
            if let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 80, height: 80)
                    .clipShape(RoundedRectangle(cornerRadius: .radiusMedium))
            }
            
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.title3)
                    .foregroundColor(.white)
                    .background(Color.black.opacity(0.3))
                    .clipShape(Circle())
            }
            .offset(x: 8, y: -8)
        }
    }
}

// MARK: - Step 3: Date & Time Selection

struct DateTimeSelectionStep: View {
    @Binding var selectedDate: Date
    @Binding var selectedTimeSlot: String
    let timeSlots: [String]
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceXL) {
            VStack(alignment: .leading, spacing: .spaceMD) {
                Text("Choose date & time")
                    .font(.headlineLarge)
                    .foregroundColor(.textPrimary)
                
                Text("Select your preferred appointment time")
                    .font(.bodyMedium)
                    .foregroundColor(.textSecondary)
            }
            .padding(.horizontal, .spaceXL)
            
            VStack(spacing: .spaceLG) {
                // Date picker
                VStack(alignment: .leading, spacing: .spaceMD) {
                    Text("Date")
                        .font(.headlineSmall)
                        .foregroundColor(.textPrimary)
                        .padding(.horizontal, .spaceXL)
                    
                    DatePicker(
                        "",
                        selection: $selectedDate,
                        in: Date()...,
                        displayedComponents: .date
                    )
                    .datePickerStyle(.compact)
                    .padding(.horizontal, .spaceXL)
                }
                
                // Time slot selection
                VStack(alignment: .leading, spacing: .spaceMD) {
                    Text("Available Times")
                        .font(.headlineSmall)
                        .foregroundColor(.textPrimary)
                        .padding(.horizontal, .spaceXL)
                    
                    ScrollView {
                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: .spaceMD) {
                            ForEach(timeSlots, id: \.self) { timeSlot in
                                TimeSlotButton(
                                    timeSlot: timeSlot,
                                    isSelected: selectedTimeSlot == timeSlot
                                ) {
                                    selectedTimeSlot = timeSlot
                                    HapticManager.selection()
                                }
                            }
                        }
                        .padding(.horizontal, .spaceXL)
                    }
                }
            }
        }
    }
}

struct TimeSlotButton: View {
    let timeSlot: String
    let isSelected: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            Text(timeSlot)
                .font(.bodyMedium)
                .fontWeight(.medium)
                .foregroundColor(isSelected ? .white : .textPrimary)
                .padding(.spaceMD)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: .radiusMedium)
                        .fill(isSelected ? Color.primaryPurple : Color.cardBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: .radiusMedium)
                                .stroke(
                                    isSelected ? Color.primaryPurple : Color.borderSubtle,
                                    lineWidth: 1
                                )
                        )
                )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Step 4: Confirmation

struct ConfirmationStep: View {
    let concern: String
    let date: Date
    let timeSlot: String
    let photosCount: Int
    @Binding var additionalNotes: String
    
    private let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .full
        return formatter
    }()
    
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceXL) {
            VStack(alignment: .leading, spacing: .spaceMD) {
                Text("Confirm appointment")
                    .font(.headlineLarge)
                    .foregroundColor(.textPrimary)
                
                Text("Review your appointment details")
                    .font(.bodyMedium)
                    .foregroundColor(.textSecondary)
            }
            .padding(.horizontal, .spaceXL)
            
            ScrollView {
                VStack(spacing: .spaceLG) {
                    // Appointment summary
                    VStack(spacing: .spaceMD) {
                        ConfirmationRow(label: "Concern", value: concern)
                        ConfirmationRow(label: "Date", value: dateFormatter.string(from: date))
                        ConfirmationRow(label: "Time", value: timeSlot)
                        ConfirmationRow(label: "Photos", value: photosCount > 0 ? "\(photosCount) attached" : "None")
                    }
                    .wellnessCard()
                    .padding(.horizontal, .spaceXL)
                    
                    // Additional notes
                    VStack(alignment: .leading, spacing: .spaceMD) {
                        Text("Additional Notes (Optional)")
                            .font(.headlineSmall)
                            .foregroundColor(.textPrimary)
                        
                        TextField("Any additional details...", text: $additionalNotes, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .lineLimit(3...6)
                    }
                    .padding(.horizontal, .spaceXL)
                }
            }
        }
    }
}

struct ConfirmationRow: View {
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

// MARK: - Navigation Buttons

struct BookingNavigationButtons: View {
    @Binding var currentStep: Int
    let canProceed: Bool
    let onComplete: () -> Void
    
    var body: some View {
        HStack(spacing: .spaceMD) {
            // Back button
            if currentStep > 0 {
                Button("Back") {
                    currentStep -= 1
                    HapticManager.light()
                }
                .font(.headlineMedium)
                .foregroundColor(.primaryPurple)
                .frame(maxWidth: .infinity)
                .padding(.spaceLG)
                .background(Color.buttonSecondary)
                .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
            }
            
            // Next/Complete button
            Button(currentStep == 3 ? "Book Appointment" : "Next") {
                if currentStep == 3 {
                    onComplete()
                } else {
                    currentStep += 1
                    HapticManager.light()
                }
            }
            .font(.headlineMedium)
            .fontWeight(.semibold)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.spaceLG)
            .background(canProceed ? AnyView(Color.primaryGradient) : AnyView(Color.textTertiary))
            .clipShape(RoundedRectangle(cornerRadius: .radiusLarge))
            .disabled(!canProceed)
        }
        .padding(.horizontal, .spaceXL)
        .padding(.bottom, .spaceXL)
    }
}


#Preview {
    AppointmentBookingView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}