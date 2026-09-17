import Foundation
import Testing
@testable import ClearAF

@MainActor struct ReminderTests {
    private func root() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }
    @Test func openingDoesNotAskPermissionAndDisabledSaveCancels() async throws {
        let folder=root(); defer { try? FileManager.default.removeItem(at:folder) }
        let access=AccountAccess(), ticket=access.activate(UUID()), scheduler=FakeReminderScheduler()
        let repo=ReminderRepository(access:access,scheduler:scheduler,directory:folder)
        await repo.resume(ticket:ticket)
        #expect(scheduler.permissionRequests==0)
        await repo.save(ReminderPreferences(),ticket:ticket)
        #expect(scheduler.permissionRequests==0)
        #expect(repo.state == .disabled)
        #expect(scheduler.requests.isEmpty)
    }
    @Test func denialAndSchedulingFailureNeverReportEnabled() async throws {
        let folder=root(); defer { try? FileManager.default.removeItem(at:folder) }
        let access=AccountAccess(), ticket=access.activate(UUID()), scheduler=FakeReminderScheduler()
        let repo=ReminderRepository(access:access,scheduler:scheduler,directory:folder)
        await repo.resume(ticket:ticket)
        var prefs=ReminderPreferences();prefs.morning.enabled=true;prefs.evening.enabled=true
        scheduler.allowed=false
        await repo.save(prefs,ticket:ticket)
        #expect(repo.state == .denied)
        #expect(scheduler.requests.isEmpty)
        scheduler.allowed=true;scheduler.fail=true
        await repo.save(prefs,ticket:ticket)
        #expect(repo.state == .failed)
        #expect(scheduler.requests.isEmpty)
        scheduler.fail=false
        await repo.save(prefs,ticket:ticket)
        #expect(repo.state == .enabled)
        #expect(scheduler.requests.count==2)
        repo.cancel()
        #expect(scheduler.requests.isEmpty)
    }
    /// Guards `OnboardingView.advance()`'s reminders step: `apply` returns early, touching neither `state` nor
    /// `preferences`, when the ticket has gone stale (the account changed underneath it) before the save runs.
    /// `state` alone can't detect this no-op — it stays whatever it was, never `.failed` — so callers must also
    /// compare `preferences` against what they tried to save to know whether it was actually applied.
    @Test func saveWithAStaleTicketIsASilentNoOp() async throws {
        let folder=root(); defer { try? FileManager.default.removeItem(at:folder) }
        let access=AccountAccess(), scheduler=FakeReminderScheduler()
        let repo=ReminderRepository(access:access,scheduler:scheduler,directory:folder)
        let staleTicket = access.activate(UUID())
        await repo.resume(ticket:staleTicket)
        _ = access.activate(UUID()) // a different account becomes current; staleTicket no longer matches
        var draft=ReminderPreferences();draft.morning.enabled=true
        let stateBefore = repo.state
        await repo.save(draft,ticket:staleTicket)
        #expect(repo.state == stateBefore)
        #expect(repo.state != .failed)
        #expect(repo.preferences != draft)
        #expect(scheduler.requests.isEmpty)
    }
    @Test func lateSchedulingCannotSurviveSignOut() async throws {
        let folder=root(); defer { try? FileManager.default.removeItem(at:folder) }
        let access=AccountAccess(), ticket=access.activate(UUID()), scheduler=FakeReminderScheduler()
        let repo=ReminderRepository(access:access,scheduler:scheduler,directory:folder)
        await repo.resume(ticket:ticket)
        var prefs=ReminderPreferences();prefs.photo.enabled=true
        scheduler.pause=true
        let task=Task { await repo.save(prefs,ticket:ticket) }
        for _ in 0..<100 where scheduler.continuation == nil { await Task.yield() }
        #expect(scheduler.continuation != nil)
        access.invalidate();repo.cancel()
        scheduler.continuation?.resume();scheduler.continuation=nil
        await task.value
        #expect(scheduler.requests.isEmpty)
        #expect(repo.state == .disabled)
    }
}
@MainActor private final class FakeReminderScheduler: ReminderScheduling {
    var requests:[String:ReminderRequest]=[:]
    var permissionRequests=0,allowed=true,fail=false,pause=false
    var continuation:CheckedContinuation<Void,Never>?
    func pendingIDs() async -> [String] { Array(requests.keys) }
    func requestPermission() async throws -> Bool { permissionRequests += 1;return allowed }
    func authorized() async -> Bool { allowed }
    func add(_ request:ReminderRequest) async throws {
        if pause { await withCheckedContinuation { continuation=$0 } }
        requests[request.id]=request
        if fail { throw URLError(.unknown) }
    }
    func remove(_ ids:[String]) { for id in ids {requests.removeValue(forKey:id)} }
}
