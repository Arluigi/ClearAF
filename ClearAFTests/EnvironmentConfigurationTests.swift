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
