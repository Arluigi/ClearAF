import SwiftUI

struct IntakeV2Fields: View {
    let question: LaunchQuestion
    @Binding var answers: [String: IntakeValue]
    private var value: IntakeValue { answers[question.id] ?? .null }
    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            if question.kind != .attestation { Text(question.prompt).font(Letterpress.ui(17, weight: .medium)) }
            switch question.kind {
            case .attestation:
                if question.id == "W1" { Text(question.prompt) }
                Toggle(question.id == "W1" ? "I understand how UNZIT works." : question.prompt, isOn: Binding(get: { value.checked }, set: { answers[question.id] = .bool($0) })).toggleStyle(.letterpressCheck)
            case .choice:
                ForEach(question.options) { option in
                    LetterpressRadioRow(title: option.label, selected: value.string == option.id) { answers[question.id] = .string(option.id) }
                }
            case .multiChoice:
                ForEach(question.options) { option in
                    Toggle(option.label, isOn: Binding(get: { value.strings.contains(option.id) }, set: { _ in
                        let next = IntakeV2Rules.select(option.id, selected: value.strings)
                        if question.id != "E1" || next.count <= 3 { answers[question.id] = .array(next.map(IntakeValue.string)) }
                    })).toggleStyle(.letterpressCheck)
                }
            case .text:
                if question.id == "A1" {
                    DatePicker(question.prompt, selection: Binding(get: { ScreeningDates.date(from: value.string) ?? Date.now }, set: { answers[question.id] = .string(ScreeningDates.string(from: $0)) }), in: ScreeningDates.earliestBirthDate...Date.now, displayedComponents: .date)
                    if value.string.isEmpty { Text("Select your date of birth.").font(Letterpress.ui(13)) }
                } else {
                    TextField(question.prompt, text: Binding(get: { value.string }, set: { answers[question.id] = .string($0); if question.id == "D2", !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { answers["D2_none"] = .bool(false) } }), axis: .vertical).lineLimit(3...12).letterpressField(isEmpty: value.string.isEmpty)
                }
            case .repeatGroup:
                IntakeV2Treatments(question: question, answers: $answers)
            }
            if question.required { Text("Required").font(Letterpress.data(11)).foregroundStyle(Letterpress.inkSecondary) }
            LetterpressRule()
        }
    }
}

private struct IntakeV2Treatments: View {
    let question: LaunchQuestion
    @Binding var answers: [String: IntakeValue]
    private var rows: [[String: IntakeValue]] {
        if case .array(let values) = answers[question.id] { return values.map(\.object) }; return []
    }
    private var selected: [String] { rows.compactMap { $0["treatmentId"]?.string } }
    private func update(_ id: String, _ row: [String: IntakeValue]) {
        answers[question.id] = .array(rows.map { .object($0["treatmentId"]?.string == id ? row : $0) })
    }
    var body: some View {
        ForEach(question.options) { option in
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Toggle(option.label, isOn: Binding(get: { selected.contains(option.id) }, set: { _ in
                    let next = IntakeV2Rules.select(option.id, selected: selected)
                    answers[question.id] = .array(next.map { id in .object(rows.first(where: { $0["treatmentId"]?.string == id }) ?? ["treatmentId": .string(id)]) })
                })).toggleStyle(.letterpressCheck)
                if option.id != "never", let row = rows.first(where: { $0["treatmentId"]?.string == option.id }) {
                    ForEach(question.fields.filter { IntakeV2Rules.shown($0.showWhen, answers: row) }) { field in
                        IntakeV2Fields(question: field, answers: Binding(get: { rows.first(where: { $0["treatmentId"]?.string == option.id }) ?? row }, set: { update(option.id, $0) }))
                    }
                }
            }
        }
    }
}
