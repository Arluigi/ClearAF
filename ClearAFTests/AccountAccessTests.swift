import Foundation
import Testing
import Auth
@testable import ClearAF

struct AccountAccessTests {
    @Test func delayedResponsesAndUploadContinuationsCannotCrossLogins() throws {
        let access = AccountAccess()
        let a = UUID()
        let first = access.activate(a)
        try access.require(first)
        access.invalidate()
        #expect(throws: AccountFailure.self) { try access.require(first) }
        let second = access.activate(UUID())
        #expect(throws: AccountFailure.self) { try access.require(first) }
        try access.require(second)
        let samePersonNewLogin = access.activate(a)
        #expect(throws: AccountFailure.self) { try access.require(first) }
        try access.require(samePersonNewLogin)
    }
    @Test func freshKeychainAllowsFirstLoginAndRoundTrip() throws {
        let storage = DeviceAuthStorage(service: "ClearAF.test.\(UUID())")
        #expect(try storage.retrieve(key: "session") == nil)
        try storage.remove(key: "session")
        try storage.store(key: "session", value: Data("synthetic".utf8))
        #expect(try storage.retrieve(key: "session") == Data("synthetic".utf8))
        try storage.remove(key: "session")
        #expect(try storage.retrieve(key: "session") == nil)
    }
    @Test func failedCredentialCleanupKeepsNewClientSignedOut() throws {
        let suite = "ClearAF-tests-\(UUID())"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let memory = TestAuthStorage()
        try memory.store(key: "clearaf-session", value: Data("old-account".utf8))
        memory.failRemoval = true
        let replacement = AccountAuthStorage(storage: memory, defaults: defaults)
        #expect(throws: URLError.self) { try replacement.prepareNewLogin() }
        #expect(try replacement.retrieve(key: "clearaf-session") == nil)
        let coldLaunch = AccountAuthStorage(storage: memory, defaults: defaults)
        #expect(try coldLaunch.retrieve(key: "clearaf-session") == nil)
        memory.failRemoval = false
        try replacement.prepareNewLogin()
        #expect(try replacement.retrieve(key: "clearaf-session") == nil)
    }
    @Test func callbacksCannotReopenLoggedOutCredentials() throws {
        let suite = "ClearAF-tests-\(UUID())"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let memory = TestAuthStorage()
        let storage = AccountAuthStorage(storage: memory, defaults: defaults)
        try storage.store(key: "clearaf-session", value: Data("cached-A".utf8))
        try storage.store(key: "clearaf-session-code-verifier", value: Data("pending-A".utf8))
        storage.block()
        let callback = try #require(URL(string: "clearaf://auth?code=invalid"))
        #expect(throws: AccountFailure.self) { try storage.callbackCode(callback) }
        let reopened = AccountAuthStorage(storage: memory, defaults: defaults)
        #expect(throws: AccountFailure.self) { try reopened.callbackCode(callback) }
        #expect(try reopened.retrieve(key: "clearaf-session") == nil)
    }
    @Test func callbackRequiresInitiatedPKCEAndSurvivesColdLaunch() throws {
        let suite = "ClearAF-tests-\(UUID())"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let memory = TestAuthStorage()
        let storage = AccountAuthStorage(storage: memory, defaults: defaults)
        let callback = try #require(URL(string: "clearaf://auth?code=synthetic"))
        #expect(throws: AccountFailure.self) { try storage.callbackCode(callback) }
        try storage.prepareNewLogin()
        try storage.store(key: "clearaf-session-code-verifier", value: Data("pending-reset".utf8))
        let reopened = AccountAuthStorage(storage: memory, defaults: defaults)
        #expect(try reopened.callbackCode(callback) == "synthetic")
        for text in ["clearaf://auth#access_token=fake", "clearaf://auth?code=", "clearaf://auth?code=a&code=b", "clearaf://wrong?code=a"] {
            let invalid = try #require(URL(string: text))
            #expect(throws: AccountFailure.self) { try reopened.callbackCode(invalid) }
        }
    }
    @Test func offlineLogoutBlocksPersistedSessionAndLateWritesAcrossRelaunch() throws {
        let suite = "ClearAF-tests-\(UUID())"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let memory = TestAuthStorage()
        let storage = AccountAuthStorage(storage: memory, defaults: defaults)
        try storage.store(key: "session", value: Data("A".utf8))
        storage.block()
        try storage.store(key: "session", value: Data("late-A".utf8))
        #expect(try storage.retrieve(key: "session") == nil)
        let reopened = AccountAuthStorage(storage: memory, defaults: defaults)
        #expect(try reopened.retrieve(key: "session") == nil)
        try reopened.remove(key: "session")
        try reopened.prepareNewLogin()
        #expect(try reopened.retrieve(key: "session") == nil)
        try reopened.store(key: "session", value: Data("B".utf8))
        #expect(try reopened.retrieve(key: "session") == Data("B".utf8))
    }
}
private final class TestAuthStorage: AuthLocalStorage, @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String: Data] = [:]
    var failRemoval = false
    func store(key: String, value: Data) throws { lock.lock(); defer { lock.unlock() }; values[key] = value }
    func retrieve(key: String) throws -> Data? { lock.lock(); defer { lock.unlock() }; return values[key] }
    func remove(key: String) throws { lock.lock(); defer { lock.unlock() }; if failRemoval { throw URLError(.cannotRemoveFile) }; values[key] = nil }
}
