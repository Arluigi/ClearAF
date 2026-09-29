//
//  PhotoCaptureManager.swift
//  ClearAF
//
//  Created by Aryan Sachdev on 7/17/25.
//

import SwiftUI
import CoreData
import Combine
import AVFoundation
import PhotosUI
import UniformTypeIdentifiers

// MARK: - Photo Capture Manager

enum PhotoCameraAccess {
    enum State: Equatable { case ready, request, denied, restricted, unavailable }
    static func state(available: Bool, authorization: AVAuthorizationStatus) -> State {
        guard available else { return .unavailable }
        switch authorization {
        case .authorized: return .ready
        case .notDetermined: return .request
        case .denied: return .denied
        case .restricted: return .restricted
        @unknown default: return .restricted
        }
    }
}

enum PhotoPickerResult { case selected(Data), cancelled, failed }

/// A provider can finish late or more than once; only its first terminal result is delivered.
@MainActor final class PhotoPickerDelivery {
    private var finished = false
    func finish(_ result: PhotoPickerResult, deliver: (PhotoPickerResult) -> Void) {
        guard !finished else { return }
        finished = true
        deliver(result)
    }
}

struct PhotoCaptureView: View {
    let onPhotoTaken: (Data) -> Void
    let title: String
    let subtitle: String
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingImagePicker = false
    @State private var showingPhotoLibrary = false
    @State private var cameraState: PhotoCameraAccess.State?
    @State private var pickerError: String?
    @State private var requestingAccess = false

    init(title: String = "Take photo", subtitle: String = "Capture a photo", onPhotoTaken: @escaping (Data) -> Void) {
        self.title = title; self.subtitle = subtitle; self.onPhotoTaken = onPhotoTaken
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    Text(title).font(Letterpress.display(34, relativeTo: .largeTitle)).foregroundStyle(Letterpress.ink).multilineTextAlignment(.center)
                    Text(subtitle).foregroundStyle(Letterpress.inkSecondary).multilineTextAlignment(.center)
                    Button(action: requestCamera) {
                        Label("Take photo", systemImage: "camera")
                    }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(requestingAccess)
                    if let cameraState {
                        switch cameraState {
                        case .denied, .restricted:
                            Text(cameraState == .denied
                                 ? "Camera access is off. Allow camera access in Settings, or choose a photo from your library."
                                 : "Camera access is restricted on this device. Check Settings, or choose a photo from your library.")
                                .accessibilityIdentifier("cameraPermissionMessage")
                            Button("Open Settings") {
                                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                            }.buttonStyle(.letterpress(.outlined))
                        case .unavailable:
                            Text("A camera is not available on this device. You can choose a photo from your library.")
                                .accessibilityIdentifier("cameraUnavailableMessage")
                        default: EmptyView()
                        }
                    }
                    Button { pickerError = nil; showingPhotoLibrary = true } label: {
                        Label("Choose from library", systemImage: "photo.on.rectangle")
                    }.buttonStyle(.letterpress(.outlined, fullWidth: true))
                    if let pickerError { Text(pickerError).foregroundStyle(Letterpress.inkSecondary).accessibilityIdentifier("photoPickerError") }
                }.padding(24)
            }
            .navigationTitle("Camera").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .sheet(isPresented: $showingImagePicker) { CameraImagePicker(onResult: receive) }
        .sheet(isPresented: $showingPhotoLibrary) { PhotoLibraryPicker(onResult: receive) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && cameraState != nil {
                cameraState = PhotoCameraAccess.state(available: UIImagePickerController.isSourceTypeAvailable(.camera),
                                                      authorization: AVCaptureDevice.authorizationStatus(for: .video))
            }
        }
    }

    private func requestCamera() {
        pickerError = nil
        let state = PhotoCameraAccess.state(available: UIImagePickerController.isSourceTypeAvailable(.camera),
                                            authorization: AVCaptureDevice.authorizationStatus(for: .video))
        cameraState = state
        if state == .ready { showingImagePicker = true }
        if state == .request {
            requestingAccess = true
            Task { @MainActor in
                let allowed = await AVCaptureDevice.requestAccess(for: .video)
                requestingAccess = false
                cameraState = allowed ? .ready : .denied
                if allowed { showingImagePicker = true }
            }
        }
    }

    private func receive(_ result: PhotoPickerResult) {
        switch result {
        case .selected(let bytes): pickerError = nil; onPhotoTaken(bytes)
        case .cancelled: break
        case .failed: pickerError = "This photo could not be opened. Please choose another photo."
        }
    }
}

