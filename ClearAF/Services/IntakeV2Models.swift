import Foundation

enum IntakeV2Routing {
    static func isV2(_ version: String) -> Bool { ["2.0-pending-review", "2.1-pending-review", "2.2-pending-review"].contains(version) }
    static func canInitialize(_ state: LaunchEnrollmentResponse?, catalog: LaunchCatalog?) -> Bool {
        guard let state, let catalog else { return false }
        return isV2(state.case.questionnaireVersion) && catalog.questionnaireVersion == state.case.questionnaireVersion && catalog.intakeV2 != nil
    }
    static func usesQuestionnaire(_ state: LaunchEnrollmentResponse) -> Bool {
        if state.case.questionnaireVersion == "2.2-pending-review" { return [.medicalHistory, .needsChanges].contains(state.case.status) }
        guard isV2(state.case.questionnaireVersion), ![.payment, .submitted, .approved, .rejected].contains(state.case.status) else { return false }
        return state.case.status != .consents || (state.consents.count == 4 && state.consents.allSatisfy { $0.acceptedAt != nil })
    }
    static func showsFinalReview(_ state: LaunchEnrollmentResponse) -> Bool {
        if state.case.questionnaireVersion == "2.2-pending-review" { return false }
        return state.case.status != .needsChanges && state.membership?.status == .paidPendingReview && state.case.intakeV2?.evaluation.missingRequired.isEmpty == true
    }
    static func needsIdentity(_ identity: LaunchIdentity?) -> Bool { identity == nil || identity?.status == .needsChanges || identity?.status == .rejected }
    static func canSubmitPhotoSet(_ set: LaunchPhotoSet, previouslySubmitted: Bool) -> Bool {
        set.status == .draft || (previouslySubmitted && [.submitted, .needsChanges].contains(set.status))
    }
}

