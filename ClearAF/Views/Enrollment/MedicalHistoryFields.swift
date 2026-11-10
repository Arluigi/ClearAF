import SwiftUI

extension LaunchMedicalDraft {
    mutating func clearHiddenBranches() {
        M20 = M20 ?? .init(pcpName: nil, pcpPhone: nil, shareSummary: false)
        M21 = M21 ?? ""
        if M1 == .male || M1 == nil { M2 = nil }
        if M2 != .yes && M2 != .notSure { M3 = nil; M4 = nil }
        if M1 != .female && M1 != .intersex { M8 = nil }
        if M4?.method != "other" { M4?.details = nil }
        if M9?.none == true { M9?.signs = []; M9?.details = nil }
        if M11?.none == true { M11?.treatments = [] }
        if M14?.none == true { M14?.details = nil }
        if M15?.picks == ["none"] { M15?.reaction = nil }
    }
    /// The UI's catalog fields are converted back into the typed wire draft after each edit.
    func field(_ key: String) -> Any? {
        guard let bytes = try? JSONEncoder().encode(self), let object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return nil }
        return object[key]
    }
    mutating func setField(_ key: String, _ value: Any) {
        guard let bytes = try? JSONEncoder().encode(self), var object = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return }
        object[key] = value
        guard let nextBytes = try? JSONSerialization.data(withJSONObject: object), let next = try? JSONDecoder().decode(Self.self, from: nextBytes) else { return }
        self = next; clearHiddenBranches()
    }
}

