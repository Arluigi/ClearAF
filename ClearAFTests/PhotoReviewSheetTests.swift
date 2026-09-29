import Foundation
import Testing
@testable import ClearAF

struct PhotoReviewSheetTests {
    @Test func noteIsOptionalTrimmedAndBoundedWithoutLosingText() {
        var draft = PhotoReviewDraft(bytes: Data([0xff, 0xd8, 0xff]), capturedAt: Date(timeIntervalSince1970: 0))
        #expect(draft.canSave)
        #expect(draft.trimmedNote == "")
        draft.note = "  Jaw looks calmer \n"
        #expect(draft.trimmedNote == "Jaw looks calmer")
        draft.note = String(repeating: "a", count: PhotoReviewDraft.noteLimit + 1)
        #expect(!draft.canSave)
        #expect(draft.noteProblem == "Shorten the note to 10,000 characters or fewer. Your text is kept.")
        #expect(draft.note.count == PhotoReviewDraft.noteLimit + 1)
    }

    @Test func copySaysWhatSavingDoes() {
        #expect(PhotoReviewCopy.saveLabel(saving: false) == "Save to record")
        #expect(PhotoReviewCopy.saveLabel(saving: true) == "Saving…")
        #expect(PhotoReviewCopy.noteLabel == "Note for this photo · optional")
        #expect(PhotoReviewCopy.afterSave == "Saved on this device first, then shared with your care team, note included. You'll see “Waiting to share” until it lands.")
    }

    @Test func retakeKeepsTheTypedNoteForTheNextPhoto() {
        var flow = PhotoReviewFlow()
        flow.receive(Data([1]), capturedAt: Date(timeIntervalSince1970: 0))
        #expect(flow.draft?.note == "")
        flow.draft?.note = "Chin is drier"
        flow.retake()
        #expect(flow.draft == nil && flow.keptNote == "Chin is drier")
        flow.receive(Data([2]), capturedAt: Date(timeIntervalSince1970: 60))
        #expect(flow.draft == PhotoReviewDraft(bytes: Data([2]), capturedAt: Date(timeIntervalSince1970: 60), note: "Chin is drier"))
        #expect(flow.keptNote == "", "the note moves to the new draft, it is not kept twice")
    }

    @Test func aWholePhotoIsNamedByItsDay() {
        let utc = TimeZone(identifier: "UTC")!, gb = Locale(identifier: "en_GB")
        let date = Date(timeIntervalSince1970: 1_790_553_600) // 28 Sep 2026
        #expect(PhotoLabel.photo(date, locale: gb, timeZone: utc) == "Photo, \(LetterpressFormat.dayMonthYear(date, locale: gb, timeZone: utc))")
        #expect(PhotoLabel.photo(nil) == "Photo")
    }

    /// Design audit C5: Save draws "Saving…" before writing and can't double-submit; the camera encodes off main;
    /// a share that can't start says so in place.
    @Test func captureSavesVisiblyAndShareFailsInPlace() throws {
        let views = LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views")
        let capture = try String(contentsOf: views.appendingPathComponent("PhotoCaptureManager.swift"), encoding: .utf8)
        #expect(capture.contains("onSave: { Task { await save() } }"))
        #expect(capture.contains("private func save() async {\n        guard let draft = review.draft, draft.canSave, !saving else { return }\n        saving = true\n        defer { saving = false }\n        try? await Task.sleep(for: .milliseconds(16))"))
        let save = try #require(capture.range(of: "private func save() async {"))
        let saveBody = capture[save.upperBound...].prefix(900)
        let didSave = try #require(saveBody.range(of: "didSave()")), dismiss = try #require(saveBody.range(of: "dismiss()"))
        #expect(didSave.lowerBound < dismiss.lowerBound, "the presenter's success haptic is armed before the sheet leaves")
        #expect(capture.contains("onRetake: { review.retake() }"))
        #expect(capture.contains("await Task.detached(priority: .userInitiated) { image?.jpegData(compressionQuality: 0.8) }.value"))
        let progress = try String(contentsOf: views.appendingPathComponent("ProgressView.swift"), encoding: .utf8)
        #expect(!progress.contains("Unable to share photo") && !progress.contains(".alert("), "no share alert")
        #expect(progress.contains("Text(PhotoTileState.shareFailed)") && progress.contains("Button(shareFailed ? \"Retry\" : action)"))
        #expect(PhotoTileState.shareFailed == "Couldn't share. Your photo is safe on this device.")
        #expect(progress.contains("label: PhotoLabel.photo(photo.captureDate)"))
        let review = try String(contentsOf: views.appendingPathComponent("PhotoReviewSheet.swift"), encoding: .utf8)
        #expect(review.contains(".accessibilityLabel(PhotoLabel.photo(draft.capturedAt))"))
    }
}
