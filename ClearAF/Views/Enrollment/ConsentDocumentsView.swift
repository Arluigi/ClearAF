import SwiftUI

struct LaunchConsentSelection {
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
    @State private var reading: LaunchConsent?
    private var documents: [LaunchConsent] { repository.state?.consents ?? [] }
    var body: some View {
        LaunchPage(title: "Before we begin") {
            Text("Read and accept each document separately.")
            ForEach(documents) { document in
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Toggle(document.title, isOn: Binding(get: { selection.contains(document) }, set: { selection.set(document, accepted: $0) })).toggleStyle(.letterpressCheck)
                    Text("\(document.versionLabel.contains("draft") ? "DRAFT · " : "")Version \(document.versionLabel)").font(Letterpress.data(12))
                    Button("Read full document") { reading = document }.buttonStyle(.letterpress(.underline)).accessibilityLabel("Read \(document.title), version \(document.versionLabel)")
                    LetterpressRule()
                }
            }
            Button(repository.saving ? "Saving…" : "Accept and continue") {
                Task {
                    let ok = await repository.submitConsents(documents, ticket: ticket)
                    if !ok { selection = LaunchConsentSelection() }
                }
            }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(!selection.isComplete(documents) || repository.saving)
            if !selection.isComplete(documents) { Text("Accept all four current documents to continue.").font(Letterpress.ui(13)) }
        }
        .onChange(of: documents) { _, _ in selection = LaunchConsentSelection() }
        .sheet(item: $reading) { document in
            NavigationStack {
                LaunchPage(title: document.title) {
                    Text("Version \(document.versionLabel)").font(Letterpress.data(12))
                    if document.versionLabel.contains("draft") { Text("DRAFT — pending clinical and legal approval").font(Letterpress.ui(13)) }
                    Text(document.body).textSelection(.enabled)
                }.toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { reading = nil } } }
            }
        }
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
