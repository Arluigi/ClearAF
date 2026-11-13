import SwiftUI

enum LaunchCaseReceipt {
    static func copy(status: LaunchCase.Status, refund: LaunchMembership.Refund?) -> String {
        switch status {
        case .submitted: return "Review within 1 to 2 business days. Your clinician reviews your identity and medical information before care begins."
        case .needsChanges: return "Your clinician requested an update. Your earlier submitted records are preserved."
        case .approved: return "Your clinician has approved your case. Refresh to check your membership and care access."
        case .rejected:
            switch refund { case .issued: return "A full refund has been issued. Your bank may take time to post it."; case .failed: return "Your clinician could not approve online care. Your full refund needs attention from the practice."; default: return "Your clinician could not approve online care. Your full refund is pending payment-provider confirmation." }
        default: return "Review your information and submit your case when all required steps are complete."
        }
    }
}
struct CaseSubmittedView: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    private func identityStatus(_ status: LaunchIdentity.Status?) -> String {
        switch status { case .approved: "Identity reviewed"; case .rejected: "Identity review declined"; case .needsChanges: "Identity update requested"; default: "Identity review pending" }
    }
    var body: some View {
        if let state = repository.state {
            LaunchPage(title: state.case.status == .rejected ? "Your care review" : "Your enrollment is with your clinician") {
                Text(LaunchCaseReceipt.copy(status: state.case.status, refund: state.membership?.refundStatus))
                if state.case.intakeV2?.evaluation.hold == true, let notice = repository.catalog?.intakeV2?.holdNotice { Text(notice) }
                if let message = state.case.patientMessage { Text(message).font(Letterpress.display(24)) }
                Text(identityStatus(state.case.identity?.status)).font(Letterpress.data(12))
                Text(state.case.status == .approved ? "Clinical review approved" : state.case.status == .rejected ? "Clinical review declined" : "Clinical review pending").font(Letterpress.data(12))
                Button(repository.loading ? "Refreshing…" : "Refresh status") { Task { _ = await repository.refresh(ticket: ticket) } }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(repository.loading)
            }
        }
    }
}
struct CaseFinalReviewView: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        LaunchPage(title: "Review and submit") {
            Text("Your clinician will review your identity, health history, photos and destination together.")
            if repository.state?.case.intakeV2?.evaluation.hold == true, let notice = repository.catalog?.intakeV2?.holdNotice { Text(notice) }
            if let state = repository.state {
                Text(state.case.photoSet.map { "\($0.items.count) photos shared" } ?? "Photos are not complete").font(Letterpress.data(13))
                Text(state.case.destination == nil ? (!Enrollment22Routing.usesNewOrder(state) && state.case.intakeV2 != nil && state.case.planId == .care ? "Pharmacy can be added before a prescription is sent." : "Destination needed") : "Destination saved")
                Text("Review within 1 to 2 business days.")
                Button(repository.saving ? "Submitting…" : "Submit for clinical review") {
                    Task { if await repository.submitCase(ticket: ticket) { dismiss() } }
                }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(!repository.canSubmitCase || repository.saving)
                if !repository.canSubmitCase { Text("Complete the required photos and save your destination before submitting.").font(Letterpress.ui(13)) }
                if let error = repository.error { Text(error).foregroundStyle(Letterpress.error) }
            }
        }
    }
}
extension LaunchEnrollmentRepository {
    var canSubmitCase: Bool {
        guard let state, let set = state.case.photoSet, IntakeV2Routing.canSubmitPhotoSet(set, previouslySubmitted: state.case.submittedAt != nil) else { return false }
        if let intake = state.case.intakeV2 {
            guard state.case.identity != nil, !IntakeV2Routing.needsIdentity(state.case.identity) else { return false }
            return [.medicalHistory, .destination, .photos, .needsChanges].contains(state.case.status) && intake.evaluation.missingRequired.isEmpty && intake.evaluation.exitPage == nil && state.membership?.status == .paidPendingReview && LaunchPhotoRules.complete(set) && (Enrollment22Routing.usesNewOrder(state) ? state.case.destination != nil : (state.case.planId == .care || state.case.destination != nil))
        }
        guard [.destination, .photos, .needsChanges].contains(state.case.status), state.case.destination != nil else { return false }
        return LaunchPhotoRules.complete(set)
    }
    @discardableResult func submitCase(ticket: AccountAccess.Ticket) async -> Bool {
        guard canSubmitCase, let current = state, let set = current.case.photoSet else { return false }
        struct Body: Encodable { let expectedRevision: Int; let photoSetId: String }
        do { return await mutate(try .json("/enrollment/\(current.case.id.uuidString.lowercased())/submit", method: "POST", Body(expectedRevision: current.case.revision, photoSetId: set.id.uuidString.lowercased())), ticket: ticket) }
        catch { return false }
    }
}
