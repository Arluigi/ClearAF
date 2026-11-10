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

/// Fixed launch form order: tolerability, side effects, side-effect detail, pregnancy,
/// new medicines, medicine detail, and current NC location. Option UUIDs are display identities;
/// the structured request carries the contract's machine values in this validated order.
enum LaunchFollowUpSchema {
    static let tolerability: [LaunchFollowUp.Tolerability] = [.good, .someIrritation, .notTolerating]
    static let pregnancy: [LaunchFollowUp.Pregnancy] = [.pregnant, .breastfeeding, .trying, .notSure, .neither, .notApplicable]
    static func valid(_ form: CheckInForm, owner: UUID) -> Bool {
        let counts = [3, 2, 0, 6, 2, 0, 2]
        guard CheckInValidation.form(form, owner: owner), form.questions.count == counts.count else { return false }
        return zip(form.questions, counts).allSatisfy { question, count in
            question.type == (count == 0 ? .text : .choice) && question.options.count == count
        }
    }
}
struct LaunchFollowUpInput: Codable, Equatable {
    var tolerability: LaunchFollowUp.Tolerability?
    var sideEffectsNone: Bool?
    var sideEffectsDetails = ""
    var pregnancyStatus: LaunchFollowUp.Pregnancy?
    var newMedicinesNone: Bool?
    var newMedicinesDetails = ""
    var physicallyInNC: Bool?
    mutating func normalize() { if sideEffectsNone == true { sideEffectsDetails = "" }; if newMedicinesNone == true { newMedicinesDetails = "" } }
    var answers: LaunchFollowUp? {
        guard let tolerability, let sideEffectsNone, let pregnancyStatus, let newMedicinesNone, let physicallyInNC,
              sideEffectsDetails.utf16.count <= 2000, newMedicinesDetails.utf16.count <= 2000,
              sideEffectsNone || !sideEffectsDetails.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              newMedicinesNone || !newMedicinesDetails.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return .init(tolerability: tolerability, sideEffects: .init(none: sideEffectsNone, details: sideEffectsNone ? nil : sideEffectsDetails), pregnancyStatus: pregnancyStatus, newMedicines: .init(none: newMedicinesNone, details: newMedicinesNone ? nil : newMedicinesDetails), physicallyInNC: physicallyInNC)
    }
}
struct LaunchCheckInDraft: Codable, Equatable {
    let occurrenceId: UUID; let responseId: UUID; let form: CheckInForm; let cadenceAnchor: String
    var input: LaunchFollowUpInput; var photoSet: LaunchPhotoSet?; var frozen: Bool; var sent: Bool
}
enum LaunchPrescriptionCopy {
    static let status = "Recorded as sent outside UNZIT in TreatRx. This record does not confirm dispensing or delivery."
}

/// The form contract has opaque option UUIDs without semantic keys. DRAFT launch controls therefore
/// pair explicit patient-facing labels with machine values rather than guessing meanings from order.
/// Server prompts, form IDs and versions are retained; backend integration must confirm topic order.
enum LaunchFollowUpTopic { case tolerability, sideEffects, pregnancy, newMedicines, location }
struct LaunchFollowUpChoice: Identifiable { let id: String; let label: String }
enum LaunchFollowUpChoices {
    static func options(_ topic: LaunchFollowUpTopic) -> [LaunchFollowUpChoice] {
        let pairs: [(String, String)]
        switch topic {
        case .tolerability: pairs = [("good", "Good"), ("some_irritation", "Some irritation"), ("not_tolerating", "Not tolerating treatment")]
        case .sideEffects: pairs = [("none", "None"), ("details", "Describe side effects")]
        case .pregnancy: pairs = [("pregnant", "Pregnant"), ("breastfeeding", "Breastfeeding"), ("trying", "Trying to become pregnant"), ("not_sure", "Not sure"), ("neither", "Neither"), ("not_applicable", "Not applicable")]
        case .newMedicines: pairs = [("none", "None"), ("details", "Describe new medicines or supplements")]
        case .location: pairs = [("in_nc", "Yes, I am physically in North Carolina"), ("outside_nc", "No, I am outside North Carolina")]
        }
        return pairs.map { .init(id: $0.0, label: $0.1) }
    }
}
extension LaunchFollowUpInput {
    mutating func choose(_ topic: LaunchFollowUpTopic, code: String) {
        guard LaunchFollowUpChoices.options(topic).contains(where: { $0.id == code }) else { return }
        switch topic {
        case .tolerability: tolerability = .init(rawValue: code)
        case .sideEffects: sideEffectsNone = code == "none"
        case .pregnancy: pregnancyStatus = .init(rawValue: code)
        case .newMedicines: newMedicinesNone = code == "none"
        case .location: physicallyInNC = code == "in_nc"
        }
        normalize()
    }
}
