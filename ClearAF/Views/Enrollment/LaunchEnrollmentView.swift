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
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Sign out") { APIService.shared.logout() } } }
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
                else { Text("Your submitted records are preserved. Your clinician's requested correction will be saved as a new revision.") }
                Button("Refresh enrollment") { refresh() }.buttonStyle(.letterpress(.outlined, fullWidth: true))
            }
        case .submitted, .approved, .rejected:
            LaunchPage(title: state.case.status == .rejected ? "Your care review" : "Your enrollment is with your clinician") {
                Text(state.case.patientMessage ?? "Review within 1 to 2 business days.")
                Text(state.case.status == .rejected ? "Your membership and refund status will update after the payment provider confirms them." : "Uploading your ID does not approve care. Your clinician reviews your identity and medical information before care begins.")
                if let refund = state.membership?.refundStatus, refund != .notApplicable { Text("Refund: \(refund.rawValue)") }
                Button("Refresh status") { refresh() }.buttonStyle(.letterpress(.filled, fullWidth: true))
            }
        default:
            // B3–B5 replace these subsequent server-driven steps with their production views.
            LaunchPage(title: title(state.case.status)) {
                Text("Your progress is saved. Continue from this step when it is available.")
                Button("Refresh enrollment") { refresh() }.buttonStyle(.letterpress(.filled, fullWidth: true))
            }
        }
    }
    private func title(_ status: LaunchCase.Status) -> String {
        switch status { case .payment: "Choose your care plan"; case .medicalHistory: "Your health history"; case .photos: "Your clinical photos"; case .destination: "Pharmacy and delivery"; default: "Your enrollment" }
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
