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

// MARK: - API Service
class APIService: ObservableObject {
    static let shared = APIService()
    
    private let baseURL = "https://clearaf.onrender.com/api"
    private let session = URLSession.shared
    
    @Published var currentUser: APIUser?
    @Published var authToken: String?
    @Published var isLoggedIn: Bool = false
    
    private init() {
        // Load saved auth token
        loadAuthToken()
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
        authToken = nil
        currentUser = nil
        isLoggedIn = false
        removeAuthToken()
    }
    
    // MARK: - User Profile
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
        
        if let token = authToken {
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
    
    // MARK: - Auth Helpers
    private func handleAuthSuccess(_ response: AuthResponse) {
        self.authToken = response.token
        self.currentUser = response.user
        self.isLoggedIn = true
        saveAuthToken(response.token)
    }
    
    private func saveAuthToken(_ token: String) {
        UserDefaults.standard.set(token, forKey: "auth_token")
    }
    
    private func loadAuthToken() {
        if let token = UserDefaults.standard.string(forKey: "auth_token") {
            self.authToken = token
            self.isLoggedIn = true
            
            // Optionally fetch current user data
            getCurrentUser()
                .sink(
                    receiveCompletion: { completion in
                        if case .failure = completion {
                            // Token might be expired, logout
                            self.logout()
                        }
                    },
                    receiveValue: { _ in }
                )
                .store(in: &cancellables)
        }
    }
    
    private func removeAuthToken() {
        UserDefaults.standard.removeObject(forKey: "auth_token")
    }
    
    private var cancellables = Set<AnyCancellable>()
}

// MARK: - API Service Extensions for Future Features
extension APIService {
    // MARK: - Photo Upload
    func uploadPhoto(_ imageData: Data, skinScore: Int = 0, notes: String = "", appointmentId: String? = nil) -> AnyPublisher<PhotoUploadResponse, Error> {
        guard let url = URL(string: baseURL + "/photos/upload") else {
            return Fail(error: URLError(.badURL))
                .eraseToAnyPublisher()
        }
        
        guard let token = authToken else {
            return Fail(error: URLError(.userAuthenticationRequired))
                .eraseToAnyPublisher()
        }
        
        // Create multipart form data
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Add image data
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"photo\"; filename=\"photo.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n".data(using: .utf8)!)
        
        // Add skin score
        if skinScore > 0 {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"skinScore\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(skinScore)".data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        // Add notes
        if !notes.isEmpty {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"notes\"\r\n\r\n".data(using: .utf8)!)
            body.append(notes.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        // Add appointment ID if provided
        if let appointmentId = appointmentId {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"appointmentId\"\r\n\r\n".data(using: .utf8)!)
            body.append(appointmentId.data(using: .utf8)!)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        // Close boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        return session.dataTaskPublisher(for: request)
            .map(\.data)
            .decode(type: PhotoUploadResponse.self, decoder: JSONDecoder())
            .receive(on: DispatchQueue.main)
            .eraseToAnyPublisher()
    }
    
    // Placeholder methods for future API integrations
    func fetchAppointments() -> AnyPublisher<[String], Error> {
        // TODO: Implement when appointments API is ready
        return Just([])
            .setFailureType(to: Error.self)
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