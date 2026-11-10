import SwiftUI

struct MedicalHistoryView: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @State private var answers = LaunchMedicalDraft()
    @State private var section = 0
    @State private var loaded = false
    @State private var localError: String?
    @State private var saved = false
    init(repository: LaunchEnrollmentRepository, ticket: AccountAccess.Ticket, initialSection: Int = 0) {
        self.repository = repository; self.ticket = ticket
        _section = State(initialValue: min(max(initialSection, 0), 3))
    }
    private let sectionTitles = ["Your health history", "Your acne history", "Medicines and health", "Your preferences"]
    private var questions: [LaunchQuestion] { repository.catalog?.medicalQuestions ?? [] }
    private var catalogComplete: Bool { Set(questions.map(\.id)).isSuperset(of: Set((1...22).map { "M\($0)" } + ["medicationPreference"])) }
    private var visible: [LaunchQuestion] {
        let ids: Set<String>
        switch section { case 0: ids = Set((1...4).map { "M\($0)" }); case 1: ids = Set((5...11).map { "M\($0)" }); case 2: ids = Set((12...17).map { "M\($0)" }); default: ids = Set((18...22).map { "M\($0)" } + ["medicationPreference"]) }
        return questions.filter { ids.contains($0.id) && LaunchMedicalValidation.shown($0.id, in: answers) }
    }
    var body: some View {
        LaunchPage(title: sectionTitles[section]) {
            if repository.canEditMedical {
                Text("Step \(section + 1) of \(sectionTitles.count)").font(Letterpress.data(12))
                if let version = repository.catalog?.questionnaireVersion { Text("\(version.contains("draft") ? "DRAFT · " : "")Version \(version)").font(Letterpress.data(12)) }
                if !catalogComplete {
                    Text("The complete questionnaire could not be loaded. Reload it to continue.")
                    Button("Reload questionnaire") { Task { await repository.loadCatalog(ticket: ticket) } }.buttonStyle(.letterpress(.outlined))
                }
                ForEach(visible) { question in MedicalHistoryFields(question: question, answers: $answers).disabled(repository.saving) }
                if repository.medicalNeedsReapply {
                    Text("Your enrollment changed on the server. Your local answers are preserved. Review the current server answers and questionnaire before deciding whether to reapply yours.")
                    if repository.catalog?.questionnaireVersion != repository.state?.case.questionnaireVersion {
                        Text("The questionnaire changed. Reload the current wording before reapplying your answers.")
                        Button("Reload current questionnaire") { Task { await repository.loadCatalog(ticket: ticket) } }.buttonStyle(.letterpress(.outlined))
                    }
                    DisclosureGroup("Current server answers") {
                        ForEach(questions.filter { LaunchMedicalValidation.shown($0.id, in: repository.state?.case.medicalHistory ?? .init()) }) { question in
                            MedicalHistoryFields(question: question, answers: .constant(repository.state?.case.medicalHistory ?? .init())).disabled(true)
                        }
                    }
                    Button("Reapply my reviewed answers") { do { try repository.reapplyMedical(ticket: ticket) } catch { localError = "Your answers could not be reapplied. Refresh and review again." } }.buttonStyle(.letterpress(.outlined, fullWidth: true)).disabled(repository.saving || repository.catalog?.questionnaireVersion != repository.state?.case.questionnaireVersion)
                }
                if section > 0 { Button("Previous section") { section -= 1 }.buttonStyle(.letterpress(.underline)).disabled(repository.saving) }
                if section < sectionTitles.count - 1 {
                    Button("Next section") { section += 1 }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(repository.saving)
                } else {
                    Button(repository.saving ? "Saving…" : "Save and continue to photos") { save() }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(!LaunchMedicalValidation.complete(answers) || !catalogComplete || repository.saving || repository.medicalNeedsReapply)
                    if !LaunchMedicalValidation.complete(answers) { Text("Answer each required question, make an explicit choice for None where applicable, and confirm the attestation to continue.").font(Letterpress.ui(13)) }
                }
                Button(repository.saving ? "Saving…" : "Save draft") { save() }.buttonStyle(.letterpress(.outlined, fullWidth: true)).disabled(repository.saving || repository.medicalNeedsReapply || !catalogComplete)
                Text(saved ? "Your answers were saved to your enrollment." : "Edits are saved on this device. Use Save draft to share them with your clinician.").font(Letterpress.ui(13))
            } else { Text("Medical history is available after payment is confirmed. Submitted records remain read-only.") }
            if let localError { Text(localError).foregroundStyle(Letterpress.error) }
        }
        .onAppear { guard !loaded else { return }; answers = repository.draft.flatMap { $0.caseId == repository.state?.case.id ? $0.answers : nil } ?? repository.state?.case.medicalHistory ?? .init(); answers.clearHiddenBranches(); loaded = true }
        .onChange(of: answers) { _, next in
            guard loaded else { return }
            var clean = next; clean.clearHiddenBranches()
            if clean != next { answers = clean; return }
            do { try repository.stageMedical(clean, ticket: ticket); localError = nil; saved = false }
            catch { localError = "Your edits could not be saved on this device. Keep this screen open and try again." }
        }
    }
    private func save() {
        do { try repository.stageMedical(answers, ticket: ticket) }
        catch { localError = "Your answers could not be saved. Check the fields and try again."; return }
        Task { saved = await repository.saveMedical(ticket: ticket) }
    }
}
