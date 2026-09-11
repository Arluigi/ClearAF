import Foundation

enum AccountNetwork {
    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 20
#if DEBUG
        // Deterministic disconnected-device tests; absent from Release builds.
        if ProcessInfo.processInfo.environment["CLEARAF_TEST_OFFLINE"] == "1" {
            configuration.protocolClasses = [DisconnectedTestProtocol.self]
        }
#endif
        return URLSession(configuration: configuration)
    }
}
#if DEBUG
private final class DisconnectedTestProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
    override func stopLoading() {}
}
#endif
