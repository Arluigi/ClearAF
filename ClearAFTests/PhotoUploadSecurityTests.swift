import Foundation
import Testing
@testable import ClearAF

struct PhotoUploadSecurityTests {
    private let prefix = SupabaseConfig.url + "/storage/v1/object/upload/sign/patient-photos/"

    @Test func storageOriginTreatsDNSHostCaseAsEquivalentWithoutRelaxingOtherBounds() throws {
        let origin = try #require(URLComponents(string: "http://Aryans-MacBook-Pro.local:54321"))
        let signed = try #require(URLComponents(string: "http://aryans-macbook-pro.local:54321/storage/v1/object/upload/sign/patient-photos/user/photo.jpg?token=synthetic"))
        #expect(APIService.photoStorageOriginMatches(signed, origin))
        for unsafe in ["https://aryans-macbook-pro.local:54321", "http://aryans-macbook-pro.local:54322", "http://different.local:54321", "http://example.com:54321"] {
            let other = try #require(URLComponents(string: unsafe))
            #expect(!APIService.photoStorageOriginMatches(other, origin))
        }
    }

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
            prefix.replacingOccurrences(of: SupabaseConfig.url, with: "https://evil.example") + "photo.jpg",
            prefix.replacingOccurrences(of: SupabaseConfig.url, with: "http://glrfxjydebnilsptlksg.supabase.co") + "photo.jpg",
            prefix.replacingOccurrences(of: "patient-photos/", with: "other-bucket/") + "photo.jpg",
            prefix + "../other-bucket/photo.jpg",
            prefix + "%2e%2e/other-bucket/photo.jpg",
            prefix.replacingOccurrences(of: SupabaseConfig.url, with: SupabaseConfig.url + ":8443") + "photo.jpg",
            prefix + "%252e%252e/photo.jpg",
            prefix + "photo.jpg#fragment"
        ] {
            #expect(throws: (any Error).self) {
                try APIService.privatePhotoUploadRequest(signedURL: url, imageData: Data([1]))
            }
        }
    }

    @Test func rejectsChangedSchemePortAndCredentials() throws {
        var destination = try #require(URLComponents(string: prefix + "user/photo.jpg?token=test"))
        destination.scheme = destination.scheme == "http" ? "https" : "http"
        #expect(throws: (any Error).self) {
            try APIService.privatePhotoUploadRequest(signedURL: destination.string!, imageData: Data([1]))
        }
        destination = try #require(URLComponents(string: prefix + "user/photo.jpg?token=test"))
        destination.port = 8443
        #expect(throws: (any Error).self) {
            try APIService.privatePhotoUploadRequest(signedURL: destination.string!, imageData: Data([1]))
        }
        destination = try #require(URLComponents(string: prefix + "user/photo.jpg?token=test"))
        destination.user = "unexpected"
        #expect(throws: (any Error).self) {
            try APIService.privatePhotoUploadRequest(signedURL: destination.string!, imageData: Data([1]))
        }
    }

    @Test func rejectsOversizedPhoto() {
        #expect(throws: (any Error).self) {
            try APIService.privatePhotoUploadRequest(signedURL: prefix + "photo.jpg", imageData: Data(count: 10 * 1024 * 1024 + 1))
        }
    }
}
