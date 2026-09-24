import Foundation

/// A request belongs to one login, even if the same person signs in again.
final class AccountAccess: @unchecked Sendable {
    struct Ticket: Equatable, Sendable { let accountID: UUID; let generation: UUID }
    private let lock = NSLock()
    private var ticket: Ticket?
    func activate(_ id: UUID) -> Ticket {
        lock.lock(); defer { lock.unlock() }
        let next = Ticket(accountID: id, generation: UUID())
        ticket = next
        return next
    }
    func invalidate() { lock.lock(); defer { lock.unlock() }; ticket = nil }
    func snapshot() -> Ticket? { lock.lock(); defer { lock.unlock() }; return ticket }
    func require(_ expected: Ticket?) throws {
        guard let expected, snapshot() == expected else { throw AccountFailure.accountChanged }
    }
}

enum AccountFailure: LocalizedError {
    case accountChanged, profileUnavailable, patientRequired, requestFailed(Int), enrollmentRequired, noAssignedClinician
    case patientMessageLimit(nextAllowedAt: String?)
    var errorDescription: String? {
        switch self {
        case .enrollmentRequired: return "Finish your eligibility and consent steps to continue."
        case .noAssignedClinician:
            return "You don't have an assigned clinician yet. If this is an emergency, call 911. If it isn't an emergency, contact your own doctor or a local urgent care clinic."
        case .accountChanged: return "Your account changed. Please try again after signing in."
        case .profileUnavailable: return "Your profile could not be loaded. Check your connection and try again."
        case .patientRequired: return "This app is for patient accounts. Clinicians should use the practice portal."
        case .requestFailed(let status):
            return status == 401 ? "Your session has ended. Please sign in again." : "The request could not be completed. Please try again."
        case .patientMessageLimit: return "You've already sent this week's message."
        }
    }
}

extension AccountFailure {
    /// Maps a non-2xx API response to the failure the app acts on, using the server's `code` when present.
    static func from(status: Int, body: Data) -> AccountFailure {
        let decoded = try? JSONDecoder().decode(ErrorCode.self, from: body)
        switch decoded?.code {
        case "ENROLLMENT_REQUIRED": return .enrollmentRequired
        case "NO_ASSIGNED_CLINICIAN": return .noAssignedClinician
        case "PATIENT_MESSAGE_LIMIT": return .patientMessageLimit(nextAllowedAt: decoded?.nextAllowedAt)
        default: return .requestFailed(status)
        }
    }
    /// Connection problems and server hiccups are worth retrying unchanged; anything else needs the person.
    static func isTransient(_ error: Error) -> Bool {
        if error is URLError { return true }
        if case AccountFailure.requestFailed(let status) = error { return status == 408 || status == 429 || status >= 500 }
        return false
    }
    private struct ErrorCode: Decodable { let code: String?; let nextAllowedAt: String? }
}
