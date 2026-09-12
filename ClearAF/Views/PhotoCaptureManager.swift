//
//  PhotoCaptureManager.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/17/25.
//

import SwiftUI
import CoreData
import Combine

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
                            if UIImagePickerController.isSourceTypeAvailable(.camera) { showingImagePicker = true } else { showingPhotoLibrary = true }
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

// Every retained entry point uses the same durable account-bound capture.
struct DurablePhotoCaptureView: View {
    var onSaved: (SkinPhoto) throws -> Void = { _ in }
    @Environment(\.dismiss) private var dismiss
    @State private var errorMessage: String?
    @State private var captureTicket = APIService.shared.access.snapshot()
    var body: some View {
        PhotoCaptureView(title: "Track Your Progress", subtitle: "Your photo is saved on this device, then shared with your care team.") { bytes in
            do {
                let photo = try APIService.shared.photos.capture(bytes, ticket: captureTicket)
                try onSaved(photo)
                HapticManager.success()
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        .alert("Unable to save photo", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: { Text(errorMessage ?? "") }
    }
}

struct DailyPhotoCaptureView: View {
    var body: some View { DurablePhotoCaptureView() }
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