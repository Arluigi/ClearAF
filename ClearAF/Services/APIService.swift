import Foundation
import Combine

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
}

struct UpdateProfileRequest: Codable {
    let skinType: String?
    let allergies: String?
    let currentMedications: String?
    let skinConcerns: String?
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

    // Production API URL
    private let baseURL = AppEnvironment.apiURL
    // For local testing: "http://192.168.68.70:3001/api"
    private let session = URLSession.shared

    @Published var currentUser: APIUser?
    @Published var isLoggedIn: Bool = false

    private init() {
        // Check if we have a Supabase session
        checkAuthState()
    }

    private func checkAuthState() {
        if SupabaseService.shared.getAccessToken() != nil {
            isLoggedIn = true
        }
    }

    // MARK: - Authentication
    func register(name: String, email: String, password: String, skinType: String?) -> AnyPublisher<AuthResponse, Error> {
        let request = RegisterRequest(
            name: name,
            email: email,
            password: password,
            skinType: skinType
        )

        return performRequest(
            endpoint: "/auth/register",
            method: "POST",
            body: request,
            responseType: AuthResponse.self
        )
        .handleEvents(receiveOutput: { [weak self] response in
            self?.handleAuthSuccess(response)
        })
        .eraseToAnyPublisher()
    }

    func login(email: String, password: String) -> AnyPublisher<AuthResponse, Error> {
        let request = LoginRequest(email: email, password: password)

        return performRequest(
            endpoint: "/auth/login",
            method: "POST",
            body: request,
            responseType: AuthResponse.self
        )
        .handleEvents(receiveOutput: { [weak self] response in
            self?.handleAuthSuccess(response)
        })
        .eraseToAnyPublisher()
    }

