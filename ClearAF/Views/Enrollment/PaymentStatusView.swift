import SwiftUI

struct PaymentStatusView: View {
    @ObservedObject var billing: BillingRepository
    @ObservedObject var enrollment: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @Environment(\.openURL) private var openURL
    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
            Text(LaunchBillingCopy.status(billing.membership))
            Text("Returning from the browser does not confirm payment. Refresh to check the payment provider's latest status.").font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
            Button(billing.loading || enrollment.loading ? "Refreshing…" : "Refresh payment and continue") {
                Task { _ = await billing.refresh(ticket: ticket); _ = await enrollment.refresh(ticket: ticket) }
            }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(billing.loading || enrollment.loading)
            if let url = billing.checkoutURL, !billing.paymentConfirmed {
                Button("Return to secure Checkout") { openURL(url) }.buttonStyle(.letterpress(.underline))
            }
            if billing.membership != nil {
                NavigationLink("Membership and billing") { MembershipView(billing: billing, enrollment: enrollment, ticket: ticket) }.buttonStyle(.letterpress(.underline))
            }
        }
    }
}
