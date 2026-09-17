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
}
