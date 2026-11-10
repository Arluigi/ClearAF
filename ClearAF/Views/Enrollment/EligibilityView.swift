import SwiftUI

extension LaunchEligibility {
    var canContinue: Bool { E1 != .somethingElse && E2 == .no }
    var reviewCues: [String] {
        var cues: [String] = []
        if E3 == .pregnant || E3 == .breastfeeding { cues.append("Your clinician will review treatment options appropriate to pregnancy or breastfeeding.") }
        if E4 == .yes { cues.append("Tell your other doctor you are using UNZIT so treatments do not overlap.") }
        return cues
    }
}
struct EligibilityView: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @State private var answers: [String: String] = [:]
    private var questions: [LaunchQuestion] { repository.catalog?.eligibilityQuestions ?? [] }
    private var value: LaunchEligibility? {
        guard let e1 = answers["E1"].flatMap(LaunchEligibility.Concern.init(rawValue:)), let e2 = answers["E2"].flatMap(LaunchEligibility.YesNo.init(rawValue:)), let e3 = answers["E3"].flatMap(LaunchEligibility.Pregnancy.init(rawValue:)), let e4 = answers["E4"].flatMap(LaunchEligibility.YesNo.init(rawValue:)) else { return nil }
        return LaunchEligibility(E1: e1, E2: e2, E3: e3, E4: e4)
    }
    var body: some View {
        LaunchPage(title: "Is UNZIT right for you?") {
            Text("Eligibility comes before payment. Your answers are shared with your clinician.")
            if questions.isEmpty {
                Text("The eligibility questions could not be loaded. Reload them to continue.")
                Button("Reload questions") { Task { await repository.loadCatalog(ticket: ticket) } }.buttonStyle(.letterpress(.outlined))
            }
            ForEach(questions) { question in
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Text(question.id).font(Letterpress.data(12))
                    Text(question.prompt).accessibilityAddTraits(.isHeader)
                    ForEach(question.options) { option in
                        LetterpressRadioRow(title: option.label, selected: answers[question.id] == option.id) { answers[question.id] = option.id }
                    }
                    LetterpressRule()
                }
            }
            if answers["E1"] == "something_else" { Text("UNZIT treats acne and dark marks from acne. Please seek care in person for other concerns.") }
            if answers["E2"] == "yes" { Text("Please see a doctor in person in the next day or two. If you have an emergency, call 911.") }
            if let value { ForEach(value.reviewCues, id: \.self) { Text($0) } }
            Button(repository.saving ? "Saving…" : (value?.canContinue == false ? "Save eligibility" : "Continue")) {
                guard let value, let current = repository.state else { return }
                struct Body: Encodable { let expectedRevision: Int; let answers: LaunchEligibility }
                Task { if let request = try? LaunchRequest.json("/enrollment/\(current.case.id.uuidString.lowercased())/eligibility", Body(expectedRevision: current.case.revision, answers: value)) { _ = await repository.mutate(request, ticket: ticket) } }
            }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(value == nil || questions.count != 4 || repository.saving)
            if value == nil { Text("Answer all four questions to continue.").font(Letterpress.ui(13)) }
        }
    }
}
