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
        #expect(NotesCopy.referenceMeta(clinicianName: "Synthetic Clinician", fromPatient: false) == "Referenced by Synthetic Clinician")
        // A patient's own turn references the record from the patient's side, not the clinician's.
        #expect(NotesCopy.referenceMeta(clinicianName: "Synthetic Clinician", fromPatient: true) == "You referenced this")
    }

    @Test func composerCopyCoversEachState() {
        #expect(NotesCopy.count(0) == "0 / 4000")
        #expect(NotesCopy.sendLabel(sending: false, attempted: false) == "Send")
        #expect(NotesCopy.sendLabel(sending: true, attempted: true) == "Sending…")
        #expect(NotesCopy.sendLabel(sending: false, attempted: true) == "Retry message")
        #expect(NotesCopy.unreadHeader(0) == nil)
        #expect(NotesCopy.unreadHeader(2) == "2 unread")
        #expect(NotesCopy.emergency == "Not for emergencies. Use Something's wrong? on Today.")
        #expect(NotesCopy.disabledSendReason == "Write a note to send")
        #expect(NotesCopy.unreadEyebrow(clinicianName: "Synthetic Clinician") == "Unread · Synthetic Clinician")
    }

    @Test func limitSentenceRendersTheRealDateAndFallsBackWithoutOne() {
        #expect(NotesCopy.limitSentence("2026-09-24T09:00:00.000Z", locale: Self.us, timeZone: Self.utc)
                == "You've sent this week's message. You can write again from 24 Sep.")
        #expect(NotesCopy.limitSentence(nil, locale: Self.us, timeZone: Self.utc)
                == "You've sent this week's message. Check back soon.")
        #expect(NotesCopy.limitSentence("not-a-date", locale: Self.us, timeZone: Self.utc)
                == "You've sent this week's message. Check back soon.")
        #expect(NotesCopy.limitReportPrompt == "Report a reaction any time")
    }

    @Test func missingLimitFieldDecodesAsCanSendAndBlockedStateDisablesComposing() throws {
        let (patient, clinician) = (UUID(), UUID())
        let withoutLimit = """
        {"patientId":"\(patient.uuidString)","clinicianId":"\(clinician.uuidString)","patientName":null,\
        "clinicianName":"Synthetic Clinician","lastMessage":null,"unreadCount":0}
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(AssignedConversation.self, from: withoutLimit)
        #expect(decoded.limit == nil)
        #expect(decoded.canSendMessage) // Older API with no `limit` field: treat missing as "can send".

        let blocked = AssignedConversation(patientId: patient, clinicianId: clinician, patientName: nil,
            clinicianName: "Synthetic Clinician", lastMessage: nil, unreadCount: 0,
            limit: MessageLimit(canSend: false, nextAllowedAt: "2026-09-24T09:00:00.000Z", reason: "weekly"))
        #expect(!blocked.canSendMessage)

        let repliable = AssignedConversation(patientId: patient, clinicianId: clinician, patientName: nil,
            clinicianName: "Synthetic Clinician", lastMessage: nil, unreadCount: 0,
            limit: MessageLimit(canSend: true, nextAllowedAt: nil, reason: "reply-window"))
        #expect(repliable.canSendMessage)
    }
}
