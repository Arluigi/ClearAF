import SwiftUI

enum CareTeamState: Equatable {
    case loading
    case assigned(String)
    case unassigned
    case failed
}

/// The assigned clinician's name, from the existing patient-scoped `GET /assigned-messages/current` read.
/// Reading it acknowledges nothing; acknowledgement stays in Notes.
@MainActor enum CareTeamLookup {
    /// Returns nil when the account changed while the request was in flight, so a late answer is never shown.
    static func load(access: AccountAccess,
                     fetch: (AccountAccess.Ticket) async throws -> AssignedConversation?) async -> CareTeamState? {
        guard let ticket = access.snapshot() else { return nil }
        do {
            let conversation = try await fetch(ticket)
            guard access.snapshot() == ticket else { return nil }
            return conversation.map { .assigned($0.clinicianName) } ?? .unassigned
        } catch {
            guard access.snapshot() == ticket else { return nil }
            return .failed
        }
    }

    /// A failed refresh keeps a name already on screen.
    static func merge(_ current: CareTeamState, _ loaded: CareTeamState) -> CareTeamState {
        if loaded == .failed, case .assigned = current { return current }
        return loaded
    }

    static func title(_ state: CareTeamState) -> String {
        switch state {
        case .loading: "Loading your care team"
        case .assigned(let name): name
        case .unassigned: "No clinician assigned yet"
        case .failed: "Couldn't load your care team"
        }
    }

    static func detail(_ state: CareTeamState) -> String? {
        switch state {
        case .loading: nil
        case .assigned: "Reads the photos, check-ins and notes you send"
        case .unassigned: "Their name appears here once one is assigned."
        case .failed: "Check your connection and try again."
        }
    }
}

/// Ruled care-team row used on Profile and onboarding.
struct CareTeamRow: View {
    @State private var state: CareTeamState

    init() {
        _state = State(initialValue: APIService.shared.messaging.conversation.map { .assigned($0.clinicianName) } ?? .loading)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s14) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text(CareTeamLookup.title(state))
                        .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                        .foregroundStyle(state == .failed ? Letterpress.error : Letterpress.ink)
                    if let detail = CareTeamLookup.detail(state) {
                        Text(detail)
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: Letterpress.Space.s10)
                if case .assigned = state {
                    Text("ASSIGNED")
                        .font(Letterpress.data(11, relativeTo: .caption))
                        .foregroundStyle(Letterpress.ink)
                }
            }
            .accessibilityElement(children: .combine)
            if state == .failed {
                Button("Try again") { Task { await reload() } }
                    .buttonStyle(.letterpress(.underline))
            }
        }
        .padding(.vertical, Letterpress.Space.s10)
        .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
        .overlay(alignment: .top) { LetterpressRule() }
        .overlay(alignment: .bottom) { LetterpressRule() }
        .task { await reload() }
    }

    private func reload() async {
        let shown = state
        if state == .failed { state = .loading }
        guard let loaded = await CareTeamLookup.load(access: APIService.shared.access, fetch: {
            try await APIService.shared.currentMessages(ticket: $0)
        }) else { return }
        state = CareTeamLookup.merge(shown, loaded)
    }
}
