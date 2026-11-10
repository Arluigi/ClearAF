import Foundation

// Launch DTOs are additive: legacy enrollment and care-form contracts remain unchanged.
enum LaunchPlanID: String, Codable, CaseIterable { case care, allIn = "all_in" }
enum LaunchConsentKey: String, Codable, CaseIterable { case telehealth, medication, privacyNotice = "privacy_notice", subscriptionTerms = "subscription_terms" }
enum LaunchPhotoSlot: String, Codable, CaseIterable { case front, left, right, chest, back, closeUp = "close_up" }
enum LaunchDates {
    static func instant(_ value: String) -> Date? {
        guard value.hasSuffix("Z") else { return nil }
        return RoutineDates.instant(value)
    }
}
struct LaunchPlan: Codable, Equatable, Identifiable {
    struct Cadence: Codable, Equatable { let weeklyWeeks: Int; let then: String }
    let id: LaunchPlanID; let name: String; let amountCents: Int; let currency: String; let interval: String
    let includesPartnerRx: Bool; let cadence: Cadence
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(LaunchPlanID.self, forKey: .id); name = try c.decode(String.self, forKey: .name)
        amountCents = try c.decode(Int.self, forKey: .amountCents); currency = try c.decode(String.self, forKey: .currency)
        interval = try c.decode(String.self, forKey: .interval); includesPartnerRx = try c.decode(Bool.self, forKey: .includesPartnerRx)
        cadence = try c.decode(Cadence.self, forKey: .cadence)
        guard amountCents >= 0, currency == "usd", interval == "month", cadence.weeklyWeeks >= 0, cadence.then == "monthly" else { throw LaunchFailure.invalidData }
    }
}
struct LaunchConsent: Codable, Equatable, Identifiable {
    var id: LaunchConsentKey { key }
    let key: LaunchConsentKey; let version: Int; let versionLabel: String; let title: String; let body: String
    let sha256: String; let effectiveAt: String; let acceptedAt: String?
}
struct LaunchQuestion: Codable, Equatable, Identifiable {
    enum Kind: String, Codable { case choice, multiChoice = "multi_choice", text, repeatGroup = "repeat", attestation }
    struct Option: Codable, Equatable, Identifiable { let id: String; let label: String }
    struct Condition: Codable, Equatable { let questionId: String; let `operator`: String; let values: [String] }
    let id: String; let prompt: String; let kind: Kind; let required: Bool; let options: [Option]; let fields: [LaunchQuestion]; let showWhen: [Condition]
}
struct LaunchCatalog: Codable, Equatable {
    let contractVersion: Int; let settingsVersion: Int; let plans: [LaunchPlan]; let consents: [LaunchConsent]
    let reviewCopy: String; let questionnaireVersion: String; let eligibilityQuestions: [LaunchQuestion]; let medicalQuestions: [LaunchQuestion]
    var photoGuidance: LaunchPhotoGuidance? = nil; var identityGuidance: LaunchIdentityGuidance? = nil
    var intakeV2: IntakeV2Catalog? = nil
}
struct LaunchIdentity: Codable, Equatable, Identifiable {
    enum Status: String, Codable { case uploaded, approved, needsChanges = "needs_changes", rejected }
    let id: UUID; let status: Status; let fullName: String; let dateOfBirth: String; let attestedInNC: Bool; let attestedAt: String
    let reviewedAt: String?; let reviewedBy: UUID?; let patientMessage: String?
}
struct LaunchPharmacy: Codable, Equatable {
    let name: String; let addressLine1: String; let addressLine2: String?; let city: String; let state: String; let postalCode: String; let phone: String
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(name, forKey: .name); try c.encode(addressLine1, forKey: .addressLine1); try c.encode(addressLine2, forKey: .addressLine2)
        try c.encode(city, forKey: .city); try c.encode(state, forKey: .state); try c.encode(postalCode, forKey: .postalCode); try c.encode(phone, forKey: .phone)
    }
}
struct LaunchShippingAddress: Codable, Equatable {
    let recipient: String; let line1: String; let line2: String?; let city: String; let state: String; let postalCode: String
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(recipient, forKey: .recipient); try c.encode(line1, forKey: .line1); try c.encode(line2, forKey: .line2)
        try c.encode(city, forKey: .city); try c.encode(state, forKey: .state); try c.encode(postalCode, forKey: .postalCode)
    }
}
enum LaunchDestination: Codable, Equatable {
    case care(LaunchPharmacy), allIn(LaunchShippingAddress)
    enum CodingKeys: String, CodingKey { case planId, pharmacy, shippingAddress }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(LaunchPlanID.self, forKey: .planId) {
        case .care: self = .care(try c.decode(LaunchPharmacy.self, forKey: .pharmacy))
        case .allIn:
            guard try c.decode(String.self, forKey: .pharmacy) == "vida" else { throw LaunchFailure.invalidData }
            let address = try c.decode(LaunchShippingAddress.self, forKey: .shippingAddress)
            guard address.state == "NC" else { throw LaunchFailure.invalidData }; self = .allIn(address)
        }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .care(let pharmacy): try c.encode(LaunchPlanID.care, forKey: .planId); try c.encode(pharmacy, forKey: .pharmacy)
        case .allIn(let address): try c.encode(LaunchPlanID.allIn, forKey: .planId); try c.encode("vida", forKey: .pharmacy); try c.encode(address, forKey: .shippingAddress)
        }
    }
}
struct LaunchEligibility: Codable, Equatable {
    enum Concern: String, Codable { case acne, darkMarks = "dark_marks", somethingElse = "something_else" }
    enum YesNo: String, Codable { case yes, no }
    enum Pregnancy: String, Codable { case pregnant, breastfeeding, neither, notApplicable = "not_applicable" }
    var E1: Concern; var E2: YesNo; var E3: Pregnancy; var E4: YesNo
}
struct LaunchEligibilityResult: Codable, Equatable { let answers: LaunchEligibility; let eligible: Bool; let reasons: [String]; let flags: [String]; let rulesVersion: String }
struct LaunchMedicalDraft: Codable, Equatable {
    enum Sex: String, Codable { case female, male, intersex, preferNotToSay = "prefer_not_to_say" }
    enum Answer: String, Codable { case yes, no, notSure = "not_sure", notApplicable = "not_applicable" }
    enum Preference: String, Codable { case topical, oral, noPreference = "no_preference" }
    struct Contraception: Codable, Equatable {
        var method: String; var details: String?
        func encode(to encoder: Encoder) throws { var c = encoder.container(keyedBy: CodingKeys.self); try c.encode(method, forKey: .method); try c.encode(details, forKey: .details) }
    }
    struct Signs: Codable, Equatable {
        var signs: [String]; var none: Bool; var details: String?
        func encode(to encoder: Encoder) throws { var c = encoder.container(keyedBy: CodingKeys.self); try c.encode(signs, forKey: .signs); try c.encode(none, forKey: .none); try c.encode(details, forKey: .details) }
    }
    struct Treatment: Codable, Equatable { var name: String; var duration: String; var helped: String; var sideEffects: String }
    struct Treatments: Codable, Equatable { var none: Bool; var treatments: [Treatment] }
    struct Detail: Codable, Equatable {
        var none: Bool; var details: String?
        func encode(to encoder: Encoder) throws { var c = encoder.container(keyedBy: CodingKeys.self); try c.encode(none, forKey: .none); try c.encode(details, forKey: .details) }
    }
    struct Allergies: Codable, Equatable {
        var picks: [String]; var reaction: String?
        func encode(to encoder: Encoder) throws { var c = encoder.container(keyedBy: CodingKeys.self); try c.encode(picks, forKey: .picks); try c.encode(reaction, forKey: .reaction) }
    }
    struct PCP: Codable, Equatable {
        var pcpName: String?; var pcpPhone: String?; var shareSummary: Bool
        func encode(to encoder: Encoder) throws { var c = encoder.container(keyedBy: CodingKeys.self); try c.encode(pcpName, forKey: .pcpName); try c.encode(pcpPhone, forKey: .pcpPhone); try c.encode(shareSummary, forKey: .shareSummary) }
    }
    var M1: Sex?; var M2: Answer?; var M3: Answer?; var M4: Contraception?; var M5: String?; var M6: [String]?; var M7: [String]?; var M8: Answer?
    var M9: Signs?; var M10: String?; var M11: Treatments?; var M12: String?; var M13: [String]?; var M14: Detail?; var M15: Allergies?; var M16: [String]?
    var M17: String?; var M18: String?; var M19: String?; var M20: PCP?; var M21: String?; var M22: Bool?; var medicationPreference: Preference?
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(M1, forKey: .M1)
        try c.encode(M2, forKey: .M2)
        try c.encode(M3, forKey: .M3)
        try c.encode(M4, forKey: .M4)
        try c.encodeIfPresent(M5, forKey: .M5)
        try c.encodeIfPresent(M6, forKey: .M6)
        try c.encodeIfPresent(M7, forKey: .M7)
        try c.encode(M8, forKey: .M8)
        try c.encodeIfPresent(M9, forKey: .M9)
        try c.encodeIfPresent(M10, forKey: .M10)
        try c.encodeIfPresent(M11, forKey: .M11)
        try c.encodeIfPresent(M12, forKey: .M12)
        try c.encodeIfPresent(M13, forKey: .M13)
        try c.encodeIfPresent(M14, forKey: .M14)
        try c.encodeIfPresent(M15, forKey: .M15)
        try c.encodeIfPresent(M16, forKey: .M16)
        try c.encodeIfPresent(M17, forKey: .M17)
        try c.encodeIfPresent(M18, forKey: .M18)
        try c.encodeIfPresent(M19, forKey: .M19)
        try c.encodeIfPresent(M20, forKey: .M20)
        try c.encodeIfPresent(M21, forKey: .M21)
        try c.encodeIfPresent(M22, forKey: .M22)
        try c.encodeIfPresent(medicationPreference, forKey: .medicationPreference)
    }
}
struct LaunchPhotoSet: Codable, Equatable, Identifiable {
    enum Purpose: String, Codable { case enrollment, checkIn = "check_in" }
    enum Status: String, Codable { case draft, submitted, needsChanges = "needs_changes", reviewed }
    struct Item: Codable, Equatable { let slot: LaunchPhotoSlot; let photoId: UUID; let captureId: UUID }
    let id: UUID; let purpose: Purpose; let status: Status; let requiredSlots: [LaunchPhotoSlot]; let items: [Item]
}
struct LaunchCapture: Codable, Equatable { let id: UUID; let captureId: UUID; let captureDate: String; let uploadedAt: String }
struct LaunchCase: Codable, Equatable, Identifiable {
    enum Status: String, Codable { case consents, identity, eligibility, payment, medicalHistory = "medical_history", photos, destination, submitted, needsChanges = "needs_changes", approved, rejected, ineligible }
    let id: UUID; let revision: Int; let status: Status; let identity: LaunchIdentity?; let eligibility: LaunchEligibilityResult?
    let medicalHistory: LaunchMedicalDraft; let questionnaireVersion: String; let photoSet: LaunchPhotoSet?; let destination: LaunchDestination?; let planId: LaunchPlanID?
    let flags: [String]; let submittedAt: String?; let approvedAt: String?; let patientMessage: String?
    var intakeV2: IntakeV2Record? = nil
}
struct LaunchMembership: Codable, Equatable, Identifiable {
    enum Status: String, Codable { case awaitingPayment = "awaiting_payment", paidPendingReview = "paid_pending_review", active, pastDue = "past_due", ended, rejected }
    enum Access: String, Codable { case enrollment, care, readOnly = "read_only" }
    enum Refund: String, Codable { case notApplicable = "not_applicable", pending, issued, failed }
    let id: UUID; let planId: LaunchPlanID; let status: Status; let amountCents: Int; let currency: String; let activatedAt: String?
    let currentPeriodEnd: String?; let paidThrough: String?; let cancelAtPeriodEnd: Bool; let cadenceAnchor: String?; let refundStatus: Refund; let access: Access
    var destinationRequired: Bool? = nil
}
struct LaunchEnrollmentResponse: Codable, Equatable {
    let `case`: LaunchCase; let membership: LaunchMembership?; let consents: [LaunchConsent]
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(self.case, forKey: .case); try c.encode(membership, forKey: .membership); try c.encode(consents, forKey: .consents)
    }
}
struct LaunchBillingResponse: Codable, Equatable { let membership: LaunchMembership? }
struct LaunchCheckoutResponse: Decodable { let membership: LaunchMembership?; let action: LaunchPaymentAction? }
/// Hosted-session response for the amended Checkout/Customer Portal contract; never evidence of payment.
struct LaunchPaymentAction: Codable, Equatable { let url: String; let expiresAt: String }
struct LaunchFollowUp: Codable, Equatable {
    enum Tolerability: String, Codable { case good, someIrritation = "some_irritation", notTolerating = "not_tolerating" }
    enum Pregnancy: String, Codable { case pregnant, breastfeeding, trying, notSure = "not_sure", neither, notApplicable = "not_applicable" }
    var tolerability: Tolerability; var sideEffects: LaunchMedicalDraft.Detail; var pregnancyStatus: Pregnancy; var newMedicines: LaunchMedicalDraft.Detail; var physicallyInNC: Bool
}
struct LaunchCheckIn: Codable, Equatable, Identifiable {
    enum Kind: String, Codable { case weekly, monthly }
    enum Status: String, Codable { case due, draft, submitted, needsChanges = "needs_changes", reviewed, superseded }
    let id: UUID; let dueAt: String; let cadenceAnchor: String; let kind: Kind; let status: Status; let formId: UUID; let form: CheckInForm
    let responseId: UUID?; let photoSet: LaunchPhotoSet?; let answers: LaunchFollowUp?; let submittedAt: String?; let reviewedAt: String?; let patientMessage: String?
}
struct LaunchPrescription: Codable, Equatable, Identifiable {
    let id: UUID; let patientId: UUID; let clinicianId: UUID; let drug: String; let strength: String; let sig: String; let pharmacy: LaunchPharmacy
    let sentAt: String; let recordedAt: String; let source: String
}
enum LaunchFailure: LocalizedError {
    case invalidData, server(status: Int, code: String?), busy
    var errorDescription: String? {
        switch self {
        case .invalidData: return "The response could not be read. Refresh and try again."
        case .server(_, let code): return code == "CONSENT_OUTDATED" ? "The consent documents changed. Review the current versions." : "Your changes could not be saved. Refresh and try again."
        case .busy: return "Please wait for the current request to finish."
        }
    }
}

/// Additive clinician-chart discriminator. Patient builds continue to ignore unknown response keys.
enum LaunchCareModel: String, Codable { case launch, legacy }
struct LaunchChartResponse: Decodable {
    let careModel: LaunchCareModel
    let enrollment: LaunchEnrollmentResponse?
    let checkIns: SupportPage<LaunchCheckIn>?
    let reviews: SupportPage<LaunchChartReview>?
    let prescriptions: SupportPage<LaunchPrescription>?
}
struct LaunchChartReview: Codable {
    let id: UUID; let targetType: String; let targetId: UUID; let outcome: String
    let patientMessage: String?; let createdAt: String; let clinicianId: UUID
}
