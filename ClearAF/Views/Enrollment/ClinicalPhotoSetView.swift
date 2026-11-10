import SwiftUI

extension LaunchPhotoSlot: Identifiable {
    var id: String { rawValue }
    var title: String {
        switch self { case .front: "Front"; case .left: "Left side"; case .right: "Right side"; case .chest: "Chest"; case .back: "Back"; case .closeUp: "Close-up" }
    }
}

/// Reused for enrollment and scheduled check-ins. All completion comes from acknowledged API associations.
struct ClinicalPhotoSetView: View {
    @ObservedObject var repository: LaunchPhotoSetRepository
    let ticket: AccountAccess.Ticket
    let targetId: UUID
    let purpose: LaunchPhotoSet.Purpose
    let requiredSlots: [LaunchPhotoSlot]
    var serverSet: LaunchPhotoSet? = nil
    var guidance: LaunchPhotoGuidance? = nil
    var onContinue: (LaunchPhotoSet) -> Void = { _ in }
    @State private var capturing: LaunchPhotoSlot?
    @State private var review: PhotoReviewDraft?
    @State private var localError: String?
    @State private var preparing = false
    var body: some View {
        LaunchPage(title: guidance?.title ?? "Your clinical photos") {
            if let guidance { ForEach(guidance.instructions, id: \.self) { Text($0) } }
            else { Text("Use daylight, no filters and no makeup. Move hair away from your face. Take a front view, then each side in the same light.") }
            if guidance == nil && (repository.requiredSlots.contains(.chest) || repository.requiredSlots.contains(.back)) {
                Text("Include the affected chest or back. Chest photos should show the area above the breasts. You may cover private areas or crop the photo before choosing it.")
            }
            Text("Zoom in and check it is sharp. These photos are shared with your clinician as a set.").font(Letterpress.ui(13))
            ForEach(LaunchPhotoSlot.allCases.filter { repository.requiredSlots.contains($0) || $0 == .closeUp }) { slot in
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    HStack {
                        Text(guidance?.slots.first(where: { $0.id == slot.rawValue })?.label ?? (slot.title + (slot == .closeUp ? " · optional" : "" ))).font(Letterpress.ui(17, weight: .medium))
                        Spacer()
                        Text(repository.acknowledgedSlots.contains(slot) ? "Shared" : repository.entries.contains(where: { $0.slot == slot }) ? "Waiting to share" : "Not added").font(Letterpress.data(12))
                    }
                    if let entry = repository.entries.first(where: { $0.slot == slot }), let image = UIImage(data: entry.bytes) {
                        Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 200).accessibilityLabel("\(slot.title) photo preview")
                    }
                    if !repository.isReadOnly {
                        HStack {
                            Button(repository.entries.contains(where: { $0.slot == slot }) ? "Retake" : "Add photo") {
                                review = nil
                                if repository.entries.contains(where: { $0.slot == slot }) {
                                    Task { if await repository.retake(slot, ticket: ticket) { capturing = slot } }
                                } else { capturing = slot }
                            }.buttonStyle(.letterpress(.outlined)).disabled(repository.saving)
                            if repository.entries.contains(where: { $0.slot == slot }), !repository.acknowledgedSlots.contains(slot) {
                                Button("Retry sharing") { Task { _ = await repository.upload(slot, ticket: ticket) } }.buttonStyle(.letterpress(.underline)).disabled(repository.saving)
                            }
                        }
                    }
                    LetterpressRule()
                }
            }
            Button(repository.saving ? "Sharing…" : "Continue") { if let set = repository.photoSet { onContinue(set) } }
                .buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(!repository.isComplete || repository.saving)
            if !repository.isComplete { Text("Share every required angle before continuing. A photo saved only on this device is not yet part of your clinical photo set.").font(Letterpress.ui(13)) }
            if let error = localError ?? repository.error { Text(error).foregroundStyle(Letterpress.error) }
            if repository.error != nil || repository.associationNeedsRetry, !repository.isReadOnly {
                Button("Retry photo set update") { Task { _ = await repository.retryAssociation(ticket: ticket) } }.buttonStyle(.letterpress(.outlined, fullWidth: true)).disabled(repository.saving)
            }
        }
        .onAppear { resume() }
        .onChange(of: serverSet) { _, _ in resume() }
        .onChange(of: requiredSlots) { _, _ in resume() }
        .sheet(item: $capturing, onDismiss: { review = nil }) { slot in
            Group {
                if review != nil {
                    PhotoReviewSheet(draft: Binding(get: { review ?? .init(bytes: Data(), capturedAt: .now) }, set: { review = $0 }), saving: preparing || repository.saving, onRetake: { review = nil }, onDiscard: { review = nil; capturing = nil }, onSave: { share(slot) }, launchSlot: slot)
                } else {
                    PhotoCaptureView(title: slot.title + " photo", subtitle: "Use daylight and check that the image is sharp.") { bytes in review = .init(bytes: bytes, capturedAt: .now) }
                }
            }.interactiveDismissDisabled(review != nil || repository.saving).letterpressSheetBackground()
                .safeAreaInset(edge: .bottom) { if let localError { Text(localError).font(Letterpress.ui(13)).foregroundStyle(Letterpress.error).padding().background(Letterpress.canvas) } }
        }
    }
    private func resume() {
        do { try repository.resume(ticket: ticket, targetId: targetId, purpose: purpose, requiredSlots: requiredSlots, serverSet: serverSet) }
        catch { localError = "Your photo set could not be opened. Refresh and try again." }
    }
    private func share(_ slot: LaunchPhotoSlot) {
        guard let review, !preparing else { return }
        preparing = true
        do { try repository.stage(review.bytes, slot: slot, date: review.capturedAt, ticket: ticket) }
        catch { localError = "The photo could not be prepared within the upload limit. Retake it in good light, using a different photo for each angle."; preparing = false; return }
        localError = nil
        Task {
            _ = await repository.upload(slot, ticket: ticket)
            preparing = false; self.review = nil; capturing = nil
        }
    }
}

struct EnrollmentClinicalPhotosView: View {
    @ObservedObject var enrollment: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @StateObject private var photos: LaunchPhotoSetRepository
    init(enrollment: LaunchEnrollmentRepository, ticket: AccountAccess.Ticket) {
        self.enrollment = enrollment; self.ticket = ticket
        _photos = StateObject(wrappedValue: LaunchPhotoSetRepository(access: APIService.shared.access, transport: APIService.shared))
    }
    var body: some View {
        if let state = enrollment.state {
            ClinicalPhotoSetView(repository: photos, ticket: ticket, targetId: state.case.id, purpose: .enrollment, requiredSlots: state.case.intakeV2?.evaluation.requiredPhotoSlots ?? LaunchPhotoRules.required(sites: state.case.medicalHistory.M6 ?? []), serverSet: correctionSet(state), guidance: enrollment.catalog?.photoGuidance) { _ in
                Task { _ = await enrollment.refresh(ticket: ticket) }
            }
        }
    }
    private func correctionSet(_ state: LaunchEnrollmentResponse) -> LaunchPhotoSet? {
        guard let set = state.case.photoSet else { return nil }
        guard state.case.status == .needsChanges, set.status == .submitted || set.status == .reviewed else { return set }
        // Opening the correction editor creates a new draft and preserves the submitted set.
        return .init(id: set.id, purpose: set.purpose, status: .needsChanges, requiredSlots: set.requiredSlots, items: set.items)
    }
}
