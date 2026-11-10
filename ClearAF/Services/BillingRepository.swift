import Foundation
import Combine

enum LaunchBillingURL {
    enum Purpose { case checkout, portal }
    static func valid(_ action: LaunchPaymentAction, purpose: Purpose, now: Date = .now) -> URL? {
        let host = purpose == .checkout ? "checkout.stripe.com" : "billing.stripe.com"
        guard let expiry = LaunchDates.instant(action.expiresAt), expiry > now,
              let components = URLComponents(string: action.url), components.scheme == "https",
              components.host == host, components.user == nil, components.password == nil,
              components.port == nil, components.fragment == nil, !components.path.isEmpty,
              let url = components.url else { return nil }
        return url
    }
}

/// Only authenticated membership reads confirm payment; a hosted browser session is never a receipt.
@MainActor final class BillingRepository: ObservableObject {
    @Published private(set) var membership: LaunchMembership?
    @Published private(set) var hostedAction: LaunchPaymentAction?
    @Published private(set) var saving = false
    @Published private(set) var loading = false
    @Published private(set) var error: String?
    @Published private(set) var settingsChanged = false
    private let access: AccountAccess
    private let transport: any LaunchTransport
    private let now: () -> Date
    private var ticket: AccountAccess.Ticket?
    private var epoch = UUID()
    init(access: AccountAccess, transport: any LaunchTransport, now: @escaping () -> Date = { .now }) { self.access = access; self.transport = transport; self.now = now }
    var checkoutURL: URL? { hostedAction.flatMap { LaunchBillingURL.valid($0, purpose: .checkout, now: now()) } }
    var checkoutRequired: Bool { !paymentConfirmed && checkoutURL == nil }
    var paymentConfirmed: Bool {
        guard let membership else { return false }
        return [.paidPendingReview, .active, .pastDue, .ended, .rejected].contains(membership.status)
    }
    func cancel() { epoch = UUID(); ticket = nil; membership = nil; hostedAction = nil; saving = false; loading = false; error = nil; settingsChanged = false }
    private func resume(_ ticket: AccountAccess.Ticket) throws {
        try access.require(ticket)
        if self.ticket != ticket { cancel(); self.ticket = ticket }
    }
    private func require(_ ticket: AccountAccess.Ticket, _ epoch: UUID) throws {
        try access.require(ticket)
        guard self.ticket == ticket, self.epoch == epoch else { throw AccountFailure.accountChanged }
    }
    @discardableResult func refresh(ticket: AccountAccess.Ticket) async -> Bool {
        do { try resume(ticket) } catch { return false }
        guard !loading else { return false }
        let current = epoch; loading = true
        defer { if epoch == current { loading = false } }
        do {
            let bytes = try await transport.send(LaunchRequest(path: "/billing"), ticket: ticket)
            try require(ticket, current)
            let value = try JSONDecoder().decode(LaunchBillingResponse.self, from: bytes)
            if let membership = value.membership {
                guard membership.amountCents >= 0, membership.currency == "usd" else { throw LaunchFailure.invalidData }
            }
            membership = value.membership; error = nil
            return true
        } catch {
            if (try? require(ticket, current)) != nil { self.error = "Couldn't refresh your payment status. Your browser return does not confirm payment. Try again." }
            return false
        }
    }
    func checkout(caseId: UUID, planId: LaunchPlanID, settingsVersion: Int, ticket: AccountAccess.Ticket) async -> URL? {
        struct Body: Encodable { let caseId: String; let planId: LaunchPlanID; let settingsVersion: Int }
        do {
            return await hosted(try .json("/billing/checkout", method: "POST", Body(caseId: caseId.uuidString.lowercased(), planId: planId, settingsVersion: settingsVersion)), purpose: .checkout, ticket: ticket)
        } catch { return nil }
    }
    func portal(ticket: AccountAccess.Ticket) async -> URL? {
        guard let membership else { return nil }
        struct Body: Encodable { let membershipId: String }
        do { return await hosted(try .json("/billing/portal", method: "POST", Body(membershipId: membership.id.uuidString.lowercased())), purpose: .portal, ticket: ticket) }
        catch { return nil }
    }
    private func hosted(_ request: LaunchRequest, purpose: LaunchBillingURL.Purpose, ticket: AccountAccess.Ticket) async -> URL? {
        do { try resume(ticket) } catch { return nil }
        guard !saving else { return nil }
        let current = epoch; saving = true; error = nil; settingsChanged = false; hostedAction = nil
        defer { if current == epoch { saving = false } }
        do {
            let bytes = try await transport.send(request, ticket: ticket)
            try require(ticket, current)
            let action: LaunchPaymentAction
            if purpose == .checkout {
                let response = try JSONDecoder().decode(LaunchCheckoutResponse.self, from: bytes)
                if let confirmed = response.membership {
                    guard confirmed.amountCents >= 0, confirmed.currency == "usd" else { throw LaunchFailure.invalidData }
                }
                membership = response.membership
                guard let checkout = response.action else { return nil }
                action = checkout
            } else {
                action = try JSONDecoder().decode(LaunchPaymentAction.self, from: bytes)
            }
            guard let url = LaunchBillingURL.valid(action, purpose: purpose, now: now()) else { throw LaunchFailure.invalidData }
            hostedAction = action
            return url
        } catch {
            guard (try? require(ticket, current)) != nil else { return nil }
            if case LaunchFailure.server(_, let code) = error, code == "SETTINGS_CHANGED" { settingsChanged = true }
            self.error = settingsChanged ? "Plan details changed. Review the refreshed plans before continuing." : "The secure payment page could not be opened. Refresh your status, then try again. If payment needs authentication, finish it in the secure payment page."
            return nil
        }
    }
}

