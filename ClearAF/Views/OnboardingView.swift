import SwiftUI

struct OnboardingRow: Equatable {
    let title: String
    let detail: String
}

/// Five steps (spec §6 #2): what you do, who reads it, what stays private, reminders, your name.
enum OnboardingStep: Int, CaseIterable, Identifiable {
    case routine, careTeam, privacy, reminders, name

    static let skipTarget: OnboardingStep = .name

    var id: Int { rawValue }
    var counter: String { String(format: "%02d/%02d", rawValue + 1, Self.allCases.count) }
    var next: OnboardingStep? { Self(rawValue: rawValue + 1) }
    var previous: OnboardingStep? { Self(rawValue: rawValue - 1) }
    var canSkip: Bool { self != .name }
    var nextHint: String? { next.map { "Next: \($0.shortName)" } }

    var title: String {
        switch self {
        case .routine: "Here's what you'll do"
        case .careTeam: "Who's looking after your skin?"
        case .privacy: "What stays private"
        case .reminders: "Would reminders help?"
        case .name: "What should we call you?"
        }
    }

    var shortName: String {
        switch self {
        case .routine: "what you'll do"
        case .careTeam: "who reads your record"
        case .privacy: "what stays private"
        case .reminders: "reminder times"
        case .name: "your name"
        }
    }
}

/// Onboarding copy. Every sentence describes something the app does today; nothing motivational.
enum OnboardingCopy {
    static let routineIntro = "Your clinician sets the plan. This is your part of it."
    static let routineRows = [
        OnboardingRow(title: "Take a dated photo", detail: "Same light and angle each time makes changes easier for your clinician to compare."),
        OnboardingRow(title: "Follow the routine you're given", detail: "Morning and evening, set by your clinician. When it changes, you see the new version."),
        OnboardingRow(title: "Answer check-ins", detail: "Your clinician writes the questions. Your answers are sent together when you finish."),
    ]
    static let careTeamIntro = "Your clinician assigns your routines and reads the photos, check-ins and notes you send."
    static let privacyIntro = "Plainly, who can see what."
    static let privacyRows = [
        OnboardingRow(title: "You and your clinician", detail: "Your photos, routines, check-ins and notes are visible to you and the clinician assigned to you."),
        OnboardingRow(title: "Photos are stored privately", detail: "Each photo you save uploads to private storage and is shared with your clinician. It is never public."),
        OnboardingRow(title: "Some things stay on this phone", detail: "Reminder times, and anything you haven't sent yet, stay on this device."),
    ]
    static let remindersIntro = "Optional. Reminders stay on this device and pause when you sign out."
    static let reminderFailure = "Couldn't update reminders. Try again, or skip them for now."
    static let nameIntro = "Your clinician sees this name on your record."
    static let nameHint = "Use between 2 and 100 characters."

    static func primary(_ step: OnboardingStep, remindersChanged: Bool, saving: Bool) -> String {
        if saving { return "Saving…" }
        switch step {
        case .reminders: return remindersChanged ? "Save reminders and continue" : "Continue"
        case .name: return "Finish"
        default: return "Continue"
        }
    }
}

struct OnboardingView: View {
    @StateObject private var saveState = AccountSaveState()
    @ObservedObject private var reminders = APIService.shared.reminders
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var step: OnboardingStep = .routine
    @State private var userName = ""
    @State private var reminderDraft = ReminderPreferences()
    let onboardingComplete: () -> Void

    private var busy: Bool { saveState.isSaving || reminders.state == .saving }
    private var remindersChanged: Bool { reminderDraft != reminders.preferences }
    private var canAdvance: Bool {
        step == .name ? AccountName.canSubmit(userName, isSaving: saveState.isSaving) : !busy
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    stepContent
                    if dynamicTypeSize.isAccessibilitySize {
                        actions.padding(.top, Letterpress.Space.s28)
                    }
                    footer.padding(.top, Letterpress.Space.s44)
                }
                .padding(.horizontal, Letterpress.Space.s22)
                .padding(.top, Letterpress.Space.s28)
                .padding(.bottom, Letterpress.Space.s28)
                .frame(maxWidth: 600, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .id(step)
            if !dynamicTypeSize.isAccessibilitySize {
                // Kept in view below the scroll area on regular text sizes; it scrolls with content at accessibility sizes.
                actions
                    .padding(.horizontal, Letterpress.Space.s22)
                    .padding(.vertical, Letterpress.Space.s14)
                    .frame(maxWidth: 600)
                    .frame(maxWidth: .infinity)
                    .background(Letterpress.canvas)
                    .overlay(alignment: .top) { LetterpressRule() }
            }
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .onAppear {
            if userName.isEmpty { userName = APIService.shared.currentUser?.name ?? "" }
        }
        .onChange(of: step) { _, newStep in
            if newStep == .reminders { reminderDraft = reminders.preferences }
        }
    }

