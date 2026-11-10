import SwiftUI

/// The v2 flow completes all gates, clinical answers and attestations before checkout.
/// Its catalog and record are separate from the installed-build v1 questionnaire.
struct IntakeV2View: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @State private var answers: [String: IntakeValue] = [:]
    @State private var section = 0
    @State private var gate = 0
    @State private var loaded = false
    @State private var localError: String?
    @State private var editingShipping = false
    private let gates = ["W1", "A1", "A2", "A3", "A4", "A5", "A6", "A6b", "A6choice", "A7"]
    private var questions: [LaunchQuestion] { (repository.catalog?.eligibilityQuestions ?? []) + (repository.catalog?.medicalQuestions ?? []) }
    private var gateQuestions: [LaunchQuestion] { gates.compactMap { id in questions.first { $0.id == id } }.filter { IntakeV2Rules.shown($0.showWhen, answers: answers) } }
    private var sections: [IntakeV2Catalog.Section] { repository.catalog?.intakeV2?.sections.filter { $0.id != "W" && $0.id != "A" } ?? [] }
    private var active: IntakeV2Catalog.Section? { section > 0 && section <= sections.count ? sections[section - 1] : nil }
    private var visible: [LaunchQuestion] {
        if section == 0 { return gateQuestions.isEmpty ? [] : [gateQuestions[min(gate, gateQuestions.count - 1)]] }
        return (active?.questionIds ?? []).compactMap { id in questions.first { $0.id == id } }.filter { IntakeV2Rules.shown($0.showWhen, answers: answers) && ($0.id != "B6_details" || IntakeV2Rules.shown(questions.first { $0.id == "B6" }?.showWhen ?? [], answers: answers)) }
    }
    private var conflict: Bool { repository.intakeV2DraftRevision != nil && repository.intakeV2DraftRevision != repository.state?.case.revision }
    private var currentComplete: Bool {
        visible.allSatisfy { IntakeV2Rules.complete($0, answers: answers) } && (active?.id != "F" || photoComplete) && (active?.id != "G" || logisticsComplete)
    }
    private var photoComplete: Bool { repository.state?.case.photoSet.map(LaunchPhotoRules.complete) ?? false }
    private var logisticsComplete: Bool {
        guard let plan = answers["planId"]?.string, ["care", "all_in"].contains(plan) else { return false }
        if plan == "care" { return true }
        if case .allIn = repository.state?.case.destination { return answers["G2"]?.string == "yes" }; return false
    }
    var body: some View {
        Group {
            if let code = repository.state?.case.intakeV2?.evaluation.exitPage, let copy = repository.catalog?.intakeV2?.exitPages[code] {
                LaunchPage(title: "Your safety check") { Text(copy) }
            } else if repository.state?.case.status == .ineligible {
                LaunchPage(title: "Your visit has stopped") { Text(repository.state?.case.patientMessage ?? "You have not been charged.") }
            } else if let state = repository.state, IntakeV2Routing.showsFinalReview(state) {
                CaseFinalReviewView(repository: repository, ticket: ticket)
            } else if section == 0 && visible.first?.id == "A7" && IntakeV2Routing.needsIdentity(repository.state?.case.identity) {
                VStack {
                    IdentityCaptureView(repository: repository, ticket: ticket)
                    Button("Previous question") { gate = max(0, gate - 1) }.buttonStyle(.letterpress(.underline))
                }
            } else if !loaded {
                LaunchPage(title: "Your intake") { Text("Loading your versioned questionnaire…") }
            } else {
                questionnaire
            }
        }
        .navigationDestination(isPresented: $editingShipping) { DestinationView(repository: repository, ticket: ticket, planId: .allIn, onSaved: { editingShipping = false }) }
        .onAppear { initialize() }
        .onChange(of: repository.catalog) { _, _ in initialize() }
        .onChange(of: answers) { _, value in
            guard loaded else { return }
            let clean = IntakeV2Rules.cleaned(value, questions: questions)
            if clean != value { answers = clean; return }
            do { try repository.stageIntakeV2(value, ticket: ticket); localError = nil }
            catch { localError = "Your draft could not be saved on this device. Keep this screen open and try again." }
        }
        .onChange(of: repository.state?.case.identity) { _, identity in
            if identity != nil && section == 0 { answers["A7"] = .bool(true) }
        }
    }
    private var questionnaire: some View {
        LaunchPage(title: active?.title ?? (visible.first?.id == "W1" ? "Welcome and how UNZIT works" : "Safety gates")) {
            Text("DRAFT · Version 2.0-pending-review").font(Letterpress.data(12))
            if repository.state?.case.status == .needsChanges {
                Text(repository.state?.case.patientMessage ?? "Your clinician requested an update.")
                NavigationLink("Update identity") { IdentityCaptureView(repository: repository, ticket: ticket) }.buttonStyle(.letterpress(.outlined, fullWidth: true))
                NavigationLink("Update clinical photos") { EnrollmentClinicalPhotosView(enrollment: repository, ticket: ticket) }.buttonStyle(.letterpress(.outlined, fullWidth: true))
                Button("Review health answers") { section = 1 }.buttonStyle(.letterpress(.outlined, fullWidth: true))
                if repository.canSubmitCase { NavigationLink("Review and resubmit") { CaseFinalReviewView(repository: repository, ticket: ticket) }.buttonStyle(.letterpress(.outlined, fullWidth: true)) }
            }
            if let active, !active.intro.isEmpty { Text(active.intro) }
            if active?.id == "H", let intro = repository.catalog?.intakeV2?.attestationIntro { Text(intro) }
            if repository.catalog?.intakeV2 == nil {
                Text("The complete questionnaire could not be loaded.")
                Button("Reload questionnaire") { Task { await repository.loadCatalog(ticket: ticket) } }.buttonStyle(.letterpress(.outlined))
            }
            if active?.id == "F" {
                NavigationLink("Take and review your photos") { EnrollmentClinicalPhotosView(enrollment: repository, ticket: ticket) }.buttonStyle(.letterpress(.outlined, fullWidth: true))
                Text(photoComplete ? "Required photos shared" : "Every required photo must be shared before continuing.")
            }
            if active?.id == "G" { logistics }
            ForEach(visible.filter { $0.id != "A7" }) { question in IntakeV2Fields(question: question, answers: $answers).disabled(repository.saving) }
            if visible.first?.id == "A7", repository.state?.case.identity != nil {
                Text(repository.catalog?.identityGuidance?.prompt ?? visible.first?.prompt ?? "")
                Toggle(repository.catalog?.identityGuidance?.attestation ?? "This ID is mine, and the selfie is really me.", isOn: Binding(get: { answers["A7"]?.checked == true }, set: { answers["A7"] = .bool($0) })).toggleStyle(.letterpressCheck)
            }
            if conflict {
                Text("Your enrollment changed. Review the saved answers before reapplying this device's draft.")
                DisclosureGroup("Current saved answers") { Text(String(describing: repository.state?.case.intakeV2?.answers ?? [:])).textSelection(.enabled) }
                Button("Reapply my reviewed draft") { do { try repository.rebaseIntakeV2Draft(ticket: ticket) } catch { localError = "Refresh your enrollment and try again." } }.buttonStyle(.letterpress(.outlined))
            }
            if section > 0 || gate > 0 { Button("Previous") { if section == 0 { gate -= 1 } else { section -= 1 } }.buttonStyle(.letterpress(.underline)).disabled(repository.saving) }
            Button(repository.saving ? "Saving…" : active?.id == "H" ? "Save and continue to payment" : "Save and continue") { save(advance: true) }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(!currentComplete || conflict || repository.saving || repository.catalog?.intakeV2 == nil)
            Button("Save and come back") { save(advance: false) }.buttonStyle(.letterpress(.outlined, fullWidth: true)).disabled(conflict || repository.saving)
            if !currentComplete { Text("Complete each required answer before continuing.").font(Letterpress.ui(13)) }
            if let localError { Text(localError).foregroundStyle(Letterpress.error) }
        }
    }
    @ViewBuilder private var logistics: some View {
        ForEach(repository.catalog?.plans ?? []) { plan in
            LetterpressRadioRow(title: "\(plan.name) · \(LaunchBillingCopy.price(cents: plan.amountCents, currency: plan.currency)) / month", selected: answers["planId"]?.string == plan.id.rawValue) { answers["planId"] = .string(plan.id.rawValue) }
        }
        if answers["planId"]?.string == "all_in" {
            if case .allIn(let address) = repository.state?.case.destination { Text("\(address.recipient)\n\(address.line1)\n\(address.city), \(address.state) \(address.postalCode)") }
            Button("Add or update North Carolina shipping address") {
                Task {
                    if await repository.saveIntakeV2(answers, ticket: ticket) { editingShipping = true }
                    else { localError = "Your plan could not be saved. Refresh and review your answers before adding the address." }
                }
            }.buttonStyle(.letterpress(.outlined, fullWidth: true)).disabled(repository.saving || conflict)
            Text("Use a North Carolina shipping address or select Care before continuing.").font(Letterpress.ui(13))
        }
    }
    private func initialize() {
        guard !loaded, IntakeV2Routing.canInitialize(repository.state, catalog: repository.catalog) else { return }
        answers = repository.intakeV2Draft ?? repository.state?.case.intakeV2?.answers ?? [:]
        if repository.state?.case.identity != nil { answers["A7"] = answers["A7"] ?? .bool(true) }
        if let first = gateQuestions.firstIndex(where: { !IntakeV2Rules.complete($0, answers: answers) }) { gate = first }
        else {
            section = sections.firstIndex(where: { item in item.questionIds.compactMap { id in questions.first { $0.id == id } }.contains { !IntakeV2Rules.complete($0, answers: answers) } }).map { $0 + 1 } ?? max(1, sections.count)
        }
        loaded = true
    }
    private func save(advance: Bool) {
        Task {
            guard await repository.saveIntakeV2(answers, ticket: ticket) else { localError = "Your answers could not be shared. Refresh and review any changes before retrying."; return }
            if !advance { return }
            if section == 0 { if gate + 1 < gateQuestions.count { gate += 1 } else { section = 1 } }
            else if section < sections.count { section += 1 }
        }
    }
}
