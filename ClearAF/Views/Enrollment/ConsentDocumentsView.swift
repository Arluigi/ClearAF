import SwiftUI

struct LaunchConsentSelection: Equatable {
    private var accepted: [LaunchConsentKey: String] = [:]
    private func signature(_ document: LaunchConsent) -> String { "\(document.version):\(document.sha256)" }
    mutating func set(_ document: LaunchConsent, accepted: Bool) { self.accepted[document.key] = accepted ? signature(document) : nil }
    func contains(_ document: LaunchConsent) -> Bool { accepted[document.key] == signature(document) }
    func isComplete(_ documents: [LaunchConsent]) -> Bool {
        Set(documents.map(\.key)) == Set(LaunchConsentKey.allCases) && documents.count == 4 && documents.allSatisfy(contains)
    }
}

struct ConsentDocumentsView: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @State private var selection = LaunchConsentSelection()
    @State private var initialized = false
    @State private var draftRevision: Int?
    @Environment(\.scenePhase) private var scenePhase
    private var conflict: Bool { Enrollment22Routing.usesNewOrder(repository.state) && draftRevision != nil && draftRevision != repository.state?.case.revision }
    private var documents: [LaunchConsent] { repository.state?.consents ?? [] }
    var body: some View {
        LaunchPage(title: "Before we begin") {
            Text("Read and accept each document separately.")
            ForEach(documents) { document in
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Toggle(document.title, isOn: Binding(get: { selection.contains(document) }, set: { selection.set(document, accepted: $0) })).toggleStyle(.letterpressCheck)
                    Text("\((document.versionLabel.contains("draft") || document.versionLabel.contains("pending-review")) ? "DRAFT · " : "")Version \(document.versionLabel)").font(Letterpress.data(12))
                    DisclosureGroup("Read full document") { Text(document.body).textSelection(.enabled) }
                        .accessibilityLabel("Read \(document.title), version \(document.versionLabel)")
                    LetterpressRule()
                }
            }
            Button(repository.saving ? "Saving…" : "Accept and continue") {
                Task {
                    let ok = await repository.submitConsents(documents, ticket: ticket)
                    if !ok { selection = LaunchConsentSelection() }
                }
            }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(!selection.isComplete(documents) || repository.saving || conflict)
            if Enrollment22Routing.usesNewOrder(repository.state) {
                Button("Save and come back") { Task { _ = await saveSelection() } }.buttonStyle(.letterpress(.outlined, fullWidth: true)).disabled(repository.saving || conflict)
            }
            if !selection.isComplete(documents) { Text("Accept all four current documents to continue.").font(Letterpress.ui(13)) }
            if conflict {
                Text("Your saved consent choices changed. Review the current choices before continuing.")
                Button("Use current saved choices") { restoreSelection() }.buttonStyle(.letterpress(.outlined, fullWidth: true))
            }
        }
        .onAppear { restoreSelection() }
        .onChange(of: documents) { _, _ in restoreSelection() }
        .task(id: selection) {
            guard initialized, Enrollment22Routing.usesNewOrder(repository.state) else { return }
            do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
            _ = await saveSelection()
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active && initialized { Task { _ = await saveSelection() } } }
    }
    private func restoreSelection() {
        selection = LaunchConsentSelection()
        for document in documents where document.acceptedAt != nil || repository.state?.case.enrollmentProgress?.consentDraft?.contains(where: { $0.matches(document) }) == true { selection.set(document, accepted: true) }
        draftRevision = repository.state?.case.revision; initialized = true
    }
    private func saveSelection() async -> Bool {
        while repository.saving { do { try await Task.sleep(for: .milliseconds(80)) } catch { return false } }
        guard !Task.isCancelled, !conflict, repository.state?.case.status == .consents else { return false }
        let signatures = documents.filter(selection.contains).map(LaunchEnrollmentProgress.Signature.init)
        if repository.state?.case.enrollmentProgress?.consentDraft == signatures { return true }
        let saved = await repository.saveProgress(step: "consents", consentDraft: signatures, ticket: ticket)
        if saved { draftRevision = repository.state?.case.revision }
        return saved
    }
}

extension LaunchEnrollmentRepository {
    func submitConsents(_ documents: [LaunchConsent], ticket: AccountAccess.Ticket) async -> Bool {
        guard let current = state else { return false }
        struct Acceptance: Encodable { let key: LaunchConsentKey; let version: Int; let sha256: String }
        struct Body: Encodable { let expectedRevision: Int; let acceptances: [Acceptance] }
        do {
            let body = Body(expectedRevision: current.case.revision, acceptances: documents.map { Acceptance(key: $0.key, version: $0.version, sha256: $0.sha256) })
            let ok = await mutate(try .json("/enrollment/\(current.case.id.uuidString.lowercased())/consents", body), ticket: ticket)
            if !ok { await loadCatalog(ticket: ticket) }
            return ok
        } catch { return false }
    }
}
