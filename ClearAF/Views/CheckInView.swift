import SwiftUI

/// Check-in copy and page logic (spec §6 #9). Validation stays in `CheckInValidation`; this only decides what a page shows.
enum CheckInFlow {
    static let textLimit = 2000
    static let advanceReason = "Answer this question to continue. It's required."
    static let lengthReason = "Shorten your answer to 2,000 characters or fewer."
    static let sendReason = "Answer every required question before sending."
    static let footnote = "Answers are sent together at the end. Your draft stays on this device until you send it."
    static let readers = "Your clinician reads these alongside your photos."
    static let sentAnnouncement = "Check-in sent"

    enum SendOutcome: Equatable { case sent, failed }

    /// Only a send made on this screen is felt and announced. Resuming a check-in that was already sent or had
    /// failed restores that status from disk without passing through `.sending`, so it stays quiet.
    static func sendOutcome(from old: CheckInRepository.Status, to new: CheckInRepository.Status) -> SendOutcome? {
        guard old == .sending else { return nil }
        switch new {
        case .sent: return .sent
        case .failed: return .failed
        default: return nil
        }
    }

    static func answer(for question: CheckInQuestion, in answers: [CheckInAnswer]) -> CheckInAnswer? {
        answers.first { $0.questionId == question.id }
    }

    static func isAnswered(_ question: CheckInQuestion, in answers: [CheckInAnswer]) -> Bool {
        guard let answer = answer(for: question, in: answers) else { return false }
        switch question.type {
        case .text: return !(answer.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .choice: return question.options.contains { $0.id == answer.optionId }
        }
    }

    static func isTooLong(_ question: CheckInQuestion, in answers: [CheckInAnswer]) -> Bool {
        question.type == .text && (answer(for: question, in: answers)?.text ?? "").utf16.count > textLimit
    }

    static func canAdvance(_ question: CheckInQuestion, in answers: [CheckInAnswer]) -> Bool {
        !isTooLong(question, in: answers) && (!question.required || isAnswered(question, in: answers))
    }

    /// First unanswered question; the review page once everything is answered or the response was submitted.
    static func resumeIndex(_ draft: CheckInDraft) -> Int {
        let questions = draft.form.questions
        guard draft.submittedAt == nil else { return questions.count }
        return questions.firstIndex { !isAnswered($0, in: draft.answers) } ?? questions.count
    }

    static func progress(index: Int, count: Int) -> String {
        index >= count ? "REVIEW" : "\(index + 1) OF \(count)"
    }

    /// A question opened from the review list goes straight back there instead of on to the next question.
    static func advanceLabel(position: Int, count: Int, returningToReview: Bool) -> String {
        if returningToReview { return "Back to review" }
        return position == count - 1 ? "Review answers" : "Next question"
    }

    static func eyebrow(_ form: CheckInForm) -> String { "\(form.title) · V\(form.version)" }

    static func requirement(_ question: CheckInQuestion) -> String {
        "\(question.required ? "Required" : "Optional"). \(readers)"
    }

    static func summary(_ question: CheckInQuestion, in answers: [CheckInAnswer]) -> String {
        guard isAnswered(question, in: answers), let answer = answer(for: question, in: answers) else {
            return question.required ? "Not answered · required" : "Not answered"
        }
        return answer.text ?? question.options.first { $0.id == answer.optionId }?.label ?? "Not answered"
    }

    static func count(_ text: String) -> String { "\(text.utf16.count) / \(textLimit)" }

    static func status(_ status: CheckInRepository.Status) -> String {
        switch status {
        case .draft: "Draft saved on this device"
        case .pending: "Waiting to send. Saved on this device."
        case .sending: "Sending…"
        case .failed: "Couldn't send. Your answers are saved on this device."
        case .sent: "Sent"
        }
    }

    static func sendLabel(_ status: CheckInRepository.Status, submitted: Bool) -> String {
        if status == .sending { return "Sending…" }
        return submitted ? "Retry sending" : "Send check-in"
    }

    static func stamp(_ timestamp: String) -> String {
        RoutineDates.instant(timestamp).map { LetterpressFormat.stampTime($0) } ?? timestamp
    }
}

/// Weekly check-in (spec §6 #9). Pushed from Today: no tab bar, no bottom spacer.
struct CheckInView: View {
    @ObservedObject private var repository = APIService.shared.checkIns
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var form: CheckInForm?
    @State private var loaded = false
    @State private var error: String?
    @State private var index = 0
    @State private var positionedDraft: UUID?
    @State private var returningToReview = false
    /// Which way the last page change went, so the new page slides in from the side you're heading to.
    @State private var forward = true
    /// Keyed by page, so the outgoing page's title (still on screen while it slides away) never holds focus.
    @AccessibilityFocusState private var focusedPage: Int?

