import SwiftUI

struct MessagingView: View {
    @ObservedObject private var repository = APIService.shared.messaging
    @State private var selected: AssignedMessage?
    @State private var visible: Set<UUID> = []
    @State private var active = false
    @Environment(\.scenePhase) private var scenePhase
    init(dermatologist: Dermatologist? = nil) {}
    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                if let pair = repository.conversation {
                    HStack { Text(pair.clinicianName).font(.headline); Spacer(); Text("\(pair.unreadCount) unread").font(.caption) }.padding(.horizontal)
                    GeometryReader { viewport in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 16) {
                                if repository.nextCursor != nil { Button("Load older messages") { Task { await repository.load(older: true) } }.disabled(repository.loading) }
                                if repository.messages.isEmpty { Text("Start a conversation with your assigned clinician.").foregroundStyle(.secondary) }
                                ForEach(repository.messages) { message in
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(message.senderType == "patient" ? "You" : pair.clinicianName).font(.caption).foregroundStyle(.secondary)
                                        Text(message.content).textSelection(.enabled)
                                        if let reference = message.reference {
                                            Button { selected = message } label: {
                                                Label(reference.label ?? (reference.type == "photo" ? "Photo feedback" : "Routine feedback"), systemImage: reference.type == "photo" ? "photo" : "list.bullet")
                                            }
                                        }
                                        if let date = RoutineDates.instant(message.sentAt) {
                                            HStack { Text(date, style: .date); Text(date, style: .time); if message.senderType == "patient" { Text("Sent") } }.font(.caption2).foregroundStyle(.secondary)
                                        }
                                    }
                                    .padding().frame(maxWidth: .infinity, alignment: .leading)
                                    .background(message.senderType == "patient" ? CareJournal.actionPrimary.opacity(0.10) : Color.cardBackground)
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                                    .background(GeometryReader { geometry in
                                        Color.clear.preference(key: VisibleMessageFrames.self, value: [message.id: geometry.frame(in: .named("messageViewport"))])
                                    })
                                }
                            }.padding()
                        }
                        .coordinateSpace(name: "messageViewport")
                        .onPreferenceChange(VisibleMessageFrames.self) { frames in
                            visible = Set(frames.filter { $0.value.intersects(CGRect(origin: .zero, size: viewport.size)) }.keys)
                            if active && scenePhase == .active && selected == nil { Task { await repository.acknowledgeVisible(visible) } }
                        }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        TextField("Write a message", text: Binding(get: { repository.draft?.content ?? "" }, set: { try? repository.edit($0) }), axis: .vertical)
                            .textFieldStyle(.roundedBorder).lineLimit(2...5).disabled(repository.sending)
                        HStack {
                            Text("\(repository.draft?.content.count ?? 0)/4000").font(.caption).foregroundStyle(.secondary)
                            Spacer()
                            Button(repository.sending ? "Sending…" : repository.draft?.attempted == true ? "Retry message" : "Send") { Task { await repository.send() } }
                                .buttonStyle(.borderedProminent).disabled(repository.sending || (repository.draft?.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true))
                        }
                    }.padding(.horizontal)
                } else if repository.opened { ContentUnavailableView("Messaging unavailable", systemImage: "message", description: Text("A conversation becomes available when a clinician is assigned to your account.")) }
                else { Button("Open current conversation") { Task { await repository.openCurrent() } } }
                if repository.loading { SwiftUI.ProgressView() }
                if let error = repository.error { Text(error).font(.callout).foregroundStyle(.secondary).padding(.horizontal).accessibilityIdentifier("messagesError") }
                Text("Refresh to check for new messages.").font(.caption).foregroundStyle(.secondary)
            }
            .padding(.vertical, 8).background(CareJournal.canvas)
            .navigationTitle("Messages")
            .toolbar { Button("Refresh", systemImage: "arrow.clockwise") { Task { await repository.openCurrent(); if active && scenePhase == .active && selected == nil { await repository.acknowledgeVisible(visible) } } }.disabled(repository.loading || repository.sending) }
            .sheet(item: $selected) { message in if let pair = repository.conversation { MessageReferenceView(message: message, pair: pair) } }
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
                VStack(alignment: .leading, spacing: 16) {
                    if unavailable { Text("This referenced record is unavailable.") }
                    else if let detail {
                        Text(detail.reference.label ?? "Feedback reference").font(.title2)
                        if let routine = detail.routine {
                            Text("\(routine.timeOfDay.capitalized) · Revision \(routine.version)").foregroundStyle(.secondary)
                            ForEach(Array(routine.steps.enumerated()), id: \.offset) { _, step in VStack(alignment: .leading) { Text(step.title).font(.headline); Text(step.instructions) } }
                        }
                        if let photo = detail.photo { Text(photo.captureDate).font(.caption); if let image { Image(uiImage: image).resizable().scaledToFit() } else { Text("Photo preview unavailable.") } }
                    } else { SwiftUI.ProgressView() }
                }.padding()
            }.navigationTitle("Linked feedback").toolbar { Button("Done") { dismiss() } }
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
    }
}