    func logout() {
        currentUser = nil
        isLoggedIn = false
        // Supabase handles session cleanup
        Task {
            try? await SupabaseService.shared.signOut()
        }
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

    // MARK: - Generic Request Methods
    private func performRequest<T: Codable, U: Codable>(
        endpoint: String,
        method: String,
        body: T? = nil,
        responseType: U.Type
    ) -> AnyPublisher<U, Error> {

        guard let url = URL(string: baseURL + endpoint) else {
            return Fail(error: URLError(.badURL))
                .eraseToAnyPublisher()
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let body = body {
            do {
                request.httpBody = try JSONEncoder().encode(body)
            } catch {
                return Fail(error: error)
                    .eraseToAnyPublisher()
            }
        }

        return session.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: responseType, decoder: JSONDecoder())
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    private func performAuthenticatedRequest<T: Codable, U: Codable>(
        endpoint: String,
        method: String,
        body: T? = nil,
        responseType: U.Type
    ) -> AnyPublisher<U, Error> {

        guard let url = URL(string: baseURL + endpoint) else {
            return Fail(error: URLError(.badURL))
                .eraseToAnyPublisher()
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Use Supabase token for authentication
        if let token = SupabaseService.shared.getAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body = body {
            do {
                request.httpBody = try JSONEncoder().encode(body)
            } catch {
                return Fail(error: error)
                    .eraseToAnyPublisher()
            }
        }

        return session.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: responseType, decoder: JSONDecoder())
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    // MARK: - Deprecated Auth Methods (kept for backward compatibility)
    // These are no longer used - Supabase handles authentication now
    private func handleAuthSuccess(_ response: AuthResponse) {
        self.currentUser = response.user
        self.isLoggedIn = true
    }
}

// MARK: - API Service Extensions for Future Features
extension APIService {
    // MARK: - Photo Upload
    func uploadPhoto(_ imageData: Data, skinScore: Int = 0, notes: String = "", appointmentId: String? = nil) -> AnyPublisher<PhotoUploadResponse, Error> {
        guard imageData.count <= 10 * 1024 * 1024 else {
            return Fail(error: PhotoUploadError.tooLarge).eraseToAnyPublisher()
        }
        guard SupabaseService.shared.getAccessToken() != nil else {
            return Fail(error: URLError(.userAuthenticationRequired)).eraseToAnyPublisher()
        }
        return performAuthenticatedRequest(
            endpoint: "/photos/upload-url", method: "POST",
            body: PhotoUploadURLRequest(mimeType: "image/jpeg"), responseType: PhotoUploadURLResponse.self
        )
        .flatMap { upload -> AnyPublisher<PhotoUploadResponse, Error> in
            let request: URLRequest
            do {
                request = try Self.privatePhotoUploadRequest(signedURL: upload.signedUrl, imageData: imageData)
            } catch {
                return Fail(error: error).eraseToAnyPublisher()
            }
            return Self.photoStorageSession.dataTaskPublisher(for: request)
                .tryMap { _, response in
                    guard let http = response as? HTTPURLResponse,
                          http.statusCode == 200 || http.statusCode == 201 else {
                        throw PhotoUploadError.uploadFailed
                    }
                }
                // Do not expose errors that may contain the signed upload URL.
                .mapError { _ -> Error in PhotoUploadError.uploadFailed }
                .flatMap {
                    self.performAuthenticatedRequest(
                        endpoint: "/photos/complete-upload", method: "POST",
                        body: CompletePhotoUploadRequest(storagePath: upload.storagePath, skinScore: skinScore,
                                                         notes: notes, appointmentId: appointmentId),
                        responseType: PhotoUploadResponse.self
                    )
                }
                .eraseToAnyPublisher()
        }
        .receive(on: DispatchQueue.main)
        .eraseToAnyPublisher()
    }

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
        guard let token = SupabaseService.shared.getAccessToken() else {
            return Fail(error: NSError(domain: "APIService", code: 401, userInfo: [NSLocalizedDescriptionKey: "No auth token"]))
                .eraseToAnyPublisher()
        }

        // Convert date to ISO8601 string
        let formatter = ISO8601DateFormatter()
        let dateString = formatter.string(from: scheduledDate)

        let requestBody = CreateAppointmentRequest(
            scheduledDate: dateString,
            type: type,
            concern: concern,
            duration: 30,
            dermatologistId: nil  // Let backend use assigned dermatologist
        )

        guard let url = URL(string: "\(baseURL)/appointments") else {
            return Fail(error: NSError(domain: "APIService", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"]))
                .eraseToAnyPublisher()
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        do {
            request.httpBody = try JSONEncoder().encode(requestBody)
        } catch {
            return Fail(error: error).eraseToAnyPublisher()
        }

        return session.dataTaskPublisher(for: request)
            .tryMap { data, response -> Data in
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw NSError(domain: "APIService", code: 0, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
                }

                if httpResponse.statusCode == 401 {
                    throw NSError(domain: "APIService", code: 401, userInfo: [NSLocalizedDescriptionKey: "Unauthorized"])
                }

                if httpResponse.statusCode >= 400 {
                    let errorMessage = String(data: data, encoding: .utf8) ?? "Unknown error"
                    throw NSError(domain: "APIService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMessage])
                }

                return data
            }
            .decode(type: CreateAppointmentResponse.self, decoder: JSONDecoder())
            .map { $0.appointment }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }

    func fetchAppointments() -> AnyPublisher<[AppointmentResponse], Error> {
        guard let token = SupabaseService.shared.getAccessToken() else {
            return Fail(error: NSError(domain: "APIService", code: 401, userInfo: [NSLocalizedDescriptionKey: "No auth token"]))
                .eraseToAnyPublisher()
        }

        guard let url = URL(string: "\(baseURL)/appointments") else {
            return Fail(error: NSError(domain: "APIService", code: 400, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"]))
                .eraseToAnyPublisher()
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        return session.dataTaskPublisher(for: request)
            .tryMap { data, response -> Data in
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw NSError(domain: "APIService", code: 0, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
                }

                if httpResponse.statusCode == 401 {
                    throw NSError(domain: "APIService", code: 401, userInfo: [NSLocalizedDescriptionKey: "Unauthorized"])
                }

                if httpResponse.statusCode >= 400 {
                    throw NSError(domain: "APIService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Server error"])
                }

                return data
            }
            .decode(type: AppointmentListResponse.self, decoder: JSONDecoder())
            .map { $0.appointments }
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
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
private struct PhotoUploadURLRequest: Codable { let mimeType: String }
private struct PhotoUploadURLResponse: Codable { let storagePath: String; let signedUrl: String }
private struct CompletePhotoUploadRequest: Codable {
    let storagePath: String
    let skinScore: Int
    let notes: String
    let appointmentId: String?
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
