import SwiftUI
import CoreData

enum TodayCopy {
    static func greeting(hour: Int) -> String {
        switch hour {
        case 5..<12: "Good morning,"
        case 12..<17: "Good afternoon,"
        case 17..<22: "Good evening,"
        default: "Good night,"
        }
    }

    static func initials(_ name: String?) -> String {
        (name ?? "").split(separator: " ").prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined()
    }

    /// Morning before 14:00, evening after; falls back to whichever slot has an active assignment.
    static func slot(hour: Int, morning: CareRoutineRevision?, evening: CareRoutineRevision?) -> RoutineTimeOfDay? {
        let hasMorning = morning?.isActive == true
        let hasEvening = evening?.isActive == true
        if hour < 14 { return hasMorning ? .morning : (hasEvening ? .evening : nil) }
        return hasEvening ? .evening : (hasMorning ? .morning : nil)
    }

    static func latestUnread(_ messages: [AssignedMessage]) -> AssignedMessage? {
        messages.last { $0.senderType == "dermatologist" && $0.unreadForMe }
    }

    static func needsTodaySlot(latest: Date?, now: Date, calendar: Calendar) -> Bool {
        guard let latest else { return true }
        return !calendar.isDate(latest, inSameDayAs: now)
    }
}

/// Today (spec §6 #3): greeting → photo rail → checklist → unread note → check-in row, rule-separated.
struct DashboardViewEnhanced: View {
    @Binding var selectedTab: AppTab
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingProfile = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TodayGreeting(name: users.first?.name, showingProfile: $showingProfile)
                        .padding(.horizontal, Letterpress.Space.s22)
                    LetterpressRule(weight: .major)
                        .padding(.horizontal, Letterpress.Space.s22)
                    CareStatusSection()
                        .padding(.top, Letterpress.Space.s18)
                    UrgentReportEntry()
                        .padding(.top, Letterpress.Space.s18)
                    TodayPhotoRail(selectedTab: $selectedTab)
                        .padding(.top, Letterpress.Space.s22)
                    TodayRoutineSection(selectedTab: $selectedTab)
                        .padding(.horizontal, Letterpress.Space.s22)
                        .padding(.top, Letterpress.Space.s22)
                    TodayUnreadNote(selectedTab: $selectedTab)
                        .padding(.horizontal, Letterpress.Space.s22)
                        .padding(.top, Letterpress.Space.s22)
                    TodayCheckInRow()
                        .padding(.horizontal, Letterpress.Space.s22)
                        .padding(.top, Letterpress.Space.s22)
                }
                .padding(.bottom, Letterpress.Space.s28)
            }
            .background(Letterpress.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .task { await refresh() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await refresh() } }
            }
            .sheet(isPresented: $showingProfile) {
                ProfileView()
                    .environment(\.managedObjectContext, viewContext)
            }
        }
    }

    /// Care status, urgent reports and the assigned conversation change on the clinician's side.
    /// Opening the conversation here only reads it; acknowledging notes happens in Notes while they are on screen.
    private func refresh() async {
        guard let ticket = APIService.shared.access.snapshot() else { return }
        await APIService.shared.careDecisions.load(ticket: ticket)
        await APIService.shared.urgentReports.load(ticket: ticket)
        do { try APIService.shared.messaging.resume(ticket) } catch { return }
        await APIService.shared.messaging.openCurrent()
    }
}

private struct TodayGreeting: View {
    let name: String?
    @Binding var showingProfile: Bool

    var body: some View {
        let now = Date()
        VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
            HStack {
                Text(LetterpressFormat.weekdayDayMonth(now)).letterpressEyebrow()
                Spacer()
                Button {
                    HapticManager.light()
                    showingProfile = true
                } label: {
                    Group {
                        let initials = TodayCopy.initials(name)
                        if initials.isEmpty {
                            Image(systemName: "person").font(Letterpress.ui(13, relativeTo: .caption))
                        } else {
                            Text(initials).font(Letterpress.data(11, relativeTo: .caption))
                        }
                    }
                    .foregroundStyle(Letterpress.canvas)
                    .frame(width: 30, height: 30)
                    .background(Letterpress.ink, in: Circle())
                    .frame(width: Letterpress.minTouch, height: Letterpress.minTouch)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibleButton(label: "Profile", hint: "Open your profile settings")
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(TodayCopy.greeting(hour: Calendar.current.component(.hour, from: now)))
                    .font(Letterpress.display(40, relativeTo: .largeTitle))
                if let name, !name.isEmpty {
                    Text(name).font(Letterpress.display(40, italic: true, relativeTo: .largeTitle))
                }
            }
            .foregroundStyle(Letterpress.ink)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, Letterpress.Space.s10)
        .padding(.bottom, Letterpress.Space.s18)
    }
}

private struct TodayPhotoRail: View {
    static let tileWidth: CGFloat = 112
    @Binding var selectedTab: AppTab
    @FetchRequest(fetchRequest: Self.recentRequest(), animation: .default)
    private var photos: FetchedResults<SkinPhoto>
    @State private var images = PhotoImageLoader()
    @State private var capturing = false

