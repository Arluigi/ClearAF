#if DEBUG
import SwiftUI

/// An explicit DEBUG launch path for inspecting production views without Auth or a backend.
/// Fixtures are synthetic DRAFT content; this transport never performs network requests.
enum LaunchMockRoute: String, CaseIterable {
    case consents, identity, eligibility, plans, medical
    case medicalAcne = "medical-acne", medicalMedicines = "medical-medicines", medicalPreferences = "medical-preferences"
    case photos, pharmacy, shipping, review, submitted, rejected, membership
    case submitJourney = "submit-journey", submitJourneyReadOnly = "submit-journey-read-only"
    case captureIdentity = "capture-identity", captureIdentityReview = "capture-identity-review"
    case capturePhotos = "capture-photos", captureCheckIn = "capture-check-in", captureRetake = "capture-retake"
    case captureFront = "capture-front", captureLeft = "capture-left", captureRight = "capture-right"
    case captureChest = "capture-chest", captureBack = "capture-back", captureCloseUp = "capture-close-up"
    case reviewFront = "review-front", reviewLeft = "review-left", reviewRight = "review-right"
    case reviewChest = "review-chest", reviewBack = "review-back", reviewCloseUp = "review-close-up"
    static func hidesReviewBadge(arguments: [String] = ProcessInfo.processInfo.arguments) -> Bool { arguments.contains("-UNZITHideReviewBadge") }
    var isCaptureReview: Bool { rawValue.hasPrefix("capture-") || rawValue.hasPrefix("review-") }
    var captureSlot: LaunchPhotoSlot? {
        let suffix = rawValue.replacingOccurrences(of: "capture-", with: "").replacingOccurrences(of: "review-", with: "")
        return LaunchPhotoSlot(rawValue: suffix == "close-up" ? "close_up" : suffix)
    }
    static func requested(arguments: [String] = ProcessInfo.processInfo.arguments) -> Self? {
        guard let index = arguments.firstIndex(of: "-UNZITLaunchMock"), arguments.indices.contains(index + 1) else { return nil }
        return Self(rawValue: arguments[index + 1])
    }
    var section: Int { switch self { case .medicalAcne: 1; case .medicalMedicines: 2; case .medicalPreferences: 3; default: 0 } }
    var status: String {
        switch self { case .consents: "consents"; case .identity: "identity"; case .eligibility: "eligibility"; case .plans: "payment"; case .medical, .medicalAcne, .medicalMedicines, .medicalPreferences: "medical_history"; case .photos: "photos"; case .pharmacy, .shipping, .review, .submitJourney, .submitJourneyReadOnly: "destination"; case .submitted: "submitted"; case .rejected: "rejected"; case .membership: "approved"; default: "photos" }
    }
}

@MainActor final class LaunchMockSession: ObservableObject {
    let access = AccountAccess()
    let ticket: AccountAccess.Ticket
    let enrollment: LaunchEnrollmentRepository
    let billing: BillingRepository
    let photos: LaunchPhotoSetRepository
    @Published var loaded = false
    init(route: LaunchMockRoute) {
        let access = self.access
        ticket = access.activate(LaunchMockTransport.patientID)
        let transport = LaunchMockTransport(route: route)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("UNZITLaunchMock-\(UUID().uuidString)")
        enrollment = LaunchEnrollmentRepository(access: access, transport: transport, directory: directory)
        billing = BillingRepository(access: access, transport: transport)
        photos = LaunchPhotoSetRepository(access: access, transport: transport, directory: directory)
    }
    func load() async {
        await enrollment.loadCatalog(ticket: ticket)
        _ = await enrollment.refresh(ticket: ticket)
        _ = await billing.refresh(ticket: ticket)
        loaded = true
    }
}

