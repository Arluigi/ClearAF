import Combine
import Foundation

/// Loads "What changed in between" for one pair. A 404 means the API predates the endpoint; a failed re-check of a
/// pair already loaded keeps that answer and marks it stale. Results are keyed by account, so nothing crosses accounts.
@MainActor final class CompareTimelineLoader: ObservableObject {
    enum State: Equatable {
        case idle, loading, ready(checkedAt: Date, stale: Bool), unavailable, tooFarApart, failed
    }

    @Published private(set) var state = State.idle
    @Published private(set) var response: CompareTimelineResponse?
    private let access: AccountAccess
    private let transport: any CompareTimelineTransport
    private let now: () -> Date
    private var cache: [String: (response: CompareTimelineResponse, checkedAt: Date)] = [:]
    private var requestID = UUID()

    init(access: AccountAccess, transport: any CompareTimelineTransport, now: @escaping () -> Date = { Date() }) {
        self.access = access
        self.transport = transport
        self.now = now
    }

    func load(from: Date, to: Date, timeZone: TimeZone = .current, ticket: AccountAccess.Ticket) async {
        let request = UUID()
        requestID = request
        guard (try? access.require(ticket)) != nil, from <= to else { response = nil; state = .failed; return }
        guard to.timeIntervalSince(from) <= Double(CompareTimelineQuery.maxDays) * 86_400 else { response = nil; state = .tooFarApart; return }
        let key = "\(ticket.accountID.uuidString)|\(from.timeIntervalSince1970)|\(to.timeIntervalSince1970)|\(timeZone.identifier)"
        if let cached = cache[key] {
            response = cached.response
            state = .ready(checkedAt: cached.checkedAt, stale: false)
        } else {
            response = nil
            state = .loading
        }
        do {
            let fresh = try await transport.fetchCompareTimeline(from: from, to: to, timeZone: timeZone, ticket: ticket)
            try access.require(ticket)
            try Task.checkCancellation()
            guard requestID == request else { return }
            guard CompareTimelineQuery.valid(fresh, owner: ticket.accountID) else { throw RoutineFailure.invalidData }
            let checkedAt = now()
            if cache.count >= 8 { cache.removeAll() }
            cache[key] = (fresh, checkedAt)
            response = fresh
            state = .ready(checkedAt: checkedAt, stale: false)
        } catch {
            guard requestID == request else { return }
            if case AccountFailure.requestFailed(404) = error { cache.removeValue(forKey: key); response = nil; state = .unavailable; return }
            if (try? access.require(ticket)) != nil, !(error is CancellationError), let cached = cache[key] {
                response = cached.response
                state = .ready(checkedAt: cached.checkedAt, stale: true)
            } else {
                response = nil
                state = .failed
            }
        }
    }

    /// Drops the visible result (no pair, or an undated photo) and keeps answers already loaded.
    func clear() {
        requestID = UUID()
        response = nil
        state = .idle
    }

    func cancel() {
        clear()
        cache.removeAll()
    }
}
