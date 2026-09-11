import Foundation

/// Preferences use the authenticated UUID; unowned legacy keys are never adopted.
struct AccountPreferences {
    let accountID: UUID
    private let defaults: UserDefaults

    init(accountID: UUID, defaults: UserDefaults = .standard) {
        self.accountID = accountID
        self.defaults = defaults
    }

    func key(_ name: String) -> String {
        "accounts.\(accountID.uuidString.lowercased()).\(name)"
    }

    func bool(forKey name: String) -> Bool {
        defaults.bool(forKey: key(name))
    }

    func string(forKey name: String) -> String? {
        defaults.string(forKey: key(name))
    }

    func set(_ value: Any?, forKey name: String) {
        defaults.set(value, forKey: key(name))
    }

    func removeObject(forKey name: String) {
        defaults.removeObject(forKey: key(name))
    }
}
