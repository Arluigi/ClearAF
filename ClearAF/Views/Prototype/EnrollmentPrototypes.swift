#if DEBUG
import SwiftUI

struct ConsentsPrototype: View {
    private let documents = ["Telehealth Consent", "Medication Consent", "Privacy Notice", "Subscription Terms"]
    @State private var accepted: Set<String> = []
    @State private var reading: String?

    var body: some View {
        PrototypePage(title: "Before we begin") {
            Text("Read and accept each document separately.")
                .foregroundStyle(Letterpress.inkSecondary)
            ForEach(documents, id: \.self) { document in
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Toggle(document, isOn: Binding(get: { accepted.contains(document) }, set: {
                        if $0 { accepted.insert(document) } else { accepted.remove(document) }
                    }))
                    .toggleStyle(.letterpressCheck)
                    HStack {
                        Text("v1.0 · Draft for review").font(Letterpress.data(11))
                        Spacer()
                        Button("Read") { reading = document }
                            .buttonStyle(.letterpress(.underline))
                            .accessibilityLabel("Read \(document), version 1.0")
                    }
                    LetterpressRule()
                }
            }
            NavigationLink { IdentityPrototype() } label: { Text("Continue") }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(accepted.count != documents.count)
            Text("Accept all four documents to continue.")
                .font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
        }
        .sheet(isPresented: Binding(get: { reading != nil }, set: { if !$0 { reading = nil } })) {
            NavigationStack {
                PrototypePage(title: reading ?? "Consent") {
                    Text("v1.0 · Draft for your doctor’s review").letterpressEyebrow()
                    Text("Document reader placeholder. The full consent text requires clinical and legal approval before publication.")
                }
                .toolbar(.visible, for: .navigationBar)
                .toolbar { Button("Done") { reading = nil } }
            }
        }
    }
}

struct IdentityPrototype: View {
    @State private var hasID = false
    @State private var hasSelfie = false
    @State private var inNC = false

    var body: some View {
        PrototypePage(title: "Verify your identity") {
            Text("Adults 18+ in North Carolina.").foregroundStyle(Letterpress.inkSecondary)
            PrototypeSection(title: "01 · Government photo ID") {
                Text("Uploads a government photo ID (driver license, state ID or passport) and takes a live selfie.")
                Button(hasID ? "Sample ID added" : "Upload government photo ID", systemImage: "person.text.rectangle") { hasID = true }
                    .buttonStyle(.letterpress(.outlined, fullWidth: true))
            }
            PrototypeSection(title: "02 · Live selfie") {
                Text("Your selfie is compared with the photo on your ID.")
                Button(hasSelfie ? "Sample selfie added" : "Take a live selfie", systemImage: "camera") { hasSelfie = true }
                    .buttonStyle(.letterpress(.outlined, fullWidth: true))
            }
            LetterpressRule()
            Toggle("I am physically in North Carolina right now.", isOn: $inNC)
                .toggleStyle(.letterpressCheck)
            Text("We ask again at each new case, follow-up and refill.")
                .font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
            NavigationLink { IntakeEligibilityPrototype() } label: { Text("Continue") }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(!hasID || !hasSelfie || !inNC)
            Text("Prototype · buttons add sample placeholders only.")
                .font(Letterpress.ui(11)).foregroundStyle(Letterpress.inkSecondary)
        }
    }
}

struct IntakeEligibilityPrototype: View {
    @State private var help = "Acne"
    @State private var urgent = ""
    @State private var pregnancy = ""
    @State private var otherDoctor = ""

    var body: some View {
        PrototypePage(title: "Is UNZIT right for you?", eyebrow: "Part A · Eligibility · Prototype") {
            PrototypeQuestion(number: "E1", prompt: "What do you want help with?", options: ["Acne", "Dark marks from acne", "Something else"], answer: $help)
            PrototypeQuestion(number: "E2", prompt: "Do you have any of these right now: fever or feeling sick with your acne; joint pain; open, bleeding or crusted sores; or acne that suddenly got much worse in the last 2 weeks?", options: ["Yes", "No"], answer: $urgent)
            PrototypeQuestion(number: "E3", prompt: "Are you pregnant or breastfeeding?", options: ["Pregnant", "Breastfeeding", "Neither", "Not applicable"], answer: $pregnancy)
            PrototypeQuestion(number: "E4", prompt: "Are you currently being treated for acne by another doctor?", options: ["Yes", "No"], answer: $otherDoctor)
            if help == "Something else" { Text("UNZIT treats acne only right now.").foregroundStyle(Letterpress.error) }
            if urgent == "Yes" { Text("Please see a doctor in person in the next day or two.").foregroundStyle(Letterpress.error) }
            if otherDoctor == "Yes" { Text("Please tell your doctor you are using UNZIT so your treatments do not overlap.") }
            NavigationLink { ShippingPharmacyPrototype() } label: { Text("Continue") }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(help == "Something else" || urgent != "No" || pregnancy.isEmpty || otherDoctor.isEmpty)
        }
    }
}