// Every retained entry point uses the same durable account-bound capture. The picked photo is reviewed first;
// Save to record commits it on the device and the existing upload worker shares it.
struct DurablePhotoCaptureView: View {
    var onSaved: (SkinPhoto) throws -> Void = { _ in }
    /// Called once the photo is saved to the record, just before the sheet dismisses itself.
    var didSave: () -> Void = {}
    @Environment(\.dismiss) private var dismiss
    @State private var errorMessage: String?
    @State private var attachmentFailed = false
    @State private var session = PhotoCaptureSession()
    @State private var captureTicket = APIService.shared.access.snapshot()
    @State private var review = PhotoReviewFlow()
    @State private var saving = false

    var body: some View {
        Group {
            if review.draft != nil {
                PhotoReviewSheet(
                    draft: Binding(get: { review.draft ?? PhotoReviewDraft(bytes: Data(), capturedAt: Date()) }, set: { review.draft = $0 }),
                    saving: saving,
                    onRetake: { review.retake() },
                    onDiscard: { review.draft = nil; dismiss() },
                    onSave: { Task { await save() } })
            } else {
                PhotoCaptureView(title: "Add a dated photo", subtitle: "Your photo is saved on this device, then shared with your care team.") { bytes in
                    review.receive(bytes, capturedAt: Date())
                }
            }
        }
        // An unsaved photo is never dropped by a swipe; Discard asks first.
        .interactiveDismissDisabled(review.draft != nil)
        .letterpressSheetBackground()
        .alert(attachmentFailed ? "Photo saved" : "Unable to save photo",
               isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { finishAlert() } })) {
            Button(attachmentFailed ? "Done" : "OK") { finishAlert() }
        } message: { Text(errorMessage ?? "") }
        // Success is played by the presenter (`photoCaptureSheet`), which stays on screen; this sheet is leaving.
        // A photo kept in Photos but not attached here is not a failed save.
        .sensoryFeedback(.error, trigger: errorMessage) { _, new in new != nil && !attachmentFailed }
    }

    /// Re-entry is refused while a save is in flight (`saving` is set before the first suspension), so a double
    /// tap saves once. The one-frame pause lets "Saving…" draw before the synchronous write to the device store
    /// (a bare `Task.yield()` can resume before the frame is committed).
    private func save() async {
        guard let draft = review.draft, draft.canSave, !saving else { return }
        saving = true
        defer { saving = false }
        try? await Task.sleep(for: .milliseconds(16))
        do {
            let completion = try session.capture(draft.bytes, date: draft.capturedAt, notes: draft.trimmedNote,
                repository: APIService.shared.photos, ticket: captureTicket, onSaved: onSaved)
            if completion == .saved {
                didSave()
                dismiss()
            } else {
                attachmentFailed = true
                errorMessage = "Your photo is saved in Photos, but could not be attached here."
            }
        } catch {
            // The draft stays on screen so Save repeats the same action.
            attachmentFailed = false
            errorMessage = error.localizedDescription
        }
    }

    private func finishAlert() {
        errorMessage = nil
        // Attachment failure does not invite another capture: the durable photo already exists.
        if attachmentFailed { dismiss() }
    }
}

extension View {
    /// Presents the durable capture sheet. The success haptic is played here, on the presenter that stays on screen,
    /// because the sheet dismisses itself in the same update that saves the photo.
    func photoCaptureSheet(isPresented: Binding<Bool>, onDismiss: (() -> Void)? = nil) -> some View {
        modifier(PhotoCaptureSheet(isPresented: isPresented, onDismiss: onDismiss))
    }
}

private struct PhotoCaptureSheet: ViewModifier {
    @Binding var isPresented: Bool
    let onDismiss: (() -> Void)?
    @State private var saves = 0

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: $isPresented, onDismiss: onDismiss) { DurablePhotoCaptureView(didSave: { saves += 1 }) }
            .sensoryFeedback(.success, trigger: saves)
    }
}

