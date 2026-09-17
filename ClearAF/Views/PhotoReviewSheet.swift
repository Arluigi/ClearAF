import SwiftUI
import UIKit

/// A picked photo that has not been saved yet.
struct PhotoReviewDraft: Equatable {
    static let noteLimit = 10_000
    let bytes: Data
    let capturedAt: Date
    var note = ""

    var trimmedNote: String { note.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Mirrors `PhotoRepository`'s notes validation so the problem is named before Save, with the text kept.
    var noteProblem: String? {
        trimmedNote.utf16.count > Self.noteLimit ? "Shorten the note to 10,000 characters or fewer. Your text is kept." : nil
    }

    var canSave: Bool { noteProblem == nil }
}

enum PhotoReviewCopy {
    static let noteLabel = "Note for this photo · optional"
    static let notePlaceholder = "For example: chin is drier than last week"
    static let afterSave = "Saved on this device first, then shared with your care team, note included. You'll see “Waiting to share” until it lands."
    static func saveLabel(saving: Bool) -> String { saving ? "Saving…" : "Save to record" }
}

/// The sheet the native camera or library picker returns to (spec §6 #4). Nothing is saved until Save to record.
struct PhotoReviewSheet: View {
    @Binding var draft: PhotoReviewDraft
    let saving: Bool
    let onRetake: () -> Void
    let onDiscard: () -> Void
    let onSave: () -> Void
    @State private var images = PhotoImageLoader()
    @State private var confirmingDiscard = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(LetterpressFormat.stampYearTime(draft.capturedAt))
                            .font(Letterpress.data(12, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.ink)
                        Spacer(minLength: Letterpress.Space.s10)
                        Button("Retake", action: onRetake)
                            .buttonStyle(.letterpress(.underline))
                            .disabled(saving)
                    }
                    preview
                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                        Text(PhotoReviewCopy.noteLabel).letterpressEyebrow()
                        TextField(PhotoReviewCopy.notePlaceholder, text: $draft.note, axis: .vertical)
                            .lineLimit(1...6)
                            .letterpressField(isEmpty: draft.note.isEmpty)
                            .disabled(saving)
                            .accessibilityIdentifier("photoReviewNote")
                        if let problem = draft.noteProblem {
                            Text(problem)
                                .font(Letterpress.ui(13, relativeTo: .footnote))
                                .foregroundStyle(Letterpress.error)
                        }
                    }
                    Button(PhotoReviewCopy.saveLabel(saving: saving), action: onSave)
                        .buttonStyle(.letterpress(.filled, fullWidth: true))
                        .disabled(saving || !draft.canSave)
                        .accessibilityIdentifier("photoReviewSave")
                    Text(PhotoReviewCopy.afterSave)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(Letterpress.Space.s22)
            }
            .navigationTitle("Review photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Discard") { confirmingDiscard = true }.disabled(saving)
                }
            }
            .confirmationDialog("Discard this photo?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                Button("Discard photo", role: .destructive, action: onDiscard)
                Button("Keep reviewing", role: .cancel) {}
            } message: {
                Text("It hasn't been saved to your record.")
            }
            .onDisappear { images.clear() }
        }
    }

    private var preview: some View {
        Rectangle()
            .fill(Letterpress.sunk)
            .aspectRatio(4 / 5, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .overlay {
                if let image = images.image(data: draft.bytes, key: "review-\(draft.capturedAt.timeIntervalSince1970)", maxPixelSize: 1600) {
                    Image(uiImage: image).resizable().scaledToFit()
                }
            }
            .overlay { Rectangle().strokeBorder(Letterpress.ink, lineWidth: 1.5) }
            .accessibilityElement()
            .accessibilityLabel("Photo to review, not saved yet")
            .accessibilityAddTraits(.isImage)
    }
}
