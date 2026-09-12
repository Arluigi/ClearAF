import CoreData
import Testing
@testable import ClearAF

/// Real account files with only the external transport and wall clock replaced.
@MainActor struct RoutineRepositoryTests {
    private func root() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }
    private func eventually(_ condition: () -> Bool) async throws {
        for _ in 0..<200 {
            if condition() { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        #expect(condition())
    }
    private func revision(_ owner: UUID, version: Int = 1) -> CareRoutineRevision {
        CareRoutineRevision(id: UUID(), userId: owner, timeOfDay: .morning, version: version,
            createdBy: UUID(), createdAt: "2026-09-11T12:00:00.000Z", name: "Synthetic routine",
            isActive: true, steps: [CareRoutineStep(title: "Synthetic first step", instructions: "Fixture instructions")])
    }
    @Test func persistedBeforeNetworkReopensAndLostResponseRetriesOriginalBody() async throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = RoutineTestTransport()
        let assigned = revision(ticket.accountID)
        transport.snapshot = RoutineSnapshot(routines: [assigned], completions: [])
        let clock = RoutineTestClock()
        let repository = RoutineRepository(access: access, transport: transport, directory: directory,
            now: { clock.date }, timeZone: { clock.zone }, retryInterval: 3600)
        repository.resume(accountID: ticket.accountID, ticket: ticket)
        await repository.refresh()
        transport.offline = true
        let saved = try repository.recordCompletion(revision: assigned, ticket: ticket)
        #expect(saved.localDate == "2026-09-12")
        #expect(saved.timeZone == "America/Chicago")
        #expect(repository.status(for: assigned) == .pending)
        repository.cancel()
        let path = directory.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())/routine-care.json")
        let savedBytes = try Data(contentsOf: path)
        #expect(!savedBytes.isEmpty)
        #if !targetEnvironment(simulator)
        let protection = try FileManager.default.attributesOfItem(atPath: path.path)[.protectionKey] as? FileProtectionType
        #expect(protection == .completeUntilFirstUserAuthentication)
        #endif // Simulator does not implement on-device file protection attributes.
        transport.offline = false; transport.loseResponse = true
        let reopened = RoutineRepository(access: access, transport: transport, directory: directory,
            now: { clock.date }, timeZone: { clock.zone }, retryInterval: 3600)
        reopened.resume(accountID: ticket.accountID, ticket: ticket)
        try await eventually { transport.accepted[saved.id] != nil && reopened.lastError != nil }
        #expect(reopened.pending.first == saved)
        clock.date = clock.date.addingTimeInterval(86400); clock.zone = TimeZone(identifier: "Asia/Tokyo")!
        await reopened.retry()
        #expect(reopened.pending.isEmpty)
        #expect(reopened.snapshot?.completions.first?.id == saved.id)
        #expect(transport.sent.filter { $0.id == saved.id }.allSatisfy { $0 == saved })
        #expect(transport.accepted.count == 1)
        reopened.cancel()
    }
    @Test func dailyDedupeRolloverAndReplacementPreserveOldPending() async throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = RoutineTestTransport(), clock = RoutineTestClock()
        let old = revision(ticket.accountID), new = revision(ticket.accountID, version: 2)
        transport.snapshot = RoutineSnapshot(routines: [old], completions: [])
        let repository = RoutineRepository(access: access, transport: transport, directory: directory,
            now: { clock.date }, timeZone: { clock.zone }, retryInterval: 3600)
        defer { repository.cancel() }
        repository.resume(accountID: ticket.accountID, ticket: ticket); await repository.refresh()
        transport.offline = true
        let first = try repository.recordCompletion(revision: old, ticket: ticket)
        #expect(try repository.recordCompletion(revision: old, ticket: ticket).id == first.id)
        #expect(repository.pending.count == 1)
        transport.snapshot = RoutineSnapshot(routines: [new], completions: [])
        await repository.refresh()
        #expect(repository.pending.contains(first))
        #expect(repository.status(for: new) == .unrecorded)
        #expect(throws: (any Error).self) { try repository.recordCompletion(revision: old, ticket: ticket) }
        transport.offline = false
        await repository.retry()
        #expect(repository.status(for: new) == .unrecorded)
        _ = try repository.recordCompletion(revision: new, ticket: ticket)
        await repository.retry()
        #expect(repository.status(for: new) == .recorded)
        clock.date = clock.date.addingTimeInterval(86400)
        await repository.refresh()
        #expect(repository.localDate == "2026-09-13")
        #expect(repository.status(for: new) == .unrecorded)
        #expect(transport.requestedDates.last == "2026-09-13")
    }
    @Test func failedAtomicWriteNeverPublishesOrSendsAndLeavesLegacyRoutinesIntact() async throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = RoutineTestTransport()
        let legacy = try PersistenceController(accountID: ticket.accountID, directory: directory)
        let item = Routine(context: legacy.container.viewContext)
        item.id = UUID(); item.name = "Legacy local only"; item.completedToday = true
        try legacy.container.viewContext.save()
        let assigned = revision(ticket.accountID)
        transport.snapshot = RoutineSnapshot(routines: [assigned], completions: [])
        let repository = RoutineRepository(access: access, transport: transport, directory: directory, retryInterval: 3600)
        defer { repository.cancel() }
        repository.resume(accountID: ticket.accountID, ticket: ticket); await repository.refresh()
        let path = directory.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())/routine-care.json")
        try FileManager.default.removeItem(at: path)
        try FileManager.default.createDirectory(at: path, withIntermediateDirectories: false)
        #expect(throws: (any Error).self) { try repository.recordCompletion(revision: assigned, ticket: ticket) }
        #expect(repository.pending.isEmpty)
        #expect(repository.status(for: assigned) == .unrecorded)
        #expect(repository.lastError != nil)
        await repository.retry()
        #expect(transport.sent.isEmpty)
        #expect(item.name == "Legacy local only" && item.completedToday)
        #expect(try legacy.container.viewContext.count(for: Routine.fetchRequest()) == 1)
        legacy.container.viewContext.reset()
        for store in legacy.container.persistentStoreCoordinator.persistentStores {
            try legacy.container.persistentStoreCoordinator.remove(store)
        }
    }
    @Test func staleUserActionAndDelayedResponseCannotCrossLoginGeneration() async throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let access = AccountAccess(), first = access.activate(UUID()), transport = RoutineTestTransport()
        let assigned = revision(first.accountID)
        transport.snapshot = RoutineSnapshot(routines: [assigned], completions: [])
        let repository = RoutineRepository(access: access, transport: transport, directory: directory, retryInterval: 3600)
        defer { repository.cancel() }
        repository.resume(accountID: first.accountID, ticket: first); await repository.refresh()
        transport.pauseSend = true
        let pending = try repository.recordCompletion(revision: assigned, ticket: first)
        try await eventually { transport.sendContinuation != nil }
        access.invalidate(); repository.cancel()
        let second = access.activate(UUID())
        transport.snapshot = RoutineSnapshot(routines: [], completions: [])
        repository.resume(accountID: second.accountID, ticket: second)
        #expect(throws: AccountFailure.self) { try repository.recordCompletion(revision: assigned, ticket: first) }
        transport.sendContinuation?.resume(); transport.sendContinuation = nil
        await repository.refresh()
        #expect(repository.pending.isEmpty)
        #expect(repository.snapshot?.completions.isEmpty == true)
        repository.cancel(); access.invalidate()
        let again = access.activate(first.accountID)
        transport.offline = true
        repository.resume(accountID: first.accountID, ticket: again)
        #expect(repository.pending.first?.id == pending.id)
        #expect(throws: AccountFailure.self) { try repository.recordCompletion(revision: assigned, ticket: first) }
    }
    @Test func completionQueuedDuringInFlightSendIsDrainedWithoutAnotherUserAction() async throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = RoutineTestTransport(), clock = RoutineTestClock()
        let assigned = revision(ticket.accountID)
        transport.snapshot = RoutineSnapshot(routines: [assigned], completions: [])
        let repository = RoutineRepository(access: access, transport: transport, directory: directory,
            now: { clock.date }, timeZone: { clock.zone }, retryInterval: 3600)
        defer { repository.cancel() }
        repository.resume(accountID: ticket.accountID, ticket: ticket); await repository.refresh()
        transport.pauseSend = true
        let first = try repository.recordCompletion(revision: assigned, ticket: ticket)
        try await eventually { transport.sendContinuation != nil }
        clock.date = clock.date.addingTimeInterval(86400)
        let second = try repository.recordCompletion(revision: assigned, ticket: ticket)
        transport.pauseSend = false
        transport.sendContinuation?.resume(); transport.sendContinuation = nil
        try await eventually { repository.pending.isEmpty }
        #expect(Set(repository.snapshot?.completions.map(\.id) ?? []) == [first.id, second.id])
    }

    @Test func rejectedOldEventDoesNotBlockLaterValidCompletion() async throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = RoutineTestTransport(), clock = RoutineTestClock()
        let assigned = revision(ticket.accountID)
        transport.snapshot = RoutineSnapshot(routines: [assigned], completions: [])
        let repository = RoutineRepository(access: access, transport: transport, directory: directory,
            now: { clock.date }, timeZone: { clock.zone }, retryInterval: 3600)
        defer { repository.cancel() }
        repository.resume(accountID: ticket.accountID, ticket: ticket); await repository.refresh()
        transport.pauseSend = true
        let first = try repository.recordCompletion(revision: assigned, ticket: ticket)
        try await eventually { transport.sendContinuation != nil }
        transport.rejectedIDs.insert(first.id)
        clock.date = clock.date.addingTimeInterval(86400)
        let second = try repository.recordCompletion(revision: assigned, ticket: ticket)
        transport.pauseSend = false; transport.sendContinuation?.resume(); transport.sendContinuation = nil
        try await eventually { repository.status(for: assigned) == .recorded }
        #expect(repository.pending == [first])
        #expect(repository.snapshot?.completions.first?.id == second.id)
        #expect(repository.lastError != nil)
    }

    @Test func serverAcknowledgmentWriteFailureRetainsOriginalOutboxOnDisk() async throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = RoutineTestTransport()
        let assigned = revision(ticket.accountID)
        transport.snapshot = RoutineSnapshot(routines: [assigned], completions: [])
        let repository = RoutineRepository(access: access, transport: transport, directory: directory, retryInterval: 3600)
        defer { repository.cancel() }
        repository.resume(accountID: ticket.accountID, ticket: ticket); await repository.refresh()
        transport.pauseSend = true
        let event = try repository.recordCompletion(revision: assigned, ticket: ticket)
        try await eventually { transport.sendContinuation != nil }
        let path = directory.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())/routine-care.json")
        let saved = try Data(contentsOf: path)
        let folder = path.deletingLastPathComponent()
        try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: folder.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: folder.path) }
        transport.pauseSend = false; transport.sendContinuation?.resume(); transport.sendContinuation = nil
        try await eventually { repository.lastError != nil }
        #expect(repository.pending.first == event)
        #expect(repository.status(for: assigned) == .pending)
        #expect(try Data(contentsOf: path) == saved)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: folder.path)
        repository.cancel()
        repository.resume(accountID: ticket.accountID, ticket: ticket)
        try await eventually { repository.pending.isEmpty }
        #expect(repository.snapshot?.completions.first?.id == event.id)
        #expect(transport.accepted.count == 1)
    }

    @Test func foreignEmbeddedOwnerAndOversizedFileAreKeptAndBlocked() async throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let access = AccountAccess(), ticket = access.activate(UUID()), transport = RoutineTestTransport()
        let assigned = revision(ticket.accountID)
        transport.snapshot = RoutineSnapshot(routines: [assigned], completions: [])
        let repository = RoutineRepository(access: access, transport: transport, directory: directory)
        defer { repository.cancel() }
        repository.resume(accountID: ticket.accountID, ticket: ticket); await repository.refresh()
        let path = directory.appendingPathComponent("Accounts/\(ticket.accountID.uuidString.lowercased())/routine-care.json")
        let saved = try Data(contentsOf: path)
        repository.cancel()
        var object = try #require(JSONSerialization.jsonObject(with: saved) as? [String: Any])
        object["owner"] = UUID().uuidString
        let foreign = try JSONSerialization.data(withJSONObject: object)
        for bytes in [foreign, Data(repeating: 32, count: 2 * 1024 * 1024 + 1)] {
            try bytes.write(to: path)
            repository.resume(accountID: ticket.accountID, ticket: ticket); await repository.retry()
            #expect(repository.snapshot == nil && repository.pending.isEmpty)
            #expect(repository.lastError != nil)
            #expect(try Data(contentsOf: path) == bytes)
            repository.cancel()
        }
    }

    @Test func delayedSnapshotAndForeignOwnerOrCorruptCacheNeverPublishBlankSuccess() async throws {
        let directory = root(); defer { try? FileManager.default.removeItem(at: directory) }
        let access = AccountAccess(), first = access.activate(UUID()), transport = RoutineTestTransport()
        let assigned = revision(first.accountID)
        transport.snapshot = RoutineSnapshot(routines: [assigned], completions: [])
        let repository = RoutineRepository(access: access, transport: transport, directory: directory, retryInterval: 3600)
        defer { repository.cancel() }
        transport.pauseFetch = true
        repository.resume(accountID: first.accountID, ticket: first)
        try await eventually { transport.fetchContinuation != nil }
        repository.cancel(); access.invalidate()
        let second = access.activate(UUID())
        transport.pauseFetch = false; transport.snapshot = RoutineSnapshot(routines: [], completions: [])
        repository.resume(accountID: second.accountID, ticket: second)
        transport.fetchContinuation?.resume(); transport.fetchContinuation = nil
        await repository.refresh()
        #expect(repository.snapshot?.routines.isEmpty == true)
        transport.snapshot = RoutineSnapshot(routines: [assigned], completions: [])
        await repository.refresh()
        #expect(repository.lastError != nil)
        #expect(repository.snapshot?.routines.isEmpty == true)
        repository.cancel()
        let path = directory.appendingPathComponent("Accounts/\(second.accountID.uuidString.lowercased())/routine-care.json")
        let corrupt = Data("{broken".utf8)
        try corrupt.write(to: path)
        repository.resume(accountID: second.accountID, ticket: second)
        await repository.refresh()
        #expect(repository.snapshot == nil)
        #expect(repository.lastError != nil)
        #expect(try Data(contentsOf: path) == corrupt)
    }
}

