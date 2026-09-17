import Foundation
import Combine
import CoreData
import Auth

enum AccountName {
    static func canSubmit(_ value: String, isSaving: Bool) -> Bool {
        let count = value.trimmingCharacters(in: .whitespacesAndNewlines).count
        return (2...100).contains(count) && !isSaving
    }
}

@MainActor
final class AccountSaveState: ObservableObject {
    @Published private(set) var isSaving = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var successMessage: String?

    func perform(success: String? = "Saved", failure: String = "Changes could not be saved. Try again.",
                 operation: () async throws -> Void) async {
        guard !isSaving else { return }
        isSaving = true
        errorMessage = nil
        successMessage = nil
        defer { isSaving = false }
        do {
            try await operation()
            successMessage = success
        } catch {
            errorMessage = failure
        }
    }
}

// MARK: - API Models
struct APIUser: Codable {
    let id: String
    let name: String?
    let email: String
    let skinType: String?
    let currentSkinScore: Int?  // Optional for registration response
    let streakCount: Int?       // Optional for registration response
    let onboardingCompleted: Bool
    let allergies: String?
    let currentMedications: String?
    let skinConcerns: String?
    let createdAt: String?      // Optional for some responses
    let userType: String?
}

struct UpdateProfileRequest: Codable {
    var name: String? = nil
    var onboardingCompleted: Bool? = nil
    let skinType: String?
    let allergies: String?
    let currentMedications: String?
    let skinConcerns: String?

    static func onboarding(name: String) -> Self {
        Self(name: name, onboardingCompleted: true, skinType: nil, allergies: nil,
             currentMedications: nil, skinConcerns: nil)
    }

    static func nameEdit(_ name: String) -> Self {
        Self(name: name, onboardingCompleted: nil, skinType: nil, allergies: nil,
             currentMedications: nil, skinConcerns: nil)
    }
}

struct UserProfileResponse: Codable {
    let user: APIUser
}

struct UpdateProfileResponse: Codable {
    let message: String
    let user: APIUser
}

// MARK: - API Service
class APIService: ObservableObject {
    static let shared = APIService()

    private let baseURL = AppEnvironment.apiURL
    private let session = AccountNetwork.session()
    let access = AccountAccess()
    enum Phase: Equatable { case loading, signedOut, profileError, enrollment, onboarding, ready, recovery }
    @Published var currentUser: APIUser?
    @Published var phase: Phase = .loading
    @Published var persistence = PersistenceController(inMemory: true)
    @Published var accountError = ""
    var isLoggedIn: Bool { phase == .ready || phase == .onboarding }
    private var started = false
    private var profileTask: Task<Void, Never>?
    private var loadingTicket: AccountAccess.Ticket?
    @MainActor lazy var reminders = ReminderRepository(access: access, scheduler: SystemReminderScheduler())
    @MainActor lazy var photos = PhotoRepository(access: access, transport: self)
    @MainActor lazy var photoReviews = PhotoReviewRepository(access: access, transport: self)
    @MainActor lazy var messaging = MessagingRepository(access: access, transport: self)
    @MainActor lazy var checkIns = CheckInRepository(access: access, transport: self)
    @MainActor lazy var routines = RoutineRepository(access: access, transport: self)
    @MainActor lazy var enrollment = EnrollmentRepository(access: access, transport: self)
    @MainActor lazy var careDecisions = CareDecisionRepository(access: access, transport: self)
    @MainActor lazy var urgentReports = UrgentReportRepository(access: access, transport: self)
    private var recheckingEnrollment = false
    private init() {}

    @MainActor func start() {
        guard !started else { return }
        started = true
        SupabaseService.shared.startListening()
    }
    @MainActor func authChanged(_ event: AuthChangeEvent, session: Session?) {
        if event == .signedOut { clearAccount(); return }
        if event == .passwordRecovery {
            SupabaseService.shared.recoveryPending = true
            clearAccount(); phase = .recovery; return
        }
        if session != nil && SupabaseService.shared.recoveryPending { clearAccount(); phase = .recovery; return }
        guard phase != .recovery else { return }
        if let session { loadProfile(for: session.user.id) }
        else if event == .initialSession { clearAccount() }
    }

