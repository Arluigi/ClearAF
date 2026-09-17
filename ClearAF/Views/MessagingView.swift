import SwiftUI

enum NotesCopy {
    static let emergency = "Not for emergencies. Use Something's wrong? on Today."

    static func stamp(_ message: AssignedMessage, clinicianName: String, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let who = (message.senderType == "patient" ? "You" : clinicianName).uppercased(with: locale)
        guard let date = RoutineDates.instant(message.sentAt) else { return who }
        return "\(LetterpressFormat.stampTime(date, locale: locale, timeZone: timeZone)) · \(who)"
    }

    static func referenceTitle(_ reference: MessageReference, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        if let label = reference.label, !label.isEmpty { return label }
        if let when = reference.occurredAt.flatMap(RoutineDates.instant) {
            return "\(reference.type == "photo" ? "Photo" : "Routine") · \(LetterpressFormat.dayMonth(when, locale: locale, timeZone: timeZone))"
        }
        return reference.type == "photo" ? "Photo feedback" : "Routine feedback"
    }

    static func referenceMeta(clinicianName: String) -> String { "Referenced by \(clinicianName)" }
    static func count(_ characters: Int) -> String { "\(characters) / 4000" }
    static func sendLabel(sending: Bool, attempted: Bool) -> String { sending ? "Sending…" : attempted ? "Retry message" : "Send" }
    static func unreadHeader(_ count: Int) -> String? { count > 0 ? "\(count) unread" : nil }
}

/// Notes (spec §6 #10, §4.7): clinician words in the display serif with a 2pt ink rule, own replies in a sunk block,
/// mono stamps, labelled reference boxes, no bubbles.
struct MessagingView: View {
    @ObservedObject private var repository = APIService.shared.messaging
    @State private var selected: AssignedMessage?
    @State private var visible: Set<UUID> = []
    @State private var active = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 0) {
                if let pair = repository.conversation {
                    header(pair)
                    GeometryReader { viewport in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: Letterpress.Space.s22) {
                                if repository.nextCursor != nil {
                                    Button("Load older") { Task { await repository.load(older: true) } }
                                        .buttonStyle(.letterpress(.underline))
                                        .frame(maxWidth: .infinity)
                                        .disabled(repository.loading)
                                }
                                if repository.messages.isEmpty && !repository.loading {
                                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                                        Text("No notes yet")
                                            .font(Letterpress.display(28, relativeTo: .title))
                                            .foregroundStyle(Letterpress.ink)
                                        Text("Write to \(pair.clinicianName) below.")
                                            .font(Letterpress.ui(15, relativeTo: .body))
                                            .foregroundStyle(Letterpress.inkSecondary)
                                    }
                                }
                                ForEach(repository.messages) { message in
                                    NoteTurn(message: message, clinicianName: pair.clinicianName) { selected = message }
                                        .background(GeometryReader { geometry in
                                            Color.clear.preference(key: VisibleMessageFrames.self, value: [message.id: geometry.frame(in: .named("messageViewport"))])
                                        })
                                }
                            }
                            .padding(.horizontal, Letterpress.Space.s22)
                            .padding(.vertical, Letterpress.Space.s18)
                        }
                        .coordinateSpace(name: "messageViewport")
                        .onPreferenceChange(VisibleMessageFrames.self) { frames in
                            visible = Set(frames.filter { $0.value.intersects(CGRect(origin: .zero, size: viewport.size)) }.keys)
                            if active && scenePhase == .active && selected == nil { Task { await repository.acknowledgeVisible(visible) } }
                        }
                    }
                    composer
                } else if repository.opened {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                        Text("No care team yet")
                            .font(Letterpress.display(28, relativeTo: .title))
                            .foregroundStyle(Letterpress.ink)
                        Text("A conversation becomes available when a clinician is assigned to your account.")
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.inkSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(Letterpress.Space.s22)
                } else {
                    Button("Open current conversation") { Task { await repository.openCurrent() } }
                        .buttonStyle(.letterpress(.outlined))
                        .padding(Letterpress.Space.s22)
                }
                statusLines
            }
            .background(Letterpress.canvas.ignoresSafeArea())
            .navigationTitle("Notes")
            .toolbar {
                Button("Refresh", systemImage: "arrow.clockwise") {
                    Task {
                        await repository.openCurrent()
                        if active && scenePhase == .active && selected == nil { await repository.acknowledgeVisible(visible) }
                    }
                }
                .disabled(repository.loading || repository.sending)
            }
            .sheet(item: $selected) { message in
                if let pair = repository.conversation { MessageReferenceView(message: message, pair: pair) }
            }
            .task {
                active = true
                guard let ticket = APIService.shared.access.snapshot() else { return }
                do { try repository.resume(ticket); await repository.openCurrent() } catch { }
            }
            .onDisappear { active = false; visible = [] }
            .onChange(of: selected?.id) { _, id in
                if id == nil && active && scenePhase == .active { Task { await repository.acknowledgeVisible(visible) } }
            }
        }
    }

    private func header(_ pair: AssignedConversation) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            HStack(alignment: .firstTextBaseline) {
                Text(pair.clinicianName).letterpressEyebrow()
                Spacer()
                if let unread = NotesCopy.unreadHeader(pair.unreadCount) {
                    Text(unread)
                        .font(Letterpress.data(11, relativeTo: .caption))
                        .foregroundStyle(Letterpress.attentionText)
                }
            }
            LetterpressRule(weight: .major)
        }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.top, Letterpress.Space.s6)
    }

    private var composer: some View {
        let content = repository.draft?.content ?? ""
        return VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            LetterpressRule()
            HStack(alignment: .bottom, spacing: Letterpress.Space.s10) {
                TextField("Write a note", text: Binding(get: { repository.draft?.content ?? "" }, set: { try? repository.edit($0) }), axis: .vertical)
                    .lineLimit(1...5)
                    .letterpressField(isEmpty: content.isEmpty)
                    .disabled(repository.sending)
                Button(NotesCopy.sendLabel(sending: repository.sending, attempted: repository.draft?.attempted == true)) {
                    Task { await repository.send() }
                }
                .buttonStyle(.letterpress(.filled))
                .disabled(repository.sending || content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            HStack(alignment: .firstTextBaseline) {
                Text(NotesCopy.emergency)
                    .font(Letterpress.ui(12, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: Letterpress.Space.s10)
                Text(NotesCopy.count(content.count))
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkTertiary)
            }
        }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.bottom, Letterpress.Space.s10)
    }

    @ViewBuilder private var statusLines: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
            if repository.loading {
                Text("Loading your notes").font(Letterpress.ui(13, relativeTo: .footnote)).foregroundStyle(Letterpress.inkSecondary)
            }
            if let error = repository.error {
                Text(error)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("messagesError")
            }
            Text("Refresh to check for new notes.")
                .font(Letterpress.ui(12, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkTertiary)
        }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.bottom, Letterpress.Space.s6)
    }
}

