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
    static func byline(_ decision: CareDecision, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        guard let date = RoutineDates.instant(decision.createdAt) else { return "From \(decision.clinicianName)" }
        return "From \(decision.clinicianName) on \(LetterpressFormat.dayMonthYear(date, locale: locale, timeZone: timeZone))"
    }
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

/// Adapted to Letterpress: eyebrow, serif title, clinician words with a 2pt ink rule (§4.7), ruled next steps.
struct CareStatusCard: View {
    let decision: CareDecision
    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text("Care update").letterpressEyebrow()
            Text(CareStatusCopy.title(for: decision.decision))
                .font(Letterpress.display(24, relativeTo: .title2))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(CareStatusCopy.byline(decision))
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let message = decision.patientMessage, !message.isEmpty {
                Text(message)
                    .font(Letterpress.display(17, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, Letterpress.Space.s14)
                    .overlay(alignment: .leading) { Rectangle().fill(Letterpress.ink).frame(width: 2) }
            }
            VStack(alignment: .leading, spacing: 0) {
                Text("Next steps").letterpressEyebrow().padding(.bottom, Letterpress.Space.s6)
                ForEach(CareStatusCopy.nextSteps, id: \.self) { step in
                    Text(step)
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, Letterpress.Space.s10)
                        .overlay(alignment: .top) { LetterpressRule() }
                }
                LetterpressRule()
            }
            .padding(.top, Letterpress.Space.s6)
            if let refund = CareStatusCopy.refund(decision.refundStatus) {
                Text(refund)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Letterpress.Space.s22)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("careStatusCard")
    }
}
