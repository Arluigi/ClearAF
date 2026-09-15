import SwiftUI

enum EnrollmentCopy {
    static let fallbackReason = "You're not eligible for online care right now."
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

/// Eligibility screener, not-eligible outcome and consent, shown between profile load and onboarding.
struct EnrollmentView: View {
    @ObservedObject private var repository = APIService.shared.enrollment
    @State private var updatingAnswers = false
    @State private var showingUrgent = false

    var body: some View {
        NavigationStack {
            content
                .background(CareJournal.canvas.ignoresSafeArea())
                .toolbar {
                    // An urgent report must be possible before eligibility and consent are complete.
                    ToolbarItem(placement: .topBarLeading) { UrgentReportButton(isPresented: $showingUrgent) }
                    ToolbarItem(placement: .topBarTrailing) { Button("Sign out") { APIService.shared.logout() } }
                }
        }
        .tint(CareJournal.actionPrimary)
        .sheet(isPresented: $showingUrgent) { UrgentReportView() }
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
            VStack(spacing: .spaceMD) { SwiftUI.ProgressView(); Text("Opening your account…") }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case nil:
            VStack(spacing: .spaceLG) {
                Text(repository.error ?? "Loading your eligibility steps…").multilineTextAlignment(.center)
                Button("Reload") {
                    guard let ticket = APIService.shared.access.snapshot() else { return }
                    Task { await repository.load(ticket: ticket) }
                }
                .disabled(repository.loading)
            }
            .padding(.spaceXXL)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
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
        Form {
            Section {
                VStack(alignment: .leading, spacing: .spaceSM) {
                    Text("A few questions first")
                        .font(CareJournal.display)
                        .foregroundStyle(CareJournal.textPrimary)
                    Text("We check eligibility before you start. Your answers are shared with your care team.")
                        .foregroundStyle(CareJournal.textSecondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            Section {
                Picker("State of residence", selection: $stateCode) {
                    Text("Choose").tag("")
                    ForEach(ResidenceOption.all, id: \.code) { option in Text(option.name).tag(option.code) }
                }
                .pickerStyle(.navigationLink)
                .accessibilityIdentifier("enrollmentState")
                Button {
                    draftDate = dateOfBirth ?? Self.defaultBirthDate()
                    choosingDate = true
                } label: {
                    LabeledContent("Date of birth") {
                        Text(dateOfBirth.map { $0.formatted(date: .long, time: .omitted) } ?? "Choose")
                    }
                }
                .accessibilityIdentifier("enrollmentDOB")
            }
            Section {
                Picker(pregnancyQuestion, selection: $pregnancy) {
                    ForEach(PregnancyAnswer.allCases) { Text($0.title).tag(Optional($0)) }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: {
                Text(pregnancyQuestion).textCase(nil)
            }
            Section {
                Button(action: submit) {
                    HStack(spacing: .spaceSM) {
                        if repository.saving { SwiftUI.ProgressView().tint(CareJournal.onPrimary) }
                        Text(repository.saving ? "Saving…" : "Continue")
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(CareJournal.actionPrimary)
                .foregroundStyle(CareJournal.onPrimary)
                .disabled(!canContinue)
                .accessibilityIdentifier("enrollmentContinue")
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
                if let error = repository.error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.retainedErrorText)
                        .accessibilityIdentifier("enrollmentError")
                }
            }
        }
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
        ScrollView {
            VStack(alignment: .leading, spacing: .spaceXL) {
                Label {
                    Text("ClearAF can't provide your care right now").font(.title2.weight(.semibold))
                } icon: {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
                }
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("enrollmentNotEligible")
                VStack(alignment: .leading, spacing: .spaceSM) {
                    ForEach(EnrollmentCopy.reasons(for: screening), id: \.self) { Text($0) }
                    Text("You have not been charged.")
                }
                .fixedSize(horizontal: false, vertical: true)
                if screening.waitlistRequestedAt != nil {
                    Label("We'll keep your request on file.", systemImage: "checkmark.circle")
                        .accessibilityIdentifier("enrollmentWaitlisted")
                } else {
                    Button {
                        guard let ticket = APIService.shared.access.snapshot() else { return }
                        Task { await repository.joinWaitlist(ticket: ticket) }
                    } label: {
                        Text("Notify me if ClearAF becomes available to me").frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(CareJournal.actionPrimary)
                    .foregroundStyle(CareJournal.onPrimary)
                    .disabled(repository.saving)
                    .accessibilityIdentifier("enrollmentWaitlist")
                }
                Button(action: onUpdate) {
                    Text("Update my answers").frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(repository.saving)
                .accessibilityIdentifier("enrollmentUpdateAnswers")
                if let error = repository.error {
                    Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(Color.retainedErrorText)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .careJournalSurface()
            .padding(20)
        }
    }
}

private struct ConsentView: View {
    @ObservedObject var repository: EnrollmentRepository
    let consent: ConsentDocument

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: .spaceXL) {
                Text(consent.title).font(.title2.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                // Plain string: paragraphs are kept and nothing in the document is interpreted as Markdown.
                Text(verbatim: consent.body).fixedSize(horizontal: false, vertical: true)
                Button {
                    guard let ticket = APIService.shared.access.snapshot() else { return }
                    Task { await repository.acceptConsent(ticket: ticket) }
                } label: {
                    HStack(spacing: .spaceSM) {
                        if repository.saving { SwiftUI.ProgressView().tint(CareJournal.onPrimary) }
                        Text("I understand and agree")
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(CareJournal.actionPrimary)
                .foregroundStyle(CareJournal.onPrimary)
                .disabled(repository.saving)
                .accessibilityIdentifier("enrollmentAgree")
                if let error = repository.error {
                    Label(error, systemImage: "exclamationmark.triangle.fill").foregroundStyle(Color.retainedErrorText)
                }
                Text("Version \(consent.version)").font(.caption).foregroundStyle(CareJournal.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .careJournalSurface()
            .padding(20)
        }
    }
}
