import SwiftUI

enum EnrollmentCopy {
    static let fallbackReason = "You're not eligible for online care right now."
    static let continueReason = "Answer all three questions to continue."
    static let notCharged = "You have not been charged."
    static let waitlisted = "We'll keep your request on file."

    static func consentEyebrow(version: Int) -> String { "Consent · V\(version)" }

    /// One sentence per reason, never empty; unknown future codes fall back to a general sentence.
    static func reasons(for screening: EligibilityScreening) -> [String] {
        var lines: [String] = []
        for code in screening.reasons {
            let line: String
            switch code {
            case "state":
                line = screening.stateCode == "NON_US"
                    ? "ClearAF is only available in the United States right now."
                    : "ClearAF isn't available in your state yet."
            case "age": line = "You don't meet the minimum age for online care yet."
            case "pregnancy": line = "ClearAF can't treat you online during pregnancy."
            case "breastfeeding": line = "ClearAF can't treat you online while breastfeeding."
            default: line = fallbackReason
            }
            if !lines.contains(line) { lines.append(line) }
        }
        return lines.isEmpty ? [fallbackReason] : lines
    }
}

/// Eligibility screener, not-eligible outcome and consent, shown between profile load and onboarding
/// (not in the spec; adapted to its fields, rules and single filled action).
struct EnrollmentView: View {
    @ObservedObject private var repository = APIService.shared.enrollment
    @State private var updatingAnswers = false

