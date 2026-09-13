import Foundation
import Combine
import CoreData
import Auth

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

struct LoginRequest: Codable {
    let email: String
    let password: String
    let userType: String

    init(email: String, password: String) {
        self.email = email
        self.password = password
        self.userType = "patient"
    }
}

struct RegisterRequest: Codable {
    let name: String
    let email: String
    let password: String
    let userType: String
    let skinType: String?

    init(name: String, email: String, password: String, skinType: String?) {
        self.name = name
        self.email = email
        self.password = password
        self.userType = "patient"
        self.skinType = skinType
    }
}

struct AuthResponse: Codable {
    let message: String
    let user: APIUser
    let token: String
    let userType: String
}

struct APIError: Codable {
    let error: String
    let code: String?
    let details: [ValidationError]?
}

struct ValidationError: Codable {
    let field: String
    let message: String
}

// MARK: - Photo Models
struct APIPhoto: Codable {
    let id: String
    let photoUrl: String
    let skinScore: Int
    let notes: String?
    let userId: String
    let captureDate: String
    let appointmentId: String?
    let fileSize: Int?
    let mimeType: String?
}

struct PhotoUploadResponse: Codable {
    let message: String
    let photo: APIPhoto
}

struct SyncProfileResponse: Codable {
    let success: Bool
    let user: SyncedUser
    let assignedDermatologist: AssignedDerm?

    struct SyncedUser: Codable {
        let id: String
        let name: String?
        let skinType: String?
        let dermatologistId: String?
    }

    struct AssignedDerm: Codable {
        let id: String
        let name: String
    }
}

// MARK: - Appointment Structures
struct CreateAppointmentRequest: Codable {
    let scheduledDate: String  // ISO8601 format
    let type: String           // "consultation", "follow-up", "treatment", "emergency"
    let concern: String
    let duration: Int?         // minutes, defaults to 30
    let dermatologistId: String?
}

struct CreateAppointmentResponse: Codable {
    let message: String
    let appointment: AppointmentResponse
}

struct AppointmentResponse: Codable {
    let id: String
    let scheduledDate: String
    let type: String
    let concern: String
    let status: String
    let duration: Int
    let createdAt: String?
    let patient: PatientInfo
    let dermatologist: DermatologistInfo

    struct PatientInfo: Codable {
        let id: String
        let name: String?
    }

    struct DermatologistInfo: Codable {
        let id: String
        let name: String
        let title: String?
    }
}

struct AppointmentListResponse: Codable {
    let appointments: [AppointmentResponse]
    let total: Int
}

// MARK: - API Service
class APIService: ObservableObject {
    static let shared = APIService()

    private let baseURL = AppEnvironment.apiURL
    private let session = AccountNetwork.session()
    let access = AccountAccess()
    enum Phase: Equatable { case loading, signedOut, profileError, onboarding, ready, recovery }
    @Published var currentUser: APIUser?
    @Published var phase: Phase = .loading
    @Published var persistence = PersistenceController(inMemory: true)
    @Published var accountError = ""
    var isLoggedIn: Bool { phase == .ready || phase == .onboarding }
    private var started = false
    private var profileTask: Task<Void, Never>?
    private var loadingTicket: AccountAccess.Ticket?
    @MainActor lazy var photos = PhotoRepository(access: access, transport: self)
    @MainActor lazy var routines = RoutineRepository(access: access, transport: self)
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
                persistence = store
                currentUser = profile.user
                phase = profile.user.onboardingCompleted ? .ready : .onboarding
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
        photos.cancel()
        routines.cancel()
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

    // MARK: - User Profile
    func syncProfile() -> AnyPublisher<SyncProfileResponse, Error> {
        return performAuthenticatedRequest(
            endpoint: "/auth/sync-profile",
            method: "POST",
            body: EmptyBody(),
            responseType: SyncProfileResponse.self
        )
        .eraseToAnyPublisher()
    }

