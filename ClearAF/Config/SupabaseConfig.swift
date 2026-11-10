import Foundation

// Selected at compile time: process environment variables cannot redirect a release.
enum AppEnvironment {
    struct Endpoints { let api: String; let supabase: String }
    enum ConfigurationError: Error { case invalidDeviceHost }

    static func endpoints(localDeviceHost host: String, debug: Bool) throws -> Endpoints {
        guard debug else { return Endpoints(api: "https://unzit-api-593272381529.us-east1.run.app/api", supabase: "https://lhaqeeitxiynzcpqbwpb.supabase.co") }
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
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYXFlZWl0eGl5bnpjcHFid3BiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4OTA5OTAsImV4cCI6MjEwOTQ2Njk5MH0.PVkq5EMOBSSIYTjT4VfiF_1eYSgOIcN4i5WxcYY4ck8"
#endif
}