struct LaunchMockRoot: View {
    let route: LaunchMockRoute
    @StateObject private var session: LaunchMockSession
    init(route: LaunchMockRoute) { self.route = route; _session = StateObject(wrappedValue: LaunchMockSession(route: route)) }
    var body: some View {
        NavigationStack {
            Group {
                if session.loaded { screen }
                else { Text("Loading synthetic enrollment…").font(Letterpress.ui(16)) }
            }
            .background(Letterpress.canvas.ignoresSafeArea())
            .toolbar { if !LaunchMockRoute.hidesReviewBadge() { ToolbarItem(placement: .topBarTrailing) { Text("DRAFT · \(route.isCaptureReview ? "2.2-pending-review" : "0.9-draft")").font(Letterpress.data(10)) } } }
        }
        .tint(Letterpress.ink)
        .task { await session.load() }
    }
    @ViewBuilder private var screen: some View {
        let enrollment = session.enrollment, ticket = session.ticket
        switch route {
        case _ where route.isCaptureReview: CaptureReviewMockScreen(route: route, session: session)
        case .consents: ConsentDocumentsView(repository: enrollment, ticket: ticket)
        case .identity: IdentityCaptureView(repository: enrollment, ticket: ticket)
        case .eligibility: EligibilityView(repository: enrollment, ticket: ticket)
        case .plans: PlanChoiceView(enrollment: enrollment, billing: session.billing, ticket: ticket)
        case .medical, .medicalAcne, .medicalMedicines, .medicalPreferences: MedicalHistoryView(repository: enrollment, ticket: ticket, initialSection: route.section)
        case .photos: ClinicalPhotoSetView(repository: session.photos, ticket: ticket, targetId: LaunchMockTransport.caseID, purpose: .enrollment, requiredSlots: [.front, .left, .right])
        case .pharmacy: DestinationView(repository: enrollment, ticket: ticket, planId: .care)
        case .shipping: DestinationView(repository: enrollment, ticket: ticket, planId: .allIn)
        case .review: CaseFinalReviewView(repository: enrollment, ticket: ticket)
        case .submitJourney, .submitJourneyReadOnly: LaunchMockSubmissionJourney(repository: enrollment, ticket: ticket)
        case .submitted, .rejected: CaseSubmittedView(repository: enrollment, ticket: ticket)
        case .membership: MembershipView(billing: session.billing, enrollment: enrollment, ticket: ticket)
        default: EmptyView()
        }
    }
}

/// Retains the production NavigationLink presentation while the root step changes.
private struct LaunchMockSubmissionJourney: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    var body: some View {
        if repository.state?.case.status == .submitted {
            CaseSubmittedView(repository: repository, ticket: ticket)
        } else {
            LaunchPage(title: "Your destination") {
                NavigationLink("Review and submit case") { CaseFinalReviewView(repository: repository, ticket: ticket) }
                    .buttonStyle(.letterpress(.outlined, fullWidth: true))
            }
        }
    }
}

