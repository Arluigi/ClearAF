import XCTest

/// Exercises the production review screen inside the same pushed navigation
/// lifecycle as enrollment, using DEBUG-only in-memory transport and no backend.
final class EnrollmentSubmissionUITests: XCTestCase {
    @MainActor func testSuccessfulSubmissionDismissesReviewAndShowsReceipt() {
        let app = openReview(route: "submit-journey")
        defer { app.terminate() }
        app.buttons["Submit for clinical review"].tap()

        let receipt = app.staticTexts["Your enrollment is with your clinician"]
        let visible = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == true AND hittable == true"), object: receipt)
        XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 8), .completed)
        XCTAssertFalse(app.staticTexts["Review and submit"].exists)
        XCTAssertTrue(app.staticTexts["Clinical review pending"].exists)
        attach(app, name: "Submission receipt after review dismisses")
    }

    @MainActor func testFailedSubmissionKeepsReviewOpenForRetry() {
        let app = openReview(route: "submit-journey-read-only")
        defer { app.terminate() }
        app.buttons["Submit for clinical review"].tap()

        XCTAssertTrue(app.staticTexts["Your changes could not be saved. Refresh and try again."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Review and submit"].exists)
        XCTAssertTrue(app.buttons["Submit for clinical review"].isEnabled)
        XCTAssertFalse(app.staticTexts["Your enrollment is with your clinician"].exists)
        attach(app, name: "Failed submission retains review and retry")
    }

    @MainActor private func openReview(route: String) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-UNZITLaunchMock", route]
        app.launch()
        let review = app.buttons["Review and submit case"]
        XCTAssertTrue(review.waitForExistence(timeout: 8))
        review.tap()
        let submit = app.buttons["Submit for clinical review"]
        XCTAssertTrue(submit.waitForExistence(timeout: 5))
        for _ in 0..<4 where !submit.isHittable { app.swipeUp() }
        XCTAssertTrue(submit.isEnabled && submit.isHittable)
        return app
    }

    @MainActor private func attach(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
