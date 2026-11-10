#if DEBUG
import SwiftUI

struct PhotoGuidePrototype: View {
    @State private var filled: Set<String> = ["Front"]
    private let required = ["Front", "Left side", "Right side"]

    var body: some View {
        PrototypePage(title: "Your photo set") {
            Text("Required: front, left side, right side of the face, taken in daylight, no makeup or filters, hair pulled back.")
            HStack(alignment: .top, spacing: Letterpress.Space.s10) {
                ForEach(required, id: \.self) { name in
                    Button { filled.insert(name) } label: {
                        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                            Rectangle().fill(Letterpress.sunk)
                                .aspectRatio(4 / 5, contentMode: .fit)
                                .overlay {
                                    Image(systemName: filled.contains(name) ? "person.crop.rectangle" : "camera")
                                        .font(Letterpress.ui(28))
                                }
                            Text(name).font(Letterpress.ui(14, weight: .medium))
                            Text(filled.contains(name) ? "Sample added" : "Required").font(Letterpress.data(10))
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(name), \(filled.contains(name) ? "sample added" : "required, add sample")")
                }
            }
            Text("zoom in and check it is sharp")
                .font(Letterpress.ui(16, weight: .medium))
            LetterpressRule()
            PrototypeSection(title: "Additional areas · Optional for this case") {
                HStack(spacing: Letterpress.Space.s10) {
                    ForEach(["Chest", "Back"], id: \.self) { name in
                        Button(filled.contains(name) ? "\(name) added" : "Add \(name.lowercased())", systemImage: "plus") { filled.insert(name) }
                            .buttonStyle(.letterpress(.outlined, fullWidth: true))
                    }
                }
                Text("Required if marked in M6: one photo each of chest and back (patient may cover or crop anything they choose).")
                    .font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
            }
            Text("Never request photos of the genital area or breasts. Chest photos are taken above the breasts.")
                .font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
            Text("Optional: close-up of dark marks or a worrying spot.")
                .font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
            NavigationLink { SubmittedPrototype() } label: { Text("Submit photos") }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(!Set(required).isSubset(of: filled))
        }
    }
}

struct ShippingPharmacyPrototype: View {
    @State private var name = "Alex Morgan"
    @State private var street = "123 Sample Street"
    @State private var unit = ""
    @State private var city = "Raleigh"
    @State private var zip = "27601"
    @State private var ownPharmacy = false
    @State private var pharmacyName = ""

    var body: some View {
        PrototypePage(title: "Shipping & pharmacy") {
            Text("Use a North Carolina shipping address.").foregroundStyle(Letterpress.inkSecondary)
            PrototypeSection(title: "Shipping address · Sample") {
                TextField("Full name", text: $name).textContentType(.name).letterpressField(isEmpty: name.isEmpty)
                TextField("Street address", text: $street).textContentType(.streetAddressLine1).letterpressField(isEmpty: street.isEmpty)
                TextField("Apartment or unit (optional)", text: $unit).letterpressField(isEmpty: unit.isEmpty)
                HStack(spacing: Letterpress.Space.s14) {
                    TextField("City", text: $city).textContentType(.addressCity).letterpressField(isEmpty: city.isEmpty)
                    Text("NC").font(Letterpress.data(15)).accessibilityLabel("State: North Carolina")
                    TextField("ZIP", text: $zip).textContentType(.postalCode).keyboardType(.numberPad).letterpressField(isEmpty: zip.isEmpty)
                        .frame(maxWidth: 100)
                }
            }
            PrototypeSection(title: "Your pharmacy") {
                LetterpressRadioRow(title: "Vida (partner pharmacy, included)", selected: !ownPharmacy) { ownPharmacy = false }
                LetterpressRadioRow(title: "Use my own pharmacy (I pay the pharmacy directly)", selected: ownPharmacy) { ownPharmacy = true }
                if ownPharmacy {
                    TextField("Pharmacy name and address", text: $pharmacyName).letterpressField(isEmpty: pharmacyName.isEmpty)
                }
            }
            NavigationLink { PaymentPrototype() } label: { Text("Continue") }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(name.isEmpty || street.isEmpty || city.isEmpty || zip.count != 5 || (ownPharmacy && pharmacyName.isEmpty))
        }
    }
}

struct PaymentPrototype: View {
    @State private var weekly = false
    @State private var showingTest = false
    @State private var showingHistory = false
    var body: some View {
        PrototypePage(title: "Your membership") {
            HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s6) {
                Text("$55").font(Letterpress.display(52))
                Text("/ month").font(Letterpress.ui(17)).foregroundStyle(Letterpress.inkSecondary)
            }
            PrototypeSection(title: "Included · Draft Part D") {
                Text("Dermatologist review and treatment plan\nMessaging and follow-ups\nFormulary prescriptions filled by Vida and shipped to you")
                    .lineSpacing(Letterpress.Space.s6)
            }
            Text("Not included: OTC products, prescriptions filled at your own pharmacy, in-person care or labs.")
                .font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
            LetterpressRule()
            Toggle(isOn: $weekly) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text("Weekly check-in upgrade")
                    Text("Price TBD").font(Letterpress.data(12)).foregroundStyle(Letterpress.inkSecondary)
                }
            }
            .tint(Letterpress.toggleOn)
            VStack(spacing: Letterpress.Space.s10) {
                Button { showingTest = true } label: { Label("Pay · Stripe test mode", systemImage: "apple.logo") }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                Button("Pay with card · Stripe test mode") { showingTest = true }
                    .buttonStyle(.letterpress(.outlined, fullWidth: true))
            }
            Text("Your UNZIT membership renews automatically every month at $55 until you cancel. Cancel in-app or by email; access continues through the paid month.")
                .font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
            Text("Prototype · no payment is collected. Inclusions and upgrade pricing require final approval.")
                .font(Letterpress.ui(11)).foregroundStyle(Letterpress.inkSecondary)
        }
        .navigationDestination(isPresented: $showingHistory) { IntakeHistoryPrototype() }
        .alert("Stripe test mode", isPresented: $showingTest) {
            Button("Continue with sample payment") { showingHistory = true }
            Button("Close", role: .cancel) { }
        } message: { Text("Payment placeholder. No card details or charge.") }
    }
}

struct SubmittedPrototype: View {
    var body: some View {
        PrototypePage(title: "Your case is submitted", eyebrow: "UNZIT · Sample confirmation") {
            Text("What happens next").font(Letterpress.display(28))
            step("01", title: "Your doctor reviews your case", detail: "Your identity, history and photo set are reviewed together within 1 to 2 business days.")
            step("02", title: "Watch for a message", detail: "If your doctor needs more information or clearer photos, we’ll ask in the app. The review clock restarts when you answer.")
            step("03", title: "Read your personal plan", detail: "Your AM and PM routine and any appropriate prescriptions appear in My Plan.")
            step("04", title: "Your pharmacy fills the prescription", detail: "Vida ships included formulary prescriptions to your North Carolina address. Your own pharmacy is paid directly.")
            NavigationLink { MyPlanPrototype() } label: { Text("Preview My Plan") }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
        }
    }

    private func step(_ number: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: Letterpress.Space.s14) {
            Text(number).font(Letterpress.data(12)).padding(.top, Letterpress.Space.s4)
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                Text(title).font(Letterpress.ui(16, weight: .medium))
                Text(detail).foregroundStyle(Letterpress.inkSecondary)
            }
        }
        .padding(.bottom, Letterpress.Space.s10)
        .overlay(alignment: .bottom) { LetterpressRule() }
    }
}
#endif
