#if DEBUG
import SwiftUI

/// Argument parsing lives behind DEBUG together with every proposal screen.
enum UNZITPrototypeRoute: String, CaseIterable {
    case consents, identity, eligibility, history1, history2, photos, shipping, payment, submitted, plan, checkin, signin, messages

    static func requested(arguments: [String] = ProcessInfo.processInfo.arguments) -> Self? {
        guard let index = arguments.firstIndex(of: "-UNZITPrototype"), arguments.indices.contains(index + 1) else { return nil }
        return Self(rawValue: arguments[index + 1])
    }
}

struct UNZITPrototypeRoot: View {
    let route: UNZITPrototypeRoute

    var body: some View {
        Group {
            switch route {
            case .signin: AuthenticationView {}
            case .messages: MessagingView(prototypeEmptyState: true)
            default: NavigationStack { screen }
            }
        }
        .tint(Letterpress.ink)
    }

    @ViewBuilder private var screen: some View {
        switch route {
        case .consents: ConsentsPrototype()
        case .identity: IdentityPrototype()
        case .eligibility: IntakeEligibilityPrototype()
        case .history1: IntakeHistoryPrototype(initialPage: 1)
        case .history2: IntakeHistoryPrototype(initialPage: 2)
        case .photos: PhotoGuidePrototype()
        case .shipping: ShippingPharmacyPrototype()
        case .payment: PaymentPrototype()
        case .submitted: SubmittedPrototype()
        case .plan: MyPlanPrototype()
        case .checkin: CheckInPrototype()
        case .signin, .messages: EmptyView()
        }
    }
}
#endif