    @MainActor func retryProfile() {
        guard let id = SupabaseService.shared.client.auth.currentSession?.user.id else { clearAccount(); return }
        loadProfile(for: id, force: true)
    }

    @MainActor private func loadProfile(for id: UUID, force: Bool = false) {
        if access.snapshot()?.accountID == id && !force { return }
        clearAccount()
        phase = .loading
        let ticket = access.activate(id)
        loadingTicket = ticket
        profileTask = Task { @MainActor in
            do {
                let profile: UserProfileResponse = try await request(endpoint: "/users/profile", method: "GET", body: Optional<String>.none, ticket: ticket)
                try access.require(ticket)
                guard UUID(uuidString: profile.user.id) == id, profile.user.userType == "patient" else {
                    throw AccountFailure.patientRequired
                }
                let store = try PersistenceController(accountID: id)
                try hydrate(profile.user, in: store.container.viewContext)
                // Eligibility and consent come before onboarding and the tabs.
                guard await enrollment.load(ticket: ticket) else {
                    guard access.snapshot() == ticket else { return }
                    accountError = enrollment.error ?? AccountFailure.profileUnavailable.localizedDescription
                    phase = .profileError
                    return
                }
                try access.require(ticket)
                persistence = store
                currentUser = profile.user
                if enrollment.state?.status != .enrolled { phase = .enrollment }
                else { phase = profile.user.onboardingCompleted ? .ready : .onboarding }
            } catch {
                guard access.snapshot() == ticket else { return }
                if case AccountFailure.requestFailed(401) = error { logout(); return }
                accountError = (error as? AccountFailure)?.localizedDescription ?? AccountFailure.profileUnavailable.localizedDescription
                phase = .profileError
            }
        }
    }

    @MainActor private func hydrate(_ profile: APIUser, in context: NSManagedObjectContext) throws {
        let users = try context.fetch(User.fetchRequest())
        let user = users.first ?? User(context: context)
        user.id = UUID(uuidString: profile.id)
        user.name = profile.name
        user.skinType = profile.skinType
        user.onboardingCompleted = profile.onboardingCompleted
        user.currentSkinScore = Int16(profile.currentSkinScore ?? 0)
        user.streakCount = Int16(profile.streakCount ?? 0)
        if user.joinDate == nil { user.joinDate = Date() }
        try context.save()
    }

    @MainActor func clearAccount() {
        reminders.cancel()
        photos.cancel()
        routines.cancel()
        checkIns.cancel()
        messaging.cancel()
        photoReviews.cancel()
        enrollment.cancel()
        careDecisions.cancel()
        urgentReports.cancel()
        recheckingEnrollment = false
        access.invalidate()
        profileTask?.cancel()
        profileTask = nil
        currentUser = nil
        persistence = PersistenceController(inMemory: true)
        phase = .signedOut
    }
    @MainActor func logout() {
        clearAccount()
        SupabaseService.shared.signOut()
    }

    @MainActor func enrollmentFinished() {
        guard phase == .enrollment, enrollment.state?.status == .enrolled else { return }
        phase = currentUser?.onboardingCompleted == true ? .ready : .onboarding
    }

    /// A clinical write was refused for enrollment: reload the state and return to the enrollment steps if needed.
    @MainActor func recheckEnrollment() {
        guard phase == .ready || phase == .onboarding, !recheckingEnrollment, let ticket = access.snapshot() else { return }
        recheckingEnrollment = true
        Task { @MainActor in
            let loaded = await enrollment.load(ticket: ticket)
            guard access.snapshot() == ticket else { return }
            recheckingEnrollment = false
            guard loaded, phase == .ready || phase == .onboarding,
                  let status = enrollment.state?.status, status != .enrolled else { return }
            phase = .enrollment
        }
    }