struct IntakeHistoryPrototype: View {
    @State private var page: Int
    @State private var sex = "Female"
    @State private var couldBecomePregnant = "Yes"
    @State private var trying = "No"
    @State private var contraception = "IUD"
    @State private var otherContraception = ""
    @State private var allergyDetails = ""

    init(initialPage: Int = 1) { _page = State(initialValue: initialPage) }

    var body: some View {
        PrototypePage(title: page == 1 ? "Your health history" : "Medicines & health", eyebrow: "Part B · Medical history · Prototype") {
            HStack {
                Text("Step \(page) of 2").font(Letterpress.data(12))
                Spacer()
                if page == 2 { Button("Back") { page = 1 }.buttonStyle(.letterpress(.underline)) }
            }
            LetterpressProgressRule(completed: page, total: 2)
            if page == 1 {
                PrototypeQuestion(number: "M1", prompt: "Sex assigned at birth", options: ["Female", "Male", "Intersex", "Prefer not to say"], answer: $sex)
                if sex != "Male" {
                    PrototypeQuestion(number: "M2", prompt: "Could you become pregnant?", options: ["Yes", "No (for example, menopause, hysterectomy, tubal ligation)", "Not sure"], answer: $couldBecomePregnant)
                    if couldBecomePregnant != "No (for example, menopause, hysterectomy, tubal ligation)" {
                        PrototypeQuestion(number: "M3", prompt: "Are you trying to get pregnant, or might you in the next 6 months?", options: ["Yes", "No", "Not sure"], answer: $trying)
                        PrototypeQuestion(number: "M4", prompt: "What birth control do you use?", options: ["Pill, patch or ring", "IUD", "Implant", "Shot", "Condoms", "None", "Other (text)"], answer: $contraception)
                        if contraception == "Other (text)" {
                            TextField("Other birth control", text: $otherContraception).letterpressField(isEmpty: otherContraception.isEmpty)
                        }
                    }
                }
                Button("Continue") { page = 2 }.buttonStyle(.letterpress(.filled, fullWidth: true))
            } else {
                PrototypeMultiSelect(number: "M13", prompt: "Do you take any of these? (select all)", options: ["Blood pressure pills (ACE inhibitor or ARB, such as lisinopril or losartan)", "Water pills", "Potassium supplements or salt substitute", "Trimethoprim (Bactrim)", "Lithium", "Digoxin", "Blood thinner (warfarin)", "Antacids, iron, calcium, zinc or magnesium", "Seizure medicine", "None"])
                PrototypeMultiSelect(number: "M15", prompt: "Are you allergic to any medication or ingredient? What happened?", options: ["tetracyclines (doxycycline, minocycline)", "sulfites", "clindamycin", "benzoyl peroxide", "None"])
                TextField("Describe what happened", text: $allergyDetails, axis: .vertical)
                    .letterpressField(isEmpty: allergyDetails.isEmpty)
                PrototypeMultiSelect(number: "M16", prompt: "Do you have or have you had any of these? (select all)", options: ["Kidney disease", "Liver disease", "High potassium", "Heart disease or irregular heartbeat", "Fainting or very low blood pressure", "Adrenal disease (Addison disease)", "Lupus or a sun-sensitivity condition", "Raised brain pressure (pseudotumor cerebri)", "Trouble swallowing or esophagus problems", "Breast cancer", "Inflammatory bowel disease", "None"])
                Text("Selected questions shown for this proposal. The complete intake also includes M5–M12, M14 and M17–M22.")
                    .font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
                NavigationLink { PhotoGuidePrototype() } label: { Text("Continue to photos") }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
            }
        }
        .id(page)
    }
}
#endif
