import Foundation
import Testing
@testable import ClearAF

struct EnvironmentConfigurationTests {
    @Test func signupConfirmationRedirectIsAWebPageAndRecoveryKeepsItsDeepLink() throws {
        #expect(AppEnvironment.emailConfirmationURL(debug: true).absoluteString == "http://localhost:3000/confirmed")
        #expect(AppEnvironment.emailConfirmationURL(debug: false).absoluteString == "https://unzit-portal.vercel.app/confirmed")
        #expect(SupabaseService.callbackURL.absoluteString == "clearaf://auth")
#if DEBUG
        #expect(AppEnvironment.emailConfirmationURL == AppEnvironment.emailConfirmationURL(debug: true))
#else
        #expect(AppEnvironment.emailConfirmationURL == AppEnvironment.emailConfirmationURL(debug: false))
#endif
        let source = try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Services/SupabaseService.swift"), encoding: .utf8)
        #expect(source.contains("redirectTo: AppEnvironment.emailConfirmationURL"))
        #expect(source.contains("resetPasswordForEmail(email, redirectTo: Self.callbackURL)"))
    }

    @Test func environmentUsesIsolatedEndpoints() {
#if DEBUG
        #expect(SupabaseConfig.url == "http://127.0.0.1:54321")
        #expect(AppEnvironment.apiURL == "http://127.0.0.1:3001/api")
#else
        #expect(SupabaseConfig.url == "https://lhaqeeitxiynzcpqbwpb.supabase.co")
        #expect(AppEnvironment.apiURL == "https://unzit-api-593272381529.us-east1.run.app/api")
#endif
    }

    @Test func deviceHostIsStrictAndReleaseCannotBeRedirected() throws {
        #expect(try AppEnvironment.endpoints(localDeviceHost: "", debug: true).api == "http://127.0.0.1:3001/api")
        #expect(try AppEnvironment.endpoints(localDeviceHost: "Aryans-MacBook-Pro.local", debug: true).api == "http://Aryans-MacBook-Pro.local:3002/api")
        for host in ["https://Mac.local", "Mac.local:3002", "example.com", "a.b.local", "-a.local", "a-.local", "a_.local", " Mac.local", "Mac.local/", "Mac.local.", String(repeating: "a", count: 64) + ".local"] {
            #expect(throws: (any Error).self) { try AppEnvironment.endpoints(localDeviceHost: host, debug: true) }
        }
        #expect(try AppEnvironment.endpoints(localDeviceHost: "evil.invalid", debug: false).api == "https://unzit-api-593272381529.us-east1.run.app/api")
    }

    @Test func rejectsTheOtherEnvironmentsUploadOrigin() {
#if DEBUG
        let otherOrigin = "https://lhaqeeitxiynzcpqbwpb.supabase.co"
#else
        let otherOrigin = "http://127.0.0.1:54321"
#endif
        #expect(throws: (any Error).self) {
            try APIService.privatePhotoUploadRequest(
                signedURL: otherOrigin + "/storage/v1/object/upload/sign/patient-photos/user/photo.jpg?token=test",
                imageData: Data([1]))
        }
    }
}