    @MainActor func finishOnboarding(name: String) async throws {
        let ticket = access.snapshot()
        let body = UpdateProfileRequest.onboarding(name: name)
        let response: UpdateProfileResponse = try await request(endpoint: "/users/profile", method: "PATCH", body: body, ticket: ticket)
        try access.require(ticket)
        guard UUID(uuidString: response.user.id) == ticket?.accountID else { throw AccountFailure.accountChanged }
        try hydrate(response.user, in: persistence.container.viewContext)
        currentUser = response.user
        phase = .ready
    }

    @MainActor func updateName(_ name: String) async throws {
        let ticket = access.snapshot()
        let response: UpdateProfileResponse = try await request(
            endpoint: "/users/profile", method: "PATCH",
            body: UpdateProfileRequest.nameEdit(name), ticket: ticket
        )
        try access.require(ticket)
        guard UUID(uuidString: response.user.id) == ticket?.accountID else { throw AccountFailure.accountChanged }
        try hydrate(response.user, in: persistence.container.viewContext)
        currentUser = response.user
    }

    @MainActor func updateRecoveredPassword(_ password: String) async throws {
        guard phase == .recovery else { throw AccountFailure.accountChanged }
        _ = try await SupabaseService.shared.client.auth.update(user: UserAttributes(password: password))
        logout()
    }

    struct EmptyBody: Codable {}

    // Each request captures its login before work starts and checks it after every suspension.
    @MainActor private func request<T: Encodable, U: Decodable>(endpoint: String, method: String,
        body: T?, ticket: AccountAccess.Ticket?) async throws -> U {
        try access.require(ticket)
        let auth = try await SupabaseService.shared.client.auth.session
        try access.require(ticket)
        guard auth.user.id == ticket?.accountID else { throw AccountFailure.accountChanged }
        guard let url = URL(string: baseURL + endpoint) else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(auth.accessToken)", forHTTPHeaderField: "Authorization")
        if let body { request.httpBody = try JSONEncoder().encode(body) }
        let (data, response) = try await session.data(for: request)
        try access.require(ticket)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            let failure = AccountFailure.from(status: http.statusCode, body: data)
            if case .enrollmentRequired = failure { recheckEnrollment() }
            throw failure
        }
        return try JSONDecoder().decode(U.self, from: data)
    }
}

// MARK: - API Service Extensions for Future Features
extension APIService {
    // MARK: - Photo Upload
    static func photoStorageOriginMatches(_ destination: URLComponents, _ origin: URLComponents) -> Bool {
        // DNS hostnames are case-insensitive; Supabase normalizes signed URL hosts.
        destination.scheme == origin.scheme && destination.host?.lowercased() == origin.host?.lowercased()
            && (destination.port ?? (destination.scheme == "https" ? 443 : 80))
                == (origin.port ?? (origin.scheme == "https" ? 443 : 80))
    }

    static func privatePhotoUploadRequest(signedURL: String, imageData: Data) throws -> URLRequest {
        guard imageData.count <= 10 * 1024 * 1024 else { throw PhotoUploadError.tooLarge }
        guard let origin = URLComponents(string: SupabaseConfig.url) else {
            throw PhotoUploadError.invalidDestination
        }
        let prefix = origin.path + "/storage/v1/object/upload/sign/patient-photos/"
        guard let components = URLComponents(string: signedURL),
              Self.photoStorageOriginMatches(components, origin),
              components.user == nil, components.password == nil, components.fragment == nil,
              components.path.hasPrefix(prefix),
              components.path.count > prefix.count,
              !components.path.split(separator: "/").contains(where: { $0 == ".." || $0 == "." }),
              !components.path.contains("%"), !components.path.contains("\\"),
              let url = components.url else { throw PhotoUploadError.invalidDestination }
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
        request.httpBody = imageData
        return request
    }

