import SwiftUI

struct MembershipView: View {
    @ObservedObject var billing: BillingRepository
    @ObservedObject var enrollment: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        LaunchPage(title: "Membership and billing") {
            if let membership = billing.membership {
                let plan = enrollment.catalog?.plans.first { $0.id == membership.planId }
                Text(plan?.name ?? (membership.planId == .care ? "Care" : "All-In")).font(Letterpress.display(28))
                Text(LaunchBillingCopy.price(cents: membership.amountCents, currency: membership.currency) + " / month").font(Letterpress.data(22))
                Text(LaunchBillingCopy.status(membership))
                if let through = membership.paidThrough.flatMap(LaunchDates.instant) {
                    Text("Paid through \(LetterpressFormat.dayMonthYear(through))").font(Letterpress.data(13))
                }
                Text(LaunchBillingCopy.cancellation(membership))
                if membership.refundStatus != .notApplicable { Text(refundCopy(membership.refundStatus)) }
                LetterpressRule()
                if membership.destinationRequired == true {
                    Text("Your new plan needs a destination. Add your own pharmacy for Care or a North Carolina shipping address for All-In to continue care.")
                    NavigationLink("Add required destination") {
                        DestinationView(repository: enrollment, ticket: ticket, planId: membership.planId) {
                            Task { _ = await billing.refresh(ticket: ticket); _ = await enrollment.refresh(ticket: ticket) }
                        }
                    }.buttonStyle(.letterpress(.outlined, fullWidth: true))
                }
                Text("Change plans or cancel in the secure Customer Portal. Plan changes take effect immediately; Stripe calculates any prorated charge or credit. Your check-in schedule refreshes after the provider confirms the change.")
                Button(billing.saving ? "Opening secure portal…" : "Manage plan or cancel") {
                    Task { if let url = await billing.portal(ticket: ticket) { openURL(url) } }
                }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(billing.saving)
            } else {
                Text(billing.loading ? "Loading your membership…" : "No membership was returned. Refresh to check again.")
            }
            Button(billing.loading ? "Refreshing…" : "Refresh membership") { refresh() }.buttonStyle(.letterpress(.outlined, fullWidth: true)).disabled(billing.loading)
            if let error = billing.error { Text(error).foregroundStyle(Letterpress.error) }
        }
        .navigationTitle("Membership").navigationBarTitleDisplayMode(.inline).toolbar(.hidden, for: .tabBar)
        .task { await enrollment.loadCatalog(ticket: ticket); _ = await billing.refresh(ticket: ticket) }
        .onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
    }
    private func refresh() { Task { _ = await billing.refresh(ticket: ticket); _ = await enrollment.refresh(ticket: ticket) } }
    private func refundCopy(_ status: LaunchMembership.Refund) -> String {
        switch status { case .pending: "Full refund pending payment-provider confirmation."; case .issued: "Full refund issued. Your bank may take time to post it."; case .failed: "Your refund needs attention from the practice. Refresh to check for an update."; case .notApplicable: "" }
    }
}
