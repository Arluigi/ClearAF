import Foundation
import Testing
@testable import ClearAF

struct NotesPresentationTests {
    static let utc = TimeZone(identifier: "UTC")!
    static let us = Locale(identifier: "en_US")

    private func message(_ sender: String, sentAt: String = "2026-09-14T16:12:00.000Z") -> AssignedMessage {
        let patient = UUID(), clinician = UUID()
        return AssignedMessage(id: UUID(), patientId: patient, clinicianId: clinician,
                               senderId: sender == "patient" ? patient : clinician, senderType: sender,
                               recipientId: sender == "patient" ? clinician : patient,
                               recipientType: sender == "patient" ? "dermatologist" : "patient",
                               content: "Synthetic", sentAt: sentAt, unreadForMe: false, reference: nil, origin: "native")
    }

    @Test func stampsAreMonoWithTheRealClinicianName() {
        #expect(NotesCopy.stamp(message("dermatologist"), clinicianName: "Synthetic Clinician", locale: Self.us, timeZone: Self.utc)
                == "14 SEP · 16:12 · SYNTHETIC CLINICIAN")
        #expect(NotesCopy.stamp(message("patient"), clinicianName: "Synthetic Clinician", locale: Self.us, timeZone: Self.utc)
                == "14 SEP · 16:12 · YOU")
    }

    @Test func referencesAreLabelledInWords() {
        let labelled = MessageReference(type: "photo", id: UUID(), available: true, label: "Friday photo", occurredAt: nil)
        let dated = MessageReference(type: "photo", id: UUID(), available: true, label: nil, occurredAt: "2026-09-12T08:00:00.000Z")
        let routine = MessageReference(type: "routineRevision", id: UUID(), available: true, label: nil, occurredAt: nil)
        #expect(NotesCopy.referenceTitle(labelled, locale: Self.us, timeZone: Self.utc) == "Friday photo")
        #expect(NotesCopy.referenceTitle(dated, locale: Self.us, timeZone: Self.utc) == "Photo · 12 Sep")
        #expect(NotesCopy.referenceTitle(routine, locale: Self.us, timeZone: Self.utc) == "Routine feedback")
        #expect(NotesCopy.referenceMeta(clinicianName: "Synthetic Clinician") == "Referenced by Synthetic Clinician")
    }

    @Test func composerCopyCoversEachState() {
        #expect(NotesCopy.count(0) == "0 / 4000")
        #expect(NotesCopy.sendLabel(sending: false, attempted: false) == "Send")
        #expect(NotesCopy.sendLabel(sending: true, attempted: true) == "Sending…")
        #expect(NotesCopy.sendLabel(sending: false, attempted: true) == "Retry message")
        #expect(NotesCopy.unreadHeader(0) == nil)
        #expect(NotesCopy.unreadHeader(2) == "2 unread")
        #expect(NotesCopy.emergency == "Not for emergencies. Use Something's wrong? on Today.")
    }
}
