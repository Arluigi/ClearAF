import XCTest

/// Uses only local Supabase/Mailpit and synthetic addresses. No production credentials.
final class AccountFlowUITests: XCTestCase {
    @MainActor func testConfirmationOnboardingColdLaunchAndOfflineLogout() async throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        if app.buttons["Profile"].waitForExistence(timeout: 3) { signOut(app) }
        if app.buttons["Sign out"].exists { app.buttons["Sign out"].tap() }
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 15))
        let suffix = UUID().uuidString.lowercased()
        let email = "clearaf-ui-\(suffix)@example.invalid"
        let password = "Synthetic-\(suffix)-A!"
        print("Synthetic account created for local UI verification: \(email)")
        app.buttons["authMode"].tap()
        XCTAssertTrue(app.textFields["Enter your full name"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Skin Type"].exists)
        app.textFields["Enter your full name"].tap()
        app.textFields["Enter your full name"].typeText("Synthetic UI Patient")
        app.textFields["Enter your email"].tap()
        app.textFields["Enter your email"].typeText(email)
        app.secureTextFields["Enter your password"].tap()
        app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
        let confirmed = app.staticTexts["authInformation"].waitForExistence(timeout: 15)
        if !confirmed {
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.lifetime = .keepAlways
            add(attachment)
            print(app.debugDescription)
        }
        XCTAssertTrue(confirmed)
        guard confirmed else { return }
        XCTAssertFalse(app.tabBars.buttons["Today"].exists)
        let link = try await confirmationLink(email)
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
        let (_, response) = try await session.data(from: link)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 303)
        app.secureTextFields["Enter your password"].tap()
        app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
        try await finishOnboarding(app)
        XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.tabBars.buttons["Photos"].exists)
        XCTAssertTrue(app.tabBars.buttons["Routines"].exists)
        XCTAssertFalse(app.tabBars.buttons["Care"].exists)
        XCTAssertFalse(app.tabBars.buttons["Shop"].exists)
        XCTAssertTrue(app.staticTexts["Synthetic UI Patient"].exists)
        app.terminate(); app.launch()
        let restored = app.tabBars.buttons["Today"].waitForExistence(timeout: 15)
        if !restored {
            print("Cold launch state: \(app.debugDescription)")
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        XCTAssertTrue(restored)
        guard restored else { return }
        XCTAssertFalse(app.buttons["onboardingContinue"].exists)
        XCTAssertTrue(app.staticTexts["Synthetic UI Patient"].exists)
        app.terminate()
        app.launchEnvironment["CLEARAF_TEST_OFFLINE"] = "1"
        app.launch()
        XCTAssertTrue(app.buttons["Try again"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["Synthetic UI Patient"].exists)
        app.buttons["Sign out"].tap()
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 5))
        // An unsolicited callback must never lower the durable logout barrier.
        app.open(URL(string: "clearaf://auth?code=invalid-after-logout")!)
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 5))
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.tabBars.buttons["Today"].exists)
        app.terminate()
        app.launchEnvironment.removeValue(forKey: "CLEARAF_TEST_OFFLINE")
        app.launch()
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 10))
    }
    @MainActor func testSameDeviceAccountSwitchAndPasswordRecovery() async throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        if app.buttons["Profile"].waitForExistence(timeout: 3) { signOut(app) }
        if app.buttons["Sign out"].exists { app.buttons["Sign out"].tap() }
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 15))
        let a = try await register(app, name: "Synthetic Alpha")
        try await finishOnboarding(app)
        XCTAssertTrue(app.staticTexts["Synthetic Alpha"].waitForExistence(timeout: 10))
        signOut(app)
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 10))
        _ = try await register(app, name: "Synthetic Beta")
        XCTAssertFalse(app.staticTexts["Synthetic Alpha"].exists)
        try await finishOnboarding(app)
        XCTAssertTrue(app.staticTexts["Synthetic Beta"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Synthetic Alpha"].exists)
        app.buttons["Profile"].tap()
        XCTAssertTrue(app.staticTexts["profileEmail"].waitForExistence(timeout: 5))
        let nameField = app.descendants(matching: .any).matching(identifier: "profileName").firstMatch
        nameField.tap()
        nameField.clearAndEnterText("Synthetic Beta Updated")
        app.buttons["profileSaveName"].tap()
        XCTAssertTrue(app.staticTexts["Name saved"].waitForExistence(timeout: 10))
        app.buttons["Close profile"].tap()
        XCTAssertTrue(app.staticTexts["Synthetic Beta Updated"].waitForExistence(timeout: 5))
        signOut(app)
        login(app, email: a.email, password: a.password)
        XCTAssertTrue(app.staticTexts["Synthetic Alpha"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["Synthetic Beta"].exists)
        XCTAssertFalse(app.buttons["onboardingContinue"].exists)
        signOut(app)
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 10))
        app.textFields["Enter your email"].tap()
        app.textFields["Enter your email"].typeText(a.email + "\n")
        app.buttons["Forgot password?"].tap()
        XCTAssertTrue(app.staticTexts["authInformation"].waitForExistence(timeout: 10))
        // A deliberately initiated PKCE reset must survive a process restart.
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 10))
        let link = try await confirmationLink(a.email, type: "recovery")
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
        let (_, response) = try await session.data(from: link)
        let redirect = try XCTUnwrap((response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Location"))
        let callback = try XCTUnwrap(URL(string: redirect))
        XCTAssertEqual(callback.scheme, "clearaf")
        app.open(callback)
        XCTAssertTrue(app.staticTexts["Choose a new password"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.tabBars.buttons["Today"].exists)
        let replacement = "Updated-\(UUID().uuidString)-A!"
        app.secureTextFields["New password (at least 8 characters)"].tap()
        app.secureTextFields["New password (at least 8 characters)"].typeText(replacement)
        app.secureTextFields["Confirm new password"].tap()
        app.secureTextFields["Confirm new password"].typeText(replacement + "\n")
        app.buttons["Update password"].tap()
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 15))
        login(app, email: a.email, password: replacement)
        XCTAssertTrue(app.staticTexts["Synthetic Alpha"].waitForExistence(timeout: 15))
        signOut(app)
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 10))
    }

    /// Preload the test-owned synthetic JPEG as the newest Simulator library image with simctl addmedia.
    @MainActor func testSyntheticPhotoCaptureSharesAndSurvivesColdLaunch() async throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        if app.buttons["Profile"].waitForExistence(timeout: 3) { signOut(app) }
        if app.buttons["Sign out"].exists { app.buttons["Sign out"].tap() }
        _ = try await register(app, name: "Synthetic Photo Patient")
        try await finishOnboarding(app)
        app.tabBars.buttons["Photos"].tap()
        let capture = app.buttons["Capture photo"]
        XCTAssertTrue(capture.waitForExistence(timeout: 5))
        capture.tap()
        app.buttons["Choose from Library"].tap()
        let image = app.images.matching(NSPredicate(format: "label CONTAINS 'Photo' OR label CONTAINS 'Image'")).firstMatch
        if !image.waitForExistence(timeout: 5) { print(app.debugDescription) }
        XCTAssertTrue(image.exists)
        // The system Photos remote view exposes a visible image with no hittable flag.
        image.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.staticTexts["Shared"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["1 photos"].exists)
        app.terminate(); app.launch()
        XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 15))
        app.tabBars.buttons["Photos"].tap()
        XCTAssertTrue(app.staticTexts["Shared"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["1 photos"].exists)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.lifetime = .keepAlways; add(attachment)
        app.tabBars.buttons["Today"].tap()
        signOut(app)
    }

    /// Preconfirmed, clinician-assigned local fixture; credentials stay in the test runner.
    @MainActor func testAssignedRoutineCompletionSurvivesColdLaunchAndYesterdayDoesNotCount() async throws {
        continueAfterFailure = false
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["CLEARAF_ROUTINE_UI_EMAIL"], "Provide the synthetic local routine fixture")
        let password = try XCTUnwrap(environment["CLEARAF_ROUTINE_UI_PASSWORD"], "Provide the synthetic local routine fixture")
        let app = XCUIApplication()
        app.launch()
        if app.buttons["Profile"].waitForExistence(timeout: 3) { signOut(app) }
        if app.buttons["Sign out"].exists { app.buttons["Sign out"].tap() }
        login(app, email: email, password: password)
        XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 15))
        dismissPasswordPrompt(app)
        let routinesTab = app.tabBars.buttons["Routines"]
        await fulfillment(of: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: routinesTab)], timeout: 10)
        routinesTab.tap()
        XCTAssertTrue(app.staticTexts["Synthetic Morning Routine"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Synthetic step one"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Synthetic step two"].exists)
        XCTAssertFalse(app.buttons["Edit"].exists)
        XCTAssertFalse(app.buttons["Add Step"].exists)
        let record = app.buttons["routine-morning-record"]
        for _ in 0..<3 where !record.isHittable { app.swipeUp() }
        XCTAssertTrue(record.isEnabled)
        record.tap()
        let status = app.staticTexts["routine-morning-status"]
        await fulfillment(of: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == 'Recorded today'"), object: status)], timeout: 20)
        app.terminate(); app.launch()
        XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 15))
        app.tabBars.buttons["Routines"].tap()
        XCTAssertTrue(app.staticTexts["Synthetic Morning Routine"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["routine-morning-status"].label, "Recorded today")
        app.buttons["Evening"].tap()
        XCTAssertTrue(app.staticTexts["Synthetic Evening Routine"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["routine-evening-status"].label, "Not recorded today")
        XCTAssertTrue(app.buttons["routine-evening-record"].isEnabled)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.lifetime = .keepAlways; add(attachment)
        app.tabBars.buttons["Today"].tap()
        signOut(app)
    }

    /// Uses the actual system permission prompt where Simulator exposes a camera.
    /// Hardware acceptance is recorded separately; this also supports camera-unavailable simulators.
    @MainActor func testPhotosCameraRecoveryAndLibraryCancelAtAccessibilitySize() async throws {
        continueAfterFailure = false
        addUIInterruptionMonitor(withDescription: "Deny camera for recovery verification") { alert in
            guard alert.label.localizedCaseInsensitiveContains("camera") else { return false }
            let deny = alert.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Allow' AND label != 'Allow'")).firstMatch
            guard deny.exists else { return false }
            deny.tap(); return true
        }
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["CLEARAF_ROUTINE_UI_EMAIL"])
        let password = try XCTUnwrap(environment["CLEARAF_ROUTINE_UI_PASSWORD"])
        let app = XCUIApplication()
        app.launch()
        if app.buttons["Profile"].waitForExistence(timeout: 3) { signOut(app) }
        if app.buttons["Sign out"].exists { app.buttons["Sign out"].tap() }
        login(app, email: email, password: password)
        guard app.tabBars.buttons["Today"].waitForExistence(timeout: 15) else {
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.lifetime = .keepAlways; add(attachment)
            throw NSError(domain: "SyntheticFixtureSignIn", code: 1)
        }
        dismissPasswordPrompt(app)
        app.terminate()
        app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Photos"].waitForExistence(timeout: 15))
        app.tabBars.buttons["Photos"].tap()
        let count = app.staticTexts["photoCount"]
        XCTAssertTrue(count.waitForExistence(timeout: 5))
        let originalCount = count.label
        XCTAssertTrue(app.buttons["Capture photo"].isHittable)
        app.buttons["Capture photo"].tap()
        XCTAssertTrue(app.buttons["Take Photo"].waitForExistence(timeout: 5))
        app.buttons["Take Photo"].tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deny = springboard.alerts.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Allow' AND label != 'Allow'")).firstMatch
        if deny.waitForExistence(timeout: 3) { deny.tap() }
        let deniedMessage = app.staticTexts["cameraPermissionMessage"]
        if deniedMessage.waitForExistence(timeout: 3) {
            let settings = app.buttons["Open Settings"]
            for _ in 0..<3 where !settings.isHittable { app.swipeUp() }
            XCTAssertTrue(settings.isHittable)
        } else {
            XCTAssertTrue(app.staticTexts["cameraUnavailableMessage"].exists)
        }
        let library = app.buttons["Choose from Library"]
        for _ in 0..<4 where !library.isHittable { app.swipeUp() }
        XCTAssertTrue(library.isHittable)
        library.tap()
        let pickerClose = app.navigationBars.matching(identifier: "Photos").buttons["Cancel"]
        if !pickerClose.waitForExistence(timeout: 10) { print(app.debugDescription) }
        XCTAssertTrue(pickerClose.exists)
        pickerClose.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        await fulfillment(of: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: pickerClose)], timeout: 5)
        XCTAssertTrue(app.buttons["Choose from Library"].waitForExistence(timeout: 5))
        app.navigationBars["Camera"].buttons["Cancel"].tap()
        XCTAssertTrue(count.waitForExistence(timeout: 5))
        XCTAssertEqual(count.label, originalCount)
        for _ in 0..<8 where app.buttons["Next"].frame.maxY > app.buttons["Capture photo"].frame.minY { app.swipeUp() }
        XCTAssertLessThanOrEqual(app.buttons["Next"].frame.maxY, app.buttons["Capture photo"].frame.minY)
        XCTAssertTrue(app.buttons["Previous"].isHittable)
        XCTAssertTrue(app.buttons["Next"].isHittable)
        XCTAssertTrue(app.buttons["Capture photo"].isHittable)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.lifetime = .keepAlways; add(attachment)
        app.terminate()
    }

    @MainActor private func register(_ app: XCUIApplication, name: String) async throws -> (email: String, password: String) {
        let suffix = UUID().uuidString.lowercased()
        let email = "clearaf-ui-\(suffix)@example.invalid"
        let password = "Synthetic-\(suffix)-A!"
        print("Synthetic account created for local UI verification: \(email)")
        app.buttons["authMode"].tap()
        XCTAssertTrue(app.textFields["Enter your full name"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Skin Type"].exists)
        app.textFields["Enter your full name"].tap()
        app.textFields["Enter your full name"].typeText(name)
        app.textFields["Enter your email"].tap()
        app.textFields["Enter your email"].typeText(email)
        app.secureTextFields["Enter your password"].tap()
        app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
        XCTAssertTrue(app.staticTexts["authInformation"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.tabBars.buttons["Today"].exists)
        let link = try await confirmationLink(email)
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
        let (_, response) = try await session.data(from: link)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 303)
        app.secureTextFields["Enter your password"].tap()
        app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
        return (email, password)
    }

    @MainActor private func completeEnrollment(_ app: XCUIApplication) {
        guard app.buttons["enrollmentContinue"].waitForExistence(timeout: 10) else { return }
        dismissPasswordPrompt(app)
        tap(app.buttons["enrollmentState"], in: app, until: app.navigationBars["State of residence"])
        // The navigation-link picker list is lazy: rows below the fold exist only after scrolling.
        let illinois = app.buttons["Illinois"]
        for _ in 0..<6 where !(illinois.exists && illinois.isHittable) { app.swipeUp() }
        tap(illinois, in: app, until: app.buttons["enrollmentDOB"])
        tap(app.buttons["enrollmentDOB"], in: app, until: app.buttons["enrollmentDOBDone"])
        tap(app.buttons["enrollmentDOBDone"], in: app, until: app.buttons["enrollmentDOBDone"], "exists == false")
        tap(app.buttons["None of these"], in: app, until: app.buttons["None of these"], "selected == true")
        app.buttons["enrollmentContinue"].tap()
        XCTAssertTrue(app.buttons["enrollmentAgree"].waitForExistence(timeout: 15))
        app.buttons["enrollmentAgree"].tap()
    }

    /// The system "Save Password?" prompt can appear late and swallow the next tap (seen during enrollment).
    /// Tap, confirm the expected effect, and retry once after dismissing the prompt.
    @MainActor private func tap(_ element: XCUIElement, in app: XCUIApplication, until done: XCUIElement, _ format: String = "exists == true") {
        element.tap()
        let effect = XCTNSPredicateExpectation(predicate: NSPredicate(format: format), object: done)
        guard XCTWaiter().wait(for: [effect], timeout: 3) != .completed else { return }
        dismissPasswordPrompt(app)
        if element.exists { element.tap() }
        let retried = XCTNSPredicateExpectation(predicate: NSPredicate(format: format), object: done)
        XCTAssertEqual(XCTWaiter().wait(for: [retried], timeout: 5), .completed, "Tap had no effect: \(element)")
    }

    @MainActor private func finishOnboarding(_ app: XCUIApplication) async throws {
        completeEnrollment(app)
        let button = app.buttons["onboardingContinue"]
        XCTAssertTrue(button.waitForExistence(timeout: 15))
        dismissPasswordPrompt(app)
        await fulfillment(of: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: button)], timeout: 5)
        button.tap()
        XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 15))
    }

    @MainActor private func login(_ app: XCUIApplication, email: String, password: String) {
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 10))
        app.textFields["Enter your email"].tap()
        app.textFields["Enter your email"].typeText(email)
        app.secureTextFields["Enter your password"].tap()
        app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
    }

    @MainActor private func dismissPasswordPrompt(_ app: XCUIApplication) {
        // iOS may present Passwords' remote view without an XCUIElementTypeSheet.
        // Match its visible title before dismissing the specific password prompt.
        guard app.staticTexts["Save Password?"].waitForExistence(timeout: 3) else { return }
        let decline = app.buttons["Not Now"]
        if decline.waitForExistence(timeout: 3), decline.isHittable { decline.tap() }
    }

    @MainActor private func signOut(_ app: XCUIApplication) {
        dismissPasswordPrompt(app)
        app.buttons["Profile"].tap()
        for _ in 0..<4 where !app.buttons["Sign out"].isHittable { app.swipeUp() }
        app.buttons["Sign out"].tap()
    }
    private func confirmationLink(_ email: String, type: String = "signup") async throws -> URL {
        for _ in 0..<30 {
            let (data, _) = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:54324/api/v1/messages")!)
            let list = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            for message in list["messages"] as? [[String: Any]] ?? [] {
                let recipients = message["To"] as? [[String: Any]] ?? []
                guard recipients.contains(where: { $0["Address"] as? String == email }), let id = message["ID"] as? String else { continue }
                let (body, _) = try await URLSession.shared.data(from: URL(string: "http://127.0.0.1:54324/api/v1/message/\(id)")!)
                let detail = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
                let html = (detail["HTML"] as? String ?? "").replacingOccurrences(of: "&amp;", with: "&")
                let regex = try NSRegularExpression(pattern: "http://127\\.0\\.0\\.1:54321/[^\\\"<> ]+")
                guard html.contains("type=" + type) else { continue }
                if let match = regex.firstMatch(in: html, range: NSRange(html.startIndex..., in: html)), let range = Range(match.range, in: html), let url = URL(string: String(html[range])) { return url }
            }
            try await Task.sleep(for: .milliseconds(200))
        }
        throw NSError(domain: "ClearAFUITests", code: 1, userInfo: [NSLocalizedDescriptionKey: "Local confirmation email not found"])
    }
}
private extension XCUIElement {
    func clearAndEnterText(_ text: String) {
        tap()
        press(forDuration: 1)
        XCUIApplication().menuItems["Select All"].tap()
        typeText(text)
    }
}
private final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
