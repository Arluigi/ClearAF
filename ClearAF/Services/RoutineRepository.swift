import Combine
import Foundation

@MainActor protocol RoutineTransport {
    func fetchRoutines(localDate: String, ticket: AccountAccess.Ticket) async throws -> RoutineSnapshot
    func sendCompletion(_ pending: PendingRoutineCompletion, ticket: AccountAccess.Ticket) async throws -> CareRoutineCompletion
}
enum RoutineFailure: LocalizedError {
    case readFailed, writeFailed, invalidData, assignmentChanged, queueFull
    var errorDescription: String? {
        switch self {
        case .readFailed: return "Saved routines could not be opened on this device. Try again; your saved file has been kept."
        case .writeFailed: return "Your routine update could not be saved on this device. Please try again."
        case .invalidData: return "The routine data could not be verified. Refresh and try again."
        case .assignmentChanged: return "This assignment changed. Review the current routine before recording completion."
        case .queueFull: return "Your saved completions need to sync before you can record more. Try again when connected."
        }
    }
}

/// The cache and owner-bound outbox are one atomic, protected file. Published
/// success only follows persistence; a failed acknowledgment keeps the same event.
@MainActor final class RoutineRepository: ObservableObject {
    @Published private(set) var snapshot: RoutineSnapshot?
    @Published private(set) var pending: [PendingRoutineCompletion] = []
    @Published private(set) var lastRefreshed: Date?
    @Published private(set) var isRefreshing = false
    @Published private(set) var isCached = true
    @Published private(set) var localDate: String
    @Published private(set) var lastError: String?
    private let access: AccountAccess
    private let transport: any RoutineTransport
    private let directory: URL?
    private let now: () -> Date
    private let timeZone: () -> TimeZone
    private let retryInterval: TimeInterval
    private var ticket: AccountAccess.Ticket?
    private var fileURL: URL?
    private var cache: RoutineCareFile?
    private var runID = UUID()
    private var refreshTask: Task<Void, Never>?
    private var worker: Task<Void, Never>?
    private var timer: Task<Void, Never>?
    private var attempts = 0

