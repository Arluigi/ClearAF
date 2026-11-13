import Foundation
import Supabase
import Auth

extension SupabaseService {
    @MainActor func resendConfirmation(email: String) async throws {
        try await client.auth.resend(email: email, type: .signup,
                                     emailRedirectTo: AppEnvironment.emailConfirmationURL)
    }
}
