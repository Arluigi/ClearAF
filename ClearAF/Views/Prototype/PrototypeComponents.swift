#if DEBUG
import SwiftUI

/// Proposal-only UI. Sample values stay in view state; no uploads, billing or clinical submissions occur.
enum PrototypeCopy {
    static let emergency = "Not for emergencies. If you have trouble breathing, swelling of your face or throat, chest pain, or another emergency, call 911."
    static let sideEffects = "If you notice any side effect, even a small one, stop that medication and message us."
}

struct PrototypePage<Content: View>: View {
    let title: String
    var eyebrow = "UNZIT · Patient flow prototype"
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                Text(eyebrow).letterpressEyebrow()
                Text(title)
                    .font(Letterpress.display(36))
                    .accessibilityAddTraits(.isHeader)
                LetterpressRule(weight: .major)
                content()
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.vertical, Letterpress.Space.s18)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .font(Letterpress.ui(15))
        .foregroundStyle(Letterpress.ink)
        .background(Letterpress.canvas.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Text(PrototypeCopy.emergency)
                .font(Letterpress.ui(11, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Letterpress.Space.s22)
                .padding(.vertical, Letterpress.Space.s10)
                .background(Letterpress.canvas)
                .overlay(alignment: .top) { LetterpressRule() }
        }
        .toolbar(.hidden, for: .navigationBar)
        .tint(Letterpress.ink)
    }
}

struct PrototypeSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(title).letterpressEyebrow()
            content()
        }
    }
}

struct PrototypeQuestion: View {
    let number: String
    let prompt: String
    let options: [String]
    @Binding var answer: String

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Text(number).letterpressEyebrow()
            Text(prompt).fixedSize(horizontal: false, vertical: true)
            Picker(prompt, selection: $answer) {
                Text("Select an answer").tag("")
                ForEach(options, id: \.self) { Text($0).tag($0) }
            }
            .pickerStyle(.menu)
            .labelsHidden()
            .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
            .overlay(alignment: .bottom) { LetterpressRule() }
            .accessibilityLabel(prompt)
        }
    }
}

struct PrototypeMultiSelect: View {
    let number: String
    let prompt: String
    let options: [String]
    @State private var selected: Set<String> = []
    @State private var showingOptions = false

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Text(number).letterpressEyebrow()
            Text(prompt).fixedSize(horizontal: false, vertical: true)
            Button {
                showingOptions = true
            } label: {
                HStack {
                    Text(selected.isEmpty ? "Select all that apply" : selected.sorted().joined(separator: ", "))
                        .multilineTextAlignment(.leading)
                    Spacer()
                    Image(systemName: "chevron.down")
                }
                .frame(minHeight: Letterpress.minTouch)
            }
            .buttonStyle(.plain)
            .overlay(alignment: .bottom) { LetterpressRule() }
        }
        .sheet(isPresented: $showingOptions) {
            NavigationStack {
                List(options, id: \.self) { option in
                    Toggle(option, isOn: Binding(get: { selected.contains(option) }, set: { checked in
                        if checked {
                            if option == "None" { selected = ["None"] }
                            else { selected.remove("None"); selected.insert(option) }
                        } else { selected.remove(option) }
                    }))
                    .toggleStyle(.letterpressCheck)
                    .listRowBackground(Letterpress.canvas)
                }
                .font(Letterpress.ui(15))
                .scrollContentBackground(.hidden)
                .background(Letterpress.canvas)
                .navigationTitle(number)
                .toolbar { Button("Done") { showingOptions = false } }
            }
            .tint(Letterpress.ink)
        }
    }
}
#endif
