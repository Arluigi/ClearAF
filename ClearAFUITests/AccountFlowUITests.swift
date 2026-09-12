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
        app.buttons["authMode"].tap()
        XCTAssertTrue(app.textFields["Enter your full name"].waitForExistence(timeout: 5))
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
        XCTAssertFalse(app.tabBars.buttons["Home"].exists)
        let link = try await confirmationLink(email)
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
        let (_, response) = try await session.data(from: link)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 303)
        app.secureTextFields["Enter your password"].tap()
        app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
        for page in 0...4 {
            let button = app.buttons["onboardingNext\(page)"]
            guard button.waitForExistence(timeout: 15) else { XCTFail("Onboarding did not reach page \(page)"); return }
            if page == 0 { dismissPasswordPrompt(app) }
            let reachable = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: button)
            await fulfillment(of: [reachable], timeout: 5)
            button.tap()
        }
        XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Welcome, Synthetic UI Patient"].exists)
        app.terminate(); app.launch()
        let restored = app.tabBars.buttons["Home"].waitForExistence(timeout: 15)
        if !restored {
            print("Cold launch state: \(app.debugDescription)")
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        XCTAssertTrue(restored)
        guard restored else { return }
        XCTAssertFalse(app.buttons["Get Started"].exists)
        XCTAssertTrue(app.staticTexts["Welcome, Synthetic UI Patient"].exists)
        app.terminate()
        app.launchEnvironment["CLEARAF_TEST_OFFLINE"] = "1"
        app.launch()
        XCTAssertTrue(app.buttons["Try again"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["Welcome, Synthetic UI Patient"].exists)
        app.buttons["Sign out"].tap()
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 5))
        // An unsolicited callback must never lower the durable logout barrier.
        app.open(URL(string: "clearaf://auth?code=invalid-after-logout")!)
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 5))
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.tabBars.buttons["Home"].exists)
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
        XCTAssertTrue(app.staticTexts["Welcome, Synthetic Alpha"].waitForExistence(timeout: 10))
        signOut(app)
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 10))
        _ = try await register(app, name: "Synthetic Beta")
        XCTAssertFalse(app.staticTexts["Welcome, Synthetic Alpha"].exists)
        try await finishOnboarding(app)
        XCTAssertTrue(app.staticTexts["Welcome, Synthetic Beta"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["Welcome, Synthetic Alpha"].exists)
        signOut(app)
        login(app, email: a.email, password: a.password)
        XCTAssertTrue(app.staticTexts["Welcome, Synthetic Alpha"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["Welcome, Synthetic Beta"].exists)
        XCTAssertFalse(app.buttons["onboardingNext0"].exists)
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
        XCTAssertFalse(app.tabBars.buttons["Home"].exists)
        let replacement = "Updated-\(UUID().uuidString)-A!"
        app.secureTextFields["New password (at least 8 characters)"].tap()
        app.secureTextFields["New password (at least 8 characters)"].typeText(replacement)
        app.secureTextFields["Confirm new password"].tap()
        app.secureTextFields["Confirm new password"].typeText(replacement + "\n")
        app.buttons["Update password"].tap()
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 15))
        login(app, email: a.email, password: replacement)
        XCTAssertTrue(app.staticTexts["Welcome, Synthetic Alpha"].waitForExistence(timeout: 15))
        signOut(app)
        XCTAssertTrue(app.buttons["authMode"].waitForExistence(timeout: 10))
    }

    @MainActor private func register(_ app: XCUIApplication, name: String) async throws -> (email: String, password: String) {
        let suffix = UUID().uuidString.lowercased()
        let email = "clearaf-ui-\(suffix)@example.invalid"
        let password = "Synthetic-\(suffix)-A!"
        print("Synthetic account created for local UI verification: \(email)")
        app.buttons["authMode"].tap()
        XCTAssertTrue(app.textFields["Enter your full name"].waitForExistence(timeout: 5))
        app.textFields["Enter your full name"].tap()
        app.textFields["Enter your full name"].typeText(name)
        app.textFields["Enter your email"].tap()
        app.textFields["Enter your email"].typeText(email)
        app.secureTextFields["Enter your password"].tap()
        app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
        XCTAssertTrue(app.staticTexts["authInformation"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.tabBars.buttons["Home"].exists)
        let link = try await confirmationLink(email)
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
        let (_, response) = try await session.data(from: link)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 303)
        app.secureTextFields["Enter your password"].tap()
        app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
        return (email, password)
    }

    @MainActor private func finishOnboarding(_ app: XCUIApplication) async throws {
        for page in 0...4 {
            let button = app.buttons["onboardingNext\(page)"]
            XCTAssertTrue(button.waitForExistence(timeout: 15))
            if page == 0 { dismissPasswordPrompt(app) }
            await fulfillment(of: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: button)], timeout: 5)
            button.tap()
        }
        XCTAssertTrue(app.tabBars.buttons["Home"].waitForExistence(timeout: 15))
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
private final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
