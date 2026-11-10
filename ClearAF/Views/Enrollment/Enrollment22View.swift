import SwiftUI

/// The server owns the current step; only this publication uses the clinician's new order.
struct Enrollment22View: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    var body: some View {
        if let state = repository.state {
            VStack(spacing: 0) {
                Enrollment22Progress(status: state.case.status)
                content(state)
            }
        }
    }
    @ViewBuilder private func content(_ state: LaunchEnrollmentResponse) -> some View {
        switch state.case.status {
        case .eligibility:
            if state.case.enrollmentProgress?.topicId == nil && (state.case.enrollmentProgress?.eligibilityDraft?.isEmpty ?? true) {
                LaunchPage(title: "Your UNZIT enrollment") {
                    if let expectation = repository.catalog?.enrollmentFlow?.expectation { Text(expectation) }
                    else { Text("Your enrollment information could not be loaded.") }
                    Text("You can save your answers and come back to continue.")
                    Button(repository.saving ? "Saving…" : "Get started") { Task { _ = await repository.saveProgress(step: "eligibility", topicId: "quick_eligibility", ticket: ticket) } }
                        .buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(repository.catalog?.enrollmentFlow == nil || repository.saving)
                }
            } else { EligibilityView(repository: repository, ticket: ticket) }
        case .consents: ConsentDocumentsView(repository: repository, ticket: ticket)
        case .payment: PlanChoiceView(enrollment: repository, billing: APIService.shared.billing, ticket: ticket)
        case .identity: IdentityCaptureView(repository: repository, ticket: ticket)
        case .medicalHistory: Enrollment22MedicalView(repository: repository, ticket: ticket)
        case .photos: EnrollmentClinicalPhotosView(enrollment: repository, ticket: ticket)
        case .destination:
            if let plan = state.membership?.planId ?? state.case.planId { DestinationView(repository: repository, ticket: ticket, planId: plan) }
            else { LaunchPage(title: "Pharmacy and delivery") { Text("Refresh your enrollment to load your selected plan.") } }
        case .needsChanges:
            if state.case.identity?.status == .needsChanges { IdentityCaptureView(repository: repository, ticket: ticket) }
            else if state.case.enrollmentProgress?.step == "destination", let plan = state.case.planId { DestinationView(repository: repository, ticket: ticket, planId: plan) }
            else { Enrollment22MedicalView(repository: repository, ticket: ticket) }
        case .submitted, .approved, .rejected: CaseSubmittedView(repository: repository, ticket: ticket)
        case .ineligible:
            LaunchPage(title: "Your visit has stopped") {
                Text(state.case.patientMessage ?? "Your answers mean you need care in person.")
                if state.membership != nil { Text("Your payment will be refunded in full. Check your care review for the refund status.") }
                else { Text("You have not been charged.") }
            }
        }
    }
}

struct Enrollment22Progress: View {
    let status: LaunchCase.Status
    private let steps: [LaunchCase.Status] = [.eligibility, .consents, .payment, .identity, .medicalHistory, .photos, .destination, .submitted]
    private var index: Int { steps.firstIndex(of: status) ?? (status == .needsChanges ? 4 : 7) }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Step \(index + 1) of \(steps.count) · \(Enrollment22Routing.title(status))").font(Letterpress.data(12))
            SwiftUI.ProgressView(value: Double(index), total: Double(steps.count - 1)).tint(Letterpress.ink)
                .accessibilityLabel("Enrollment progress").accessibilityValue(Enrollment22Routing.title(status))
        }.padding(.horizontal, Letterpress.Space.s22).padding(.vertical, Letterpress.Space.s10)
            .foregroundStyle(Letterpress.ink).background(Letterpress.canvas)
    }
}

