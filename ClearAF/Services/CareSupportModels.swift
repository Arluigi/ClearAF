import Foundation

struct CheckInOption: Codable, Equatable, Identifiable { let id: UUID; let label: String }
struct CheckInQuestion: Codable, Equatable, Identifiable {
    enum Kind: String, Codable { case text, choice }
    let id: UUID; let prompt: String; let type: Kind; let required: Bool; let options: [CheckInOption]
}
struct CheckInForm: Codable, Equatable, Identifiable {
    let id: UUID; let userId: UUID; let version: Int; let createdBy: UUID; let createdAt: String
    let title: String; let isActive: Bool; let questions: [CheckInQuestion]
}
struct CheckInAnswer: Codable, Equatable { let questionId: UUID; var text: String?; var optionId: UUID? }
struct CheckInResponse: Codable, Identifiable {
    let id: UUID; let userId: UUID; let formId: UUID; let submittedAt: String; let receivedAt: String
    let answers: [CheckInAnswer]; let form: CheckInForm
}
struct CheckInDraft: Codable, Equatable {
    let id: UUID; let form: CheckInForm; var answers: [CheckInAnswer]; var submittedAt: String?
}
struct SupportPagination: Codable { let page: Int; let limit: Int; let total: Int; let totalPages: Int }
struct SupportPage<T: Decodable>: Decodable { let data: [T]; let pagination: SupportPagination }
struct CompletionCalendar: Decodable {
    struct Day: Decodable { let localDate: String; let morning: Int; let evening: Int }
    let month: String; let days: [Day]
}
struct CompletionCalendarEvent: Decodable, Identifiable {
    let completion: CareRoutineCompletion; let routine: CareRoutineRevision
    var id: UUID { completion.id }
    private enum CodingKeys: String, CodingKey { case routine }
    init(from decoder: Decoder) throws {
        completion = try CareRoutineCompletion(from: decoder)
        routine = try decoder.container(keyedBy: CodingKeys.self).decode(CareRoutineRevision.self, forKey: .routine)
    }
}
enum SupportDates {
    static func days(_ month: String) -> [String] {
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let f = DateFormatter(); f.calendar = calendar; f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(secondsFromGMT: 0); f.dateFormat = "yyyy-MM-dd"; f.isLenient = false
        guard let date = f.date(from: month + "-01"), f.string(from: date) == month + "-01", let range = f.calendar.range(of: .day, in: .month, for: date) else { return [] }
        return range.map { String(format: "%@-%02d", month, $0) }
    }
}
enum CheckInValidation {
    static func form(_ form: CheckInForm, owner: UUID) -> Bool {
        guard form.userId == owner, form.version > 0, RoutineDates.instant(form.createdAt) != nil,
              (1...120).contains(form.title.utf16.count), form.questions.count <= 10,
              !form.isActive || !form.questions.isEmpty,
              Set(form.questions.map(\.id)).count == form.questions.count else { return false }
        return form.questions.allSatisfy { q in
            (1...300).contains(q.prompt.utf16.count) &&
            (q.type == .text ? q.options.isEmpty : (2...10).contains(q.options.count) && Set(q.options.map(\.id)).count == q.options.count && q.options.allSatisfy { (1...160).contains($0.label.utf16.count) })
        }
    }
    static func answers(_ answers: [CheckInAnswer], questions: [CheckInQuestion]) -> Bool {
        guard Set(answers.map(\.questionId)).count == answers.count else { return false }
        for answer in answers {
            guard let q = questions.first(where: { $0.id == answer.questionId }) else { return false }
            switch q.type {
            case .text: guard answer.optionId == nil, let text = answer.text, text.utf16.count <= 2000, !q.required || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
            case .choice: guard answer.text == nil, q.options.contains(where: { $0.id == answer.optionId }) else { return false }
            }
        }
        return questions.filter(\.required).allSatisfy { q in answers.contains { $0.questionId == q.id } }
    }
}
