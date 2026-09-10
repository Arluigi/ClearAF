import Foundation

// Selected at compile time: process environment variables cannot redirect a release.
enum AppEnvironment {
#if DEBUG
    static let apiURL = "http://127.0.0.1:3001/api"
    static let supabaseURL = "http://127.0.0.1:54321"
#else
    static let apiURL = "https://clearaf-api.vercel.app/api"
    static let supabaseURL = "https://glrfxjydebnilsptlksg.supabase.co"
#endif
}

enum SupabaseConfig {
    static let url = AppEnvironment.supabaseURL
#if DEBUG
    // Public local anon JWT only; generated from `supabase status` during setup.
    // No production fallback: an unconfigured developer build must fail closed.
    static let anonKey: String = {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "ClearAFLocalSupabaseAnonKey") as? String,
              !key.isEmpty, !key.contains("$(") else {
            preconditionFailure("Run local setup to generate ClearAF/Config/Local.generated.xcconfig before launching Debug.")
        }
        return key
    }()
#else
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscmZ4anlkZWJuaWxzcHRsa3NnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MzUyNTksImV4cCI6MjA3MTExMTI1OX0.CqVuJxORUU6PgL-o7ElT_0j9M2wmX65FOuvp8wP7K6E"
#endif
}