enum LaunchBillingCopy {
    static func price(cents: Int, currency: String, locale: Locale = .current) -> String {
        let formatter = NumberFormatter(); formatter.numberStyle = .currency; formatter.currencyCode = currency.uppercased(); formatter.locale = locale
        return formatter.string(from: NSDecimalNumber(value: cents).dividing(by: 100)) ?? ""
    }
    static func cadence(_ plan: LaunchPlan) -> String {
        plan.cadence.weeklyWeeks > 0 ? "Weekly check-ins for the first \(plan.cadence.weeklyWeeks) weeks, then monthly. Check-ins begin after clinical approval." : "Monthly check-ins after clinical approval."
    }
    static func inclusions(_ plan: LaunchPlan) -> String {
        plan.includesPartnerRx ? "Clinician review, your care plan and follow-up, with prescribed partner medication through Vida included." : "Clinician review, your care plan and follow-up. Prescriptions go to your own pharmacy; you pay the pharmacy separately."
    }
    static func status(_ membership: LaunchMembership?) -> String {
        guard let membership else { return "Payment has not been confirmed. If you closed Checkout or payment needs authentication, reopen it or refresh after completing payment." }
        switch membership.status {
        case .awaitingPayment: return "Payment is awaiting confirmation. Complete any payment authentication in Checkout, then refresh."
        case .paidPendingReview: return "Payment confirmed. Your care is pending clinical review. Payment does not approve care."
        case .active: return "Your membership is active."
        case .pastDue: return "Your latest payment needs attention. Manage payment in the secure Customer Portal."
        case .ended: return "Your membership has ended. Your clinical history remains available."
        case .rejected: return "Your clinician could not approve online care. Your refund status is shown below."
        }
    }
    static func cancellation(_ membership: LaunchMembership) -> String {
        membership.cancelAtPeriodEnd ? "Cancellation is scheduled. Access continues through your paid period." : "Cancel in the secure Customer Portal. Cancellation takes effect at the end of the paid period."
    }
}
