import Foundation

/// `GET /care-support/timeline` (additive, patient-only, read-only): what the record holds between two capture instants.
struct CompareTimelineResponse: Decodable {
    struct Recorded: Decodable, Equatable {
        let morning: Int
        let evening: Int
    }

    let fromDate: String
    let toDate: String
    let days: Int
    let routinesAtFrom: [CareRoutineRevision]
    let routinesAtTo: [CareRoutineRevision]
    let revisions: [CareRoutineRevision]
    let completions: Recorded
    let responses: [CheckInResponse]
    let responsesTotal: Int
}

@MainActor protocol CompareTimelineTransport {
    func fetchCompareTimeline(from: Date, to: Date, timeZone: TimeZone, ticket: AccountAccess.Ticket) async throws -> CompareTimelineResponse
}

enum CompareTimelineQuery {
    /// Same bound as the server's `timelineMaxDays`.
    static let maxDays = 1096

    static func endpoint(from: Date, to: Date, zoneIdentifier: String) -> String {
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "from", value: RoutineDates.timestamp(from)),
            URLQueryItem(name: "to", value: RoutineDates.timestamp(to)),
            URLQueryItem(name: "timeZone", value: zoneIdentifier),
        ]
        // URLComponents leaves "+" alone in a query; Express would read it as a space.
        let query = (components.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B")
        return "/care-support/timeline?\(query)"
    }

    /// Every row must belong to the signed-in patient and every count must be possible for the period.
    static func valid(_ response: CompareTimelineResponse, owner: UUID) -> Bool {
        let routines = response.routinesAtFrom + response.routinesAtTo + response.revisions
        return (1...(maxDays + 2)).contains(response.days)
            && SupportDates.days(String(response.fromDate.prefix(7))).contains(response.fromDate)
            && SupportDates.days(String(response.toDate.prefix(7))).contains(response.toDate)
            && (0...response.days).contains(response.completions.morning)
            && (0...response.days).contains(response.completions.evening)
            && response.responsesTotal >= response.responses.count
            && routines.allSatisfy { $0.userId == owner && RoutineDates.instant($0.createdAt) != nil }
            && response.responses.allSatisfy {
                $0.userId == owner && $0.form.id == $0.formId && CheckInValidation.form($0.form, owner: owner)
                    && CheckInValidation.answers($0.answers, questions: $0.form.questions) && RoutineDates.instant($0.submittedAt) != nil
            }
    }
}
