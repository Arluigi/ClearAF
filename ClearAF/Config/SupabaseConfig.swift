import Foundation

// Selected at compile time: process environment variables cannot redirect a release.
enum AppEnvironment {
    struct Endpoints { let api: String; let supabase: String }
    enum ConfigurationError: Error { case invalidDeviceHost }

    static func endpoints(localDeviceHost host: String, debug: Bool) throws -> Endpoints {
        guard debug else { return Endpoints(api: "https://clearaf-api.vercel.app/api", supabase: "https://glrfxjydebnilsptlksg.supabase.co") }
        if host.isEmpty { return Endpoints(api: "http://127.0.0.1:3001/api", supabase: "http://127.0.0.1:54321") }
        // One DNS label (1–63 ASCII characters), followed by the Bonjour suffix.
        guard host.range(of: #"\A[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.local\z"#, options: .regularExpression) != nil else {
            throw ConfigurationError.invalidDeviceHost
        }
        return Endpoints(api: "http://\(host):3002/api", supabase: "http://\(host):54321")
    }

    private static let selected: Endpoints = {
#if DEBUG
        let raw = Bundle.main.object(forInfoDictionaryKey: "ClearAFLocalDeviceHost") as? String ?? ""
        // Xcode may leave an unset build setting unexpanded.
        let host = raw == "$(CLEARAF_LOCAL_DEVICE_HOST)" ? "" : raw
        guard let value = try? endpoints(localDeviceHost: host, debug: true) else {
            preconditionFailure("CLEARAF_LOCAL_DEVICE_HOST must be a single Bonjour .local hostname.")
        }
        return value
#else
        return try! endpoints(localDeviceHost: "", debug: false)
#endif
    }()
    static let apiURL = selected.api
    static let supabaseURL = selected.supabase
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
