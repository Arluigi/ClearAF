#if DEBUG
import SwiftUI

struct MyPlanPrototype: View {
    var body: some View {
        PrototypePage(title: "Mild red bumps", eyebrow: "My Plan · Template 2 · Sample only") {
            Text("Example plan for the proposal. Prescriptions require Dr. Om’s individual review.")
                .font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
            Text(PrototypeCopy.sideEffects)
                .font(Letterpress.ui(15, weight: .medium))
                .padding(.leading, Letterpress.Space.s14)
                .overlay(alignment: .leading) { Rectangle().fill(Letterpress.ink).frame(width: 2) }
            PrototypeSection(title: "AM · Morning") {
                Text("BPO 4 to 5% wash → moisturizer → SPF 30+.")
            }
            PrototypeSection(title: "PM · Evening") {
                Text("Clindamycin 1% thin layer → tretinoin 0.025% pea-sized (every other night for 2 weeks) → moisturizer.")
            }
            LetterpressRule(weight: .major)
            PrototypeSection(title: "Prescriptions · Sample directions") {
                prescription("Clindamycin 1% gel or lotion", sig: "Thin layer once or twice daily, always with BPO.")
                prescription("Tretinoin 0.025%", sig: "Pea-sized, whole face, dry skin, every other night for 2 weeks, then nightly.")
                prescription("Benzoyl peroxide 4 to 5% wash", sig: "Use in the morning. Leave 1 to 2 min, rinse. Use BPO in morning, not at the same time as tretinoin.")
            }
            Text("Do not restart a stopped medication until Dr. Om replies.")
                .font(Letterpress.ui(13)).foregroundStyle(Letterpress.inkSecondary)
        }
    }

    private func prescription(_ title: String, sig: String) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
            Text(title).font(Letterpress.ui(15, weight: .medium)).foregroundStyle(Letterpress.attentionText)
            Text(sig).font(Letterpress.ui(13)).fixedSize(horizontal: false, vertical: true)
            LetterpressRule().padding(.top, Letterpress.Space.s6)
        }
    }
}

struct CheckInPrototype: View {
    @State private var tolerability = "Manageable"
    @State private var sideEffects = "No"
    @State private var pregnancy = "No change"
    @State private var medicines = "No"
    @State private var inNC = false

    var body: some View {
        PrototypePage(title: "Your check-in", eyebrow: "UNZIT · Follow-up · Prototype") {
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text("UNZIT Score").letterpressEyebrow(color: Letterpress.ink)
                HStack(alignment: .firstTextBaseline) {
                    Text("64").font(Letterpress.display(44))
                    Text("Sample value").font(Letterpress.data(11)).foregroundStyle(Letterpress.inkSecondary)
                }
                Text("Prototype — scoring method to be defined by Dr. Om")
                    .font(Letterpress.ui(12)).foregroundStyle(Letterpress.inkSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Letterpress.Space.s14)
            .overlay { Rectangle().strokeBorder(Letterpress.rule, lineWidth: 1) }
            HStack {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text("New photo set").font(Letterpress.ui(16, weight: .medium))
                    Text("Front, left and right · Not added yet").font(Letterpress.ui(12)).foregroundStyle(Letterpress.inkSecondary)
                }
                Spacer()
                NavigationLink { PhotoGuidePrototype() } label: { Text("Add") }
                    .buttonStyle(.letterpress(.underline))
            }
            LetterpressRule()
            checkInQuestion("How are you tolerating your treatment?", options: ["Manageable", "Difficult", "Not using it"], answer: $tolerability)
            checkInQuestion("Any side effects?", options: ["No", "Yes"], answer: $sideEffects)
            if sideEffects == "Yes" {
                Text(PrototypeCopy.sideEffects).font(Letterpress.ui(13)).foregroundStyle(Letterpress.error)
            }
            checkInQuestion("Has your pregnancy status changed?", options: ["No change", "Pregnant", "Breastfeeding", "Trying", "Not sure", "Not applicable"], answer: $pregnancy)
            checkInQuestion("Any new medicines or supplements?", options: ["No", "Yes"], answer: $medicines)
            Toggle("I am physically in North Carolina right now.", isOn: $inNC)
                .toggleStyle(.letterpressCheck)
            Button("Submit check-in") { }
                .buttonStyle(.letterpress(.filled, fullWidth: true)).disabled(true)
            Text("Add a new photo set and confirm your location to submit.")
                .font(Letterpress.ui(12)).foregroundStyle(Letterpress.inkSecondary)
        }
    }

    private func checkInQuestion(_ prompt: String, options: [String], answer: Binding<String>) -> some View {
        HStack(alignment: .center, spacing: Letterpress.Space.s10) {
            Text(prompt).font(Letterpress.ui(14)).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Picker(prompt, selection: answer) {
                ForEach(options, id: \.self) { Text($0).tag($0) }
            }
            .labelsHidden().pickerStyle(.menu)
        }
        .frame(minHeight: Letterpress.minTouch)
        .overlay(alignment: .bottom) { LetterpressRule() }
    }
}
#endif
