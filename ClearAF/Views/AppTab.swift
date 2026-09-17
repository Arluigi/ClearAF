/// The four destinations (spec §6 tab bar). `capture` sits in the centre of the bar as an action and is never selected.
enum AppTab: Hashable, CaseIterable {
    case today, record, capture, plan, notes

    static let destinations: [AppTab] = [.today, .record, .plan, .notes]

    var title: String {
        switch self {
        case .today: "Today"
        case .record: "Record"
        case .capture: "Capture"
        case .plan: "Plan"
        case .notes: "Notes"
        }
    }

    var systemImage: String {
        switch self {
        case .today: "sun.max"
        case .record: "square.grid.2x2"
        case .capture: "camera"
        case .plan: "checklist"
        case .notes: "text.bubble"
        }
    }

    /// A tap on Capture opens the camera sheet and leaves the current destination selected.
    static func route(_ requested: AppTab, from current: AppTab) -> (selection: AppTab, startsCapture: Bool) {
        requested == .capture ? (current, true) : (requested, false)
    }
}