@MainActor private final class RoutineTestClock {
    var date = Date(timeIntervalSince1970: 1_789_221_600) // 2026-09-12 14:00 UTC
    var zone = TimeZone(identifier: "America/Chicago")!
}
@MainActor private final class RoutineTestTransport: RoutineTransport {
    var snapshot = RoutineSnapshot(routines: [], completions: [])
    var offline = false, loseResponse = false, pauseSend = false, pauseFetch = false
    var sendContinuation: CheckedContinuation<Void, Never>?, fetchContinuation: CheckedContinuation<Void, Never>?
    var rejectedIDs: Set<UUID> = []
    var sent: [PendingRoutineCompletion] = [], accepted: [UUID: CareRoutineCompletion] = [:], requestedDates: [String] = []
    func fetchRoutines(localDate: String, ticket: AccountAccess.Ticket) async throws -> RoutineSnapshot {
        requestedDates.append(localDate)
        let result = snapshot
        if pauseFetch { await withCheckedContinuation { fetchContinuation = $0 } }
        return result
    }
    func sendCompletion(_ pending: PendingRoutineCompletion, ticket: AccountAccess.Ticket) async throws -> CareRoutineCompletion {
        sent.append(pending)
        if pauseSend { await withCheckedContinuation { sendContinuation = $0 } }
        if offline { throw URLError(.notConnectedToInternet) }
        if rejectedIDs.contains(pending.id) { throw AccountFailure.requestFailed(400) }
        let record = accepted[pending.id] ?? CareRoutineCompletion(id: pending.id, userId: pending.userId,
            revisionId: pending.revisionId, completedAt: pending.completedAt, localDate: pending.localDate,
            timeZone: pending.timeZone, receivedAt: "2026-09-12T12:00:01.000Z")
        accepted[pending.id] = record
        if loseResponse { loseResponse = false; throw URLError(.networkConnectionLost) }
        return record
    }
}
