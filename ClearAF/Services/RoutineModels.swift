import Foundation

// Separate DTOs preserve the legacy Core Data Routine/RoutineStep entities.
enum RoutineTimeOfDay: String, Codable, CaseIterable { case morning, evening
    var title: String { rawValue.capitalized }
}
struct CareRoutineStep: Codable, Equatable {
    let title: String
    let instructions: String
}
struct CareRoutineRevision: Codable, Equatable, Identifiable {
    let id: UUID
    let userId: UUID
    let timeOfDay: RoutineTimeOfDay
    let version: Int
    let createdBy: UUID
    let createdAt: String
    let name: String
    let isActive: Bool
    let steps: [CareRoutineStep]
}
struct CareRoutineCompletion: Codable, Equatable, Identifiable {
    let id: UUID
    let userId: UUID
    let revisionId: UUID
    let completedAt: String
    let localDate: String
    let timeZone: String
    let receivedAt: String
}
struct PendingRoutineCompletion: Codable, Equatable, Identifiable {
    let id: UUID
    let userId: UUID
    let revisionId: UUID
    let completedAt: String
    let localDate: String
    let timeZone: String
}
struct RoutineSnapshot: Codable, Equatable {
    var routines: [CareRoutineRevision]
    var completions: [CareRoutineCompletion]
}
enum RoutineDailyStatus: Equatable {
    case unrecorded, pending, recorded
    var label: String {
        switch self {
        case .unrecorded: return "Not recorded today"
        case .pending: return "Saved on this device · Pending sync"
        case .recorded: return "Recorded today"
        }
    }
}

/// API timestamps remain ISO strings so a durable retry sends the original body.
enum RoutineDates {
    static func localDate(_ date: Date, zone: TimeZone) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
    static func instant(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
    static func valid(completedAt: String, localDate: String, timeZone: String) -> Bool {
        guard completedAt.utf8.count <= 64, localDate.utf8.count == 10, timeZone.utf8.count <= 100,
              let date = instant(completedAt), date.timeIntervalSince1970.isFinite,
              let zone = TimeZone(identifier: timeZone) else { return false }
        return self.localDate(date, zone: zone) == localDate
    }
}
