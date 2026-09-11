import Foundation
import Security
import Auth

/// Keychain absence is a normal first-launch state; every other failure propagates.
struct DeviceAuthStorage: AuthLocalStorage {
    let service: String
    init(service: String = (Bundle.main.bundleIdentifier ?? "ClearAF") + ".auth") { self.service = service }
    private func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
    }
    func retrieve(key: String) throws -> Data? {
        var request = query(key)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw DeviceStorageError(status: status) }
        guard let data = result as? Data else { throw DeviceStorageError(status: errSecDecode) }
        return data
    }
    func store(key: String, value: Data) throws {
        var item = query(key)
        item[kSecValueData as String] = value
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let added = SecItemAdd(item as CFDictionary, nil)
        if added == errSecDuplicateItem {
            let status = SecItemUpdate(query(key) as CFDictionary, [kSecValueData as String: value] as CFDictionary)
            guard status == errSecSuccess else { throw DeviceStorageError(status: status) }
        } else if added != errSecSuccess { throw DeviceStorageError(status: added) }
    }
    func remove(key: String) throws {
        let status = SecItemDelete(query(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw DeviceStorageError(status: status) }
    }
}
struct DeviceStorageError: Error { let status: OSStatus }
