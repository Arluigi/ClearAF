import SwiftUI

enum LaunchEnrollmentRoute {
    static func canOpenCare(caseStatus: LaunchCase.Status, membershipAccess: LaunchMembership.Access?) -> Bool {
        caseStatus == .approved && (membershipAccess == .care || membershipAccess == .readOnly)
    }
}

/// This shell never advances a step optimistically. Every save replaces the case with the server response.
struct LaunchEnrollmentView: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        NavigationStack {
            Group {
                if let state = repository.state {
                    step(state)
                } else {
                    LaunchPage(title: "Your enrollment") {
                        Text(repository.loading ? "Loading your enrollment…" : "Your enrollment could not be loaded.")
                        Button("Try again") { refresh() }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(repository.loading)
                    }
                }
            }
            .background(Letterpress.canvas.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Sign out") { APIService.shared.logout() } }
                if repository.state?.membership != nil {
                    ToolbarItem(placement: .topBarLeading) { NavigationLink("Membership") { MembershipView(billing: APIService.shared.billing, enrollment: repository, ticket: ticket) } }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if let error = repository.error { Text(error).font(Letterpress.ui(13)).foregroundStyle(Letterpress.error).padding().frame(maxWidth: .infinity).background(Letterpress.canvas) }
            }
        }
        .tint(Letterpress.ink)
        .task { await repository.loadCatalog(ticket: ticket); _ = await repository.refresh(ticket: ticket) }
        .onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
        .onChange(of: repository.state, initial: true) { _, _ in APIService.shared.launchEnrollmentFinished() }
    }
    @ViewBuilder private func step(_ state: LaunchEnrollmentResponse) -> some View {
        switch state.case.status {
        case .consents: ConsentDocumentsView(repository: repository, ticket: ticket)
        case .identity: IdentityCaptureView(repository: repository, ticket: ticket)
        case .eligibility: EligibilityView(repository: repository, ticket: ticket)
        case .payment: PlanChoiceView(enrollment: repository, billing: APIService.shared.billing, ticket: ticket)
        case .medicalHistory: MedicalHistoryView(repository: repository, ticket: ticket)
        case .photos: EnrollmentClinicalPhotosView(enrollment: repository, ticket: ticket)
        case .destination:
            if let plan = state.membership?.planId ?? state.case.planId { DestinationView(repository: repository, ticket: ticket, planId: plan) }
            else { LaunchPage(title: "Pharmacy and delivery") { Text("Refresh your enrollment to load the selected plan."); Button("Refresh enrollment") { refresh() }.buttonStyle(.letterpress(.filled, fullWidth: true)) } }
        case .ineligible:
            LaunchPage(title: "UNZIT can't provide your care right now") {
                Text("UNZIT provides online acne care for adults physically in North Carolina. Your answers may mean you need care in person.")
                Text("If you have fever, feel sick, or have suddenly worsening acne or open sores, see a doctor in person in the next day or two.")
                Text("You have not been charged.")
                Button("Refresh enrollment") { refresh() }.buttonStyle(.letterpress(.filled, fullWidth: true))
            }
        case .needsChanges:
            LaunchPage(title: "Your clinician needs an update") {
                Text(state.case.patientMessage ?? "Refresh your enrollment to see the requested changes.")
                if state.case.identity?.status == .needsChanges { IdentityCaptureView(repository: repository, ticket: ticket) }
                else {
                    NavigationLink("Update health history") { MedicalHistoryView(repository: repository, ticket: ticket) }.buttonStyle(.letterpress(.outlined))
                    NavigationLink("Update clinical photos") { EnrollmentClinicalPhotosView(enrollment: repository, ticket: ticket) }.buttonStyle(.letterpress(.outlined))
                    NavigationLink("Review and resubmit") { CaseFinalReviewView(repository: repository, ticket: ticket) }.buttonStyle(.letterpress(.filled, fullWidth: true))
                }
                Button("Refresh enrollment") { refresh() }.buttonStyle(.letterpress(.outlined, fullWidth: true))
            }
        case .submitted, .approved, .rejected:
            CaseSubmittedView(repository: repository, ticket: ticket)
        }
    }
    private func refresh() { Task { await repository.loadCatalog(ticket: ticket); _ = await repository.refresh(ticket: ticket) } }
}

struct LaunchPage<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                UrgentReportEntry(horizontalPadding: 0)
                Text(title).font(Letterpress.display(34, relativeTo: .largeTitle)).accessibilityAddTraits(.isHeader)
                LetterpressRule(weight: .major)
                content
            }
            .font(Letterpress.ui(16)).foregroundStyle(Letterpress.ink)
            .padding(Letterpress.Space.s22)
            .frame(maxWidth: 600, alignment: .leading).frame(maxWidth: .infinity)
        }.background(Letterpress.canvas.ignoresSafeArea())
    }
}
