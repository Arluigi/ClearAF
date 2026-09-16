import Foundation

// Enrollment, care-decision and urgent-report shapes mirror the API's JSON field for field.
enum EnrollmentStatus: String, Codable {
    case screeningRequired = "screening_required", ineligible, consentRequired = "consent_required", enrolled
}
struct EligibilityScreening: Codable, Equatable {
    let id: UUID
    let stateCode: String, dateOfBirth: String, pregnancyStatus: String
    let eligible: Bool
    let reasons: [String], flags: [String]
    let rulesVersion: String, submittedAt: String
    let waitlistRequestedAt: String?
}
struct ConsentDocument: Codable, Equatable {
    let version: Int
    let title: String, body: String, sha256: String
    let acceptedAt: String?
}
struct EnrollmentState: Codable, Equatable {
    let status: EnrollmentStatus
    let rulesVersion: String
    let screening: EligibilityScreening?
    let consent: ConsentDocument
}
struct ScreeningAnswers: Codable, Equatable {
    let stateCode: String, dateOfBirth: String, pregnancyStatus: String
}

enum PregnancyAnswer: String, CaseIterable, Identifiable {
    case none, pregnant, tryingToConceive = "trying_to_conceive", breastfeeding
    var id: String { rawValue }
    var title: String {
        switch self {
        case .none: return "None of these"
        case .pregnant: return "Pregnant"
        case .tryingToConceive: return "Trying to conceive"
        case .breastfeeding: return "Breastfeeding"
        }
    }
}

/// The server's accepted residence codes: 50 states and DC in name order, then outside the US.
enum ResidenceOption {
    static let all: [(code: String, name: String)] = [
        ("AL", "Alabama"), ("AK", "Alaska"), ("AZ", "Arizona"), ("AR", "Arkansas"), ("CA", "California"),
        ("CO", "Colorado"), ("CT", "Connecticut"), ("DE", "Delaware"), ("DC", "District of Columbia"), ("FL", "Florida"),
        ("GA", "Georgia"), ("HI", "Hawaii"), ("ID", "Idaho"), ("IL", "Illinois"), ("IN", "Indiana"),
        ("IA", "Iowa"), ("KS", "Kansas"), ("KY", "Kentucky"), ("LA", "Louisiana"), ("ME", "Maine"),
        ("MD", "Maryland"), ("MA", "Massachusetts"), ("MI", "Michigan"), ("MN", "Minnesota"), ("MS", "Mississippi"),
        ("MO", "Missouri"), ("MT", "Montana"), ("NE", "Nebraska"), ("NV", "Nevada"), ("NH", "New Hampshire"),
        ("NJ", "New Jersey"), ("NM", "New Mexico"), ("NY", "New York"), ("NC", "North Carolina"), ("ND", "North Dakota"),
        ("OH", "Ohio"), ("OK", "Oklahoma"), ("OR", "Oregon"), ("PA", "Pennsylvania"), ("RI", "Rhode Island"),
        ("SC", "South Carolina"), ("SD", "South Dakota"), ("TN", "Tennessee"), ("TX", "Texas"), ("UT", "Utah"),
        ("VT", "Vermont"), ("VA", "Virginia"), ("WA", "Washington"), ("WV", "West Virginia"), ("WI", "Wisconsin"),
        ("WY", "Wyoming"), ("NON_US", "I live outside the United States"),
    ]
}

enum ScreeningDates {
    /// The calendar date the person picked, as "YYYY-MM-DD" in the Gregorian calendar whatever their locale uses.
    static func string(from date: Date, timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
    }
    static let earliestBirthDate: Date = {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = .current
        return calendar.date(from: DateComponents(year: 1900, month: 1, day: 1)) ?? .distantPast
    }()
}

struct CareDecision: Codable, Equatable {
    let id: UUID, patientId: UUID, clinicianId: UUID
    let clinicianName: String, decision: String
    let patientMessage: String?
    let photoId: UUID?
    let refundStatus: String
    let refundUpdatedAt: String?
    let createdAt: String
}

enum UrgentCategory: String, CaseIterable, Identifiable {
    case reactionToTreatment = "reaction_to_treatment", rapidWorsening = "rapid_worsening"
    case painOrInfection = "pain_or_infection", other
    var id: String { rawValue }
    var title: String {
        switch self {
        case .reactionToTreatment: return "Reaction to a treatment"
        case .rapidWorsening: return "Skin getting much worse quickly"
        case .painOrInfection: return "Pain, swelling or signs of infection"
        case .other: return "Something else"
        }
    }
}
struct UrgentReport: Codable, Equatable, Identifiable {
    let id: UUID, patientId: UUID
    let category: String, description: String, status: String, createdAt: String
    let acknowledgedAt: String?, resolvedAt: String?, resolutionNote: String?
}
