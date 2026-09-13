import XCTest
@testable import ClearAF

/// Hosted in ClearAF itself, so local-network privacy/ATS identity matches the real app.
final class MVPConnectivityTests: XCTestCase {
    func testPhysicalAppLocalConnectivity() async throws {
        guard let host = ProcessInfo.processInfo.environment["CLEARAF_DEVICE_HOST"] else {
            throw XCTSkip("Physical local connectivity requires explicit synthetic Bonjour host")
        }
        guard host.range(of: #"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.local$"#, options: .regularExpression) != nil else {
            throw NSError(domain: "FixtureHost", code: 1)
        }
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var failures = 0
        for (label, port, path) in [("api", 3002, "/health"), ("auth", 54321, "/auth/v1/health")] {
            var request = URLRequest(url: try XCTUnwrap(URL(string: "http://\(host):\(port)\(path)")))
            request.timeoutInterval = 15
            do {
                let (_, response) = try await session.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                print("MVP hosted \(label) HTTP \(status)")
                if !(200..<300).contains(status) && !(label == "auth" && status == 401) { failures += 1 }
            } catch {
                let e = error as NSError
                print("MVP hosted \(label) failed domain=\(e.domain) code=\(e.code)")
                failures += 1
            }
        }
        XCTAssertEqual(failures, 0)
    }
    private final class NoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }
}