    var body: some View {
        NavigationStack {
            content
                .background(Letterpress.canvas.ignoresSafeArea())
                .toolbar {
                    if updatingAnswers && repository.state?.status == .ineligible {
                        ToolbarItem(placement: .cancellationAction) {
                            // Back to the not-eligible result (and its waitlist action) without submitting anything.
                            Button("Cancel") { updatingAnswers = false }
                                .accessibilityIdentifier("enrollmentCancelUpdate")
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) { Button("Sign out") { APIService.shared.logout() } }
                }
        }
        .tint(Letterpress.action)
        .task(id: repository.state?.status) {
            if repository.state?.status == .enrolled { APIService.shared.enrollmentFinished() }
        }
        // A message from one step never carries into the next.
        .onChange(of: repository.state?.status) { _, _ in repository.clearError() }
        .onChange(of: updatingAnswers) { _, _ in repository.clearError() }
    }

    @ViewBuilder private var content: some View {
        switch repository.state?.status {
        case .screeningRequired:
            ScreeningForm(repository: repository) {}
        case .ineligible:
            if updatingAnswers || repository.state?.screening == nil {
                ScreeningForm(repository: repository) { updatingAnswers = false }
            } else if let screening = repository.state?.screening {
                NotEligibleView(repository: repository, screening: screening) { updatingAnswers = true }
            }
        case .consentRequired:
            if let consent = repository.state?.consent { ConsentView(repository: repository, consent: consent) }
        case .enrolled:
            waiting(Text("Opening your account"))
        case nil:
            VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                UrgentReportEntry(horizontalPadding: 0)
                Spacer()
                if let error = repository.error {
                    Text("Couldn't load your eligibility steps")
                        .font(Letterpress.display(28, relativeTo: .title))
                        .foregroundStyle(Letterpress.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(error)
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("Loading your eligibility steps")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                Button(repository.loading ? "Loading…" : "Reload") {
                    guard let ticket = APIService.shared.access.snapshot() else { return }
                    Task { await repository.load(ticket: ticket) }
                }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(repository.loading)
                Spacer()
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.vertical, Letterpress.Space.s18)
            .frame(maxWidth: 600, maxHeight: .infinity, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private func waiting(_ label: Text) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
            UrgentReportEntry(horizontalPadding: 0)
            Spacer()
            HStack(spacing: Letterpress.Space.s10) {
                SwiftUI.ProgressView().tint(Letterpress.inkTertiary)
                label
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
            }
            Spacer()
        }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.vertical, Letterpress.Space.s18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

private struct ScreeningForm: View {
    @ObservedObject var repository: EnrollmentRepository
    let onSubmitted: () -> Void
    @State private var stateCode = ""
    @State private var dateOfBirth: Date?
    @State private var pregnancy: PregnancyAnswer?
    @State private var choosingDate = false
    @State private var draftDate = Date.now
    private let pregnancyQuestion = "Are you currently pregnant, trying to conceive, or breastfeeding?"

    var body: some View {
        // A plain List keeps the native navigation-link state picker; rows sit on canvas with rule-tinted separators.
        List {
            Group {
                UrgentReportEntry(horizontalPadding: 0)
                    .listRowSeparator(.hidden)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Text("A few questions first")
                        .font(Letterpress.display(34, relativeTo: .largeTitle))
                        .foregroundStyle(Letterpress.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text("We check eligibility before you start. Your answers are shared with your care team.")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, Letterpress.Space.s10)
                .listRowSeparator(.hidden)
                Picker("State of residence", selection: $stateCode) {
                    Text("Choose").tag("")
                    ForEach(ResidenceOption.all, id: \.code) { option in Text(option.name).tag(option.code) }
                }
                .pickerStyle(.navigationLink)
                .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                .foregroundStyle(Letterpress.ink)
                .frame(minHeight: Letterpress.minTouch)
                .accessibilityIdentifier("enrollmentState")
                Button {
                    draftDate = dateOfBirth ?? Self.defaultBirthDate()
                    choosingDate = true
                } label: {
                    HStack(spacing: Letterpress.Space.s10) {
                        Text("Date of birth")
                            .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                        Spacer(minLength: Letterpress.Space.s10)
                        Text(dateOfBirth.map { LetterpressFormat.dayMonthYear($0) } ?? "Choose")
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(dateOfBirth == nil ? Letterpress.inkSecondary : Letterpress.ink)
                    }
                    .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("enrollmentDOB")
                VStack(alignment: .leading, spacing: 0) {
                    Text(pregnancyQuestion)
                        .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, Letterpress.Space.s10)
                    ForEach(PregnancyAnswer.allCases) { answer in
                        LetterpressRadioRow(title: answer.title, selected: pregnancy == answer) { pregnancy = answer }
                    }
                    LetterpressRule()
                }
                .padding(.vertical, Letterpress.Space.s14)
                .listRowSeparator(.hidden)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Button(repository.saving ? "Saving…" : "Continue", action: submit)
                        .buttonStyle(.letterpress(.filled, fullWidth: true))
                        .disabled(!canContinue)
                        .accessibilityIdentifier("enrollmentContinue")
                    if let error = repository.error {
                        Text(error)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("enrollmentError")
                    } else if !canContinue && !repository.saving {
                        Text(EnrollmentCopy.continueReason)
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                }
                .padding(.vertical, Letterpress.Space.s14)
                .listRowSeparator(.hidden)
            }
            .listRowBackground(Letterpress.canvas)
            .listRowInsets(EdgeInsets(top: 0, leading: Letterpress.Space.s22, bottom: 0, trailing: Letterpress.Space.s22))
            .listRowSeparatorTint(Letterpress.rule)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .sheet(isPresented: $choosingDate) {
            NavigationStack {
                DatePicker("Date of birth", selection: $draftDate, in: ScreeningDates.earliestBirthDate...Date.now, displayedComponents: .date)
                    .datePickerStyle(.wheel)
                    .labelsHidden()
                    .padding()
                    .navigationTitle("Date of birth")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { choosingDate = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { dateOfBirth = draftDate; choosingDate = false }
                                .accessibilityIdentifier("enrollmentDOBDone")
                        }
                    }
            }
            .presentationDetents([.medium])
            .letterpressSheetBackground()
        }
    }

    private var canContinue: Bool { !stateCode.isEmpty && dateOfBirth != nil && pregnancy != nil && !repository.saving }

    private static func defaultBirthDate() -> Date { Calendar.current.date(byAdding: .year, value: -25, to: .now) ?? .now }

    private func submit() {
        guard canContinue, let dateOfBirth, let pregnancy, let ticket = APIService.shared.access.snapshot() else { return }
        let answers = ScreeningAnswers(stateCode: stateCode, dateOfBirth: ScreeningDates.string(from: dateOfBirth), pregnancyStatus: pregnancy.rawValue)
        Task {
            await repository.submit(answers, ticket: ticket)
            if repository.error == nil { onSubmitted() }
        }
    }
}

private struct NotEligibleView: View {
    @ObservedObject var repository: EnrollmentRepository
    let screening: EligibilityScreening
    let onUpdate: () -> Void

    var body: some View {
        let waitlisted = screening.waitlistRequestedAt != nil
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                UrgentReportEntry(horizontalPadding: 0)
                Text("ClearAF can't provide your care right now")
                    .font(Letterpress.display(28, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("enrollmentNotEligible")
                    .padding(.top, Letterpress.Space.s28)
                LetterpressRule(weight: .major)
                    .padding(.top, Letterpress.Space.s18)
                ForEach(EnrollmentCopy.reasons(for: screening), id: \.self) { reason in
                    Text(reason)
                        .font(Letterpress.ui(16, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, Letterpress.Space.s10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .bottom) { LetterpressRule() }
                }
                Text(EnrollmentCopy.notCharged)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .padding(.top, Letterpress.Space.s14)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    if waitlisted {
                        Text(EnrollmentCopy.waitlisted)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                            .accessibilityIdentifier("enrollmentWaitlisted")
                    } else {
                        Button(repository.saving ? "Saving…" : "Notify me if ClearAF becomes available to me") {
                            guard let ticket = APIService.shared.access.snapshot() else { return }
                            Task { await repository.joinWaitlist(ticket: ticket) }
                        }
                        .buttonStyle(.letterpress(.filled, fullWidth: true))
                        .disabled(repository.saving)
                        .accessibilityIdentifier("enrollmentWaitlist")
                    }
                    // Exactly one filled action: once waitlisted, updating answers is the primary step.
                    Button("Update my answers", action: onUpdate)
                        .buttonStyle(.letterpress(waitlisted ? .filled : .outlined, fullWidth: true))
                        .disabled(repository.saving)
                        .accessibilityIdentifier("enrollmentUpdateAnswers")
                    if let error = repository.error {
                        Text(error)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, Letterpress.Space.s28)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.vertical, Letterpress.Space.s18)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }
}

private struct ConsentView: View {
    @ObservedObject var repository: EnrollmentRepository
    let consent: ConsentDocument

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                UrgentReportEntry(horizontalPadding: 0)
                Text(EnrollmentCopy.consentEyebrow(version: consent.version))
                    .letterpressEyebrow()
                    .padding(.top, Letterpress.Space.s28)
                Text(consent.title)
                    .font(Letterpress.display(28, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, Letterpress.Space.s10)
                LetterpressRule(weight: .major)
                    .padding(.top, Letterpress.Space.s18)
                // Plain string: paragraphs are kept and nothing in the document is interpreted as Markdown.
                Text(verbatim: consent.body)
                    .font(Letterpress.ui(16, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .lineSpacing(Letterpress.Space.s6)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s18)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Button(repository.saving ? "Saving…" : "I understand and agree") {
                        guard let ticket = APIService.shared.access.snapshot() else { return }
                        Task { await repository.acceptConsent(ticket: ticket) }
                    }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(repository.saving)
                    .accessibilityIdentifier("enrollmentAgree")
                    if let error = repository.error {
                        Text(error)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, Letterpress.Space.s28)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.vertical, Letterpress.Space.s18)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }
}