    struct EmptyBody: Codable {}
    func updateProfile(skinType: String?, allergies: String?, currentMedications: String?, skinConcerns: String?) -> AnyPublisher<APIUser, Error> {
        let request = UpdateProfileRequest(
            skinType: skinType,
            allergies: allergies,
            currentMedications: currentMedications,
            skinConcerns: skinConcerns
        )

        return performAuthenticatedRequest(
            endpoint: "/users/profile",
            method: "PATCH",
            body: request,
            responseType: UpdateProfileResponse.self
        )
        .map(\.user)
        .handleEvents(receiveOutput: { [weak self] user in
            self?.currentUser = user
        })
        .eraseToAnyPublisher()
    }

    func getCurrentUser() -> AnyPublisher<APIUser, Error> {
        return performAuthenticatedRequest(
            endpoint: "/users/profile",
            method: "GET",
            body: Optional<String>.none,
            responseType: UserProfileResponse.self
        )
        .map(\.user)
        .handleEvents(receiveOutput: { [weak self] user in
            self?.currentUser = user
        })
        .eraseToAnyPublisher()
    }

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
        guard (200..<300).contains(http.statusCode) else { throw AccountFailure.requestFailed(http.statusCode) }
        return try JSONDecoder().decode(U.self, from: data)
    }

    private func performAuthenticatedRequest<T: Codable, U: Codable>(endpoint: String, method: String,
        body: T? = nil, responseType: U.Type, ticket expected: AccountAccess.Ticket? = nil) -> AnyPublisher<U, Error> {
        let ticket = expected ?? access.snapshot()
        return Deferred {
            Future<U, Error> { promise in
                Task { @MainActor in
                    do { promise(.success(try await self.request(endpoint: endpoint, method: method, body: body, ticket: ticket))) }
                    catch { promise(.failure(error)) }
                }
            }
        }.receive(on: DispatchQueue.main)
        .tryMap { value in try self.access.require(ticket); return value }
        .eraseToAnyPublisher()
    }
}

// MARK: - API Service Extensions for Future Features
extension APIService {
    // MARK: - Photo Upload
    static func privatePhotoUploadRequest(signedURL: String, imageData: Data) throws -> URLRequest {
        guard imageData.count <= 10 * 1024 * 1024 else { throw PhotoUploadError.tooLarge }
        guard let origin = URLComponents(string: SupabaseConfig.url) else {
            throw PhotoUploadError.invalidDestination
        }
        let prefix = origin.path + "/storage/v1/object/upload/sign/patient-photos/"
        guard let components = URLComponents(string: signedURL),
              components.scheme == origin.scheme,
              components.host == origin.host,
              (components.port ?? (components.scheme == "https" ? 443 : 80)) ==
                (origin.port ?? (origin.scheme == "https" ? 443 : 80)),
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

    // Placeholder methods for future API integrations
    // MARK: - Appointment API Methods

    func createAppointment(scheduledDate: Date, type: String, concern: String, notes: String? = nil) -> AnyPublisher<AppointmentResponse, Error> {
        let body = CreateAppointmentRequest(scheduledDate: ISO8601DateFormatter().string(from: scheduledDate),
            type: type, concern: concern, duration: 30, dermatologistId: nil)
        return performAuthenticatedRequest(endpoint: "/appointments", method: "POST", body: body,
            responseType: CreateAppointmentResponse.self).map(\.appointment).eraseToAnyPublisher()
    }
    func fetchAppointments() -> AnyPublisher<[AppointmentResponse], Error> {
        performAuthenticatedRequest(endpoint: "/appointments", method: "GET", body: Optional<String>.none,
            responseType: AppointmentListResponse.self).map(\.appointments).eraseToAnyPublisher()
    }

    func fetchMessages() -> AnyPublisher<[String], Error> {
        // TODO: Implement when messages API is ready
        return Just([])
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }

    func fetchProducts() -> AnyPublisher<[String], Error> {
        // TODO: Implement when products API is ready
        return Just([])
            .setFailureType(to: Error.self)
            .eraseToAnyPublisher()
    }
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
