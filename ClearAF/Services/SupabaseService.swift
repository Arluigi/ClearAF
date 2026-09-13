import Foundation
import Supabase
import Auth

/// Persistent logout barrier: an offline logout cannot restore a cached session on relaunch.
final class AccountAuthStorage: AuthLocalStorage, @unchecked Sendable {
    private let lock = NSLock()
    private let storage: any AuthLocalStorage
    private let defaults: UserDefaults
    private let marker: String
    private var permanentlyBlocked = false
    init(storage: any AuthLocalStorage = DeviceAuthStorage(),
         defaults: UserDefaults = .standard, marker: String = "account.signedOut") {
        self.storage = storage; self.defaults = defaults; self.marker = marker
    }
    func block() { lock.lock(); defer { lock.unlock() }; permanentlyBlocked = true; defaults.set(true, forKey: marker) }
    func prepareNewLogin() throws {
        lock.lock(); defer { lock.unlock() }
        defaults.set(true, forKey: marker)
        guard !permanentlyBlocked else { throw AccountFailure.accountChanged }
        try storage.remove(key: "clearaf-session")
        try storage.remove(key: "clearaf-session-code-verifier")
        defaults.set(false, forKey: marker)
    }
    /// A link may consume an already initiated PKCE flow, never initiate a login
    /// or clear the persistent logout marker itself.
    func callbackCode(_ url: URL) throws -> String {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let codes = components?.queryItems?.filter { $0.name == "code" } ?? []
        guard url.scheme == "clearaf", url.host == "auth", url.path.isEmpty,
              url.user == nil, url.password == nil, url.port == nil, url.fragment == nil,
              codes.count == 1, let code = codes.first?.value, !code.isEmpty,
              try retrieve(key: "clearaf-session-code-verifier") != nil else {
            throw AccountFailure.accountChanged
        }
        return code
    }
    func store(key: String, value: Data) throws {
        lock.lock(); defer { lock.unlock() }
        guard !permanentlyBlocked && !defaults.bool(forKey: marker) else { return }
        try storage.store(key: key, value: value)
    }
    func retrieve(key: String) throws -> Data? {
        lock.lock(); defer { lock.unlock() }
        return (permanentlyBlocked || defaults.bool(forKey: marker)) ? nil : try storage.retrieve(key: key)
    }
    func remove(key: String) throws {
        lock.lock(); defer { lock.unlock() }
        guard !permanentlyBlocked else { return }
        try storage.remove(key: key)
    }
}

final class SupabaseService: ObservableObject {
    static let shared = SupabaseService()
    private(set) var client: SupabaseClient
    private(set) var storage: AccountAuthStorage
    private var listener: Task<Void, Never>?
    private var clientGeneration = UUID()
    private var logoutTask: Task<Void, Never>?
    private init() {
        UserDefaults.standard.removeObject(forKey: "supabase_token")
        let storage = AccountAuthStorage()
        self.storage = storage
        self.client = Self.makeClient(storage)
    }
    private static func makeClient(_ storage: AccountAuthStorage) -> SupabaseClient {
        SupabaseClient(supabaseURL: URL(string: SupabaseConfig.url)!, supabaseKey: SupabaseConfig.anonKey,
            options: .init(auth: .init(storage: storage, redirectToURL: Self.callbackURL, storageKey: "clearaf-session"), global: .init(session: AccountNetwork.session())))
    }
    @MainActor func startListening() {
        listener?.cancel()
        let generation = clientGeneration
        let auth = client.auth
        listener = Task { @MainActor in
            for await (event, session) in await auth.authStateChanges {
                guard generation == clientGeneration, !Task.isCancelled else { return }
                APIService.shared.authChanged(event, session: session)
            }
        }
    }
    var recoveryPending: Bool {
        get { UserDefaults.standard.bool(forKey: "account.recoveryPending") }
        set { UserDefaults.standard.set(newValue, forKey: "account.recoveryPending") }
    }
    static var callbackURL: URL { URL(string: "clearaf://auth")! }
    @MainActor func prepareSignIn() async throws {
        await logoutTask?.value
        logoutTask = nil
        // A new SDK client prevents an old refresh from writing into a new login.
        storage.block()
        clientGeneration = UUID()
        listener?.cancel()
        let replacement = AccountAuthStorage()
        try replacement.prepareNewLogin()
        storage = replacement
        client = Self.makeClient(replacement)
        startListening()
    }
    static func registrationMetadata(name: String, skinType: String? = nil) -> [String: AnyJSON] {
        var metadata: [String: AnyJSON] = ["name": .string(name)]
        if let skinType, !skinType.isEmpty { metadata["skinType"] = .string(skinType) }
        return metadata
    }
    @MainActor func signUp(email: String, password: String, name: String, skinType: String? = nil) async throws -> Bool {
        try await prepareSignIn()
        recoveryPending = false
        let response = try await client.auth.signUp(email: email, password: password,
            data: Self.registrationMetadata(name: name, skinType: skinType), redirectTo: Self.callbackURL)
        return response.session != nil
    }
    @MainActor func signIn(email: String, password: String) async throws {
        recoveryPending = false
        try await prepareSignIn()
        _ = try await client.auth.signIn(email: email, password: password)
    }
    @MainActor func signOut() {
        recoveryPending = false
        storage.block()
        clientGeneration = UUID()
        listener?.cancel()
        let auth = client.auth
        logoutTask = Task { try? await auth.signOut(scope: .local) }
    }
    @MainActor func requestRecovery(email: String) async throws {
        try await prepareSignIn()
        recoveryPending = true
        do { try await client.auth.resetPasswordForEmail(email, redirectTo: Self.callbackURL) }
        catch { recoveryPending = false; throw error }
    }
    @MainActor func handleCallback(_ url: URL) async throws {
        let code = try storage.callbackCode(url)
        _ = try await client.auth.exchangeCodeForSession(authCode: code)
    }
    @MainActor func verifyCode(email: String, code: String, recovery: Bool) async throws {
        try await prepareSignIn()
        _ = try await client.auth.verifyOTP(email: email, token: code, type: recovery ? .recovery : .signup)
    }
    func getCurrentUserId() -> String? { client.auth.currentSession?.user.id.uuidString }
}
