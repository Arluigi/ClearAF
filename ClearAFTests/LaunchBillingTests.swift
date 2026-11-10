import XCTest
@testable import ClearAF

@MainActor final class LaunchBillingTests: XCTestCase {
    func testServerAmountFormattingAndCadence() throws {
        let plan = try JSONDecoder().decode(LaunchPlan.self, from: Data(#"{"id":"all_in","name":"All-In","amountCents":9123,"currency":"usd","interval":"month","includesPartnerRx":true,"cadence":{"weeklyWeeks":8,"then":"monthly"}}"#.utf8))
        XCTAssertEqual(LaunchBillingCopy.price(cents: plan.amountCents, currency: plan.currency, locale: Locale(identifier: "en_US")), "$91.23")
        XCTAssertTrue(LaunchBillingCopy.cadence(plan).contains("8"))
        XCTAssertTrue(LaunchBillingCopy.inclusions(plan).contains("Vida"))
    }
    func testHostedURLsRejectSpoofingCredentialsPortsAndExpiredSession() {
        let now = Date(timeIntervalSince1970: 0)
        XCTAssertNotNil(LaunchBillingURL.valid(LaunchPaymentAction(url: "https://checkout.stripe.com/c/pay/synthetic", expiresAt: "2026-11-09T12:00:00Z"), purpose: .checkout, now: now))
        XCTAssertNotNil(LaunchBillingURL.valid(LaunchPaymentAction(url: "https://billing.stripe.com/p/session/synthetic", expiresAt: "2026-11-09T12:00:00Z"), purpose: .portal, now: now))
        for url in ["http://checkout.stripe.com/c/pay/x", "https://checkout.stripe.com.evil.invalid/x", "https://evil.invalid/?paid=true", "https://name@checkout.stripe.com/x", "https://checkout.stripe.com:444/x", "https://billing.stripe.com/x"] {
            XCTAssertNil(LaunchBillingURL.valid(LaunchPaymentAction(url: url, expiresAt: "2026-11-09T12:00:00Z"), purpose: .checkout, now: now))
        }
        XCTAssertNil(LaunchBillingURL.valid(LaunchPaymentAction(url: "https://checkout.stripe.com/x", expiresAt: "1970-01-01T00:00:00Z"), purpose: .checkout, now: now))
    }
    func testCheckoutExactRequestAndBrowserReturnIsNotPayment() async throws {
        let fake = BillingFake(), access = AccountAccess(), ticket = access.activate(UUID()), repo = BillingRepository(access: access, transport: fake)
        let caseID = UUID()
        let url = await repo.checkout(caseId: caseID, planId: .care, settingsVersion: 7, ticket: ticket)
        XCTAssertEqual(url?.host, "checkout.stripe.com")
        XCTAssertNil(repo.membership)
        XCTAssertEqual(fake.requests.last?.path, "/billing/checkout")
        XCTAssertEqual(fake.requests.last?.method, "POST")
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(fake.requests.last?.body)) as! [String: Any]
        XCTAssertEqual(Set(body.keys), ["caseId", "planId", "settingsVersion"])
        XCTAssertEqual(body["caseId"] as? String, caseID.uuidString.lowercased())
        XCTAssertEqual(body["settingsVersion"] as? Int, 7)
        XCTAssertFalse(repo.paymentConfirmed)
        _ = await repo.refresh(ticket: ticket)
        XCTAssertFalse(repo.paymentConfirmed)
        XCTAssertEqual(fake.requests.last?.path, "/billing")
    }
    func testDuplicateCheckoutAndLateAccountCallbackAreDropped() async {
        let fake = BillingFake(), access = AccountAccess(), ticket = access.activate(UUID()), repo = BillingRepository(access: access, transport: fake)
        fake.pause = true
        let first = Task { await repo.checkout(caseId: UUID(), planId: .care, settingsVersion: 1, ticket: ticket) }
        while fake.continuation == nil { await Task.yield() }
        let duplicate = await repo.checkout(caseId: UUID(), planId: .care, settingsVersion: 1, ticket: ticket)
        XCTAssertNil(duplicate)
        XCTAssertEqual(fake.requests.count, 1)
        _ = access.activate(UUID())
        fake.continuation?.resume(returning: fake.action)
        let stale = await first.value
        XCTAssertNil(stale)
        XCTAssertNil(repo.hostedAction)
    }
    func testProviderRefreshKeepsPaidReviewPendingAndShowsCancellationRefund() async throws {
        let fake = BillingFake(), access = AccountAccess(), ticket = access.activate(UUID()), repo = BillingRepository(access: access, transport: fake)
        fake.billing = Self.membership(status: "paid_pending_review", access: "enrollment", cancel: true, destination: true)
        let loaded = await repo.refresh(ticket: ticket)
        XCTAssertTrue(loaded)
        XCTAssertTrue(repo.paymentConfirmed)
        XCTAssertEqual(repo.membership?.access, .enrollment)
        XCTAssertTrue(LaunchBillingCopy.status(repo.membership).contains("review"))
        XCTAssertTrue(LaunchBillingCopy.cancellation(repo.membership!).contains("paid"))
        XCTAssertEqual(repo.membership?.destinationRequired, true)
        fake.billing = Self.membership(status: "ended", access: "read_only", cancel: false, destination: false)
        _ = await repo.refresh(ticket: ticket)
        XCTAssertEqual(repo.membership?.status, .ended)
        XCTAssertEqual(repo.membership?.access, .readOnly)
    }
    func testPortalUsesOnlyPortalEndpointAndRequiresServerMembership() async throws {
        let fake = BillingFake(), access = AccountAccess(), ticket = access.activate(UUID()), repo = BillingRepository(access: access, transport: fake)
        let unavailable = await repo.portal(ticket: ticket)
        XCTAssertNil(unavailable)
        XCTAssertTrue(fake.requests.isEmpty)
        fake.billing = Self.membership(status: "active", access: "care", cancel: false, destination: false)
        _ = await repo.refresh(ticket: ticket)
        fake.action = Data(#"{"url":"https://billing.stripe.com/p/session/synthetic","expiresAt":"2099-01-01T00:00:00Z"}"#.utf8)
        let url = await repo.portal(ticket: ticket)
        XCTAssertEqual(url?.host, "billing.stripe.com")
        let body = try JSONSerialization.jsonObject(with: XCTUnwrap(fake.requests.last?.body)) as! [String: Any]
        XCTAssertEqual(Set(body.keys), ["membershipId"])
        XCTAssertEqual(body["membershipId"] as? String, "00000000-0000-4000-8000-000000000001")
        XCTAssertEqual(fake.requests.last?.path, "/billing/portal")
        XCTAssertEqual(fake.requests.last?.method, "POST")
        XCTAssertFalse(fake.requests.contains { $0.path.contains("operations") || $0.path.contains("cancel") || $0.path.contains("switch") })
    }
    func testSettingsConflictAndAuthenticationActionRemainRecoverable() async {
        let fake = BillingFake(), access = AccountAccess(), ticket = access.activate(UUID()), repo = BillingRepository(access: access, transport: fake)
        fake.failure = LaunchFailure.server(status: 409, code: "SETTINGS_CHANGED")
        let url = await repo.checkout(caseId: UUID(), planId: .allIn, settingsVersion: 1, ticket: ticket)
        XCTAssertNil(url)
        XCTAssertTrue(repo.settingsChanged)
        XCTAssertFalse(repo.saving)
        XCTAssertNotNil(repo.error)
        fake.failure = nil
        let retry = await repo.checkout(caseId: UUID(), planId: .allIn, settingsVersion: 2, ticket: ticket)
        XCTAssertNotNil(retry)
        XCTAssertFalse(repo.paymentConfirmed)
    }
    func testUnpaidRelaunchExpiredCheckoutAndSettingsChangeAllowNewCheckout() async {
        let fake = BillingFake(), access = AccountAccess(), ticket = access.activate(UUID())
        var now = Date(timeIntervalSince1970: 0)
        let repo = BillingRepository(access: access, transport: fake, now: { now })
        fake.billing = Self.membership(status: "awaiting_payment", access: "enrollment", cancel: false, destination: false)
        _ = await repo.refresh(ticket: ticket)
        XCTAssertTrue(repo.checkoutRequired)
        _ = await repo.checkout(caseId: UUID(), planId: .care, settingsVersion: 1, ticket: ticket)
        XCTAssertFalse(repo.checkoutRequired)
        now = Date.distantFuture
        XCTAssertTrue(repo.checkoutRequired)
        fake.failure = LaunchFailure.server(status: 409, code: "SETTINGS_CHANGED")
        _ = await repo.checkout(caseId: UUID(), planId: .care, settingsVersion: 1, ticket: ticket)
        XCTAssertTrue(repo.checkoutRequired)
        XCTAssertTrue(repo.settingsChanged)
        now = Date(timeIntervalSince1970: 0); fake.failure = nil
        let retry = await repo.checkout(caseId: UUID(), planId: .care, settingsVersion: 2, ticket: ticket)
        XCTAssertNotNil(retry)
    }
    func testPaidCheckoutRetryUsesMembershipEnvelopeWithoutOpeningAnotherSession() async {
        let fake = BillingFake(), access = AccountAccess(), ticket = access.activate(UUID()), repo = BillingRepository(access: access, transport: fake)
        fake.billing = Self.membership(status: "paid_pending_review", access: "enrollment", cancel: false, destination: false)
        fake.nullCheckoutAction = true
        let url = await repo.checkout(caseId: UUID(), planId: .care, settingsVersion: 1, ticket: ticket)
        XCTAssertNil(url)
        XCTAssertTrue(repo.paymentConfirmed)
        XCTAssertNil(repo.error)
        XCTAssertNil(repo.hostedAction)
    }
    static func membership(status: String, access: String, cancel: Bool, destination: Bool) -> Data {
        Data("""
        {"membership":{"id":"00000000-0000-4000-8000-000000000001","planId":"care","status":"\(status)","amountCents":4123,"currency":"usd","activatedAt":null,"currentPeriodEnd":"2026-12-09T12:00:00Z","paidThrough":"2026-12-09T12:00:00Z","cancelAtPeriodEnd":\(cancel),"cadenceAnchor":"2026-11-09T12:00:00Z","refundStatus":"pending","access":"\(access)","destinationRequired":\(destination)}}
        """.utf8)
    }
}
@MainActor private final class BillingFake: LaunchTransport {
    var requests: [LaunchRequest] = []
    var billing = Data(#"{"membership":null}"#.utf8)
    var action = Data(#"{"url":"https://checkout.stripe.com/c/pay/synthetic","expiresAt":"2099-01-01T00:00:00Z"}"#.utf8)
    var nullCheckoutAction = false
    var failure: Error?
    var pause = false
    var continuation: CheckedContinuation<Data, Never>?
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data {
        requests.append(request)
        if let failure { throw failure }
        if pause { return await withCheckedContinuation { continuation = $0 } }
        if request.path == "/billing/checkout" {
            var envelope = try JSONSerialization.jsonObject(with: billing) as! [String: Any]
            envelope["action"] = nullCheckoutAction ? NSNull() : try JSONSerialization.jsonObject(with: action)
            return try JSONSerialization.data(withJSONObject: envelope)
        }
        return request.method == "GET" ? billing : action
    }
}
