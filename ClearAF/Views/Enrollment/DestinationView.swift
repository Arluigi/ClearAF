import SwiftUI

enum LaunchDestinationValidation {
    static let states: Set<String> = Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC AS GU MP PR VI".split(separator: " ").map(String.init))
    static func valid(_ destination: LaunchDestination) -> Bool {
        func text(_ value: String, max: Int) -> Bool { !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.count <= max }
        func zip(_ value: String) -> Bool { value.range(of: "^[0-9]{5}(-[0-9]{4})?$", options: .regularExpression) != nil }
        switch destination {
        case .care(let p):
            return text(p.name, max: 160) && text(p.addressLine1, max: 200) && (p.addressLine2?.count ?? 0) <= 200 && text(p.city, max: 160) && states.contains(p.state) && zip(p.postalCode) && (10...15).contains(p.phone.filter(\.isNumber).count)
        case .allIn(let a):
            return text(a.recipient, max: 160) && text(a.line1, max: 200) && (a.line2?.count ?? 0) <= 200 && text(a.city, max: 160) && a.state == "NC" && zip(a.postalCode)
        }
    }
}

struct DestinationView: View {
    @ObservedObject var repository: LaunchEnrollmentRepository
    let ticket: AccountAccess.Ticket
    let planId: LaunchPlanID
    var onSaved: () -> Void = {}
    @State private var name = ""
    @State private var line1 = ""
    @State private var line2 = ""
    @State private var city = ""
    @State private var state = ""
    @State private var postalCode = ""
    @State private var phone = ""
    @State private var saved = false
    @State private var initialized = false
    private var destination: LaunchDestination {
        if planId == .care { return .care(.init(name: name, addressLine1: line1, addressLine2: line2.isEmpty ? nil : line2, city: city, state: state, postalCode: postalCode, phone: phone)) }
        return .allIn(.init(recipient: name, line1: line1, line2: line2.isEmpty ? nil : line2, city: city, state: "NC", postalCode: postalCode))
    }
    var body: some View {
        LaunchPage(title: planId == .care ? "Your pharmacy" : "Your delivery address") {
            if planId == .care { Text("Choose your own pharmacy anywhere in the United States. You pay the pharmacy separately for prescribed medicines.") }
            else { Text("Prescribed partner medication is provided through Vida. Delivery is available only to a North Carolina address.") }
            field(planId == .care ? "Pharmacy name" : "Recipient full name", value: $name)
            field("Address line 1", value: $line1)
            field("Address line 2 (optional)", value: $line2)
            field("City", value: $city)
            if planId == .care {
                Picker("State or territory", selection: $state) {
                    Text("Choose state").tag("")
                    ForEach(LaunchDestinationValidation.states.sorted(), id: \.self) { Text($0).tag($0) }
                }.tint(Letterpress.ink)
            } else { Text("North Carolina").font(Letterpress.ui(16)) }
            field("ZIP code", value: $postalCode).keyboardType(.numbersAndPunctuation)
            if planId == .care { field("Pharmacy phone", value: $phone).keyboardType(.phonePad) }
            Button(repository.saving ? "Saving…" : "Save destination") {
                Task { saved = await repository.saveDestination(destination, ticket: ticket); if saved { onSaved() } }
            }.buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(!LaunchDestinationValidation.valid(destination) || repository.saving)
            if !LaunchDestinationValidation.valid(destination) { Text("Enter the complete name, address and ZIP code\(planId == .care ? ", including the pharmacy phone number" : "").").font(Letterpress.ui(13)) }
            if saved { Text("Your destination was saved to your enrollment.") }
            if repository.canSubmitCase {
                NavigationLink("Review and submit case") { CaseFinalReviewView(repository: repository, ticket: ticket) }.buttonStyle(.letterpress(.outlined, fullWidth: true))
            }
            if let error = repository.error { Text(error).foregroundStyle(Letterpress.error) }
        }
        .onAppear { populate() }
    }
    private func field(_ label: String, value: Binding<String>) -> some View { TextField(label, text: value).letterpressField(isEmpty: value.wrappedValue.isEmpty) }
    private func populate() {
        guard !initialized else { return }; initialized = true
        switch repository.state?.case.destination {
        case .care(let p) where planId == .care: name = p.name; line1 = p.addressLine1; line2 = p.addressLine2 ?? ""; city = p.city; state = p.state; postalCode = p.postalCode; phone = p.phone
        case .allIn(let a) where planId == .allIn: name = a.recipient; line1 = a.line1; line2 = a.line2 ?? ""; city = a.city; state = a.state; postalCode = a.postalCode
        default: break
        }
    }
}
