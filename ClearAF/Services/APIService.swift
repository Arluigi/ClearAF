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