    private static func recentRequest() -> NSFetchRequest<SkinPhoto> {
        let request = SkinPhoto.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(key: "captureDate", ascending: false), NSSortDescriptor(key: "id", ascending: false)]
        request.fetchLimit = 3
        return request
    }

    var body: some View {
        let needsToday = TodayCopy.needsTodaySlot(latest: photos.first?.captureDate, now: Date(), calendar: .current)
        let shown = Array(photos.prefix(needsToday ? 2 : 3))
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Photo record").letterpressEyebrow()
                Spacer()
                Button("View all") { selectedTab = .record }.buttonStyle(.letterpress(.underline))
            }
            .padding(.horizontal, Letterpress.Space.s22)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: Letterpress.Space.s6) {
                    if needsToday { todaySlot }
                    ForEach(Array(shown.enumerated()), id: \.element.objectID) { index, photo in
                        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                            PhotoFrame(photo: photo, images: images, maxPixelSize: 400)
                                .accessibilityElement()
                                .accessibilityAddTraits(.isImage)
                                .accessibilityLabel(index == 0 ? "Latest progress photo" : "Dated photo")
                            if let date = photo.captureDate {
                                Text(LetterpressFormat.stamp(date))
                                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                                    .foregroundStyle(Letterpress.inkTertiary)
                            }
                            PhotoSharingStatusView(photo: photo, compact: true)
                        }
                        .frame(width: Self.tileWidth)
                    }
                }
                .padding(.horizontal, Letterpress.Space.s22)
            }
        }
        .sheet(isPresented: $capturing) { DurablePhotoCaptureView() }
        .onDisappear { images.clear() }
    }

    private var todaySlot: some View {
        Button { capturing = true } label: {
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Rectangle()
                    .fill(Letterpress.sunk)
                    .aspectRatio(4 / 5, contentMode: .fit)
                    .overlay {
                        VStack(spacing: Letterpress.Space.s6) {
                            Image(systemName: "camera").foregroundStyle(Letterpress.ink)
                            Text("Today").letterpressEyebrow(color: Letterpress.ink)
                        }
                    }
                    .overlay { Rectangle().strokeBorder(Letterpress.ink, lineWidth: 1.5) }
                Text(LetterpressFormat.stamp(Date()))
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                    .foregroundStyle(Letterpress.ink)
            }
            .frame(width: Self.tileWidth)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("Take today's photo")
    }
}

private struct TodayRoutineSection: View {
    @Binding var selectedTab: AppTab
    @ObservedObject private var repository = APIService.shared.routines
    @State private var ticked: [UUID: Set<Int>] = [:]
    @State private var actionError: String?

    var body: some View {
        let slot = TodayCopy.slot(hour: Calendar.current.component(.hour, from: Date()),
                                  morning: repository.routine(for: .morning), evening: repository.routine(for: .evening))
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            LetterpressRule()
            if let slot, let routine = repository.routine(for: slot) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(slot.title) routine").letterpressEyebrow()
                    Spacer()
                    Text("V\(routine.version)")
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(Letterpress.inkTertiary)
                }
                .padding(.top, Letterpress.Space.s10)
                RoutineChecklist(steps: routine.steps, ticked: Binding(get: { ticked[routine.id] ?? [] }, set: { ticked[routine.id] = $0 }))
                RoutineRecordPanel(routine: routine, repository: repository, identifierPrefix: "today-routine",
                                   showsVersionNote: false, actionError: $actionError)
                    .padding(.top, Letterpress.Space.s6)
            } else {
                Text("Routine").letterpressEyebrow().padding(.top, Letterpress.Space.s10)
                Text(repository.snapshot == nil ? "Your routine hasn't loaded yet." : "No routine assigned yet.")
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
            }
            if actionError != nil || repository.lastError != nil {
                Text("Routines need attention.")
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.error)
            }
            Button("Open Plan") { selectedTab = .plan }.buttonStyle(.letterpress(.underline))
        }
    }
}

private struct TodayUnreadNote: View {
    @Binding var selectedTab: AppTab
    @ObservedObject private var messaging = APIService.shared.messaging

    var body: some View {
        if let pair = messaging.conversation, let message = TodayCopy.latestUnread(messaging.messages) {
            Button { selectedTab = .notes } label: {
                VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                    Text("Unread · \(pair.clinicianName)").letterpressEyebrow(color: Letterpress.attentionText)
                    Text(message.content)
                        .font(Letterpress.display(17, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                        .lineLimit(4)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, Letterpress.Space.s14)
                .overlay(alignment: .leading) { Rectangle().fill(Letterpress.attentionMark).frame(width: 3) }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens Notes")
        }
    }
}

private struct TodayCheckInRow: View {
    @ObservedObject private var checkIns = APIService.shared.checkIns

    var body: some View {
        NavigationLink { CheckInView() } label: {
            HStack(spacing: Letterpress.Space.s14) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text("Check-in")
                        .font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline))
                        .foregroundStyle(Letterpress.ink)
                    Text(checkIns.draft == nil ? "Answer the questions your clinician set" : "Draft saved on this device")
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                Spacer(minLength: Letterpress.Space.s10)
                Text(checkIns.draft == nil ? "Start" : "Continue")
                    .font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline))
                    .foregroundStyle(Letterpress.ink)
                    .underline()
            }
            .padding(.horizontal, Letterpress.Space.s18)
            .padding(.vertical, Letterpress.Space.s14)
            .frame(minHeight: Letterpress.minTouch)
            .overlay { Rectangle().strokeBorder(Letterpress.ink.opacity(0.2), lineWidth: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    DashboardViewEnhanced(selectedTab: .constant(.today))
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}
