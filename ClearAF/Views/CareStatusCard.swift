import SwiftUI

enum CareStatusCopy {
    static func title(for decision: String) -> String {
        switch decision {
        case "refer_out": return "Online care isn't the right fit right now"
        case "needs_in_person": return "Your clinician recommends an in-person visit"
        default: return "An update from your care team"
        }
    }
    static func refund(_ status: String) -> String? {
        switch status {
        case "pending": return "Refund: being processed"
        case "issued": return "Refund: issued"
        default: return nil
        }
    }
    static let nextSteps = [
        "Book a visit with an in-person dermatologist.",
        "Your photos and history stay available in ClearAF.",
        "You can still message your care team.",
    ]
}

/// Shown on Today only while the latest decision moves care away from asynchronous online care.
struct CareStatusSection: View {
    @ObservedObject private var repository = APIService.shared.careDecisions
    var body: some View {
        if let decision = repository.current, decision.decision != "async_care" {
            CareStatusCard(decision: decision)
        }
    }
}

struct CareStatusCard: View {
    let decision: CareDecision
    var body: some View {
        VStack(alignment: .leading, spacing: .spaceMD) {
            Text(CareStatusCopy.title(for: decision.decision))
                .font(.headlineLarge)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: .spaceXS) {
                Text("From \(decision.clinicianName)")
                if let date = RoutineDates.instant(decision.createdAt) {
                    Text("·").accessibilityHidden(true)
                    Text(date, format: .dateTime.month().day().year())
                }
            }
            .font(.subheadline)
            .foregroundStyle(CareJournal.textSecondary)
            if let message = decision.patientMessage, !message.isEmpty {
                Text(message).fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: .spaceSM) {
                Text("Next steps").font(.headline)
                ForEach(CareStatusCopy.nextSteps, id: \.self) { step in
                    HStack(alignment: .firstTextBaseline, spacing: .spaceSM) {
                        Text("•").accessibilityHidden(true)
                        Text(step).fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            if let refund = CareStatusCopy.refund(decision.refundStatus) {
                Text(refund).font(.subheadline).foregroundStyle(CareJournal.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .careJournalSurface()
        .padding(.horizontal, 20)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("careStatusCard")
    }
}
