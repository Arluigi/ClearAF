import Foundation
import Supabase
import Auth

class SupabaseService: ObservableObject {
    static let shared = SupabaseService()

    let client: SupabaseClient

    @Published var currentUser: Auth.User?
    @Published var isAuthenticated = false

    private init() {
        self.client = SupabaseClient(
            supabaseURL: URL(string: SupabaseConfig.url)!,
            supabaseKey: SupabaseConfig.anonKey
        )

        // Listen for auth state changes
        Task {
            for await state in await client.auth.authStateChanges {
                await MainActor.run {
                    self.currentUser = state.session?.user
                    self.isAuthenticated = state.session != nil

                    // Save session token for API calls
                    if let session = state.session {
                        UserDefaults.standard.set(session.accessToken, forKey: "supabase_token")
                    } else {
                        UserDefaults.standard.removeObject(forKey: "supabase_token")
                    }
                }
            }
        }

        // Check for existing session
        Task {
            await checkSession()
        }
    }

    // MARK: - Authentication

    func signUp(email: String, password: String, name: String, skinType: String) async throws -> Auth.User {
        let response = try await client.auth.signUp(
            email: email,
            password: password,
            data: [
                "name": .string(name),
                "skinType": .string(skinType)
            ]
        )

        return response.user
    }

    func signIn(email: String, password: String) async throws -> Session {
        let session = try await client.auth.signIn(
            email: email,
            password: password
        )

        return session
    }

    func signOut() async throws {
        try await client.auth.signOut()
        await MainActor.run {
            self.currentUser = nil
            self.isAuthenticated = false
        }
    }

    func checkSession() async {
        do {
            let session = try await client.auth.session
            await MainActor.run {
                self.currentUser = session.user
                self.isAuthenticated = true
            }
        } catch {
            await MainActor.run {
                self.currentUser = nil
                self.isAuthenticated = false
            }
        }
    }

    // MARK: - User Profile

    func getCurrentUserId() -> String? {
        return currentUser?.id.uuidString
    }

    func getAccessToken() -> String? {
        return UserDefaults.standard.string(forKey: "supabase_token")
    }
}

// MARK: - Errors

enum AuthError: LocalizedError {
    case signUpFailed
    case signInFailed
    case invalidCredentials
    case networkError

    var errorDescription: String? {
        switch self {
        case .signUpFailed:
            return "Failed to create account. Please try again."
        case .signInFailed:
            return "Failed to sign in. Please check your credentials."
        case .invalidCredentials:
            return "Invalid email or password."
        case .networkError:
            return "Network error. Please check your connection."
        }
    }
}