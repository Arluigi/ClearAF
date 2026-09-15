import SwiftUI

struct CheckInView: View {
    @ObservedObject private var repository = APIService.shared.checkIns
    @State private var form: CheckInForm?
    @State private var loaded = false
    @State private var error: String?
    var body: some View {
        let ticket = APIService.shared.access.snapshot()
        Form {
            Section { NavigationLink("Response history") { CheckInHistoryView() } }
            if let error = error ?? repository.error { Section { Text(error); Button("Refresh") { Task { await load(ticket) } } } }
            if let draft = repository.draft {
                Section {
                    Text(draft.form.title).font(.system(.title2, design: .serif))
                    Text("Version \(draft.form.version)")
                    Text(statusText)
                    if form?.id != draft.form.id, loaded { Text("This response keeps the form you started. A newer assignment does not change it.") }
                }
                ForEach(draft.form.questions) { question in
                    Section(question.prompt + (question.required ? " · Required" : " · Optional")) {
                        if question.type == .text {
                            TextField("Your response", text: Binding(get: { repository.draft?.answers.first { $0.questionId == question.id }?.text ?? "" }, set: { value in update(CheckInAnswer(questionId: question.id, text: value, optionId: nil), ticket) }), axis: .vertical)
                            Text("Up to 2,000 characters").font(.caption)
                        } else {
                            Picker("Your response", selection: Binding<UUID?>(get: { repository.draft?.answers.first { $0.questionId == question.id }?.optionId }, set: { value in update(CheckInAnswer(questionId: question.id, text: nil, optionId: value), ticket) })) {
                                Text("Choose an option").tag(Optional<UUID>.none)
                                ForEach(question.options) { option in Text(option.label).tag(Optional(option.id)) }
                            }
                        }
                    }.disabled(draft.submittedAt != nil)
                }
                Section {
                    if repository.status == .sent {
                        if let form, form.isActive { Button("Start another check-in") { do { if let ticket { try repository.start(form, ticket: ticket) } } catch { self.error = "Your draft could not be saved." } } }
                    } else {
                        Button(draft.submittedAt == nil ? "Send check-in" : "Retry original response") {
                            guard let ticket else { return }
                            do { try repository.prepare(ticket: ticket); Task { await repository.send(ticket: ticket) } }
                            catch { self.error = "Complete required responses and check the text length before sending." }
                        }.disabled(repository.status == .sending || !CheckInValidation.answers(draft.answers, questions: draft.form.questions))
                    }
                }
            } else if loaded {
                Section { Text(form?.isActive == false ? "Your clinician archived this check-in." : "No check-in assigned"); Text("Questions from your clinician will appear here.") }
            } else { SwiftUI.ProgressView("Loading check-in…") }
        }
        .navigationTitle("Check-in").tint(CareJournal.actionPrimary)
        .task { await load(ticket) }
        .refreshable { await load(ticket) }
    }
    private var statusText: String {
        switch repository.status {
        case .draft: return "Draft saved on this device"
        case .pending: return "Pending · saved on this device"
        case .sending: return "Sending…"
        case .failed: return "Failed to send · saved on this device"
        case .sent: return "Sent"
        }
    }
    private func update(_ answer: CheckInAnswer, _ ticket: AccountAccess.Ticket?) {
        guard let ticket else { return }
        do { try repository.update(answer, ticket: ticket); error = nil } catch { self.error = "Your edit could not be saved. Please try again." }
    }
    private func load(_ ticket: AccountAccess.Ticket?) async {
        guard let ticket else { return }
        do {
            try repository.resume(ticket)
            let current = try await APIService.shared.fetchCheckInForm(ticket: ticket)
            try APIService.shared.access.require(ticket)
            form = current; loaded = true; error = nil
            if repository.draft == nil, let current, current.isActive { try repository.start(current, ticket: ticket) }
        } catch { guard APIService.shared.access.snapshot() == ticket else { return }; self.error = "Check-in could not be loaded. Refresh to retry." }
    }
}

struct CheckInHistoryView: View {
    @State private var records: [CheckInResponse] = []
    @State private var page = 1
    @State private var totalPages = 1
    @State private var loading = false
    @State private var error: String?
    var body: some View {
        List {
            if loading { SwiftUI.ProgressView("Loading responses…") }
            if let error { Text(error); Button("Retry") { Task { await load() } } }
            if records.isEmpty && !loading && error == nil { Text("No responses recorded") }
            ForEach(records) { record in
                DisclosureGroup("\(record.form.title) · Version \(record.form.version)") {
                    Text("Submitted \(formatted(record.submittedAt))"); Text("Received \(formatted(record.receivedAt))")
                    ForEach(record.form.questions) { q in
                        Text(q.prompt).font(.headline)
                        Text(answer(record, q))
                    }
                }
            }
            HStack {
                Button("Previous") { page -= 1; records = []; Task { await load() } }.disabled(page <= 1 || loading)
                Spacer(); Text("Page \(page)"); Spacer()
                Button("Next") { page += 1; records = []; Task { await load() } }.disabled(page >= totalPages || loading)
            }
        }.navigationTitle("Responses").task { await load() }.refreshable { await load() }
    }
    private func formatted(_ value: String) -> String {
        RoutineDates.instant(value)?.formatted(date: .abbreviated, time: .shortened) ?? value
    }
    private func answer(_ record: CheckInResponse, _ q: CheckInQuestion) -> String {
        guard let a = record.answers.first(where: { $0.questionId == q.id }) else { return "Not answered" }
        return a.text ?? q.options.first(where: { $0.id == a.optionId })?.label ?? "Not answered"
    }
    private func load() async {
        guard let ticket = APIService.shared.access.snapshot(), !loading else { return }
        loading = true; error = nil; records = []
        defer { loading = false }
        do { let result = try await APIService.shared.fetchCheckInResponses(page: page, ticket: ticket); try APIService.shared.access.require(ticket); records = result.data; totalPages = result.pagination.totalPages }
        catch { if APIService.shared.access.snapshot() == ticket { self.error = "Responses could not be loaded." } }
    }
}