    var body: some View {
        let ticket = APIService.shared.access.snapshot()
        // The ZStack holds the outgoing and incoming pages on top of each other while they slide. `.id(index)` also
        // starts each question at the top.
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    content(ticket)
                }
                .padding(.horizontal, Letterpress.Space.s22)
                .padding(.top, Letterpress.Space.s10)
                .padding(.bottom, Letterpress.Space.s28)
                .frame(maxWidth: 600, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .id(index)
            .transition(reduceMotion ? .opacity : .asymmetric(
                insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
                removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity)))
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .navigationTitle("Check-in")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .task { await load(ticket) }
        .refreshable { await load(ticket) }
        .onChange(of: repository.draft?.id, initial: true) { _, id in
            guard let draft = repository.draft, positionedDraft != id else { return }
            index = CheckInFlow.resumeIndex(draft)
            returningToReview = false
            positionedDraft = id
        }
        // VoiceOver lands on the new page's title; the focus move is the announcement.
        .onChange(of: index) { _, new in focusedPage = new }
        .modifier(CheckInSendFeedback(status: repository.status, failure: repository.error))
        .announcing(error)
    }

    @ViewBuilder private func content(_ ticket: AccountAccess.Ticket?) -> some View {
        if let draft = repository.draft {
            let questions = draft.form.questions
            let position = min(index, questions.count)
            header(position: position, count: questions.count)
            if let error {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text(error)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.error)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Try again") { Task { await load(ticket) } }
                        .buttonStyle(.letterpress(.underline))
                }
                .padding(.top, Letterpress.Space.s14)
            }
            if repository.status == .sent {
                sentPage(draft, ticket)
            } else if position < questions.count {
                questionPage(draft, question: questions[position], position: position, ticket: ticket)
            } else {
                reviewPage(draft, ticket)
            }
        } else if let error {
            emptyState(title: "Couldn't load your check-in", detail: error) {
                Button("Try again") { Task { await load(ticket) } }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
            }
        } else if loaded {
            let archived = form?.isActive == false
            emptyState(title: archived ? "This check-in was archived" : "No check-in yet",
                       detail: archived ? "Your clinician archived it. Past responses are still available."
                                        : "When your clinician sets questions, they'll appear here.") {
                historyLink
            }
        } else {
            HStack(spacing: Letterpress.Space.s10) {
                SwiftUI.ProgressView().tint(Letterpress.inkTertiary)
                Text("Loading your check-in")
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
            }
            .padding(.top, Letterpress.Space.s22)
        }
    }

    private func header(position: Int, count: Int) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s10) {
                Text(CheckInFlow.progress(index: position, count: count))
                    .font(Letterpress.data(11, relativeTo: .caption))
                    .foregroundStyle(Letterpress.ink)
                    .accessibilityIdentifier("checkInProgress")
                Spacer(minLength: Letterpress.Space.s10)
                Text(CheckInFlow.status(repository.status))
                    .font(Letterpress.ui(12, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("checkInStatus")
            }
            LetterpressProgressRule(completed: min(position + 1, count), total: count)
        }
    }

    @ViewBuilder private func questionPage(_ draft: CheckInDraft, question: CheckInQuestion, position: Int, ticket: AccountAccess.Ticket?) -> some View {
        let answers = draft.answers
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(CheckInFlow.eyebrow(draft.form)).letterpressEyebrow()
            Text(question.prompt)
                .font(Letterpress.display(28, relativeTo: .title))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($focusedPage, equals: index)
            reason(CheckInFlow.requirement(question))
        }
        .padding(.top, Letterpress.Space.s22)
        newerFormNote(draft)
        Group {
            switch question.type {
            case .choice:
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(question.options) { option in
                        let selected = CheckInFlow.answer(for: question, in: answers)?.optionId == option.id
                        LetterpressRadioRow(title: option.label, selected: selected) {
                            // Tapping the chosen option of an optional question clears it.
                            let value: UUID? = selected && !question.required ? nil : option.id
                            update(CheckInAnswer(questionId: question.id, text: nil, optionId: value), ticket)
                        }
                    }
                    LetterpressRule()
                }
                .sensoryFeedback(.selection, trigger: CheckInFlow.answer(for: question, in: answers)?.optionId)
            case .text:
                let text = CheckInFlow.answer(for: question, in: answers)?.text ?? ""
                LetterpressLabeledField(label: "Your answer", isEmpty: text.isEmpty, message: CheckInFlow.count(text),
                                        isError: CheckInFlow.isTooLong(question, in: answers)) {
                    TextField(text: textBinding(question, ticket), prompt: nil, axis: .vertical) { Text(question.prompt) }
                        .lineLimit(3...10)
                        .accessibilityIdentifier("checkInText")
                }
            }
        }
        .padding(.top, Letterpress.Space.s22)
        .disabled(draft.submittedAt != nil)
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            let layout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: Letterpress.Space.s10))
                : AnyLayout(HStackLayout(spacing: Letterpress.Space.s10))
            layout {
                if position > 0 {
                    Button("Back") {
                        go(to: position - 1)
                        returningToReview = false
                    }
                        .buttonStyle(.letterpress(.outlined, fullWidth: dynamicTypeSize.isAccessibilitySize))
                        .accessibilityIdentifier("checkInBack")
                }
                Button(CheckInFlow.advanceLabel(position: position, count: draft.form.questions.count, returningToReview: returningToReview)) {
                    go(to: returningToReview ? draft.form.questions.count : position + 1)
                    returningToReview = false
                }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(!CheckInFlow.canAdvance(question, in: answers))
                    .accessibilityIdentifier("checkInNext")
            }
            if CheckInFlow.isTooLong(question, in: answers) {
                reason(CheckInFlow.lengthReason)
            } else if !CheckInFlow.canAdvance(question, in: answers) {
                reason(CheckInFlow.advanceReason)
            }
            reason(CheckInFlow.footnote)
        }
        .padding(.top, Letterpress.Space.s28)
    }

    @ViewBuilder private func reviewPage(_ draft: CheckInDraft, _ ticket: AccountAccess.Ticket?) -> some View {
        let submitted = draft.submittedAt != nil
        let valid = CheckInValidation.answers(draft.answers, questions: draft.form.questions)
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(CheckInFlow.eyebrow(draft.form)).letterpressEyebrow()
            Text(submitted ? "Your answers" : "Review your answers")
                .font(Letterpress.display(28, relativeTo: .title))
                .foregroundStyle(Letterpress.ink)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($focusedPage, equals: index)
        }
        .padding(.top, Letterpress.Space.s22)
        newerFormNote(draft)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(draft.form.questions.enumerated()), id: \.element.id) { position, question in
                Button {
                    go(to: position)
                    returningToReview = true
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s10) {
                        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                            Text(question.prompt)
                                .font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline))
                                .foregroundStyle(Letterpress.ink)
                            Text(CheckInFlow.summary(question, in: draft.answers))
                                .font(Letterpress.ui(15, relativeTo: .body))
                                .foregroundStyle(Letterpress.inkSecondary)
                        }
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        if !submitted {
                            Image(systemName: "chevron.right")
                                .font(Letterpress.ui(13, relativeTo: .footnote))
                                .foregroundStyle(Letterpress.inkTertiary)
                                .accessibilityHidden(true)
                        }
                    }
                    .padding(.vertical, Letterpress.Space.s10)
                    .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
                    .overlay(alignment: .top) { LetterpressRule() }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(submitted)
                .accessibilityHint(submitted ? "" : "Change this answer")
            }
            LetterpressRule()
        }
        .padding(.top, Letterpress.Space.s22)
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Button(CheckInFlow.sendLabel(repository.status, submitted: submitted)) { send(ticket) }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(repository.status == .sending || !valid)
                .accessibilityIdentifier("checkInSend")
            if let failure = repository.error {
                Text(failure)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("checkInError")
            } else if !valid {
                reason(CheckInFlow.sendReason)
            }
            reason(CheckInFlow.footnote)
            historyLink
        }
        .padding(.top, Letterpress.Space.s28)
    }

    @ViewBuilder private func sentPage(_ draft: CheckInDraft, _ ticket: AccountAccess.Ticket?) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
            Text(CheckInFlow.eyebrow(draft.form)).letterpressEyebrow()
            Text("Check-in sent")
                .font(Letterpress.display(28, relativeTo: .title))
                .foregroundStyle(Letterpress.ink)
                .accessibilityAddTraits(.isHeader)
            reason(CheckInFlow.readers)
            if let submittedAt = draft.submittedAt {
                Text("SENT \(CheckInFlow.stamp(submittedAt))")
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkTertiary)
            }
        }
        .padding(.top, Letterpress.Space.s22)
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Button("Done") { dismiss() }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .accessibilityIdentifier("checkInDone")
            if let form, form.isActive {
                Button("Start another check-in") {
                    guard let ticket else { return }
                    do { try repository.start(form, ticket: ticket) }
                    catch { self.error = "Your new draft couldn't be saved. Try again." }
                }
                .buttonStyle(.letterpress(.outlined, fullWidth: true))
            }
            historyLink
        }
        .padding(.top, Letterpress.Space.s28)
    }

    @ViewBuilder private func newerFormNote(_ draft: CheckInDraft) -> some View {
        if loaded, form?.id != draft.form.id {
            reason("This response keeps the form you started. A newer assignment does not change it.")
                .padding(.top, Letterpress.Space.s14)
        }
    }

    private var historyLink: some View {
        NavigationLink("Response history") { CheckInHistoryView() }
            .buttonStyle(.letterpress(.underline))
    }

    private func emptyState<Action: View>(title: String, detail: String, @ViewBuilder action: () -> Action) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
            Text(title)
                .font(Letterpress.display(28, relativeTo: .title))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(detail)
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            action().padding(.top, Letterpress.Space.s10)
        }
        .padding(.top, Letterpress.Space.s22)
    }

    private func reason(_ text: String) -> some View {
        Text(text)
            .font(Letterpress.ui(13, relativeTo: .footnote))
            .foregroundStyle(Letterpress.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func textBinding(_ question: CheckInQuestion, _ ticket: AccountAccess.Ticket?) -> Binding<String> {
        Binding(
            get: { CheckInFlow.answer(for: question, in: repository.draft?.answers ?? [])?.text ?? "" },
            set: { update(CheckInAnswer(questionId: question.id, text: $0, optionId: nil), ticket) }
        )
    }

    private func update(_ answer: CheckInAnswer, _ ticket: AccountAccess.Ticket?) {
        guard let ticket else { return }
        do { try repository.update(answer, ticket: ticket); error = nil }
        catch { self.error = "Your edit couldn't be saved. Try again." }
    }

    /// A leaving page keeps the transition it was last drawn with, so when the direction flips it is redrawn with the
    /// new direction first and the page changes on the next turn of the run loop.
    private func go(to newIndex: Int) {
        let isForward = newIndex > index
        guard isForward != forward else {
            withAnimation(.smooth) { index = newIndex }
            return
        }
        forward = isForward
        DispatchQueue.main.async { withAnimation(.smooth) { index = newIndex } }
    }

    private func send(_ ticket: AccountAccess.Ticket?) {
        guard let ticket else { return }
        do {
            try repository.prepare(ticket: ticket)
            Task { await repository.send(ticket: ticket) }
        } catch {
            self.error = "Answer the required questions and check the length before sending."
        }
    }

    private func load(_ ticket: AccountAccess.Ticket?) async {
        guard let ticket else { return }
        do {
            try repository.resume(ticket)
            let current = try await APIService.shared.fetchCheckInForm(ticket: ticket)
            try APIService.shared.access.require(ticket)
            form = current
            loaded = true
            error = nil
            if repository.draft == nil, let current, current.isActive { try repository.start(current, ticket: ticket) }
        } catch {
            guard APIService.shared.access.snapshot() == ticket else { return }
            self.error = "Check your connection, then try again. Any draft stays on this device."
        }
    }
}

/// Only a send made here buzzes: resuming a check-in that was already sent, or failed earlier, stays quiet.
/// The send's outcome, felt and spoken once, keyed on the status transition so a second failure with the same
/// sentence is still heard.
private struct CheckInSendFeedback: ViewModifier {
    let status: CheckInRepository.Status
    let failure: String?

    func body(content: Content) -> some View {
        content
            .sensoryFeedback(trigger: status) { old, new in
                switch CheckInFlow.sendOutcome(from: old, to: new) {
                case .sent: SensoryFeedback.success
                case .failed: SensoryFeedback.error
                case nil: nil
                }
            }
            .onChange(of: status) { old, new in
                switch CheckInFlow.sendOutcome(from: old, to: new) {
                case .sent: AccessibilityNotification.Announcement(CheckInFlow.sentAnnouncement).post()
                case .failed: if let failure { AccessibilityNotification.Announcement(failure).post() }
                case nil: break
                }
            }
    }
}

/// Past responses, newest first (existing endpoint and pagination).
struct CheckInHistoryView: View {
    @State private var records: [CheckInResponse] = []
    @State private var page = 1
    @State private var totalPages = 1
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if loading {
                    Text("Loading your responses")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                } else if let error {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                        Text(error)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                        Button("Try again") { Task { await load() } }
                            .buttonStyle(.letterpress(.underline))
                    }
                } else if records.isEmpty {
                    Text("No responses yet")
                        .font(Letterpress.display(28, relativeTo: .title))
                        .foregroundStyle(Letterpress.ink)
                    Text("Check-ins you send appear here.")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .padding(.top, Letterpress.Space.s10)
                }
                ForEach(records) { record in
                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                        Text(CheckInFlow.eyebrow(record.form))
                            .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                        Text("SENT \(CheckInFlow.stamp(record.submittedAt)) · RECEIVED \(CheckInFlow.stamp(record.receivedAt))")
                            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                            .foregroundStyle(Letterpress.inkTertiary)
                        DisclosureGroup("Answers") {
                            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                                ForEach(record.form.questions) { question in
                                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                                        Text(question.prompt)
                                            .font(Letterpress.ui(14, weight: .medium, relativeTo: .subheadline))
                                            .foregroundStyle(Letterpress.ink)
                                        Text(CheckInFlow.summary(question, in: record.answers))
                                            .font(Letterpress.ui(14, relativeTo: .subheadline))
                                            .foregroundStyle(Letterpress.inkSecondary)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            .padding(.top, Letterpress.Space.s6)
                        }
                        .font(Letterpress.ui(14, weight: .medium, relativeTo: .subheadline))
                        .tint(Letterpress.ink)
                    }
                    .padding(.vertical, Letterpress.Space.s14)
                    .overlay(alignment: .top) { LetterpressRule() }
                }
                if !records.isEmpty { LetterpressRule() }
                if totalPages > 1 {
                    HStack(spacing: Letterpress.Space.s10) {
                        Button("Previous") { page -= 1; Task { await load() } }
                            .buttonStyle(.letterpress(.outlined))
                            .disabled(page <= 1 || loading)
                        Spacer(minLength: 0)
                        Text("Page \(page) of \(totalPages)")
                            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                            .foregroundStyle(Letterpress.inkTertiary)
                        Spacer(minLength: 0)
                        Button("Next") { page += 1; Task { await load() } }
                            .buttonStyle(.letterpress(.outlined))
                            .disabled(page >= totalPages || loading)
                    }
                    .padding(.top, Letterpress.Space.s14)
                }
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.top, Letterpress.Space.s18)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .navigationTitle("Responses")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let ticket = APIService.shared.access.snapshot(), !loading else { return }
        loading = true
        error = nil
        records = []
        defer { loading = false }
        do {
            let result = try await APIService.shared.fetchCheckInResponses(page: page, ticket: ticket)
            try APIService.shared.access.require(ticket)
            records = result.data
            totalPages = max(result.pagination.totalPages, 1)
        } catch {
            if APIService.shared.access.snapshot() == ticket { self.error = "Couldn't load your responses." }
        }
    }
}

