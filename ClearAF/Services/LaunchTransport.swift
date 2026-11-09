import Foundation

struct LaunchRequest {
    let path: String; let method: String; let body: Data?; let contentType: String
    init(path: String, method: String = "GET", body: Data? = nil, contentType: String = "application/json") {
        self.path = path; self.method = method; self.body = body; self.contentType = contentType
    }
    static func json<T: Encodable>(_ path: String, method: String = "PUT", _ body: T) throws -> Self {
        Self(path: path, method: method, body: try JSONEncoder().encode(body))
    }
}
@MainActor protocol LaunchTransport {
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data
}
extension APIService: LaunchTransport {
    @MainActor func send(_ launch: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data {
        try access.require(ticket)
        let auth = try await SupabaseService.shared.client.auth.session
        try access.require(ticket)
        guard auth.user.id == ticket.accountID, launch.path.hasPrefix("/"), !launch.path.contains("://"),
              let url = URL(string: AppEnvironment.apiURL + launch.path) else { throw AccountFailure.accountChanged }
        var request = URLRequest(url: url)
        request.httpMethod = launch.method; request.httpBody = launch.body
        request.setValue(launch.contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer " + auth.accessToken, forHTTPHeaderField: "Authorization")
        let (bytes, response) = try await launchSession.data(for: request)
        try access.require(ticket)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200...299).contains(http.statusCode) else {
            struct Failure: Decodable { let code: String? }
            throw LaunchFailure.server(status: http.statusCode, code: (try? JSONDecoder().decode(Failure.self, from: bytes))?.code)
        }
        guard bytes.count <= 4 * 1024 * 1024 else { throw LaunchFailure.invalidData }
        return bytes
    }
}