    private static let photoStorageSession = URLSession(
        configuration: .ephemeral, delegate: PhotoUploadRedirectDelegate(), delegateQueue: nil
    )
}
private enum PhotoUploadError: LocalizedError {
    case tooLarge, invalidDestination, uploadFailed
    var errorDescription: String? {
        switch self {
        case .tooLarge: return "Photo must be 10 MB or smaller. Please choose a smaller image."
        case .invalidDestination: return "The photo upload destination could not be verified. Please try again."
        case .uploadFailed: return "Photo upload failed. Please try again."
        }
    }
}

private final class PhotoUploadRedirectDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}


extension APIService: PhotoTransport {
    @MainActor func intent(captureID: UUID, ticket: AccountAccess.Ticket) async throws -> CaptureIntent {
        let response: CaptureUploadResponse = try await request(
            endpoint: "/photos/captures/\(captureID.uuidString.lowercased())/upload-url", method: "POST", body: EmptyBody(), ticket: ticket)
        try access.require(ticket)
        if let photo = response.photo { return .shared(try photo.verifiedID(ticket)) }
        if response.uploaded == true { return .uploaded }
        guard let url = response.signedUrl else { throw URLError(.badServerResponse) }
        return .upload(url)
    }

    @MainActor func upload(_ bytes: Data, signedURL: String, ticket: AccountAccess.Ticket) async throws {
        try access.require(ticket)
        let request = try Self.privatePhotoUploadRequest(signedURL: signedURL, imageData: bytes)
        do {
            let (_, response) = try await Self.photoStorageSession.data(for: request)
            try access.require(ticket)
            guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
            // Retry intent after a Storage conflict: a previous response may have been lost.
            guard (200..<300).contains(http.statusCode) else { throw URLError(.cannotLoadFromNetwork) }
        } catch {
            try access.require(ticket)
            // URLSession errors can contain signed URLs. Surface only a sanitized error.
            throw URLError(.networkConnectionLost)
        }
    }

    @MainActor func complete(captureID: UUID, date: Date, notes: String, ticket: AccountAccess.Ticket) async throws -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let response: CaptureUploadResponse = try await request(
            endpoint: "/photos/captures/\(captureID.uuidString.lowercased())/complete", method: "POST",
            body: CaptureCompletion(captureDate: formatter.string(from: date), notes: notes), ticket: ticket)
        try access.require(ticket)
        guard let photo = response.photo else { throw URLError(.badServerResponse) }
        return try photo.verifiedID(ticket)
    }
}
private struct CaptureCompletion: Encodable { let captureDate: String; let notes: String }
private struct CaptureUploadResponse: Decodable {
    let photo: CaptureRecord?
    let signedUrl: String?
    let uploaded: Bool?
}
private struct CaptureRecord: Decodable {
    let id: String
    let userId: String
    func verifiedID(_ ticket: AccountAccess.Ticket) throws -> String {
        guard UUID(uuidString: userId) == ticket.accountID, UUID(uuidString: id) != nil else { throw AccountFailure.accountChanged }
        return id
    }
}


extension APIService: RoutineTransport {
    @MainActor func fetchRoutines(localDate: String, ticket: AccountAccess.Ticket) async throws -> RoutineSnapshot {
        try access.require(ticket)
        let response: RoutineSnapshot = try await request(endpoint: "/routines?localDate=\(localDate)",
            method: "GET", body: Optional<String>.none, ticket: ticket)
        try access.require(ticket)
        guard response.routines.allSatisfy({ $0.userId == ticket.accountID }),
              response.completions.allSatisfy({ $0.userId == ticket.accountID }) else { throw AccountFailure.accountChanged }
        return response
    }
    @MainActor func sendCompletion(_ pending: PendingRoutineCompletion, ticket: AccountAccess.Ticket) async throws -> CareRoutineCompletion {
        try access.require(ticket)
        guard pending.userId == ticket.accountID else { throw AccountFailure.accountChanged }
        let body = RoutineCompletionBody(revisionId: pending.revisionId.uuidString.lowercased(),
            completedAt: pending.completedAt, localDate: pending.localDate, timeZone: pending.timeZone)
        let response: RoutineCompletionResponse = try await request(
            endpoint: "/routines/completions/\(pending.id.uuidString.lowercased())", method: "PUT", body: body, ticket: ticket)
        try access.require(ticket)
        guard response.completion.userId == ticket.accountID else { throw AccountFailure.accountChanged }
        return response.completion
    }
}
private struct RoutineCompletionBody: Encodable {
    let revisionId: String
    let completedAt: String
    let localDate: String
    let timeZone: String
}
private struct RoutineCompletionResponse: Decodable { let completion: CareRoutineCompletion }


