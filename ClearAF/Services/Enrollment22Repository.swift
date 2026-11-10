import Foundation

extension LaunchEnrollmentRepository {
    @discardableResult func stopIdentityEnrollment(reason: LaunchIdentityIneligibleReason, ticket: AccountAccess.Ticket) async -> Bool {
        guard let state, Enrollment22Routing.usesNewOrder(state), state.case.status == .identity || (state.case.status == .needsChanges && state.case.identity?.status == .needsChanges) else { return false }
        struct Body: Encodable { let expectedRevision: Int; let reason: LaunchIdentityIneligibleReason }
        do { return await mutate(try .json("/enrollment/\(state.case.id.uuidString.lowercased())/identity-ineligible", method: "POST", Body(expectedRevision: state.case.revision, reason: reason)), ticket: ticket) }
        catch { return false }
    }

    @discardableResult func saveProgress(step: String, topicId: String? = nil, eligibilityDraft: [String: String]? = nil, consentDraft: [LaunchEnrollmentProgress.Signature]? = nil, destinationDraft: LaunchEnrollmentProgress.DestinationDraft? = nil, selectedPlan: LaunchPlanID? = nil, ticket: AccountAccess.Ticket) async -> Bool {
        guard let state, Enrollment22Routing.usesNewOrder(state) else { return false }
        struct Body: Encodable {
            let expectedRevision: Int; let step: String; let topicId: String?
            let eligibilityDraft: [String: String]?; let consentDraft: [LaunchEnrollmentProgress.Signature]?
            let destinationDraft: LaunchEnrollmentProgress.DestinationDraft?; let selectedPlan: LaunchPlanID?
            enum CodingKeys: String, CodingKey { case expectedRevision, step, topicId, eligibilityDraft, consentDraft, destinationDraft, selectedPlan }
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(expectedRevision, forKey: .expectedRevision); try c.encode(step, forKey: .step); try c.encode(topicId, forKey: .topicId)
                try c.encodeIfPresent(eligibilityDraft, forKey: .eligibilityDraft); try c.encodeIfPresent(consentDraft, forKey: .consentDraft)
                try c.encodeIfPresent(destinationDraft, forKey: .destinationDraft); try c.encodeIfPresent(selectedPlan, forKey: .selectedPlan)
            }
        }
        do { return await mutate(try .json("/enrollment/\(state.case.id.uuidString.lowercased())/progress", Body(expectedRevision: state.case.revision, step: step, topicId: topicId, eligibilityDraft: eligibilityDraft, consentDraft: consentDraft, destinationDraft: destinationDraft, selectedPlan: selectedPlan)), ticket: ticket) }
        catch { return false }
    }
    @discardableResult func saveIdentityDraft(attemptId: UUID, fullName: String, dateOfBirth: String?, physicallyInNC: Bool, idPhoto: Data?, selfie: Data?, ticket: AccountAccess.Ticket) async -> Bool {
        guard let state, Enrollment22Routing.usesNewOrder(state) else { return false }
        do {
            let boundary = "UNZIT-\(UUID().uuidString)"
            let body = try LaunchIdentityInput.draftMultipart(idPhoto: idPhoto, selfie: selfie, fullName: fullName, dateOfBirth: dateOfBirth, physicallyInNC: physicallyInNC, revision: state.case.revision, boundary: boundary)
            return await mutate(.init(path: "/enrollment/\(state.case.id.uuidString.lowercased())/identity-draft/\(attemptId.uuidString.lowercased())", method: "PUT", body: body, contentType: "multipart/form-data; boundary=\(boundary)"), ticket: ticket)
        } catch { return false }
    }
}

extension LaunchIdentityInput {
    static func draftMultipart(idPhoto: Data?, selfie: Data?, fullName: String, dateOfBirth: String?, physicallyInNC: Bool, revision: Int, boundary: String) throws -> Data {
        guard (idPhoto?.count ?? 0) <= imageLimit, (selfie?.count ?? 0) <= imageLimit else { throw LaunchFailure.invalidData }
        var bytes = Data()
        func append(_ value: String) { bytes.append(Data(value.utf8)) }
        for (key, value) in [("fullName", fullName), ("dateOfBirth", dateOfBirth ?? ""), ("physicallyInNC", physicallyInNC ? "true" : "false"), ("expectedRevision", String(revision))] {
            append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"\r\n\r\n\(value)\r\n")
        }
        for (key, image) in [("idPhoto", idPhoto), ("selfie", selfie)] {
            guard let image else { continue }
            append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"; filename=\"\(key).jpg\"\r\nContent-Type: image/jpeg\r\n\r\n")
            bytes.append(image); append("\r\n")
        }
        append("--\(boundary)--\r\n")
        guard bytes.count <= multipartLimit else { throw LaunchFailure.invalidData }
        return bytes
    }
}
