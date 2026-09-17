import SwiftUI

enum ProfileCopy {
    static let nameHint = "Use between 2 and 100 characters."
    static let removalTitle = "Account removal is not available yet"
    static let removalMessage = "The practice must finalize its record-retention and deletion process before account removal is enabled. Signing out ends access on this device; it does not delete your account or clinical records."

    /// "Patient since 30 Jul 2026", set in mono and uppercased by the view.
    static func since(_ createdAt: String?, locale: Locale = .current, timeZone: TimeZone = .current) -> String? {
        guard let createdAt, let date = RoutineDates.instant(createdAt) else { return nil }
        return "Patient since \(LetterpressFormat.dayMonthYear(date, locale: locale, timeZone: timeZone))"
    }

    static func version(_ info: [String: Any]?) -> String? {
        guard let short = info?["CFBundleShortVersionString"] as? String, let build = info?["CFBundleVersion"] as? String else { return nil }
        return "ClearAF \(short) · build \(build)"
    }

    static func nameChanged(_ name: String, saved: String?) -> Bool {
        name.trimmingCharacters(in: .whitespacesAndNewlines) != (saved ?? "")
    }
}

/// Profile and settings (spec §6 #11): one ruled list, pushed from Today, no tab bar, no bottom spacer.
/// Auto-share, keep originals and PDF export are omitted (deferred.md).
struct ProfileView: View {
    @ObservedObject private var api = APIService.shared
    @ObservedObject private var reminders = APIService.shared.reminders
    @StateObject private var saveState = AccountSaveState()
    @State private var name = ""
    @State private var showingRemovalInfo = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                LetterpressRule(weight: .major)
                    .padding(.top, Letterpress.Space.s18)
                section("Care team") { CareTeamRow() }
                section("Reminders") { reminderSummary }
                section("Account") { account }
                VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
                    Button("Sign out") { api.logout() }
                        .buttonStyle(.letterpress(.underline))
                        .accessibilityIdentifier("profileSignOut")
                    if let version = ProfileCopy.version(Bundle.main.infoDictionary) {
                        Text(version)
                            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                            .textCase(.uppercase)
                            .foregroundStyle(Letterpress.inkTertiary)
                    }
                }
                .padding(.top, Letterpress.Space.s28)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.top, Letterpress.Space.s10)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .alert(ProfileCopy.removalTitle, isPresented: $showingRemovalInfo) {
            Button("OK") {}
        } message: {
            Text(ProfileCopy.removalMessage)
        }
        .onAppear { name = api.currentUser?.name ?? "" }
    }

    private var header: some View {
        HStack(spacing: Letterpress.Space.s14) {
            Group {
                let initials = TodayCopy.initials(api.currentUser?.name)
                if initials.isEmpty {
                    Image(systemName: "person").font(Letterpress.ui(17, relativeTo: .body))
                } else {
                    Text(initials).font(Letterpress.data(17, relativeTo: .body))
                }
            }
            .foregroundStyle(Letterpress.canvas)
            .frame(width: 56, height: 56)
            .background(Letterpress.ink, in: Circle())
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text(api.currentUser?.name ?? "Your profile")
                    .font(Letterpress.display(26, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                    .accessibilityAddTraits(.isHeader)
                if let since = ProfileCopy.since(api.currentUser?.createdAt) {
                    Text(since)
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .textCase(.uppercase)
                        .foregroundStyle(Letterpress.inkTertiary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .letterpressEyebrow()
                .padding(.bottom, Letterpress.Space.s10)
                .accessibilityAddTraits(.isHeader)
            content()
        }
        .padding(.top, Letterpress.Space.s22)
    }

    private var reminderSummary: some View {
        let rows = ReminderCopy.rows(reminders.preferences)
        return VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            NavigationLink { ReminderSettingsView() } label: {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(rows) { row in
                        HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s14) {
                            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                                Text(row.title)
                                    .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                                    .foregroundStyle(Letterpress.ink)
                                Text(row.detail)
                                    .font(Letterpress.ui(13, relativeTo: .footnote))
                                    .foregroundStyle(Letterpress.inkSecondary)
                            }
                            .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: Letterpress.Space.s10)
                            if let time = row.time {
                                Text(time)
                                    .font(Letterpress.data(12, weight: .regular, relativeTo: .caption))
                                    .foregroundStyle(Letterpress.ink)
                            }
                            Image(systemName: "chevron.right")
                                .font(Letterpress.ui(13, relativeTo: .footnote))
                                .foregroundStyle(Letterpress.inkTertiary)
                                .accessibilityHidden(true)
                        }
                        .padding(.vertical, Letterpress.Space.s10)
                        .frame(minHeight: Letterpress.minTouch)
                        .overlay(alignment: .top) { LetterpressRule() }
                    }
                    LetterpressRule()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Reminders. " + rows.map { "\($0.title), \($0.time.map { "\($0), " } ?? "")\($0.detail)" }.joined(separator: ". "))
            .accessibilityHint("Change reminder times")
            .accessibilityAddTraits(.isButton)
            Text(ReminderCopy.status(reminders.state))
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var account: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
            LetterpressLabeledField(label: "Name", isEmpty: name.isEmpty, message: ProfileCopy.nameHint) {
                TextField(text: $name, prompt: nil, axis: .vertical) { Text("Name") }
                    .textContentType(.name)
                    .accessibilityIdentifier("profileName")
            }
            if ProfileCopy.nameChanged(name, saved: api.currentUser?.name) {
                Button(saveState.isSaving ? "Saving…" : "Save name", action: saveName)
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(!AccountName.canSubmit(name, isSaving: saveState.isSaving))
                    .accessibilityIdentifier("profileSaveName")
            }
            if let saveError = saveState.errorMessage {
                Text(saveError)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("profileSaveError")
            }
            if let saveConfirmation = saveState.successMessage {
                Text(saveConfirmation)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .accessibilityIdentifier("profileSaveConfirmation")
            }
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                Text("Email").letterpressEyebrow().accessibilityHidden(true)
                Text(api.currentUser?.email ?? "Unavailable")
                    .font(Letterpress.ui(16, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Email")
                    .accessibilityValue(api.currentUser?.email ?? "Unavailable")
                    .accessibilityIdentifier("profileEmail")
            }
            Button { showingRemovalInfo = true } label: {
                HStack(spacing: Letterpress.Space.s14) {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                        Text("Account removal")
                            .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                        Text("How removal works today")
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: Letterpress.Space.s10)
                    Image(systemName: "chevron.right")
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkTertiary)
                        .accessibilityHidden(true)
                }
                .padding(.vertical, Letterpress.Space.s10)
                .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
                .overlay(alignment: .top) { LetterpressRule() }
                .overlay(alignment: .bottom) { LetterpressRule() }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Explains the current account removal process")
        }
    }

    private func saveName() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard AccountName.canSubmit(trimmed, isSaving: saveState.isSaving) else { return }
        Task { @MainActor in
            await saveState.perform(success: "Name saved",
                                    failure: "Your name could not be saved. Check your connection and try again.") {
                try await APIService.shared.updateName(trimmed)
            }
            if saveState.errorMessage == nil { name = trimmed }
        }
    }
}
