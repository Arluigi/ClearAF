import Foundation
import Testing
@testable import ClearAF

struct PhotoUploadSecurityTests {
    private let prefix = "https://glrfxjydebnilsptlksg.supabase.co/storage/v1/object/upload/sign/patient-photos/"

    @Test func validPrivateDestinationHasNoBearerToken() throws {
        let bytes = Data(repeating: 1, count: 5 * 1024 * 1024)
        let request = try APIService.privatePhotoUploadRequest(signedURL: prefix + "user/photo.jpg?token=secret", imageData: bytes)
        #expect(request.httpMethod == "PUT")
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "image/jpeg")
        #expect(request.httpBody == bytes)
    }

    @Test func rejectsUnsafeDestinations() {
        for url in [
            prefix.replacingOccurrences(of: "https:", with: "http:") + "photo.jpg",
            prefix.replacingOccurrences(of: "glrfxjydebnilsptlksg.supabase.co", with: "evil.example") + "photo.jpg",
            prefix.replacingOccurrences(of: "patient-photos/", with: "other-bucket/") + "photo.jpg",
            prefix + "../other-bucket/photo.jpg",
            prefix + "%2e%2e/other-bucket/photo.jpg",
            prefix.replacingOccurrences(of: ".co/", with: ".co:8443/") + "photo.jpg"
        ] {
            #expect(throws: (any Error).self) {
                try APIService.privatePhotoUploadRequest(signedURL: url, imageData: Data([1]))
            }
        }
    }

    @Test func rejectsOversizedPhoto() {
        #expect(throws: (any Error).self) {
            try APIService.privatePhotoUploadRequest(signedURL: prefix + "photo.jpg", imageData: Data(count: 10 * 1024 * 1024 + 1))
        }
    }
}