    init(access: AccountAccess, transport: any RoutineTransport, directory: URL? = nil,
         now: @escaping () -> Date = Date.init, timeZone: @escaping () -> TimeZone = { .current },
         retryInterval: TimeInterval = 30) {
        self.access = access; self.transport = transport; self.directory = directory
        self.now = now; self.timeZone = timeZone; self.retryInterval = max(1, retryInterval)
        localDate = RoutineDates.localDate(now(), zone: timeZone())
    }
    func resume(accountID: UUID, ticket: AccountAccess.Ticket) {
        guard access.snapshot() == ticket, ticket.accountID == accountID else { return }
        if self.ticket == ticket, cache != nil {
            updateToday()
            return
        }
        cancel()
        self.ticket = ticket
        updateToday()
        do {
            let root = try directory ?? FileManager.default.url(for: .applicationSupportDirectory,
                in: .userDomainMask, appropriateFor: nil, create: true)
            let folder = root.appendingPathComponent("Accounts/\(accountID.uuidString.lowercased())", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            fileURL = folder.appendingPathComponent("routine-care.json")
            try load()
            let run = runID
            Task { @MainActor [weak self] in
                guard let self, self.runID == run else { return }
                await self.refresh()
            }
            startWorker()
        } catch { lastError = RoutineFailure.readFailed.localizedDescription }
    }
    func cancel() {
        runID = UUID()
        refreshTask?.cancel(); worker?.cancel(); timer?.cancel()
        refreshTask = nil; worker = nil; timer = nil; ticket = nil; cache = nil; fileURL = nil
        snapshot = nil; pending = []; lastRefreshed = nil; lastError = nil
        isRefreshing = false; isCached = true; attempts = 0
    }
    func status(for revision: CareRoutineRevision) -> RoutineDailyStatus {
        guard revision.userId == ticket?.accountID else { return .unrecorded }
        if snapshot?.completions.contains(where: { $0.revisionId == revision.id && $0.localDate == localDate }) == true { return .recorded }
        if pending.contains(where: { $0.revisionId == revision.id && $0.localDate == localDate }) { return .pending }
        return .unrecorded
    }
    func routine(for slot: RoutineTimeOfDay) -> CareRoutineRevision? {
        snapshot?.routines.first { $0.timeOfDay == slot }
    }
    @discardableResult func recordCompletion(revision: CareRoutineRevision, ticket expected: AccountAccess.Ticket?) throws -> PendingRoutineCompletion {
        try access.require(expected)
        guard let ticket, expected == ticket else { throw AccountFailure.accountChanged }
        try require(ticket, run: runID)
        updateToday()
        guard let current = routine(for: revision.timeOfDay), current == revision,
              revision.userId == ticket.accountID, revision.isActive else { throw RoutineFailure.assignmentChanged }
        if let existing = pending.first(where: { $0.revisionId == revision.id && $0.localDate == localDate }) { return existing }
        if let existing = snapshot?.completions.first(where: { $0.revisionId == revision.id && $0.localDate == localDate }) {
            return PendingRoutineCompletion(id: existing.id, userId: existing.userId, revisionId: existing.revisionId,
                completedAt: existing.completedAt, localDate: existing.localDate, timeZone: existing.timeZone)
        }
        guard var next = cache else { throw RoutineFailure.readFailed }
        guard next.pending.count < 1000 else { throw RoutineFailure.queueFull }
        let date = now(), zone = timeZone()
        let event = PendingRoutineCompletion(id: UUID(), userId: ticket.accountID, revisionId: revision.id,
            completedAt: RoutineDates.timestamp(date), localDate: RoutineDates.localDate(date, zone: zone), timeZone: zone.identifier)
        next.pending.append(event)
        try persist(next)
        lastError = nil; attempts = 0
        startWorker()
        return event
    }
    func refresh() async {
        updateToday()
        if let refreshTask { await refreshTask.value; return }
        guard let ticket, access.snapshot() == ticket, cache != nil else { return }
        let run = runID, requestedDate = localDate
        isRefreshing = true
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                try self.require(ticket, run: run)
                let response = try await self.transport.fetchRoutines(localDate: requestedDate, ticket: ticket)
                try self.require(ticket, run: run)
                try RoutineCareFile.validate(response, owner: ticket.accountID)
                guard var next = self.cache else { throw RoutineFailure.readFailed }
                next.snapshot = RoutineSnapshot(routines: response.routines,
                    completions: Self.merge(next.snapshot?.completions ?? [], response.completions))
                next.lastRefreshed = self.now()
                try self.persist(next)
                self.isCached = false
                // A successful refresh doesn't conceal a still-failing outbox.
                if self.pending.isEmpty { self.lastError = nil }
            } catch {
                guard (try? self.require(ticket, run: run)) != nil else { return }
                self.isCached = true
                self.lastError = self.message(error)
            }
        }
        refreshTask = task
        await task.value
        guard runID == run else { return }
        refreshTask = nil; isRefreshing = false
        // A date change during the request must load the new day's events too.
        updateToday()
        if requestedDate != localDate { await refresh() }
    }
    func retry() async {
        guard let ticket, access.snapshot() == ticket else { return }
        if cache == nil {
            do { try load() } catch { lastError = RoutineFailure.readFailed.localizedDescription; return }
        }
        timer?.cancel(); timer = nil; attempts = 0
        let run = runID
        if let worker { await worker.value }
        guard (try? require(ticket, run: run)) != nil else { return }
        startWorker()
        if let worker { await worker.value }
        guard (try? require(ticket, run: run)) != nil else { return }
        await refresh()
    }
    private func updateToday() { localDate = RoutineDates.localDate(now(), zone: timeZone()) }
    private func require(_ ticket: AccountAccess.Ticket, run: UUID) throws {
        try Task.checkCancellation()
        try access.require(ticket)
        guard self.ticket == ticket, runID == run else { throw AccountFailure.accountChanged }
    }
    private func load() throws {
        guard let fileURL, let ticket else { throw RoutineFailure.readFailed }
        let next: RoutineCareFile
        if FileManager.default.fileExists(atPath: fileURL.path) {
            let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
            guard let size = attributes[.size] as? NSNumber, size.intValue <= 2 * 1024 * 1024,
                  attributes[.type] as? FileAttributeType == .typeRegular else { throw RoutineFailure.readFailed }
            next = try JSONDecoder().decode(RoutineCareFile.self, from: Data(contentsOf: fileURL))
            try next.validate(owner: ticket.accountID)
        } else { next = RoutineCareFile(owner: ticket.accountID) }
        cache = next; publish()
    }
    private func persist(_ next: RoutineCareFile) throws {
        guard let fileURL, let ticket else { throw AccountFailure.accountChanged }
        try access.require(ticket)
        do {
            try next.validate(owner: ticket.accountID)
            let data = try JSONEncoder().encode(next)
            guard data.count <= 2 * 1024 * 1024 else { throw RoutineFailure.writeFailed }
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            cache = next; publish()
        } catch {
            lastError = RoutineFailure.writeFailed.localizedDescription
            throw RoutineFailure.writeFailed
        }
    }
    private func publish() {
        snapshot = cache?.snapshot; pending = cache?.pending ?? []; lastRefreshed = cache?.lastRefreshed
    }
    private func startWorker() {
        guard worker == nil, !pending.isEmpty, cache != nil, let ticket, access.snapshot() == ticket else { return }
        timer?.cancel(); timer = nil
        let run = runID
        worker = Task { @MainActor [weak self] in
            guard let self else { return }
            var transient = false
            var failure: String?
            var attempted: Set<UUID> = []
            // Attempt each event once per pass, including events queued while a
            // send awaits. A rejected old report cannot block later valid ones.
            while let event = self.pending.first(where: { !attempted.contains($0.id) }) {
                attempted.insert(event.id)
                do {
                    try self.require(ticket, run: run)
                    let response = try await self.transport.sendCompletion(event, ticket: ticket)
                    try self.require(ticket, run: run)
                    guard response.userId == event.userId, response.revisionId == event.revisionId,
                          response.localDate == event.localDate,
                          response.id != event.id || (response.completedAt == event.completedAt && response.timeZone == event.timeZone)
                    else { throw RoutineFailure.invalidData }
                    guard var next = self.cache else { throw RoutineFailure.readFailed }
                    var snapshot = next.snapshot ?? RoutineSnapshot(routines: [], completions: [])
                    snapshot.completions = Self.merge(snapshot.completions, [response])
                    next.snapshot = snapshot
                    next.pending.removeAll { $0.id == event.id }
                    try self.persist(next)
                } catch {
                    guard (try? self.require(ticket, run: run)) != nil else { return }
                    failure = self.message(error)
                    transient = transient || Self.isTransient(error)
                    // A local persistence failure must be repaired before more
                    // acknowledgments can be saved. The original file remains.
                    if case RoutineFailure.writeFailed = error { break }
                }
            }
            guard (try? self.require(ticket, run: run)) != nil else { return }
            self.lastError = failure
            self.worker = nil
            self.attempts += 1
            // At most three passes per foreground/retry cycle, scheduled only
            // after a transient failure. No background retry loop.
            if transient && !self.pending.isEmpty && self.attempts < 3 {
                self.timer = Task { @MainActor [weak self] in
                    guard let interval = self?.retryInterval else { return }
                    do { try await Task.sleep(for: .seconds(interval)) } catch { return }
                    guard let self, (try? self.require(ticket, run: run)) != nil else { return }
                    self.startWorker()
                }
            }
        }
    }
    private static func merge(_ saved: [CareRoutineCompletion], _ fetched: [CareRoutineCompletion]) -> [CareRoutineCompletion] {
        var events = Dictionary(saved.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
        for event in fetched { events[event.id] = event }
        return Array(events.values.sorted { $0.receivedAt > $1.receivedAt }.prefix(2000))
    }
    private func message(_ error: Error) -> String {
        if let error = error as? RoutineFailure { return error.localizedDescription }
        if let error = error as? AccountFailure { return error.localizedDescription }
        return pending.isEmpty ? "Routines could not be refreshed. Check your connection and try again." : "Saved on this device. Completion could not be synced. Check your connection and retry."
    }
    private static func isTransient(_ error: Error) -> Bool { AccountFailure.isTransient(error) }
}

