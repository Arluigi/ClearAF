import Foundation
import Testing
@testable import ClearAF

struct EnvironmentConfigurationTests {
    @Test func environmentUsesIsolatedEndpoints() {
#if DEBUG
        #expect(SupabaseConfig.url == "http://127.0.0.1:54321")
        #expect(AppEnvironment.apiURL == "http://127.0.0.1:3001/api")
#else
        #expect(SupabaseConfig.url == "https://glrfxjydebnilsptlksg.supabase.co")
        #expect(AppEnvironment.apiURL == "https://clearaf-api.vercel.app/api")
#endif
    }

    @Test func deviceHostIsStrictAndReleaseCannotBeRedirected() throws {
        #expect(try AppEnvironment.endpoints(localDeviceHost: "", debug: true).api == "http://127.0.0.1:3001/api")
        #expect(try AppEnvironment.endpoints(localDeviceHost: "Aryans-MacBook-Pro.local", debug: true).api == "http://Aryans-MacBook-Pro.local:3002/api")
        for host in ["https://Mac.local", "Mac.local:3002", "example.com", "a.b.local", "-a.local", "a-.local", "a_.local", " Mac.local", "Mac.local/", "Mac.local.", String(repeating: "a", count: 64) + ".local"] {
            #expect(throws: (any Error).self) { try AppEnvironment.endpoints(localDeviceHost: host, debug: true) }
        }
        #expect(try AppEnvironment.endpoints(localDeviceHost: "evil.invalid", debug: false).api == "https://clearaf-api.vercel.app/api")
    }

    @Test func rejectsTheOtherEnvironmentsUploadOrigin() {
#if DEBUG
        let otherOrigin = "https://glrfxjydebnilsptlksg.supabase.co"
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
