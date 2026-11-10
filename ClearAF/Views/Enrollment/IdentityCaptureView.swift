import SwiftUI
import AVFoundation
import ImageIO
import UniformTypeIdentifiers

enum LaunchIdentityInput {
    static let imageLimit = 1_572_864
    static let multipartLimit = 3_670_016
    static func valid(fullName: String, dateOfBirth: String, physicallyInNC: Bool, readable: Bool, idPhoto: Data?, selfie: Data?, now: Date = .now) -> Bool {
        let name = fullName.trimmingCharacters(in: .whitespacesAndNewlines)
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(identifier: "America/New_York"); formatter.dateFormat = "yyyy-MM-dd"; formatter.isLenient = false
        guard name.count >= 2, name.count <= 100, physicallyInNC, readable,
              let birth = formatter.date(from: dateOfBirth), formatter.string(from: birth) == dateOfBirth,
              birth <= now, let age = formatter.calendar.dateComponents([.year], from: birth, to: now).year, age >= 18,
              let idPhoto, let selfie, !idPhoto.isEmpty, !selfie.isEmpty,
              idPhoto.count <= imageLimit, selfie.count <= imageLimit else { return false }
        return true
    }
    /// Decode to pixels, normalize orientation, and create a new JPEG without source metadata.
    static func jpeg(_ input: Data) throws -> Data {
        guard input.count <= 40 * 1024 * 1024, let source = CGImageSourceCreateWithData(input as CFData, nil),
              let pixels = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 2400] as CFDictionary) else { throw LaunchFailure.invalidData }
        let image = UIImage(cgImage: pixels)
        for quality in [0.9, 0.8, 0.7, 0.6] {
            if let bytes = image.jpegData(compressionQuality: quality), bytes.count <= imageLimit { return bytes }
        }
        throw LaunchFailure.invalidData
    }
    static func multipart(idPhoto: Data, selfie: Data, fullName: String, dateOfBirth: String, physicallyInNC: Bool, revision: Int, boundary: String) throws -> Data {
        guard idPhoto.count <= imageLimit, selfie.count <= imageLimit else { throw LaunchFailure.invalidData }
        var bytes = Data()
        func append(_ value: String) { bytes.append(Data(value.utf8)) }
        for (key, value) in [("fullName", fullName), ("dateOfBirth", dateOfBirth), ("physicallyInNC", physicallyInNC ? "true" : "false"), ("expectedRevision", String(revision))] {
            append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"\r\n\r\n\(value)\r\n")
        }
        for (key, image) in [("idPhoto", idPhoto), ("selfie", selfie)] {
            append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"; filename=\"\(key).jpg\"\r\nContent-Type: image/jpeg\r\n\r\n")
            bytes.append(image); append("\r\n")
        }
        append("--\(boundary)--\r\n")
        guard bytes.count <= multipartLimit else { throw LaunchFailure.invalidData }
        return bytes
    }
}