extension APIService: PhotoReviewTransport {
    @MainActor func fetchPhotoReviews(photoIDs: [UUID], ticket: AccountAccess.Ticket) async throws -> PhotoReviewResponse {
        try access.require(ticket)
        let ids = photoIDs.map { $0.uuidString.lowercased() }.joined(separator: ",")
        let response: PhotoReviewResponse = try await request(endpoint: "/photo-reviews/status?photoIds=\(ids)",
            method: "GET", body: Optional<String>.none, ticket: ticket)
        try access.require(ticket)
        return response
    }
}


extension APIService: CheckInTransport {
    @MainActor func fetchCheckInForm(ticket: AccountAccess.Ticket) async throws -> CheckInForm? {
        let result: CheckInFormEnvelope = try await request(endpoint: "/care-support/form", method: "GET", body: Optional<String>.none, ticket: ticket)
        guard result.form == nil || result.form.map({ CheckInValidation.form($0, owner: ticket.accountID) }) == true else { throw AccountFailure.accountChanged }
        return result.form
    }
    @MainActor func sendCheckIn(_ draft: CheckInDraft, ticket: AccountAccess.Ticket) async throws -> CheckInResponse {
        guard draft.form.userId == ticket.accountID, let submittedAt = draft.submittedAt else { throw AccountFailure.accountChanged }
        let result: CheckInResponseEnvelope = try await request(endpoint: "/care-support/responses/\(draft.id.uuidString.lowercased())", method: "PUT", body: CheckInBody(formId: draft.form.id, submittedAt: submittedAt, answers: draft.answers), ticket: ticket)
        return result.response
    }
    @MainActor func fetchCheckInResponses(page: Int, ticket: AccountAccess.Ticket) async throws -> SupportPage<CheckInResponse> {
        let result: SupportPage<CheckInResponse> = try await request(endpoint: "/care-support/responses?page=\(page)&limit=20", method: "GET", body: Optional<String>.none, ticket: ticket)
        guard result.data.allSatisfy({ $0.userId == ticket.accountID && CheckInValidation.form($0.form, owner: ticket.accountID) && $0.form.id == $0.formId && CheckInValidation.answers($0.answers, questions: $0.form.questions) && RoutineDates.instant($0.submittedAt) != nil && RoutineDates.instant($0.receivedAt) != nil }) else { throw AccountFailure.accountChanged }
        return result
    }
    @MainActor func fetchCompletionCalendar(month: String, ticket: AccountAccess.Ticket) async throws -> CompletionCalendar {
        guard !SupportDates.days(month).isEmpty else { throw RoutineFailure.invalidData }
        let result: CompletionCalendar = try await request(endpoint: "/care-support/calendar?month=\(month)", method: "GET", body: Optional<String>.none, ticket: ticket)
        guard result.month == month, result.days.allSatisfy({ SupportDates.days(month).contains($0.localDate) && $0.morning >= 0 && $0.evening >= 0 }) else { throw RoutineFailure.invalidData }
        return result
    }
    @MainActor func fetchCompletionDay(date: String, page: Int, ticket: AccountAccess.Ticket) async throws -> SupportPage<CompletionCalendarEvent> {
        guard SupportDates.days(String(date.prefix(7))).contains(date) else { throw RoutineFailure.invalidData }
        let result: SupportPage<CompletionCalendarEvent> = try await request(endpoint: "/care-support/calendar/events?localDate=\(date)&page=\(page)&limit=20", method: "GET", body: Optional<String>.none, ticket: ticket)
        guard result.data.allSatisfy({ $0.completion.userId == ticket.accountID && $0.routine.userId == ticket.accountID && $0.completion.localDate == date && $0.completion.revisionId == $0.routine.id }) else { throw RoutineFailure.invalidData }
        return result
    }
}
private struct CheckInFormEnvelope: Decodable { let form: CheckInForm? }
private struct CheckInResponseEnvelope: Decodable { let response: CheckInResponse }
private struct CheckInBody: Encodable { let formId: UUID; let submittedAt: String; let answers: [CheckInAnswer] }