// The camera picker is presented only after availability and authorization checks.
struct CameraImagePicker: UIViewControllerRepresentable {
    let onResult: (PhotoPickerResult) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.delegate = context.coordinator; picker.sourceType = .camera; picker.cameraCaptureMode = .photo
        return picker
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraImagePicker
        let delivery = PhotoPickerDelivery()
        init(_ parent: CameraImagePicker) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            let image = info[.originalImage] as? UIImage
            let (delivery, parent) = (delivery, parent)
            Task { @MainActor in
                // JPEG encoding a full camera frame takes long enough to hitch the UI, so it runs off the main thread,
                // as the library path's does. The delivery still finishes only once.
                let bytes = await Task.detached(priority: .userInitiated) { image?.jpegData(compressionQuality: 0.8) }.value
                delivery.finish(bytes.map(PhotoPickerResult.selected) ?? .failed, deliver: parent.onResult)
                parent.dismiss()
            }
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            delivery.finish(.cancelled, deliver: parent.onResult); parent.dismiss()
        }
    }
}

/// PHPicker grants access to one selected image, without library-wide authorization.
struct PhotoLibraryPicker: UIViewControllerRepresentable {
    let onResult: (PhotoPickerResult) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeUIViewController(context: Context) -> PHPickerViewController {
        var configuration = PHPickerConfiguration()
        configuration.filter = .images; configuration.selectionLimit = 1
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ controller: PHPickerViewController, context: Context) {}
    static func dismantleUIViewController(_ controller: PHPickerViewController, coordinator: Coordinator) {
        // Interactive dismissal also invalidates a provider that is still decoding.
        coordinator.delivery.finish(.cancelled, deliver: coordinator.parent.onResult)
    }
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let parent: PhotoLibraryPicker
        let delivery = PhotoPickerDelivery()
        private var started = false
        init(_ parent: PhotoLibraryPicker) { self.parent = parent }
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard let provider = results.first?.itemProvider else {
                delivery.finish(.cancelled, deliver: parent.onResult); parent.dismiss(); return
            }
            load(provider: provider)
        }
        // Shared production conversion entry point, also exercised with real test providers.
        func load(provider: NSItemProvider) {
            guard !started else { return }; started = true
            provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { [self] bytes, error in
                // Decode and JPEG encode off the main thread. Upload representation stays unchanged.
                let jpeg = error == nil ? bytes.flatMap { UIImage(data: $0)?.jpegData(compressionQuality: 0.8) } : nil
                Task { @MainActor in
                    delivery.finish(jpeg.map(PhotoPickerResult.selected) ?? .failed, deliver: parent.onResult)
                    parent.dismiss()
                }
            }
        }
    }
}

/// The capture sheet's review state: the draft on screen, and the note kept across a retake so typed text survives it.
struct PhotoReviewFlow: Equatable {
    var draft: PhotoReviewDraft?
    private(set) var keptNote = ""

    mutating func receive(_ bytes: Data, capturedAt: Date) {
        draft = PhotoReviewDraft(bytes: bytes, capturedAt: capturedAt, note: keptNote)
        keptNote = ""
    }

    mutating func retake() {
        keptNote = draft?.note ?? ""
        draft = nil
    }
}

/// One picker presentation owns one durable capture, even if attaching it fails.
@MainActor final class PhotoCaptureSession {
    enum Completion: Equatable { case saved, savedWithoutAttachment }
    private(set) var photo: SkinPhoto?
    private var completion = Completion.savedWithoutAttachment

    func capture(_ bytes: Data, date: Date = Date(), notes: String = "", repository: PhotoRepository,
                 ticket: AccountAccess.Ticket?, onSaved: (SkinPhoto) throws -> Void) throws -> Completion {
        guard photo == nil else { return completion }
        let photo = try repository.capture(bytes, date: date, notes: notes, ticket: ticket)
        self.photo = photo
        do {
            try onSaved(photo)
            completion = .saved
        } catch {
            completion = .savedWithoutAttachment
        }
        return completion
    }
}
