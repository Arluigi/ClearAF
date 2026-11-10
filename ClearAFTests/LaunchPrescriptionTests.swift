import XCTest
@testable import ClearAF

@MainActor final class LaunchPrescriptionTests: XCTestCase {
    func testRecordedFieldsAndReadOnlyHistoryAndPaging() async throws {
        let fake = PrescriptionFake(), access = AccountAccess(), ticket = access.activate(fake.patient), repo = LaunchPrescriptionRepository(access: access, transport: fake)
        verifyTrue(awaitResult(await repo.load(ticket: ticket)))
        let prescription = try XCTUnwrap(repo.records.first)
        XCTAssertEqual(prescription.strength, "1%"); XCTAssertEqual(prescription.sig, "Synthetic directions")
        XCTAssertEqual(prescription.pharmacy.city, "Raleigh"); XCTAssertEqual(prescription.source, "treatrx_external")
        XCTAssertTrue(LaunchPrescriptionCopy.status.contains("Recorded as sent"))
        XCTAssertFalse(LaunchPrescriptionCopy.status.contains("shipped"))
        XCTAssertTrue(fake.requests.allSatisfy { $0.path.hasPrefix("/prescriptions-sent") && $0.method == "GET" })
    }
    func testOtherPatientAndLateAccountCannotExposePrescription() async {
        let fake = PrescriptionFake(), access = AccountAccess(), ticket = access.activate(UUID()), repo = LaunchPrescriptionRepository(access: access, transport: fake)
        verifyFalse(awaitResult(await repo.load(ticket: ticket))); XCTAssertTrue(repo.records.isEmpty)
        fake.pause = true; let a = access.activate(fake.patient)
        let task = Task { await repo.load(ticket: a) }
        while fake.continuation == nil { await Task.yield() }
        _ = access.activate(UUID()); repo.cancel(); fake.continuation?.resume(returning: fake.bytes)
        verifyFalse(awaitResult(await task.value)); XCTAssertTrue(repo.records.isEmpty)
    }
    private func awaitResult(_ value: Bool) -> Bool { value }
    private func verifyTrue(_ value: Bool, file: StaticString = #filePath, line: UInt = #line) { XCTAssertTrue(value, file: file, line: line) }
    private func verifyFalse(_ value: Bool, file: StaticString = #filePath, line: UInt = #line) { XCTAssertFalse(value, file: file, line: line) }
}
@MainActor private final class PrescriptionFake: LaunchTransport {
    let patient = UUID(); var requests: [LaunchRequest] = []; var pause = false; var continuation: CheckedContinuation<Data,Never>?
    var bytes: Data { Data("""
    {"data":[{"id":"00000000-0000-4000-8000-000000000001","patientId":"\(patient)","clinicianId":"00000000-0000-4000-8000-000000000003","drug":"Synthetic drug","strength":"1%","sig":"Synthetic directions","pharmacy":{"name":"Synthetic","addressLine1":"1 Test St","addressLine2":null,"city":"Raleigh","state":"NC","postalCode":"27601","phone":"9195550100"},"sentAt":"2026-11-09T12:00:00Z","recordedAt":"2026-11-09T13:00:00Z","source":"treatrx_external"}],"pagination":{"page":1,"limit":20,"total":1,"totalPages":1}}
    """.utf8) }
    func send(_ request: LaunchRequest, ticket: AccountAccess.Ticket) async throws -> Data { requests.append(request); if pause { return await withCheckedContinuation { continuation = $0 } }; return bytes }
}
