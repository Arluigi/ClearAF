#if DEBUG
import SwiftUI

/// Offline inspection of the actual capture components. No camera, account, or upload is fabricated as successful.
enum CaptureReviewMockContent {
    // Exact snapshot of backend/src/content/catalogs/2.2-pending-review.json capture fields.
    // Kept in Swift so the fixture is compiled out of Release, including its content.
    static let guidance = try! JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
    static let json = #"""
{
  "photoGuidance": {
    "title": "Photos",
    "instructions": [
      "Photos are how your doctor examines your skin. Take them in daylight, facing a window if you can, with no makeup, no filters, and your hair pulled back. Check that each photo is sharp before you send it. Your doctor may ask for new photos if these are not clear enough; your case pauses until good photos arrive.",
      "Never send photos of the genital area or breasts. Chest photos must be above the breasts. You may cover or crop anything you choose.",
      "UNZIT treats acne only. We cannot check moles or spots. If you have a spot that is new, changing, bleeding, or not healing, please have it checked in person promptly, even if you are joining UNZIT for your acne."
    ],
    "slots": [
      {
        "id": "front",
        "label": "Front of your face (required)",
        "required": true,
        "requiredWhen": null
      },
      {
        "id": "left",
        "label": "Left side of your face (required)",
        "required": true,
        "requiredWhen": null
      },
      {
        "id": "right",
        "label": "Right side of your face (required)",
        "required": true,
        "requiredWhen": null
      },
      {
        "id": "chest",
        "label": "Chest, above the breasts (required because you told us your acne is on your chest)",
        "required": false,
        "requiredWhen": {
          "questionId": "B8",
          "value": "chest"
        }
      },
      {
        "id": "back",
        "label": "Back (required because you told us your acne is on your back)",
        "required": false,
        "requiredWhen": {
          "questionId": "B8",
          "value": "back"
        }
      },
      {
        "id": "close_up",
        "label": "Close-up of dark marks left by acne (optional)",
        "required": false,
        "requiredWhen": null
      }
    ],
    "copy": {
      "setReviewHint": "Zoom in and check it is sharp. These photos are shared with your clinician as a set.",
      "completionHint": "Add all required photos to continue. Photos aren’t sent to your doctor until you tap Share.",
      "reviewAdvice": "Check the angle, lighting and focus before sharing. Retake a blurred photo.",
      "zoomLabel": "Zoom in and check that each photo is sharp.",
      "afterSave": "This photo is saved privately and will be sent to your doctor when you share your photo set.",
      "discardMessage": "Discard this photo? It hasn’t been sent to your doctor.",
      "prepareFailure": "We couldn’t upload this photo. Retake it in good light, and use a separate photo for each angle.",
      "safetyTitle": "Having a problem?",
      "safetyMessage": "If this is an emergency, call 911. For a reaction to a UNZIT medicine, stop it and message your doctor in the app."
    }
  },
  "identityGuidance": {
    "title": "Verify your identity",
    "items": [
      {
        "id": "government_id",
        "required": true,
        "instructions": "Upload a government photo ID: driver license, state ID or passport. Your name and date of birth must match your account. You must be 18 or older."
      },
      {
        "id": "selfie",
        "required": true,
        "instructions": "Take a live selfie. Your selfie must match the photo on your ID. Your doctor reviews your identity before care."
      },
      {
        "id": "nc_attestation",
        "required": true,
        "instructions": "I am physically in North Carolina right now."
      }
    ],
    "prompt": "Verify your identity. Upload a government photo ID (driver license, state ID, or passport). Your name and date of birth must match your account. Then take a live selfie. Your selfie must match the photo on your ID. Your doctor checks your identity before any treatment.",
    "attestation": "This ID is mine, and the selfie is really me.",
    "copy": {
      "fullNameLabel": "Full legal name",
      "dateOfBirthLabel": "Date of birth",
      "birthConfirmation": "I confirm this is my date of birth.",
      "idTitle": "Government photo ID",
      "selfieTitle": "Live selfie",
      "idInstructions": "Keep the full name, date of birth and face readable. Your ID is kept separately from your skin photos.",
      "selfieInstructions": "Use the camera now, with your face clearly visible. A saved library image cannot be used as your selfie.",
      "ncWarning": "UNZIT can only treat you while you are physically in North Carolina. If you are somewhere else right now, please get care where you are.",
      "completionHint": "To continue, add a clear photo of your ID and a selfie, confirm your date of birth and confirm you’re in North Carolina. UNZIT is for adults 18 and older.",
      "idPreviewLabel": "Government photo ID preview. Check that it is readable.",
      "selfiePreviewLabel": "Live selfie preview. Check that it is readable.",
      "prepareFailure": "We couldn’t upload this photo. Retake it in good light and make sure the text and your face are sharp.",
      "safetyTitle": "Having a problem?",
      "safetyMessage": "If this is an emergency, call 911. For a reaction to a UNZIT medicine, stop it and message your doctor in the app."
    }
  }
}
"""#
    @MainActor static func image(label: String) -> Data {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 600, height: 400))
        return renderer.jpegData(withCompressionQuality: 0.9) { context in
            UIColor(Letterpress.canvas).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 600, height: 400))
            ("SYNTHETIC REVIEW FIXTURE\n" + label + "\nNo patient photo or identity document")
                .draw(in: CGRect(x: 35, y: 140, width: 530, height: 200), withAttributes: [
                    .font: UIFont.systemFont(ofSize: 26), .foregroundColor: UIColor(Letterpress.ink)])
        }
    }
}

struct CaptureReviewMockScreen: View {
    let route: LaunchMockRoute
    @ObservedObject var session: LaunchMockSession
    @State private var draft = PhotoReviewDraft(bytes: CaptureReviewMockContent.image(label: "Clinical photo"), capturedAt: Date(timeIntervalSince1970: 1794225600))
    @State private var retaking = false
    private let slots: [LaunchPhotoSlot] = [.front, .left, .right, .chest, .back]
    var body: some View {
        if route == .captureIdentity || route == .captureIdentityReview {
            IdentityCaptureView(repository: session.enrollment, ticket: session.ticket, mockReview: route == .captureIdentityReview)
        } else if let slot = route.captureSlot {
            if route.rawValue.hasPrefix("review-") && !retaking {
                PhotoReviewSheet(draft: $draft, saving: false, onRetake: { retaking = true }, onDiscard: {}, onSave: {}, launchSlot: slot, guidance: session.enrollment.catalog?.photoGuidance, mockAccess: session.access)
            } else {
                PhotoCaptureView(title: session.enrollment.catalog?.photoGuidance?.captureTitle(slot) ?? slot.title + " photo", subtitle: session.enrollment.catalog?.photoGuidance?.captureInstructions ?? "Use daylight and check that the image is sharp.") { bytes in
                    draft = .init(bytes: bytes, capturedAt: .now)
                    retaking = false
                }
            }
        } else {
            // Same catalog-backed shared component as enrollment and check-in.
            ClinicalPhotoSetView(repository: session.photos, ticket: session.ticket, targetId: session.enrollment.state!.case.id,
                purpose: route == .captureCheckIn ? .checkIn : .enrollment, requiredSlots: slots,
                guidance: session.enrollment.catalog?.photoGuidance)
                .task {
                    if route == .captureRetake {
                        do {
                            try session.photos.resume(ticket: session.ticket, targetId: session.enrollment.state!.case.id, purpose: .enrollment, requiredSlots: slots)
                            try session.photos.stage(CaptureReviewMockContent.image(label: "Front - awaiting sharing"), slot: .front, ticket: session.ticket)
                        } catch { assertionFailure("Invalid synthetic capture fixture: \(error)") }
                    }
                }
        }
    }
}
#endif
