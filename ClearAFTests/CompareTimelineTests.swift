import Foundation
import Testing
@testable import ClearAF

@MainActor struct CompareTimelineTests {
    static let owner = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!

    static func date(_ value: String) -> Date { RoutineDates.instant(value)! }

    /// The Task 1 response shape with synthetic, neutral content.
    static func json(owner: UUID = owner, days: Int = 14, morning: Int = 11) -> Data {
        let o = owner.uuidString.lowercased()
        return """
        {"fromDate":"2026-09-02","toDate":"2026-09-15","days":\(days),
         "routinesAtFrom":[{"id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","userId":"\(o)","timeOfDay":"morning","version":3,"createdBy":"33333333-3333-4333-8333-333333333333","createdAt":"2026-08-20T09:00:00.000Z","name":"Synthetic morning","isActive":true,"steps":[{"title":"Synthetic step","instructions":"Synthetic instructions"}]}],
         "routinesAtTo":[{"id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","userId":"\(o)","timeOfDay":"morning","version":4,"createdBy":"33333333-3333-4333-8333-333333333333","createdAt":"2026-09-02T09:00:00.000Z","name":"Synthetic morning","isActive":true,"steps":[{"title":"Synthetic step","instructions":"Synthetic instructions"}]}],
         "revisions":[{"id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","userId":"\(o)","timeOfDay":"morning","version":4,"createdBy":"33333333-3333-4333-8333-333333333333","createdAt":"2026-09-02T09:00:00.000Z","name":"Synthetic morning","isActive":true,"steps":[{"title":"Synthetic step","instructions":"Synthetic instructions"}]}],
         "completions":{"morning":\(morning),"evening":0},
         "responses":[{"id":"88888888-8888-4888-8888-888888888888","userId":"\(o)","formId":"ffffffff-ffff-4fff-8fff-ffffffffffff","submittedAt":"2026-09-14T12:00:00.000Z","receivedAt":"2026-09-14T12:00:01.000Z",
           "answers":[{"questionId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","optionId":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"},{"questionId":"99999999-9999-4999-8999-999999999999","text":"Synthetic note about the chin"}],
           "form":{"id":"ffffffff-ffff-4fff-8fff-ffffffffffff","userId":"\(o)","version":1,"createdBy":"33333333-3333-4333-8333-333333333333","createdAt":"2026-08-01T00:00:00.000Z","title":"Weekly check-in","isActive":true,
             "questions":[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","prompt":"Pick one","type":"choice","required":true,"options":[{"id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","label":"Neutral first"},{"id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","label":"Neutral second"}]},
                          {"id":"99999999-9999-4999-8999-999999999999","prompt":"Anything else?","type":"text","required":false,"options":[]}]}}],
         "responsesTotal":1}
        """.data(using: .utf8)!
    }

    @Test func decodesTheEndpointShapeAndAcceptsOnlyTheOwnersRecords() throws {
        let response = try JSONDecoder().decode(CompareTimelineResponse.self, from: Self.json())
        #expect(response.days == 14 && response.completions == .init(morning: 11, evening: 0))
        #expect(response.routinesAtFrom.map(\.version) == [3] && response.routinesAtTo.map(\.version) == [4] && response.revisions.map(\.version) == [4])
        #expect(response.responses.first?.answers.count == 2 && response.responsesTotal == 1)
        #expect(CompareTimelineQuery.valid(response, owner: Self.owner))
        #expect(!CompareTimelineQuery.valid(response, owner: UUID()), "another account's rows are rejected")
        let impossible = try JSONDecoder().decode(CompareTimelineResponse.self, from: Self.json(morning: 15))
        #expect(!CompareTimelineQuery.valid(impossible, owner: Self.owner), "more recorded days than days in the period")
    }

    @Test func queryCarriesInstantsAndAnEncodedZone() {
        let from = Self.date("2026-09-02T07:04:00.000Z"), to = Self.date("2026-09-15T07:12:00.000Z")
        #expect(CompareTimelineQuery.endpoint(from: from, to: to, zoneIdentifier: "America/New_York")
            == "/care-support/timeline?from=2026-09-02T07:04:00.000Z&to=2026-09-15T07:12:00.000Z&timeZone=America/New_York")
        #expect(CompareTimelineQuery.endpoint(from: from, to: to, zoneIdentifier: "Etc/GMT+5").hasSuffix("timeZone=Etc/GMT%2B5"),
                "a literal + would reach the server as a space")
    }

    @Test func loaderPublishesFreshThenStaleThenFailedThenUnavailable() async {
        let access = AccountAccess(), ticket = access.activate(Self.owner)
        let fake = TimelineFake()
        let checked = Date(timeIntervalSince1970: 1_789_000_000)
        let loader = CompareTimelineLoader(access: access, transport: fake, now: { checked })
        let from = Self.date("2026-09-02T07:04:00.000Z"), to = Self.date("2026-09-15T07:12:00.000Z")
        #expect(loader.state == .idle)
        await loader.load(from: from, to: to, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .ready(checkedAt: checked, stale: false))
        #expect(loader.response?.days == 14)
        fake.result = .failure(URLError(.notConnectedToInternet))
        await loader.load(from: from, to: to, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .ready(checkedAt: checked, stale: true), "a failed re-check keeps the last answer and marks it stale")
        #expect(loader.response?.days == 14)
        let other = Self.date("2026-09-10T07:00:00.000Z")
        await loader.load(from: from, to: other, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .failed)
        #expect(loader.response?.days == nil)
        fake.result = .failure(AccountFailure.requestFailed(404))
        await loader.load(from: from, to: other, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .unavailable, "an API without the route is not an error")
        #expect(fake.calls == 4)
        loader.cancel()
        #expect(loader.state == .idle && loader.response?.days == nil)
    }

    @Test func loaderRefusesLongRangesForeignRecordsAndReplacedTickets() async {
        let access = AccountAccess(), ticket = access.activate(Self.owner)
        let fake = TimelineFake()
        let loader = CompareTimelineLoader(access: access, transport: fake)
        await loader.load(from: Self.date("2020-01-01T00:00:00.000Z"), to: Self.date("2026-09-15T00:00:00.000Z"), timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .tooFarApart)
        #expect(fake.calls == 0)
        let start = Self.date("2026-09-02T07:04:00.000Z"), end = Self.date("2026-09-15T07:12:00.000Z")
        fake.result = .success(Self.json(owner: UUID()))
        await loader.load(from: start, to: end, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .failed, "another account's rows are never shown")
        fake.result = .success(Self.json())
        _ = access.activate(UUID())
        await loader.load(from: start, to: end, timeZone: .gmt, ticket: ticket)
        #expect(loader.state == .failed)
        #expect(fake.calls == 1, "a replaced ticket never reaches the network")
    }
}

@MainActor private final class TimelineFake: CompareTimelineTransport {
    var result: Result<Data, Error> = .success(CompareTimelineTests.json())
    var calls = 0
    func fetchCompareTimeline(from: Date, to: Date, timeZone: TimeZone, ticket: AccountAccess.Ticket) async throws -> CompareTimelineResponse {
        calls += 1
        return try JSONDecoder().decode(CompareTimelineResponse.self, from: try result.get())
    }
}