enum LaunchMedicalValidation {
    static let choices: [String: Set<String>] = [
        "M2": ["yes", "no", "not_sure"], "M3": ["yes", "no", "not_sure"],
        "M4": ["pill_patch_ring", "iud", "implant", "shot", "condoms", "none", "other"],
        "M5": ["under_6_months", "6_to_12_months", "1_to_5_years", "over_5_years"],
        "M6": ["forehead", "cheeks", "nose", "jaw_chin", "neck", "chest", "back", "other"],
        "M7": ["comedones", "red_bumps", "pus_bumps", "deep_painful_lumps", "dark_marks", "scars"],
        "M8": ["yes", "no", "not_sure", "not_applicable"],
        "M9": ["irregular_periods", "new_hair_growth", "scalp_thinning", "voice_change"],
        "M10": ["burns_rarely_tans", "burns_then_tans", "rarely_burns_tans_easily", "very_rarely_burns_deeply_pigmented"],
        "M12": ["never", "past", "now"],
        "M13": ["ace_arb", "water_pills", "potassium", "trimethoprim", "lithium", "digoxin", "warfarin", "minerals_antacids", "seizure_medicine", "none"],
        "M15": ["tetracyclines", "sulfites", "clindamycin", "benzoyl_peroxide", "other", "none"],
        "M16": ["kidney", "liver", "high_potassium", "heart", "fainting_low_bp", "adrenal", "lupus_sun_sensitivity", "raised_brain_pressure", "swallowing_esophagus", "breast_cancer", "ibd", "none"],
        "M17": ["not_sensitive", "somewhat", "very", "eczema_rosacea"], "M19": ["yes", "sometimes", "no"]
    ]
    static func select(_ value: String, in selected: [String]) -> [String] {
        if selected.contains(value) { return selected.filter { $0 != value } }
        return value == "none" ? ["none"] : selected.filter { $0 != "none" } + [value]
    }
    static func shown(_ id: String, in draft: LaunchMedicalDraft) -> Bool {
        switch id {
        case "M2": return draft.M1 != nil && draft.M1 != .male
        case "M3", "M4": return draft.M2 == .yes || draft.M2 == .notSure
        case "M8": return draft.M1 == .female || draft.M1 == .intersex
        default: return true
        }
    }
    static func validDraft(_ draft: LaunchMedicalDraft) -> Bool {
        func valid(_ value: String?, _ key: String) -> Bool { value == nil || choices[key]!.contains(value!) }
        func multi(_ values: [String]?, _ key: String) -> Bool {
            guard let values else { return true }
            return Set(values).count == values.count && Set(values).isSubset(of: choices[key]!) && (!values.contains("none") || values.count == 1)
        }
        let strings: [(String?, String)] = [(draft.M2?.rawValue,"M2"),(draft.M3?.rawValue,"M3"),(draft.M4?.method,"M4"),(draft.M5,"M5"),(draft.M8?.rawValue,"M8"),(draft.M10,"M10"),(draft.M12,"M12"),(draft.M17,"M17"),(draft.M19,"M19")]
        guard strings.allSatisfy({ valid($0.0, $0.1) }), multi(draft.M6,"M6"), multi(draft.M7,"M7"), multi(draft.M13,"M13"), multi(draft.M15?.picks,"M15"), multi(draft.M16,"M16"), multi(draft.M9?.signs,"M9") else { return false }
        if let signs = draft.M9, signs.none && !signs.signs.isEmpty { return false }
        if let treatments = draft.M11, treatments.treatments.count > 20 || (treatments.none && !treatments.treatments.isEmpty) { return false }
        let texts: [String?] = [draft.M4?.details, draft.M9?.details, draft.M14?.details, draft.M15?.reaction, draft.M18, draft.M20?.pcpName, draft.M20?.pcpPhone, draft.M21] + (draft.M11?.treatments.flatMap { [$0.name, $0.duration, $0.helped, $0.sideEffects] }.map { Optional($0) } ?? [])
        return texts.allSatisfy { ($0?.count ?? 0) <= 2000 }
    }
    static func complete(_ draft: LaunchMedicalDraft) -> Bool {
        guard validDraft(draft), draft.M1 != nil, draft.M5 != nil, draft.M6?.isEmpty == false, draft.M7?.isEmpty == false,
              draft.M9 != nil, draft.M10 != nil, draft.M11 != nil, draft.M12 != nil, draft.M13?.isEmpty == false,
              draft.M14 != nil, draft.M15?.picks.isEmpty == false, draft.M16?.isEmpty == false, draft.M17 != nil,
              filled(draft.M18), draft.M19 != nil, draft.M22 == true, draft.medicationPreference != nil else { return false }
        if shown("M2", in: draft), draft.M2 == nil { return false }
        if shown("M3", in: draft), draft.M3 == nil || draft.M4 == nil { return false }
        if shown("M8", in: draft), draft.M8 == nil { return false }
        if draft.M4?.method == "other", !filled(draft.M4?.details) { return false }
        if let signs = draft.M9, !signs.none && signs.signs.isEmpty { return false }
        if let rows = draft.M11, !rows.none && (rows.treatments.isEmpty || !rows.treatments.allSatisfy({ filled($0.name) && filled($0.duration) && filled($0.helped) && filled($0.sideEffects) })) { return false }
        if draft.M14?.none == false, !filled(draft.M14?.details) { return false }
        if draft.M15?.picks != ["none"], !filled(draft.M15?.reaction) { return false }
        return true
    }
    static func filled(_ value: String?) -> Bool { !(value ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
}

/// Catalog copy and labels, fixed typed answer mapping. No sample clinical text is bundled here.
struct MedicalHistoryFields: View {
    let question: LaunchQuestion
    @Binding var answers: LaunchMedicalDraft
    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(question.id).font(Letterpress.data(12))
            Text(question.prompt).font(Letterpress.ui(17, weight: .medium)).accessibilityAddTraits(.isHeader)
            controls
            LetterpressRule().padding(.top, Letterpress.Space.s10)
        }
    }
    @ViewBuilder private var controls: some View {
        switch question.id {
        case "M4":
            choices(options("method"), selected: answers.M4?.method) { answers.M4 = .init(method: $0, details: nil) }
            if answers.M4?.method == "other" { text(label("details", fallback: "Details"), value: Binding(get: { answers.M4?.details ?? "" }, set: { answers.M4?.details = $0 })) }
        case "M9":
            multi(options("signs").filter { $0.id != "none" }, selected: answers.M9?.signs ?? []) { id in
                var value = answers.M9 ?? .init(signs: [], none: false, details: nil)
                value.none = false; value.signs = LaunchMedicalValidation.select(id, in: value.signs); answers.M9 = value
            }
            none(selected: answers.M9?.none == true) { answers.M9 = .init(signs: [], none: true, details: nil) }
            if answers.M9?.none == false { text(label("details", fallback: "Details (optional)"), value: Binding(get: { answers.M9?.details ?? "" }, set: { answers.M9?.details = $0 })) }
        case "M11":
            MedicalTreatmentsField(question: question, value: Binding(get: { answers.M11 }, set: { answers.M11 = $0 }))
        case "M14":
            none(selected: answers.M14?.none == true) { answers.M14 = .init(none: true, details: nil) }
            LetterpressRadioRow(title: label("details", fallback: "Add details"), selected: answers.M14?.none == false) { answers.M14 = .init(none: false, details: "") }
            if answers.M14?.none == false { text(label("details", fallback: "Details"), value: Binding(get: { answers.M14?.details ?? "" }, set: { answers.M14?.details = $0 })) }
        case "M15":
            multi(options("picks"), selected: answers.M15?.picks ?? []) { id in answers.M15 = .init(picks: LaunchMedicalValidation.select(id, in: answers.M15?.picks ?? []), reaction: id == "none" ? nil : answers.M15?.reaction) }
            if let picks = answers.M15?.picks, !picks.isEmpty && picks != ["none"] { text(label("reaction", fallback: "Reaction"), value: Binding(get: { answers.M15?.reaction ?? "" }, set: { answers.M15?.reaction = $0 })) }
        case "M20":
            text(label("pcpName", fallback: "Primary care clinician (optional)"), value: Binding(get: { answers.M20?.pcpName ?? "" }, set: { var value = answers.M20 ?? .init(pcpName: nil, pcpPhone: nil, shareSummary: false); value.pcpName = $0.isEmpty ? nil : $0; answers.M20 = value }))
            text(label("pcpPhone", fallback: "Phone (optional)"), value: Binding(get: { answers.M20?.pcpPhone ?? "" }, set: { var value = answers.M20 ?? .init(pcpName: nil, pcpPhone: nil, shareSummary: false); value.pcpPhone = $0.isEmpty ? nil : $0; answers.M20 = value }))
            Toggle(label("shareSummary", fallback: "Share a summary with my primary care clinician"), isOn: Binding(get: { answers.M20?.shareSummary ?? false }, set: { var value = answers.M20 ?? .init(pcpName: nil, pcpPhone: nil, shareSummary: false); value.shareSummary = $0; answers.M20 = value })).toggleStyle(.letterpressCheck)
        case "M22": Toggle(question.prompt, isOn: Binding(get: { answers.M22 == true }, set: { answers.M22 = $0 })).toggleStyle(.letterpressCheck)
        case "M6", "M7", "M13", "M16":
            multi(question.options, selected: answers.field(question.id) as? [String] ?? []) { id in answers.setField(question.id, LaunchMedicalValidation.select(id, in: answers.field(question.id) as? [String] ?? [])) }
        case "M18", "M21": text(question.prompt, value: Binding(get: { answers.field(question.id) as? String ?? "" }, set: { answers.setField(question.id, $0) }))
        default: choices(question.options, selected: answers.field(question.id) as? String) { answers.setField(question.id, $0) }
        }
    }
    private func options(_ field: String) -> [LaunchQuestion.Option] { question.fields.first { $0.id == field || $0.id.hasSuffix("." + field) }?.options ?? question.options }
    private func label(_ field: String, fallback: String) -> String { question.fields.first { $0.id == field || $0.id.hasSuffix("." + field) }?.prompt ?? fallback }
    private func choices(_ values: [LaunchQuestion.Option], selected: String?, choose: @escaping (String) -> Void) -> some View {
        ForEach(values) { option in LetterpressRadioRow(title: option.label, selected: selected == option.id) { choose(option.id) } }
    }
    private func multi(_ values: [LaunchQuestion.Option], selected: [String], choose: @escaping (String) -> Void) -> some View {
        ForEach(values) { option in Toggle(option.label, isOn: Binding(get: { selected.contains(option.id) }, set: { _ in choose(option.id) })).toggleStyle(.letterpressCheck) }
    }
    private func none(selected: Bool, action: @escaping () -> Void) -> some View { LetterpressRadioRow(title: question.options.first { $0.id == "none" }?.label ?? "None", selected: selected, action: action) }
    private func text(_ label: String, value: Binding<String>) -> some View { TextField(label, text: value, axis: .vertical).letterpressField(isEmpty: value.wrappedValue.isEmpty) }
}