struct Enrollment22MedicalView: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @Environment(\.scenePhase) private var scenePhase
    @State private var answers: [String: IntakeValue] = [:]
    @State private var topicId: String?
    @State private var loaded = false
    @State private var localError: String?
    private var sections: [IntakeV2Catalog.Section] { repository.catalog?.enrollmentFlow?.medicalSections ?? [] }
    private var questions: [LaunchQuestion] { (repository.catalog?.eligibilityQuestions ?? []) + (repository.catalog?.medicalQuestions ?? []) }
    private var active: IntakeV2Catalog.Section? { sections.first { $0.id == topicId } }
    private var visible: [LaunchQuestion] {
        (active?.questionIds ?? []).compactMap { id in questions.first { $0.id == id } }.filter { IntakeV2Rules.shown($0.showWhen, answers: answers) && ($0.id != "B6_details" || IntakeV2Rules.shown(questions.first { $0.id == "B6" }?.showWhen ?? [], answers: answers)) }
    }
    private var complete: Bool { !visible.isEmpty && visible.allSatisfy { IntakeV2Rules.complete($0, answers: answers) } }
    private var conflict: Bool { repository.intakeV2DraftRevision != nil && repository.intakeV2DraftRevision != repository.state?.case.revision }
    var body: some View {
        LaunchPage(title: active?.title ?? "Your medical history") {
            if let active {
                Text("Topic \((sections.firstIndex(where: { $0.id == active.id }) ?? 0) + 1) of \(sections.count)").font(Letterpress.data(12))
                if !active.intro.isEmpty { Text(active.intro) }
                if active.id == "routine", let intro = repository.catalog?.intakeV2?.attestationIntro { Text(intro) }
                ForEach(visible) { question in IntakeV2Fields(question: question, answers: $answers) }
                if repository.state?.case.status == .needsChanges {
                    Text(repository.state?.case.patientMessage ?? "Your doctor requested an update.")
                    NavigationLink("Update clinical photos") { EnrollmentClinicalPhotosView(enrollment: repository, ticket: ticket) }.buttonStyle(.letterpress(.outlined, fullWidth: true))
                    if let plan = repository.state?.case.planId { NavigationLink("Update pharmacy or delivery") { DestinationView(repository: repository, ticket: ticket, planId: plan) }.buttonStyle(.letterpress(.outlined, fullWidth: true)) }
                    if repository.canSubmitCase { NavigationLink("Review and resubmit") { CaseFinalReviewView(repository: repository, ticket: ticket) }.buttonStyle(.letterpress(.outlined, fullWidth: true)) }
                }
                if let index = sections.firstIndex(where: { $0.id == active.id }), index > 0 {
                    Button("Previous topic") { move(to: sections[index - 1].id) }.buttonStyle(.letterpress(.underline)).disabled(repository.saving)
                }
                Button(repository.saving ? "Saving…" : "Save and continue") { advance() }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(!complete || repository.saving || conflict)
                Button("Save and come back") { Task { _ = await save() } }.buttonStyle(.letterpress(.outlined, fullWidth: true)).disabled(repository.saving || conflict)
                if !complete { Text("Complete each required answer before continuing.").font(Letterpress.ui(13)) }
                if conflict {
                    Text("Your saved enrollment changed. Refresh and review the saved answers before continuing.")
                    Button("Use current saved answers") { answers = repository.state?.case.intakeV2?.answers ?? [:]; try? repository.rebaseIntakeV2Draft(ticket: ticket); localError = nil }.buttonStyle(.letterpress(.outlined, fullWidth: true))
                }
            } else {
                Text("The medical topics could not be loaded.")
                Button("Reload topics") { Task { await repository.loadCatalog(ticket: ticket); initialize() } }.buttonStyle(.letterpress(.outlined))
            }
            if let localError { Text(localError).foregroundStyle(Letterpress.error) }
        }
        .onAppear { initialize() }
        .onChange(of: repository.catalog) { _, _ in initialize() }
        .onChange(of: answers) { _, value in
            guard loaded else { return }
            let clean = IntakeV2Rules.cleaned(value, questions: questions)
            if clean != value { answers = clean; return }
            do { try repository.stageIntakeV2(clean, ticket: ticket) }
            catch { localError = "Your draft could not be saved on this device. Keep this screen open and try again." }
        }
        .task(id: answers) {
            guard loaded else { return }
            do { try await Task.sleep(for: .milliseconds(500)) } catch { return }
            guard !Task.isCancelled else { return }
            _ = await save()
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active && loaded { Task { _ = await save() } } }
    }
    private func initialize() {
        guard !loaded, let state = repository.state, repository.catalog?.questionnaireVersion == state.case.questionnaireVersion, !sections.isEmpty else { return }
        answers = state.case.intakeV2?.answers ?? [:]
        if repository.intakeV2DraftRevision == state.case.revision, let local = repository.intakeV2Draft { answers = local }
        topicId = Enrollment22Routing.resumeTopic(state, sections: sections, questions: questions)
        loaded = true
    }
    private func save(advance: Bool = false) async -> Bool {
        guard loaded, !conflict else { return false }
        while repository.saving { do { try await Task.sleep(for: .milliseconds(80)) } catch { return false } }
        guard !Task.isCancelled else { return false }
        let value = answers
        if advance || value != repository.state?.case.intakeV2?.answers {
            guard await repository.saveIntakeV2(value, ticket: ticket, advance: advance) else { localError = "Your answers could not be saved online. Keep this screen open and try again."; return false }
        }
        if repository.state?.case.status == .medicalHistory || repository.state?.case.status == .needsChanges {
            if repository.state?.case.enrollmentProgress?.topicId != topicId {
                guard await repository.saveProgress(step: "medical_history", topicId: topicId, ticket: ticket) else { localError = "Your place could not be saved. Try again before leaving."; return false }
            }
        }
        localError = nil
        return true
    }
    private func move(to id: String) {
        Task { if await save(), await repository.saveProgress(step: "medical_history", topicId: id, ticket: ticket) { topicId = id } }
    }
    private func advance() {
        guard let topicId, let index = sections.firstIndex(where: { $0.id == topicId }) else { return }
        if index + 1 < sections.count { move(to: sections[index + 1].id) }
        else { Task { _ = await save(advance: true) } }
    }
}