// MARK: - Scheduled launch care
struct LaunchCheckInsView: View {
    @ObservedObject var repository: LaunchCheckInRepository
    let ticket: AccountAccess.Ticket
    var sites: [String] = []
    var body: some View {
        LaunchPage(title: "Your scheduled check-ins") {
            Text("Your clinician reads your answers alongside a fresh photo set. Your schedule comes from your care membership.")
            if repository.loading && repository.occurrences.isEmpty { Text("Loading your schedule…") }
            else if repository.occurrences.isEmpty { Text("No scheduled check-ins were returned. Refresh to check again.") }
            ForEach(repository.occurrences) { occurrence in
                NavigationLink {
                    LaunchCheckInDetailView(repository: repository, ticket: ticket, occurrenceId: occurrence.id, sites: sites)
                } label: {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                        Text(occurrence.kind == .weekly ? "Weekly check-in" : "Monthly check-in").font(Letterpress.ui(17, weight: .medium))
                        Text("Due \(LaunchCheckInCopy.date(occurrence.dueAt))").font(Letterpress.data(12))
                        Text(LaunchCheckInCopy.status(occurrence, draft: repository.drafts[occurrence.id])).font(Letterpress.ui(13))
                        LetterpressRule()
                    }.foregroundStyle(Letterpress.ink).frame(maxWidth: .infinity, alignment: .leading)
                }.buttonStyle(.plain)
            }
            if repository.page < repository.totalPages { Button("Load earlier check-ins") { Task { _ = await repository.loadMore(ticket: ticket) } }.buttonStyle(.letterpress(.outlined)).disabled(repository.loading) }
            Button(repository.loading ? "Refreshing…" : "Refresh schedule") { Task { _ = await repository.refresh(ticket: ticket) } }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(repository.loading)
            if let error = repository.error { Text(error).foregroundStyle(Letterpress.error) }
        }
        .navigationTitle("Check-ins").navigationBarTitleDisplayMode(.inline).toolbar(.hidden, for: .tabBar)
        .task { _ = await repository.refresh(ticket: ticket) }.refreshable { _ = await repository.refresh(ticket: ticket) }
    }
}
enum LaunchCheckInCopy {
    static func date(_ value: String) -> String { LaunchDates.instant(value).map { LetterpressFormat.dayMonthYear($0) } ?? "Date unavailable" }
    static func status(_ occurrence: LaunchCheckIn, draft: LaunchCheckInDraft?) -> String {
        switch occurrence.status {
        case .due: return draft == nil ? "Due" : "Continue your saved check-in"
        case .draft: return "Continue your check-in"
        case .submitted: return "Submitted for clinician review"
        case .needsChanges: return "Changes requested"
        case .reviewed: return "Reviewed by your clinician"
        case .superseded: return "Replaced by your current schedule · read-only"
        }
    }
}
struct LaunchCheckInDetailView: View {
    @ObservedObject var repository: LaunchCheckInRepository
    let ticket: AccountAccess.Ticket
    let occurrenceId: UUID
    var sites: [String] = []
    @StateObject private var photos: LaunchPhotoSetRepository
    @State private var input = LaunchFollowUpInput()
    @State private var loaded = false
    @State private var localError: String?
    @State private var confirmingRestart = false
    init(repository: LaunchCheckInRepository, ticket: AccountAccess.Ticket, occurrenceId: UUID, sites: [String] = []) {
        self.repository = repository; self.ticket = ticket; self.occurrenceId = occurrenceId; self.sites = sites
        _photos = StateObject(wrappedValue: repository.photoRepository())
    }
    private var occurrence: LaunchCheckIn? { repository.occurrences.first { $0.id == occurrenceId } }
    private var draft: LaunchCheckInDraft? { repository.drafts[occurrenceId] }
    var body: some View {
        LaunchPage(title: "Your check-in") {
            if let occurrence {
                Text("Due \(LaunchCheckInCopy.date(occurrence.dueAt)) · \(occurrence.kind.rawValue)").font(Letterpress.data(12))
                Text(occurrence.form.title).font(Letterpress.ui(13))
                Text("Form version \(occurrence.form.version)").font(Letterpress.data(12))
                Text(LaunchCheckInCopy.status(occurrence, draft: draft))
                if let message = occurrence.patientMessage { Text(message).font(Letterpress.display(22)) }
                if let draft, !draft.sent, repository.membership?.access == .care, repository.isCurrent(draft, occurrence: occurrence) {
                    if !draft.frozen {
                        fields(draft.form).disabled(repository.sending != nil)
                        NavigationLink("Add or review photo set") {
                            LaunchCheckInPhotosView(photos: photos, checkIns: repository, ticket: ticket, occurrence: occurrence, sites: sites)
                        }.buttonStyle(.letterpress(.outlined, fullWidth: true))
                        Text(draft.photoSet.map { LaunchPhotoRules.complete($0) ? "Photo set shared" : "Photo set incomplete" } ?? "A complete fresh photo set is required.").font(Letterpress.ui(13))
                    } else { Text("Your original submission is saved on this device. Retry sends the same answers and photo-set identity.") }
                    Button(repository.sending == occurrenceId ? "Sending…" : draft.frozen ? "Retry sending" : "Send check-in") { Task { _ = await repository.send(occurrenceId, ticket: ticket) } }
                        .buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(repository.sending != nil || draft.input.answers == nil || draft.photoSet.map({ !LaunchPhotoRules.complete($0) }) != false)
                } else if let answers = occurrence.answers {
                    LaunchFollowUpSummary(answers: answers)
                } else {
                    Text(repository.membership?.access == .care ? "The questions or schedule changed. Refresh and review the current check-in." : "Your check-in history remains available. New submissions require current care access.")
                }
                if repository.membership?.access == .care, [.due, .draft, .needsChanges].contains(occurrence.status), draft == nil || draft?.frozen == true || draft.map({ !repository.isCurrent($0, occurrence: occurrence) }) == true {
                    Button("Start again with current questions") { confirmingRestart = true }.buttonStyle(.letterpress(.outlined)).disabled(repository.sending != nil || repository.loading)
                }
            } else { Text("This occurrence is not in the current page. Return to your schedule and refresh.") }
            if let error = localError ?? repository.error { Text(error).foregroundStyle(Letterpress.error) }
            Button(repository.loading ? "Refreshing…" : "Refresh check-in") { Task { _ = await repository.refresh(ticket: ticket); begin() } }.buttonStyle(.letterpress(.underline)).disabled(repository.loading || repository.sending != nil)
            Text("If you notice any side effect, even a small one, stop that medication and message us. Do not restart a stopped medication until your clinician replies.").font(Letterpress.ui(13))
        }
        .navigationTitle("Check-in").navigationBarTitleDisplayMode(.inline).toolbar(.hidden, for: .tabBar)
        .onAppear { begin() }
        .onChange(of: input) { _, value in guard loaded, draft?.frozen == false else { return }; do { try repository.update(value, occurrenceId: occurrenceId, ticket: ticket) } catch { localError = "Your answers could not be saved on this device. Keep this screen open and try again." } }
        .confirmationDialog("Replace the saved draft?", isPresented: $confirmingRestart, titleVisibility: .visible) {
            Button("Start new draft", role: .destructive) { do { try repository.start(occurrenceId, ticket: ticket, replacing: true); input = .init(); localError = nil } catch { localError = "Current questions could not be opened. Refresh and try again." } }.disabled(repository.sending != nil || repository.loading)
            Button("Cancel", role: .cancel) {}
        } message: { Text("The saved answers will be replaced. Earlier submitted responses remain in your clinical history.") }
    }
    @ViewBuilder private func fields(_ form: CheckInForm) -> some View {
        if LaunchFollowUpSchema.valid(form, owner: ticket.accountID) {
            Text(form.title + " · V\(form.version)").font(Letterpress.data(12))
            semanticChoice(.tolerability, prompt: form.questions[0].prompt, selected: input.tolerability?.rawValue)
            semanticChoice(.sideEffects, prompt: form.questions[1].prompt, selected: input.sideEffectsNone.map { $0 ? "none" : "details" })
            if input.sideEffectsNone == false { detail(form.questions[2].prompt, value: $input.sideEffectsDetails) }
            semanticChoice(.pregnancy, prompt: form.questions[3].prompt, selected: input.pregnancyStatus?.rawValue)
            semanticChoice(.newMedicines, prompt: form.questions[4].prompt, selected: input.newMedicinesNone.map { $0 ? "none" : "details" })
            if input.newMedicinesNone == false { detail(form.questions[5].prompt, value: $input.newMedicinesDetails) }
            semanticChoice(.location, prompt: form.questions[6].prompt, selected: input.physicallyInNC.map { $0 ? "in_nc" : "outside_nc" })
            if input.physicallyInNC == false { Text("Your location answer will be recorded for your clinician. Prescribing requires current North Carolina location.").font(Letterpress.ui(13)) }
        }
    }
    private func semanticChoice(_ topic: LaunchFollowUpTopic, prompt: String, selected: String?) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(prompt).font(Letterpress.ui(17, weight: .medium))
            ForEach(LaunchFollowUpChoices.options(topic)) { option in
                LetterpressRadioRow(title: option.label, selected: selected == option.id) { input.choose(topic, code: option.id) }
            }
            LetterpressRule()
        }
    }
    private func detail(_ prompt: String, value: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Text(prompt)
            TextField(prompt, text: value, axis: .vertical).letterpressField(isEmpty: value.wrappedValue.isEmpty)
            Text("\(value.wrappedValue.utf16.count) / 2,000").font(Letterpress.data(11))
        }
    }
    private func begin() {
        guard let occurrence, [.due, .draft, .needsChanges].contains(occurrence.status), repository.membership?.access == .care else { return }
        do { try repository.start(occurrenceId, ticket: ticket); input = draft?.input ?? .init(); loaded = true; localError = nil }
        catch { localError = "The check-in form is incompatible or has changed. Refresh the current questions before continuing." }
    }
}
private struct LaunchCheckInPhotosView: View {
    @ObservedObject var photos: LaunchPhotoSetRepository
    @ObservedObject var checkIns: LaunchCheckInRepository
    let ticket: AccountAccess.Ticket
    let occurrence: LaunchCheckIn
    let sites: [String]
    @Environment(\.dismiss) private var dismiss
    @State private var error: String?
    var body: some View {
        VStack(spacing: 0) {
            if let error { Text(error).font(Letterpress.ui(13)).foregroundStyle(Letterpress.error).padding(.horizontal, Letterpress.Space.s22) }
            ClinicalPhotoSetView(repository: photos, ticket: ticket, targetId: occurrence.id, purpose: .checkIn, requiredSlots: LaunchPhotoRules.required(sites: sites), serverSet: occurrence.photoSet) { set in
                do { try checkIns.attach(set, occurrenceId: occurrence.id, ticket: ticket); dismiss() }
                catch { self.error = "Your photo set could not be attached. Refresh and try again." }
            }
        }.onAppear { do { try checkIns.clearPhotos(occurrenceId: occurrence.id, ticket: ticket) } catch { self.error = "Your check-in draft changed. Return and refresh." } }
    }
}
struct LaunchFollowUpSummary: View {
    let answers: LaunchFollowUp
    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text("Treatment tolerability: \(answers.tolerability == .good ? "Good" : answers.tolerability == .someIrritation ? "Some irritation" : "Not tolerating")")
            Text(answers.sideEffects.none ? "No side effects reported" : "Side effects: " + (answers.sideEffects.details ?? "Details unavailable"))
            Text("Pregnancy status: \(answers.pregnancyStatus.rawValue.replacingOccurrences(of: "_", with: " "))")
            Text(answers.newMedicines.none ? "No new medicines reported" : "New medicines: " + (answers.newMedicines.details ?? "Details unavailable"))
            Text(answers.physicallyInNC ? "In North Carolina at submission" : "Not in North Carolina at submission")
        }.font(Letterpress.ui(15))
    }
}