private struct MedicalTreatmentRow: Identifiable {
    let id = UUID()
    var value: LaunchMedicalDraft.Treatment
}
private struct MedicalTreatmentsField: View {
    let question: LaunchQuestion
    @Binding var value: LaunchMedicalDraft.Treatments?
    @State private var rows: [MedicalTreatmentRow] = []
    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
            LetterpressRadioRow(title: question.options.first { $0.id == "none" }?.label ?? "None", selected: value?.none == true) { rows = []; value = .init(none: true, treatments: []) }
            ForEach($rows) { $row in
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    field("name", fallback: "Treatment", binding: $row.value.name)
                    field("duration", fallback: "Duration", binding: $row.value.duration)
                    field("helped", fallback: "Did it help?", binding: $row.value.helped)
                    field("sideEffects", fallback: "Side effects", binding: $row.value.sideEffects)
                    Button("Remove treatment") { rows.removeAll { $0.id == row.id }; update() }.buttonStyle(.letterpress(.underline))
                    LetterpressRule()
                }
            }
            Button("Add prior treatment") { rows.append(.init(value: .init(name: "", duration: "", helped: "", sideEffects: ""))); update() }.buttonStyle(.letterpress(.outlined)).disabled(rows.count >= 20)
        }
        .onAppear { rows = (value?.treatments ?? []).map { .init(value: $0) } }
        .onChange(of: rows.map(\.value)) { _, _ in update() }
    }
    private func update() { if !rows.isEmpty || value?.none != true { value = .init(none: false, treatments: rows.map(\.value)) } }
    private func field(_ id: String, fallback: String, binding: Binding<String>) -> some View {
        TextField(question.fields.first { $0.id == id || $0.id.hasSuffix("." + id) }?.prompt ?? fallback, text: binding, axis: .vertical).letterpressField(isEmpty: binding.wrappedValue.isEmpty)
    }
}