    private var header: some View {
        HStack(spacing: Letterpress.Space.s10) {
            Text(step.counter)
                .font(Letterpress.data(11, relativeTo: .caption))
                .foregroundStyle(Letterpress.ink)
                .accessibilityLabel("Step \(step.rawValue + 1) of \(OnboardingStep.allCases.count)")
            LetterpressProgressRule(completed: step.rawValue + 1, total: OnboardingStep.allCases.count)
            if step.canSkip {
                Button("Skip") { step = OnboardingStep.skipTarget }
                    .buttonStyle(.letterpress(.underline))
                    .disabled(busy)
                    .accessibilityHint("Goes to the last step")
                    .accessibilityIdentifier("onboardingSkip")
            }
        }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.top, Letterpress.Space.s10)
        .frame(minHeight: Letterpress.minTouch)
    }

    @ViewBuilder private var stepContent: some View {
        Text(step.title)
            .font(Letterpress.display(34, relativeTo: .largeTitle))
            .foregroundStyle(Letterpress.ink)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
        switch step {
        case .routine:
            intro(OnboardingCopy.routineIntro)
            numberedRows(OnboardingCopy.routineRows)
        case .careTeam:
            intro(OnboardingCopy.careTeamIntro)
            CareTeamRow()
                .padding(.top, Letterpress.Space.s22)
        case .privacy:
            intro(OnboardingCopy.privacyIntro)
            numberedRows(OnboardingCopy.privacyRows)
        case .reminders:
            intro(OnboardingCopy.remindersIntro)
            ReminderRows(draft: $reminderDraft)
                .padding(.top, Letterpress.Space.s22)
            if reminders.state == .failed {
                message(OnboardingCopy.reminderFailure, isError: true)
            } else if reminders.state == .denied {
                message(ReminderCopy.deniedHelp, isError: false)
            }
        case .name:
            intro(OnboardingCopy.nameIntro)
            LetterpressLabeledField(label: "Your name", isEmpty: userName.isEmpty, message: OnboardingCopy.nameHint) {
                TextField(text: $userName, prompt: nil) { Text("Your name") }
                    .textContentType(.name)
                    .accessibilityIdentifier("onboardingName")
            }
            .padding(.top, Letterpress.Space.s22)
            if let saveError = saveState.errorMessage {
                message(saveError, isError: true)
                    .accessibilityIdentifier("onboardingError")
            }
        }
    }

    private func intro(_ text: String) -> some View {
        Text(text)
            .font(Letterpress.ui(15, relativeTo: .body))
            .foregroundStyle(Letterpress.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Letterpress.Space.s14)
    }

    private func message(_ text: String, isError: Bool) -> some View {
        Text(text)
            .font(Letterpress.ui(15, relativeTo: .body))
            .foregroundStyle(isError ? Letterpress.error : Letterpress.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Letterpress.Space.s14)
    }

    private func numberedRows(_ rows: [OnboardingRow]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s14) {
                    Text(String(format: "%02d", index + 1))
                        .font(Letterpress.data(11, relativeTo: .caption))
                        .foregroundStyle(Letterpress.ink)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                        Text(row.title)
                            .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                        Text(row.detail)
                            .font(Letterpress.ui(14, relativeTo: .subheadline))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, Letterpress.Space.s14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { LetterpressRule() }
                .accessibilityElement(children: .combine)
            }
            LetterpressRule()
        }
        .padding(.top, Letterpress.Space.s22)
    }

    private var actions: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: Letterpress.Space.s10))
            : AnyLayout(HStackLayout(spacing: Letterpress.Space.s10))
        return VStack(spacing: Letterpress.Space.s10) {
            layout {
                if let previous = step.previous {
                    Button("Back") { step = previous }
                        .buttonStyle(.letterpress(.outlined, fullWidth: dynamicTypeSize.isAccessibilitySize))
                        .disabled(busy)
                        .accessibilityIdentifier("onboardingBack")
                }
                Button(OnboardingCopy.primary(step, remindersChanged: remindersChanged, saving: busy), action: advance)
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(!canAdvance)
                    .accessibilityIdentifier("onboardingContinue")
            }
            if let hint = step.nextHint {
                Text(hint)
                    .font(Letterpress.ui(12, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkTertiary)
            }
        }
    }

    /// The urgent-report entry owns its sheet, so the sheet closes when onboarding ends.
    private var footer: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            UrgentReportEntry(horizontalPadding: 0)
            Button("Sign out") { APIService.shared.logout() }
                .buttonStyle(.letterpress(.underline))
                .disabled(busy)
        }
    }

    private func advance() {
        switch step {
        case .reminders:
            guard remindersChanged, let ticket = APIService.shared.access.snapshot() else {
                step = .name
                return
            }
            Task { @MainActor in
                await reminders.save(reminderDraft, ticket: ticket)
                if reminders.state != .failed { step = .name }
            }
        case .name:
            completeOnboarding()
        default:
            if let next = step.next { step = next }
        }
    }

    private func completeOnboarding() {
        let name = userName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard AccountName.canSubmit(name, isSaving: saveState.isSaving) else { return }
        Task { @MainActor in
            await saveState.perform(success: nil,
                                    failure: "Your profile could not be saved. Check your connection and try again.") {
                try await APIService.shared.finishOnboarding(name: name)
            }
            if saveState.errorMessage == nil { onboardingComplete() }
        }
    }
}

#Preview {
    OnboardingView {}
}