/// JSON answers preserve complete affirmative negative screens and treatment repeats.
enum IntakeValue: Codable, Equatable {
    case string(String), bool(Bool), array([IntakeValue]), object([String: IntakeValue]), number(Double), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let value = try? c.decode(Bool.self) { self = .bool(value) }
        else if let value = try? c.decode(String.self) { self = .string(value) }
        else if let value = try? c.decode([IntakeValue].self) { self = .array(value) }
        else if let value = try? c.decode([String: IntakeValue].self) { self = .object(value) }
        else { self = .number(try c.decode(Double.self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self { case .string(let v): try c.encode(v); case .bool(let v): try c.encode(v); case .array(let v): try c.encode(v); case .object(let v): try c.encode(v); case .number(let v): try c.encode(v); case .null: try c.encodeNil() }
    }
    var string: String { if case .string(let value) = self { return value }; return "" }
    var strings: [String] { if case .array(let value) = self { return value.map(\.string) }; return string.isEmpty ? [] : [string] }
    var object: [String: IntakeValue] { if case .object(let value) = self { return value }; return [:] }
    var checked: Bool { self == .bool(true) }
}
enum IntakeV2Rules {
    static func cleaned(_ answers: [String: IntakeValue], questions: [LaunchQuestion]) -> [String: IntakeValue] {
        var next = answers
        for _ in 0..<3 { for question in questions where !shown(question.showWhen, answers: next) { next[question.id] = nil } }
        if next["D2_none"]?.checked == true { next["D2"] = nil }
        if let hormoneQuestion = questions.first(where: { $0.id == "B6" }), !shown(hormoneQuestion.showWhen, answers: next) { next["B6_details"] = nil }
        for (key, value) in next {
            if case .array(let values) = value, values.isEmpty { next[key] = nil }
        }
        if let treatmentQuestion = questions.first(where: { $0.id == "C1" }), case .array(let rows) = next["C1"] {
            next["C1"] = .array(rows.map { value in
                var row = value.object
                if row["treatmentId"]?.string == "never" { return .object(["treatmentId": .string("never")]) }
                for field in treatmentQuestion.fields where !shown(field.showWhen, answers: row) { row[field.id] = nil }
                return .object(row)
            })
        }
        return next
    }
    static func complete(_ question: LaunchQuestion, answers: [String: IntakeValue]) -> Bool {
        guard shown(question.showWhen, answers: answers) else { return true }
        if question.id == "D2", answers["D2_none"]?.checked == true { return true }
        guard question.required else { return true }
        let value = answers[question.id] ?? .null
        switch question.kind {
        case .attestation: return value.checked
        case .text: return !value.string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .choice: return question.options.contains { $0.id == value.string }
        case .multiChoice: return !value.strings.isEmpty && (question.id != "E1" || value.strings.count <= 3)
        case .repeatGroup:
            guard case .array(let rows) = value, !rows.isEmpty else { return false }
            return rows.allSatisfy { row in
                row.object["treatmentId"]?.string == "never" || question.fields.allSatisfy { complete($0, answers: row.object) }
            }
        }
    }
    static func select(_ value: String, selected: [String], exclusive: Set<String> = ["none", "never", "not_worried"]) -> [String] {
        if selected.contains(value) { return selected.filter { $0 != value } }
        return exclusive.contains(value) ? [value] : selected.filter { !exclusive.contains($0) } + [value]
    }
    static func shown(_ conditions: [LaunchQuestion.Condition], answers: [String: IntakeValue]) -> Bool {
        conditions.allSatisfy { condition in
            guard let answer = answers[condition.questionId], !answer.strings.isEmpty else { return false }
            let matches = !Set(answer.strings).isDisjoint(with: condition.values)
            return condition.operator == "not_in" ? !matches : matches
        }
    }
}
extension ScreeningDates {
    static func date(from value: String) -> Date? {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.calendar = Calendar(identifier: .gregorian); formatter.dateFormat = "yyyy-MM-dd"; formatter.isLenient = false
        guard let date = formatter.date(from: value), formatter.string(from: date) == value else { return nil }; return date
    }
}
struct LaunchPhotoGuidance: Codable, Equatable {
    struct Slot: Codable, Equatable { let id: String; let label: String }
    let title: String; let instructions: [String]; let slots: [Slot]
    var copy: [String: String]? = nil
    // Legacy text is used only when the older publication lacks this additive field.
    func text(_ key: String, legacy: String) -> String { copy?[key] ?? legacy }
    func captureTitle(_ slot: LaunchPhotoSlot) -> String { slots.first { $0.id == slot.rawValue }?.label ?? slot.title + " photo" }
    var captureInstructions: String { instructions.joined(separator: "\n\n") }
}
struct LaunchIdentityGuidance: Codable, Equatable {
    struct Item: Codable, Equatable { let id: String; let instructions: String }
    let title: String; let items: [Item]; var prompt: String?; var attestation: String?
    var copy: [String: String]? = nil
    func text(_ key: String, legacy: String) -> String { copy?[key] ?? legacy }
    func item(_ id: String, legacy: String) -> String { items.first { $0.id == id }?.instructions ?? legacy }
}
extension LaunchCatalog {
    /// A current publication must never silently substitute older Swift instructions.
    var hasCompatibleCaptureGuidance: Bool {
        guard ["2.1-pending-review", "2.2-pending-review"].contains(questionnaireVersion) else { return true }
        let photoKeys: Set<String> = ["setReviewHint", "completionHint", "reviewAdvice", "zoomLabel", "afterSave", "discardMessage", "prepareFailure", "safetyTitle", "safetyMessage"]
        let identityKeys: Set<String> = ["fullNameLabel", "dateOfBirthLabel", "birthConfirmation", "idTitle", "selfieTitle", "idInstructions", "selfieInstructions", "ncWarning", "completionHint", "idPreviewLabel", "selfiePreviewLabel", "prepareFailure", "safetyTitle", "safetyMessage"]
        guard let photoGuidance, let identityGuidance,
              let photoCopy = photoGuidance.copy, let identityCopy = identityGuidance.copy,
              photoKeys.allSatisfy({ !(photoCopy[$0]?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) }),
              identityKeys.allSatisfy({ !(identityCopy[$0]?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) }),
              !photoGuidance.instructions.isEmpty,
              Set(photoGuidance.slots.map(\.id)).isSuperset(of: LaunchPhotoSlot.allCases.map(\.rawValue)),
              Set(identityGuidance.items.map(\.id)).isSuperset(of: ["government_id", "selfie", "nc_attestation"]),
              identityGuidance.prompt?.isEmpty == false, identityGuidance.attestation?.isEmpty == false else { return false }
        return true
    }
}
struct IntakeV2Catalog: Codable, Equatable {
    struct Section: Codable, Equatable, Identifiable { let id: String; let title: String; let intro: String; let questionIds: [String] }
    let sections: [Section]; let exitPages: [String: String]; let holdNotice: String; let attestationIntro: String
    let dateQuestionIds: [String]
}
struct IntakeV2Record: Codable, Equatable {
    struct Evaluation: Codable, Equatable {
        let missingRequired: [String]; let exitPage: String?; let hold: Bool; let requiredPhotoSlots: [LaunchPhotoSlot]
    }
    let answers: [String: IntakeValue]; let evaluation: Evaluation
    var summary: IntakeValue?; var holdDecision: IntakeValue?
}
