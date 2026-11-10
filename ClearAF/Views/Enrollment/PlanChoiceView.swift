import SwiftUI

struct PlanChoiceView: View {
    @ObservedObject var enrollment: LaunchEnrollmentRepository
    @ObservedObject var billing: BillingRepository
    let ticket: AccountAccess.Ticket
    @State private var selected: LaunchPlanID?
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        LaunchPage(title: "Choose your care plan") {
            if let catalog = enrollment.catalog {
                ForEach(catalog.plans.filter { Enrollment22Routing.usesNewOrder(enrollment.state) || enrollment.state?.case.intakeV2 == nil || $0.id.rawValue == enrollment.state?.case.intakeV2?.answers["planId"]?.string }) { plan in
                    VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                        LetterpressRadioRow(title: plan.name, selected: selected == plan.id) { selected = plan.id }
                        Text(LaunchBillingCopy.price(cents: plan.amountCents, currency: plan.currency) + " / month").font(Letterpress.data(24))
                        Text(LaunchBillingCopy.inclusions(plan))
                        Text(LaunchBillingCopy.cadence(plan)).font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
                        LetterpressRule()
                    }
                }
                Text("Your subscription renews monthly until you cancel. The billing period begins when payment is confirmed. Clinical care and check-in cadence begin only after your clinician approves your identity and medical information.")
                if !Enrollment22Routing.usesNewOrder(enrollment.state) && enrollment.state?.case.intakeV2 != nil && billing.checkoutRequired { NavigationLink("Review intake before payment") { IntakeV2View(repository: enrollment, ticket: ticket) }.buttonStyle(.letterpress(.outlined, fullWidth: true)) }
                if !billing.checkoutRequired {
                    PaymentStatusView(billing: billing, enrollment: enrollment, ticket: ticket)
                } else {
                    Button(billing.saving ? "Opening secure Checkout…" : "Continue to secure Checkout") { checkout(catalog) }
                        .buttonStyle(.letterpress(.filled, fullWidth: true))
                        .disabled(selected == nil || billing.saving)
                    if selected == nil { Text("Select a plan to continue.").font(Letterpress.ui(13)) }
                    Text(LaunchBillingCopy.status(billing.membership)).font(Letterpress.ui(13))
                    Button(billing.loading ? "Refreshing…" : "Check payment status") { refresh() }.buttonStyle(.letterpress(.outlined, fullWidth: true)).disabled(billing.loading)
                }
                if billing.settingsChanged {
                    Button("Review current plans") { Task { await enrollment.loadCatalog(ticket: ticket); selected = nil } }.buttonStyle(.letterpress(.underline))
                }
            } else {
                Text("Your plans could not be loaded.")
                Button("Reload plans") { Task { await enrollment.loadCatalog(ticket: ticket) } }.buttonStyle(.letterpress(.filled, fullWidth: true))
            }
            if let error = billing.error { Text(error).foregroundStyle(Letterpress.error) }
        }
        .task { selected = enrollment.state?.case.enrollmentProgress?.selectedPlan ?? enrollment.state?.case.planId ?? enrollment.state?.case.intakeV2?.answers["planId"].flatMap { LaunchPlanID(rawValue: $0.string) }; _ = await billing.refresh(ticket: ticket) }
        .onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
        .task(id: selected) {
            guard Enrollment22Routing.usesNewOrder(enrollment.state), let selected, selected != enrollment.state?.case.enrollmentProgress?.selectedPlan else { return }
            do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
            while enrollment.saving { do { try await Task.sleep(for: .milliseconds(80)) } catch { return } }
            guard !Task.isCancelled else { return }
            _ = await enrollment.saveProgress(step: "payment", selectedPlan: selected, ticket: ticket)
        }
        .onChange(of: enrollment.catalog?.settingsVersion) { _, _ in selected = nil }
    }
    private func checkout(_ catalog: LaunchCatalog) {
        guard let selected, let current = enrollment.state else { return }
        Task {
            if let url = await billing.checkout(caseId: current.case.id, planId: selected, settingsVersion: catalog.settingsVersion, ticket: ticket) { openURL(url) }
            if billing.settingsChanged { await enrollment.loadCatalog(ticket: ticket); self.selected = nil }
        }
    }
    private func refresh() { Task { _ = await billing.refresh(ticket: ticket); _ = await enrollment.refresh(ticket: ticket) } }
}
