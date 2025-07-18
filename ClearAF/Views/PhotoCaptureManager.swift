//
//  PhotoCaptureManager.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/17/25.
//

import SwiftUI
import CoreData

// MARK: - Photo Capture Manager

struct PhotoCaptureView: View {
    let onPhotoTaken: (Data) -> Void
    let title: String
    let subtitle: String
    @Environment(\.dismiss) private var dismiss
    @State private var showingImagePicker = false
    @State private var showingPhotoLibrary = false
    @State private var selectedImage: UIImage?
    
    init(title: String = "Take Photo", subtitle: String = "Capture a photo", onPhotoTaken: @escaping (Data) -> Void) {
        self.title = title
        self.subtitle = subtitle
        self.onPhotoTaken = onPhotoTaken
    }
    
    var body: some View {
        NavigationView {
            VStack {
                Spacer()
                
                VStack(spacing: 20) {
                    Text(title)
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .multilineTextAlignment(.center)
                    
                    Text(subtitle)
                        .font(.body)
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                    
                    VStack(spacing: 16) {
                        Button(action: {
                            showingImagePicker = true
                        }) {
                            HStack {
                                Image(systemName: "camera")
                                Text("Take Photo")
                            }
                            .font(.headline)
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(Color.primaryGradient)
                            .cornerRadius(12)
                        }
                        
                        Button(action: {
                            showingPhotoLibrary = true
                        }) {
                            HStack {
                                Image(systemName: "photo.on.rectangle")
                                Text("Choose from Library")
                            }
                            .font(.headline)
                            .foregroundColor(.primaryPurple)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(Color.buttonSecondary)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.primaryPurple.opacity(0.3), lineWidth: 1)
                            )
                            .cornerRadius(12)
                        }
                    }
                    .padding(.horizontal, 40)
                }
                
                Spacer()
            }
            .navigationTitle("Camera")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() }
            )
        }
        .sheet(isPresented: $showingImagePicker) {
            CameraImagePicker(selectedImage: $selectedImage)
        }
        .sheet(isPresented: $showingPhotoLibrary) {
            PhotoLibraryPicker(selectedImage: $selectedImage)
        }
        .onChange(of: selectedImage) { image in
            if let image = image, let imageData = image.jpegData(compressionQuality: 0.8) {
                onPhotoTaken(imageData)
            }
        }
    }
}

// MARK: - Daily Photo Capture (for Dashboard)

struct DailyPhotoCaptureView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.managedObjectContext) private var viewContext
    @State private var showingImagePicker = false
    @State private var selectedImage: UIImage?
    @State private var showingPhotoTakenMessage = false
    
    var body: some View {
        NavigationView {
            VStack {
                Spacer()
                
                VStack(spacing: 20) {
                    Text("Track Your Progress")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .multilineTextAlignment(.center)
                    
                    Text("Take a photo to track your skin's journey")
                        .font(.body)
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                    
                    Button(action: {
                        showingImagePicker = true
                    }) {
                        HStack {
                            Image(systemName: "camera")
                            Text("Take Photo")
                        }
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Color.primaryGradient)
                        .cornerRadius(12)
                    }
                    .padding(.horizontal, 40)
                }
                
                Spacer()
            }
            .navigationTitle("Camera")
            .navigationBarTitleDisplayMode(.inline)
            .navigationBarItems(
                leading: Button("Cancel") { dismiss() }
            )
        }
        .sheet(isPresented: $showingImagePicker) {
            CameraImagePicker(selectedImage: $selectedImage)
        }
        .onChange(of: selectedImage) { image in
            if let image = image {
                saveDailyPhoto(image: image)
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
    
    private func saveDailyPhoto(image: UIImage) {
        let photo = SkinPhoto(context: viewContext)
        photo.id = UUID()
        photo.captureDate = Date()
        photo.photoData = image.jpegData(compressionQuality: 0.8)
        photo.skinScore = 50 // Default score, user can edit later
        
        do {
            try viewContext.save()
            HapticManager.success()
            showingPhotoTakenMessage = true
            
            // Hide message after 2 seconds, then close
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                showingPhotoTakenMessage = false
                // Close after message disappears
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    dismiss()
                }
            }
        } catch {
            HapticManager.error()
            print("Error saving photo: \(error)")
        }
    }
}

// MARK: - Reusable Camera Image Picker

struct CameraImagePicker: UIViewControllerRepresentable {
    @Binding var selectedImage: UIImage?
    @Environment(\.dismiss) private var dismiss
    
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.delegate = context.coordinator
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        return picker
    }
    
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraImagePicker
        
        init(_ parent: CameraImagePicker) {
            self.parent = parent
        }
        
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.selectedImage = image
            }
            parent.dismiss()
        }
        
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

// MARK: - Photo Library Picker

struct PhotoLibraryPicker: UIViewControllerRepresentable {
    @Binding var selectedImage: UIImage?
    @Environment(\.dismiss) private var dismiss
    
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.delegate = context.coordinator
        picker.sourceType = .photoLibrary
        return picker
    }
    
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: PhotoLibraryPicker
        
        init(_ parent: PhotoLibraryPicker) {
            self.parent = parent
        }
        
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            if let image = info[.originalImage] as? UIImage {
                parent.selectedImage = image
            }
            parent.dismiss()
        }
        
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}