extension APIService: MessagingTransport {
    @MainActor func currentMessages(ticket: AccountAccess.Ticket) async throws -> AssignedConversation? {
        let response: CurrentMessageEnvelope = try await request(endpoint: "/assigned-messages/current", method: "GET", body: Optional<String>.none, ticket: ticket)
        guard response.conversation == nil || response.conversation?.patientId == ticket.accountID else { throw AccountFailure.accountChanged }
        return response.conversation
    }
    @MainActor func messagePage(pair: AssignedConversation, before: String?, ticket: AccountAccess.Ticket) async throws -> AssignedMessagePage {
        let cursor = before.map { "&before=" + ($0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "") } ?? ""
        return try await request(endpoint: pair.path + "?limit=30" + cursor, method: "GET", body: Optional<String>.none, ticket: ticket)
    }
    @MainActor func putMessage(_ draft: MessageDraft, ticket: AccountAccess.Ticket) async throws -> AssignedMessage {
        let response: SentMessageEnvelope = try await request(endpoint: draft.pair.path + "/messages/" + draft.id.uuidString.lowercased(), method: "PUT", body: PatientMessageBody(content: draft.content), ticket: ticket)
        return response.message
    }
    @MainActor func readMessages(pair: AssignedConversation, ids: [UUID], ticket: AccountAccess.Ticket) async throws -> MessageReadResponse {
        try await request(endpoint: pair.path + "/read", method: "POST", body: MessageReadBody(messageIds: ids), ticket: ticket)
    }
    @MainActor func messageReference(pair: AssignedConversation, id: UUID, ticket: AccountAccess.Ticket) async throws -> MessageReferenceDetail {
        try await request(endpoint: pair.path + "/messages/" + id.uuidString.lowercased() + "/reference", method: "GET", body: Optional<String>.none, ticket: ticket)
    }
}
private struct CurrentMessageEnvelope: Decodable { let conversation: AssignedConversation? }
private struct SentMessageEnvelope: Decodable { let message: AssignedMessage }
private struct MessageReadBody: Encodable { let messageIds: [UUID] }
private struct PatientMessageBody: Encodable {
    let content: String
    enum CodingKeys: String, CodingKey { case content, reference }
    func encode(to encoder: Encoder) throws { var c = encoder.container(keyedBy: CodingKeys.self); try c.encode(content, forKey: .content); try c.encodeNil(forKey: .reference) }
}

extension APIService: EnrollmentTransport {
    @MainActor func fetchEnrollment(ticket: AccountAccess.Ticket) async throws -> EnrollmentState {
        let state: EnrollmentState = try await request(endpoint: "/enrollment", method: "GET", body: Optional<String>.none, ticket: ticket)
        guard state.consent.version > 0, state.consent.sha256.utf8.count == 64 else { throw RoutineFailure.invalidData }
        return state
    }
    @MainActor func submitScreening(id: UUID, answers: ScreeningAnswers, ticket: AccountAccess.Ticket) async throws -> EnrollmentStatus {
        let result: ScreeningEnvelope = try await request(endpoint: "/enrollment/screenings/\(id.uuidString.lowercased())", method: "PUT", body: answers, ticket: ticket)
        guard result.screening.id == id else { throw AccountFailure.accountChanged }
        return result.status
    }
    @MainActor func joinWaitlist(screeningId: UUID, ticket: AccountAccess.Ticket) async throws -> EligibilityScreening {
        let result: WaitlistEnvelope = try await request(endpoint: "/enrollment/waitlist", method: "PUT", body: WaitlistBody(screeningId: screeningId.uuidString.lowercased()), ticket: ticket)
        guard result.screening.id == screeningId else { throw AccountFailure.accountChanged }
        return result.screening
    }
    @MainActor func acceptConsent(version: Int, sha256: String, ticket: AccountAccess.Ticket) async throws -> EnrollmentStatus {
        let result: ConsentEnvelope = try await request(endpoint: "/enrollment/consents/\(version)", method: "PUT", body: ConsentBody(documentSha256: sha256), ticket: ticket)
        guard result.acceptance.version == version else { throw RoutineFailure.invalidData }
        return result.status
    }
}
private struct ScreeningEnvelope: Decodable { let screening: EligibilityScreening; let status: EnrollmentStatus }
private struct WaitlistBody: Encodable { let screeningId: String }
private struct WaitlistEnvelope: Decodable { let screening: EligibilityScreening }
private struct ConsentBody: Encodable { let documentSha256: String }
private struct ConsentEnvelope: Decodable {
    struct Acceptance: Decodable { let version: Int }
    let acceptance: Acceptance; let status: EnrollmentStatus
}