private struct NoteTurn: View {
    let message: AssignedMessage
    let clinicianName: String
    let openReference: () -> Void

    var body: some View {
        if message.senderType == "patient" { patient } else { clinician }
    }

    private var stamp: some View {
        Text(NotesCopy.stamp(message, clinicianName: clinicianName))
            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
            .foregroundStyle(Letterpress.inkTertiary)
    }

    private var clinician: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            if message.unreadForMe { Text("Unread").letterpressEyebrow(color: Letterpress.attentionText) }
            stamp
            Text(message.content)
                .font(Letterpress.display(17, relativeTo: .body))
                .foregroundStyle(Letterpress.ink)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            if let reference = message.reference { referenceBox(reference) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, Letterpress.Space.s14)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(message.unreadForMe ? Letterpress.attentionMark : Letterpress.ink)
                .frame(width: message.unreadForMe ? 3 : 2)
        }
    }

    private var patient: some View {
        VStack(alignment: .trailing, spacing: Letterpress.Space.s6) {
            stamp
            Text(message.content)
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.ink)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Letterpress.Space.s14)
                .background(Letterpress.sunk)
            Text("Sent")
                .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkTertiary)
            if let reference = message.reference { referenceBox(reference) }
        }
        .padding(.leading, Letterpress.Space.s44)
    }

    private func referenceBox(_ reference: MessageReference) -> some View {
        Button(action: openReference) {
            HStack(spacing: Letterpress.Space.s10) {
                Image(systemName: reference.type == "photo" ? "photo" : "checklist")
                    .font(Letterpress.ui(17, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .frame(width: 28)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text(NotesCopy.referenceTitle(reference))
                        .font(Letterpress.ui(13, weight: .medium, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.ink)
                    Text(NotesCopy.referenceMeta(clinicianName: clinicianName))
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(Letterpress.inkTertiary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .accessibilityHidden(true)
            }
            .padding(Letterpress.Space.s10)
            .frame(minHeight: Letterpress.minTouch)
            .overlay { Rectangle().strokeBorder(Letterpress.ink.opacity(0.2), lineWidth: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the linked feedback")
    }
}

private struct VisibleMessageFrames: PreferenceKey {
    static var defaultValue: [UUID: CGRect] = [:]
    static func reduce(value: inout [UUID: CGRect], nextValue: () -> [UUID: CGRect]) { value.merge(nextValue(), uniquingKeysWith: { _, new in new }) }
}

private struct MessageReferenceView: View {
    let message: AssignedMessage; let pair: AssignedConversation
    @Environment(\.dismiss) private var dismiss
    @State private var detail: MessageReferenceDetail?
    @State private var image: UIImage?
    @State private var unavailable = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
                    if unavailable {
                        Text("This referenced record is unavailable.")
                            .font(Letterpress.ui(15, relativeTo: .body)).foregroundStyle(Letterpress.inkSecondary)
                    } else if let detail {
                        Text(detail.reference.label ?? "Feedback reference")
                            .font(Letterpress.display(24, relativeTo: .title2)).foregroundStyle(Letterpress.ink)
                        if let routine = detail.routine {
                            Text("\(routine.timeOfDay.capitalized) · v\(routine.version)")
                                .font(Letterpress.data(12, weight: .regular, relativeTo: .footnote)).foregroundStyle(Letterpress.inkSecondary)
                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(Array(routine.steps.enumerated()), id: \.offset) { _, step in
                                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                                        Text(step.title).font(Letterpress.ui(16, weight: .medium, relativeTo: .headline)).foregroundStyle(Letterpress.ink)
                                        Text(step.instructions).font(Letterpress.ui(13, relativeTo: .footnote)).foregroundStyle(Letterpress.inkSecondary)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, Letterpress.Space.s10)
                                    .overlay(alignment: .top) { LetterpressRule() }
                                }
                                LetterpressRule()
                            }
                        }
                        if let photo = detail.photo {
                            Text(RoutineDates.instant(photo.captureDate).map { LetterpressFormat.stampYearTime($0) } ?? photo.captureDate)
                                .font(Letterpress.data(12, relativeTo: .footnote)).foregroundStyle(Letterpress.ink)
                            if let image {
                                Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("Referenced photo")
                            } else {
                                Text("Photo preview unavailable.")
                                    .font(Letterpress.ui(15, relativeTo: .body)).foregroundStyle(Letterpress.inkSecondary)
                            }
                        }
                    } else {
                        Text("Loading the linked feedback")
                            .font(Letterpress.ui(15, relativeTo: .body)).foregroundStyle(Letterpress.inkSecondary)
                    }
                }
                .padding(Letterpress.Space.s22)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Linked feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { dismiss() } }
            .task {
                let api = APIService.shared
                guard let ticket = api.access.snapshot(), let reference = message.reference else { unavailable = true; return }
                do {
                    let result = try await api.messageReference(pair: pair, id: message.id, ticket: ticket)
                    try api.access.require(ticket); try Task.checkCancellation()
                    guard result.reference.id == reference.id, result.reference.type == reference.type, result.reference.available else { unavailable = true; return }
                    if reference.type == "routineRevision" { guard let routine = result.routine, routine.id == reference.id, routine.userId == pair.patientId else { unavailable = true; return } }
                    else if reference.type == "photo" {
                        guard result.photo?.id == reference.id else { unavailable = true; return }
                        let bytes = try await api.messagePhotoThumbnail(id: reference.id, ticket: ticket)
                        try api.access.require(ticket); try Task.checkCancellation(); image = UIImage(data: bytes)
                    } else { unavailable = true; return }
                    detail = result
                } catch { unavailable = true }
            }
        }
        .letterpressSheetBackground()
    }
}