struct IdentityCaptureView: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @State private var fullName = ""
    @State private var dateOfBirth: Date = Calendar.current.date(byAdding: .year, value: -18, to: .now) ?? .now
    @State private var birthSelected = false
    @State private var inNC = false
    @State private var readable = false
    @State private var idPhoto: Data?
    @State private var selfie: Data?
    @State private var attemptID = UUID()
    @State private var showingIDLibrary = false
    @State private var camera: IdentityCameraKind?
    @State private var error: String?
    @State private var processing = false
    var body: some View {
        LaunchPage(title: repository.catalog?.identityGuidance?.title ?? "Verify your identity") {
            if let guidance = repository.catalog?.identityGuidance {
                if let prompt = guidance.prompt { Text(prompt) }
                else { ForEach(guidance.items.filter { $0.id != "nc_attestation" }, id: \.id) { Text($0.instructions) } }
            } else { Text("Adults 18+ physically in North Carolina. A clinician compares your government photo ID and live selfie. This is a manual review.") }
            TextField("Full legal name", text: $fullName).textContentType(.name).letterpressField(isEmpty: fullName.isEmpty)
            DatePicker("Date of birth", selection: $dateOfBirth, in: ScreeningDates.earliestBirthDate...Date.now, displayedComponents: .date)
                .onChange(of: dateOfBirth) { _, _ in birthSelected = true }
            Toggle("I confirm this is my date of birth.", isOn: $birthSelected).toggleStyle(.letterpressCheck)
            identityImage(idPhoto, title: "Government photo ID")
            HStack {
                Button(idPhoto == nil ? "Choose ID photo" : "Replace ID photo") { showingIDLibrary = true }.buttonStyle(.letterpress(.outlined))
                Button("Photograph ID") { requestCamera(.id) }.buttonStyle(.letterpress(.underline))
            }
            Text("Keep the full name, date of birth and face readable. Your ID is kept separately from your skin photos.").font(Letterpress.ui(13))
            LetterpressRule()
            identityImage(selfie, title: "Live selfie")
            Button(selfie == nil ? "Take a live selfie" : "Retake selfie") { requestCamera(.selfie) }.buttonStyle(.letterpress(.outlined, fullWidth: true))
            Text("Use the camera now, with your face clearly visible. A saved library image cannot be used as your selfie.").font(Letterpress.ui(13))
            Toggle(repository.catalog?.identityGuidance?.attestation ?? "I can read my name and date of birth, and both photos clearly show my face.", isOn: $readable).toggleStyle(.letterpressCheck)
            Toggle("I am physically in North Carolina right now.", isOn: $inNC).toggleStyle(.letterpressCheck)
            if !inNC { Text("You must be physically in North Carolina for this care. If you are elsewhere, seek local care.").font(Letterpress.ui(13)) }
            if let error { Text(error).foregroundStyle(Letterpress.error) }
            if processing { Text("Preparing your photo…") }
            Button(repository.saving ? "Uploading…" : "Upload and continue", action: submit)
                .buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(!canSubmit || repository.saving || processing)
            if !canSubmit { Text("Add both readable photos, confirm your date of birth, and attest your current location to continue. UNZIT is for adults 18+.").font(Letterpress.ui(13)) }
            Button("Open camera settings") { if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) } }.buttonStyle(.letterpress(.underline))
        }
        .sheet(isPresented: $showingIDLibrary) { PhotoLibraryPicker { receive($0, kind: .id) } }
        .fullScreenCover(item: $camera) { kind in IdentityNativeCamera(kind: kind) { receive($0, kind: kind) } }
        .onChange(of: fullName) { _, _ in attemptID = UUID() }
        .onChange(of: dateOfBirth) { _, _ in attemptID = UUID() }
        .onChange(of: inNC) { _, _ in attemptID = UUID() }
        .onChange(of: repository.state?.case.revision) { _, _ in attemptID = UUID() }
        // Identity bytes exist only in this account-bound view state; removal/signout releases them.
        // Do not purge on camera presentation: a full-screen picker may make its presenter disappear.
    }
    private var birthString: String { ScreeningDates.string(from: dateOfBirth) }
    private var canSubmit: Bool { birthSelected && LaunchIdentityInput.valid(fullName: fullName, dateOfBirth: birthString, physicallyInNC: inNC, readable: readable, idPhoto: idPhoto, selfie: selfie) }
    @ViewBuilder private func identityImage(_ bytes: Data?, title: String) -> some View {
        Text(title).font(Letterpress.ui(17, weight: .medium))
        if let bytes, let image = UIImage(data: bytes) {
            Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 280).accessibilityLabel("\(title) preview. Check that it is readable.")
        } else { Text("No photo added").font(Letterpress.ui(13)) }
    }
    private func requestCamera(_ kind: IdentityCameraKind) {
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else { error = "A camera is not available. Use a device with a camera for your live selfie."; return }
        Task { @MainActor in
            let status = AVCaptureDevice.authorizationStatus(for: .video)
            var allowed = status == .authorized
            if status == .notDetermined { allowed = await AVCaptureDevice.requestAccess(for: .video) }
            if allowed { error = nil; camera = kind }
            else { error = "Camera access is off or restricted. Allow access in Settings, then try again." }
        }
    }
    private func receive(_ result: PhotoPickerResult, kind: IdentityCameraKind) {
        guard case .selected(let input) = result else {
            if case .failed = result { error = "This photo could not be opened. Retake it or choose another ID photo." }
            return
        }
        processing = true; readable = false
        Task { @MainActor in
            let bytes = await Task.detached(priority: .userInitiated) { try? LaunchIdentityInput.jpeg(input) }.value
            processing = false
            guard APIService.shared.access.snapshot() == ticket else { return }
            guard let bytes else { error = "The photo could not be prepared within the upload limit. Retake it in good light and check the text and face are sharp."; return }
            attemptID = UUID()
            if kind == .id { idPhoto = bytes } else { selfie = bytes }
            error = nil
        }
    }
    private func submit() {
        guard canSubmit, let idPhoto, let selfie else { return }
        Task {
            if await repository.submitIdentity(id: attemptID, fullName: fullName, dateOfBirth: birthString, physicallyInNC: inNC, idPhoto: idPhoto, selfie: selfie, ticket: ticket) {
                self.idPhoto = nil; self.selfie = nil; readable = false
            }
        }
    }
}
private enum IdentityCameraKind: String, Identifiable { case id, selfie; var id: String { rawValue } }
private struct IdentityNativeCamera: UIViewControllerRepresentable {
    let kind: IdentityCameraKind
    let onResult: (PhotoPickerResult) -> Void
    @Environment(\.dismiss) private var dismiss
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let controller = UIImagePickerController(); controller.sourceType = .camera; controller.cameraCaptureMode = .photo
        if kind == .selfie, UIImagePickerController.isCameraDeviceAvailable(.front) { controller.cameraDevice = .front }
        controller.delegate = context.coordinator; return controller
    }
    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: IdentityNativeCamera
        init(_ parent: IdentityNativeCamera) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            guard let image = info[.originalImage] as? UIImage else { parent.onResult(.failed); parent.dismiss(); return }
            let parent = parent
            Task { @MainActor in
                let bytes = await Task.detached(priority: .userInitiated) { image.jpegData(compressionQuality: 0.95) }.value
                parent.onResult(bytes.map(PhotoPickerResult.selected) ?? .failed); parent.dismiss()
            }
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.onResult(.cancelled); parent.dismiss() }
    }
}
extension LaunchEnrollmentRepository {
    func submitIdentity(id: UUID, fullName: String, dateOfBirth: String, physicallyInNC: Bool, idPhoto: Data, selfie: Data, ticket: AccountAccess.Ticket) async -> Bool {
        guard let current = state else { return false }
        let boundary = "UNZIT-\(UUID().uuidString)"
        do {
            let bytes = try LaunchIdentityInput.multipart(idPhoto: idPhoto, selfie: selfie, fullName: fullName, dateOfBirth: dateOfBirth, physicallyInNC: physicallyInNC, revision: current.case.revision, boundary: boundary)
            return await mutate(LaunchRequest(path: "/enrollment/\(current.case.id.uuidString.lowercased())/identity/\(id.uuidString.lowercased())", method: "PUT", body: bytes, contentType: "multipart/form-data; boundary=\(boundary)"), ticket: ticket)
        } catch { return false }
    }
}