extension APIService: CareDecisionTransport {
    @MainActor func currentCareDecision(ticket: AccountAccess.Ticket) async throws -> CareDecision? {
        let result: CareDecisionEnvelope = try await request(endpoint: "/care-decisions/current", method: "GET", body: Optional<String>.none, ticket: ticket)
        guard result.decision.map({ $0.patientId == ticket.accountID }) ?? true else { throw AccountFailure.accountChanged }
        return result.decision
    }
}
private struct CareDecisionEnvelope: Decodable { let decision: CareDecision? }

extension APIService: UrgentReportTransport {
    @MainActor func sendUrgentReport(id: UUID, category: UrgentCategory, description: String, ticket: AccountAccess.Ticket) async throws -> UrgentReport {
        let result: UrgentReportEnvelope = try await request(endpoint: "/urgent-reports/\(id.uuidString.lowercased())", method: "PUT",
            body: UrgentReportBody(category: category.rawValue, description: description), ticket: ticket)
        guard result.report.id == id, result.report.patientId == ticket.accountID else { throw AccountFailure.accountChanged }
        return result.report
    }
    @MainActor func urgentReports(ticket: AccountAccess.Ticket) async throws -> [UrgentReport] {
        let result: SupportPage<UrgentReport> = try await request(endpoint: "/urgent-reports?limit=20", method: "GET", body: Optional<String>.none, ticket: ticket)
        guard result.data.allSatisfy({ $0.patientId == ticket.accountID }) else { throw AccountFailure.accountChanged }
        return result.data
    }
}
private struct UrgentReportBody: Encodable { let category: String; let description: String }
private struct UrgentReportEnvelope: Decodable { let report: UrgentReport }

extension APIService {
    @MainActor func messagePhotoThumbnail(id: UUID, ticket: AccountAccess.Ticket) async throws -> Data {
        try access.require(ticket)
        let auth = try await SupabaseService.shared.client.auth.session
        try access.require(ticket)
        guard auth.user.id == ticket.accountID, let url = URL(string: baseURL + "/photos/" + id.uuidString.lowercased() + "/thumbnail") else { throw AccountFailure.accountChanged }
        var request = URLRequest(url: url); request.setValue("Bearer " + auth.accessToken, forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        try access.require(ticket)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200, data.count <= 10 * 1024 * 1024 else { throw URLError(.badServerResponse) }
        return data
    }
}


extension APIService: CompareTimelineTransport {
    @MainActor func fetchCompareTimeline(from: Date, to: Date, timeZone: TimeZone, ticket: AccountAccess.Ticket) async throws -> CompareTimelineResponse {
        try access.require(ticket)
        let response: CompareTimelineResponse = try await request(
            endpoint: CompareTimelineQuery.endpoint(from: from, to: to, zoneIdentifier: timeZone.identifier),
            method: "GET", body: Optional<String>.none, ticket: ticket)
        try access.require(ticket)
        return response
    }
}