@MainActor private final class LaunchMockTransport: LaunchTransport {
    static let patientID = UUID(uuidString: "00000000-0000-4000-8000-000000000001")!
    static let caseID = UUID(uuidString: "00000000-0000-4000-8000-000000000002")!
    let route: LaunchMockRoute
    private var didSubmit = false
    init(route: LaunchMockRoute) { self.route = route }
    private let instant = "2026-11-09T12:00:00Z"
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data {
        guard ticket.accountID == Self.patientID else { throw AccountFailure.accountChanged }
        if route == .submitJourney, request.method == "POST", request.path == "/enrollment/\(Self.caseID.uuidString.lowercased())/submit" {
            didSubmit = true
            return try bytes(["case": enrollmentCase, "membership": membership, "consents": consents])
        }
        guard request.method == "GET" else { throw LaunchFailure.server(status: 503, code: "MOCK_READ_ONLY") }
        switch request.path {
        case "/catalog": return try bytes(catalog)
        case "/billing": return try bytes(["membership": membership])
        case "/enrollment": return try bytes(["case": enrollmentCase, "membership": membership, "consents": consents])
        default: throw LaunchFailure.invalidData
        }
    }
    private func bytes(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value) }
    private var plan: String { route == .shipping ? "all_in" : "care" }
    private var membership: Any {
        if [.consents, .identity, .eligibility, .plans].contains(route) { return NSNull() }
        return ["id": "00000000-0000-4000-8000-000000000003", "planId": plan, "status": route == .rejected ? "rejected" : route == .membership ? "active" : "paid_pending_review", "amountCents": plan == "care" ? 3900 : 8900, "currency": "usd", "activatedAt": NSNull(), "currentPeriodEnd": "2026-12-09T12:00:00Z", "paidThrough": "2026-12-09T12:00:00Z", "cancelAtPeriodEnd": false, "cadenceAnchor": route == .membership ? instant as Any : NSNull(), "refundStatus": route == .rejected ? "pending" : "not_applicable", "access": route == .membership ? "care" : "enrollment", "destinationRequired": false] as [String: Any]
    }
    private var consents: [[String: Any]] {
        [("telehealth", "Telehealth consent"), ("medication", "Medication consent"), ("privacy_notice", "Privacy notice"), ("subscription_terms", "Subscription terms")].map { key, title in
            ["key": key, "version": 1, "versionLabel": "0.9-draft", "title": title, "body": "DRAFT — synthetic inspection copy, pending clinical and legal approval. This mock document is not a consent for clinical care. Production displays the complete versioned document supplied by the catalog.", "sha256": String(repeating: "a", count: 64), "effectiveAt": instant, "acceptedAt": NSNull()]
        }
    }
    private func question(_ id: String, _ prompt: String, _ values: [(String, String)] = [], kind: String = "choice", fields: [[String: Any]] = []) -> [String: Any] {
        ["id": id, "prompt": prompt, "kind": kind, "required": true, "options": values.map { ["id": $0.0, "label": $0.1] }, "fields": fields, "showWhen": []]
    }
    private func options(_ key: String) -> [(String, String)] { (LaunchMedicalValidation.choices[key] ?? []).sorted().map { ($0, $0.replacingOccurrences(of: "_", with: " ").capitalized) } }
    private var catalog: [String: Any] {
        let prompts = ["Sex assigned at birth", "Could you become pregnant?", "Are you trying to become pregnant, or might you in the next six months?", "What birth control do you use?", "How long have you had acne?", "Where do you have acne?", "Which types of spots do you have?", "Does acne change with your periods?", "Have you noticed any of these signs?", "How does your skin respond to sunlight?", "Which treatments have you tried?", "Have you used isotretinoin?", "Do you take any of these medicines?", "Other medicines and supplements", "Medication or ingredient allergies", "Health conditions", "How sensitive is your skin?", "What do you use on your skin now?", "Do you use sunscreen?", "Your primary care clinician", "Anything else you would like your clinician to know?", "I confirm my answers are accurate to the best of my knowledge."]
        var questions: [[String: Any]] = (1...22).map { index in
            let key = "M\(index)"
            var choices = options(key)
            if key == "M1" { choices = [("female", "Female"), ("male", "Male"), ("intersex", "Intersex"), ("prefer_not_to_say", "Prefer not to say")] }
            let kind = ["M6", "M7", "M13", "M16"].contains(key) ? "multi_choice" : ["M18", "M21"].contains(key) ? "text" : key == "M22" ? "attestation" : "choice"
            return question(key, prompts[index - 1], choices, kind: kind)
        }
        let nested: [String: [String]] = ["M4": ["method", "details"], "M9": ["signs", "details"], "M11": ["name", "duration", "helped", "sideEffects"], "M14": ["details"], "M15": ["picks", "reaction"], "M20": ["pcpName", "pcpPhone", "shareSummary"]]
        for (key, fields) in nested {
            if let index = questions.firstIndex(where: { $0["id"] as? String == key }) {
                questions[index]["fields"] = fields.map { field in question(field, field == "shareSummary" ? "Share a summary with my primary care clinician" : field.replacingOccurrences(of: "pcp", with: "Primary care ").capitalized, ["method", "signs", "picks"].contains(field) ? options(key) : [], kind: ["method", "signs", "picks"].contains(field) ? "choice" : "text") }
            }
        }
        questions.append(question("medicationPreference", "Do you prefer topical or oral medications?", [("topical", "Topical"), ("oral", "Oral"), ("no_preference", "No preference")]))
        let eligibility = [question("E1", "What do you want help with?", [("acne", "Acne"), ("dark_marks", "Dark marks from acne"), ("something_else", "Something else")]), question("E2", "Do you have fever, feel sick, have open sores, or acne that suddenly became much worse?", [("yes", "Yes"), ("no", "No")]), question("E3", "Are you pregnant or breastfeeding?", [("pregnant", "Pregnant"), ("breastfeeding", "Breastfeeding"), ("neither", "Neither"), ("not_applicable", "Not applicable")]), question("E4", "Are you currently being treated for acne by another doctor?", [("yes", "Yes"), ("no", "No")])]
        let plans: [[String: Any]] = [("care", "Care", 3900, false, 0), ("all_in", "All-In", 8900, true, 8)].map { id, name, cents, rx, weeks in ["id": id, "name": name, "amountCents": cents, "currency": "usd", "interval": "month", "includesPartnerRx": rx, "cadence": ["weeklyWeeks": weeks, "then": "monthly"]] }
        var result: [String: Any] = ["contractVersion": 1, "settingsVersion": 1, "plans": plans, "consents": consents, "reviewCopy": "Review within 1 to 2 business days.", "questionnaireVersion": "0.9-draft", "eligibilityQuestions": eligibility, "medicalQuestions": questions]
        if route.isCaptureReview {
            result["questionnaireVersion"] = "2.2-pending-review"
            for (key, value) in CaptureReviewMockContent.guidance { result[key] = value }
        }
        return result
    }
    private var enrollmentCase: [String: Any] {
        let photoItems = ["front", "left", "right"].enumerated().map { index, slot in ["slot": slot, "photoId": String(format: "00000000-0000-4000-8000-%012d", 10 + index), "captureId": String(format: "00000000-0000-4000-8000-%012d", 20 + index)] }
        let photos: [String: Any] = ["id": "00000000-0000-4000-8000-000000000004", "purpose": "enrollment", "status": route == .submitted || didSubmit ? "submitted" : "draft", "requiredSlots": ["front", "left", "right"], "items": photoItems]
        let pharmacy: [String: Any] = ["planId": "care", "pharmacy": ["name": "Synthetic Pharmacy", "addressLine1": "1 Example Street", "addressLine2": NSNull(), "city": "Raleigh", "state": "NC", "postalCode": "27601", "phone": "9195550100"]]
        let identity: [String: Any] = ["id": "00000000-0000-4000-8000-000000000005", "status": "uploaded", "fullName": "Synthetic Adult", "dateOfBirth": "1990-01-01", "attestedInNC": true, "attestedAt": instant, "reviewedAt": NSNull(), "reviewedBy": NSNull(), "patientMessage": NSNull()]
        return ["id": Self.caseID.uuidString.lowercased(), "revision": didSubmit ? 2 : 1, "status": didSubmit ? "submitted" : route.status, "identity": identity, "eligibility": NSNull(), "medicalHistory": ["M1": "female", "M2": "yes", "M3": "no", "M4": ["method": "iud", "details": NSNull()], "M6": ["cheeks"]], "questionnaireVersion": route.isCaptureReview ? "2.2-pending-review" : "0.9-draft", "photoSet": [.review, .submitted, .rejected, .submitJourney, .submitJourneyReadOnly].contains(route) ? photos as Any : NSNull(), "destination": [.review, .submitted, .rejected, .submitJourney, .submitJourneyReadOnly].contains(route) ? pharmacy as Any : NSNull(), "planId": plan, "flags": [], "submittedAt": route == .submitted || didSubmit ? instant as Any : NSNull(), "approvedAt": NSNull(), "patientMessage": NSNull()]
    }
}
#endif