private struct RoutineCareFile: Codable {
    var schema = 1
    let owner: UUID
    var snapshot: RoutineSnapshot?
    var lastRefreshed: Date?
    var pending: [PendingRoutineCompletion] = []
    func validate(owner expected: UUID) throws {
        guard owner == expected, schema == 1, pending.count <= 1000,
              Set(pending.map(\.id)).count == pending.count,
              lastRefreshed?.timeIntervalSince1970.isFinite != false else { throw RoutineFailure.invalidData }
        if let snapshot { try Self.validate(snapshot, owner: expected) }
        for event in pending {
            guard event.userId == expected,
                  RoutineDates.valid(completedAt: event.completedAt, localDate: event.localDate, timeZone: event.timeZone)
            else { throw RoutineFailure.invalidData }
        }
    }
    static func validate(_ snapshot: RoutineSnapshot, owner: UUID) throws {
        guard snapshot.routines.count <= 2, snapshot.completions.count <= 2000,
              Set(snapshot.routines.map(\.timeOfDay)).count == snapshot.routines.count,
              Set(snapshot.completions.map(\.id)).count == snapshot.completions.count else { throw RoutineFailure.invalidData }
        for routine in snapshot.routines {
            guard routine.userId == owner, routine.version > 0, RoutineDates.instant(routine.createdAt) != nil,
                  (1...120).contains(routine.name.utf16.count), routine.steps.count <= 20,
                  !routine.isActive || !routine.steps.isEmpty,
                  routine.steps.allSatisfy({ (1...120).contains($0.title.utf16.count) && $0.instructions.utf16.count <= 2000 })
            else { throw RoutineFailure.invalidData }
        }
        for event in snapshot.completions {
            guard event.userId == owner, RoutineDates.instant(event.receivedAt) != nil,
                  RoutineDates.valid(completedAt: event.completedAt, localDate: event.localDate, timeZone: event.timeZone)
            else { throw RoutineFailure.invalidData }
        }
    }
}
