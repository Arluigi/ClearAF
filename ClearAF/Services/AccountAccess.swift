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
    case accountChanged, profileUnavailable, patientRequired, requestFailed(Int)
    var errorDescription: String? {
        switch self {
        case .accountChanged: return "Your account changed. Please try again after signing in."
        case .profileUnavailable: return "Your profile could not be loaded. Check your connection and try again."
        case .patientRequired: return "This app is for patient accounts. Clinicians should use the practice portal."
        case .requestFailed(let status):
            return status == 401 ? "Your session has ended. Please sign in again." : "The request could not be completed. Please try again."
        }
    }
}
