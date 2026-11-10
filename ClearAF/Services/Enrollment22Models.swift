import Foundation

enum LaunchIdentityIneligibleReason: String, Codable { case under18 = "under_18", outsideNC = "outside_nc" }

/// Publication metadata changes the new enrollment without changing historical questionnaires.
struct LaunchEnrollmentFlow: Codable, Equatable {
    let expectation: String
    let quickEligibilityQuestions: [LaunchQuestion]
    let medicalSections: [IntakeV2Catalog.Section]
}
struct LaunchEnrollmentProgress: Codable, Equatable {
    struct Signature: Codable, Equatable {
        let key: LaunchConsentKey; let version: Int; let sha256: String
        init(_ document: LaunchConsent) { key = document.key; version = document.version; sha256 = document.sha256 }
        func matches(_ document: LaunchConsent) -> Bool { key == document.key && version == document.version && sha256 == document.sha256 }
    }
    struct SignedImage: Codable, Equatable { let url: String; let expiresAt: String }
    struct IdentityDraft: Codable, Equatable {
        let fullName: String; let dateOfBirth: String?; let physicallyInNC: Bool
        let idPhoto: SignedImage?; let selfie: SignedImage?
    }
    struct DestinationDraft: Codable, Equatable {
        let planId: LaunchPlanID
        var name: String; var line1: String; var line2: String; var city: String; var state: String; var postalCode: String; var phone: String
    }
    let step: String
    let topicId: String?
    var eligibilityDraft: [String: String]?
    var consentDraft: [Signature]?
    var identityDraft: IdentityDraft?
    var destinationDraft: DestinationDraft?
    var selectedPlan: LaunchPlanID?
}

enum Enrollment22Routing {
    static func usesNewOrder(_ state: LaunchEnrollmentResponse?) -> Bool { state?.case.questionnaireVersion == "2.2-pending-review" }
    static func title(_ status: LaunchCase.Status) -> String {
        switch status {
        case .eligibility: "Eligibility"
        case .consents: "Consents"
        case .payment: "Plan and payment"
        case .identity: "Identity"
        case .medicalHistory, .needsChanges: "Medical history"
        case .photos: "Photos"
        case .destination: "Pharmacy and delivery"
        case .submitted, .approved, .rejected, .ineligible: "Review"
        }
    }
    static func resumeTopic(_ state: LaunchEnrollmentResponse, sections: [IntakeV2Catalog.Section], questions: [LaunchQuestion]) -> String? {
        if let saved = state.case.enrollmentProgress?.topicId, sections.contains(where: { $0.id == saved }) { return saved }
        let answers = state.case.intakeV2?.answers ?? [:]
        return sections.first { section in section.questionIds.compactMap { id in questions.first { $0.id == id } }.contains { !IntakeV2Rules.complete($0, answers: answers) } }?.id ?? sections.last?.id
    }
}
