import XCTest

final class MVPExperienceUITests: XCTestCase {
    @MainActor func testCareJournalAffectedScreens() throws {
        let app = try signedIn(largestText: false)
        defer { app.terminate() }
        for (theme, size) in [("System", "UICTContentSizeCategoryL"),
                              ("System", "UICTContentSizeCategoryAccessibilityXXXL")] {
            app.terminate()
            app.launchArguments = ["-UIPreferredContentSizeCategoryName", size]
            app.launch()
            XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 15))
            for screen in ["Today", "Record", "Plan"] {
                try tapTab(screen, in: app)
                if screen == "Record" && size == "UICTContentSizeCategoryL" {
                    XCTAssertTrue(app.segmentedControls.buttons["List"].waitForExistence(timeout: 5))
                    app.segmentedControls.buttons["List"].tap()
                    XCTAssertTrue(app.segmentedControls.buttons["List"].isSelected)
                    app.segmentedControls.buttons["Grid"].tap()
                }
                if screen == "Plan" && size == "UICTContentSizeCategoryL" {
                    XCTAssertTrue(app.segmentedControls.buttons["Evening"].waitForExistence(timeout: 5))
                    app.segmentedControls.buttons["Evening"].tap()
                    XCTAssertTrue(app.segmentedControls.buttons["Evening"].isSelected)
                    app.segmentedControls.buttons["Morning"].tap()
                }
                let shot = XCTAttachment(screenshot: app.screenshot())
                shot.name = "Letterpress-\(screen)-\(theme)-\(size)"
                shot.lifetime = .keepAlways
                add(shot)
            }
        }
    }

    /// Run in the signed UI runner on hardware; reports only endpoint labels/status/error codes.
    /// Uses no credentials and never follows a redirect to a different origin.
    func testPhysicalLocalConnectivity() async throws {
        let host = try XCTUnwrap(ProcessInfo.processInfo.environment["CLEARAF_DEVICE_HOST"])
        guard host.range(of: #"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.local$"#, options: .regularExpression) != nil else {
            throw NSError(domain: "FixtureHost", code: 1)
        }
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        var failures = 0
        for (label, port, path) in [("api", 3002, "/health"), ("auth", 54321, "/auth/v1/health")] {
            var request = URLRequest(url: try XCTUnwrap(URL(string: "http://\(host):\(port)\(path)")))
            request.timeoutInterval = 15
            do {
                let (_, response) = try await session.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                let attachment = XCTAttachment(string: "\(label) HTTP \(status)")
                attachment.lifetime = .keepAlways; add(attachment)
                // Auth gateway may require its anonymous key; 401 still proves device reachability.
                if !(200..<300).contains(status) && !(label == "auth" && status == 401) { failures += 1 }
            } catch {
                let error = error as NSError
                let attachment = XCTAttachment(string: "\(label) failed domain=\(error.domain) code=\(error.code)")
                attachment.lifetime = .keepAlways; add(attachment); failures += 1
            }
        }
        XCTAssertEqual(failures, 0, "Inspect endpoint-only connectivity attachments")
    }

    @MainActor func testVolumeAtLeastTwentyPageChangesMemory() throws {
        let app = try signedIn(largestText: false)
        try tapTab("Record", in: app)
        guard app.staticTexts["photoCount"].waitForExistence(timeout: 10) else { throw fixtureFailure() }
        XCTAssertEqual(app.staticTexts["photoCount"].label.filter(\.isNumber), "1000")
        let options = XCTMeasureOptions(); options.iterationCount = 40
        var page = 1
        measure(metrics: [XCTMemoryMetric(application: app)], options: options) {
            let next = app.buttons["Next"]
            for _ in 0..<10 where !next.isHittable { app.swipeUp() }
            XCTAssertTrue(next.isEnabled && next.isHittable)
            next.tap(); page += 1
            XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Page \(page) of")).firstMatch.waitForExistence(timeout: 5))
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "Native volume page change"
            attachment.lifetime = .keepAlways; add(attachment)
        }
        app.terminate()
    }

    @MainActor func testRetainedScreensAccessibilityAudit() throws {
        try auditRetainedScreens(largestText: false)
    }

    @MainActor func testRetainedScreensLargestTextAccessibilityAudit() throws {
        try auditRetainedScreens(largestText: true)
    }

    @MainActor func testCaptureLibraryAtLargestTextVisibleReachability() throws {
        let app = try signedIn(largestText: true)
        try tapTab("Record", in: app)
        app.tabBars.buttons["Capture"].tap()
        try revealLibraryAndAudit(app)
        app.terminate()
    }

    @MainActor private func revealLibraryAndAudit(_ app: XCUIApplication) throws {
        let library = app.buttons["Choose from Library"]
        for _ in 0..<8 where library.frame.maxY > app.frame.maxY - 60 {
            app.scrollViews.firstMatch.swipeUp()
        }
        guard library.isHittable, library.frame.minY > app.frame.minY + 90,
              library.frame.maxY < app.frame.maxY - 40 else { throw fixtureFailure() }
        try audit(app, screen: "Capture library actually visible")
    }

    @MainActor func testAssignedRoutineAtLargestTextAccessibility() throws {
        let app = try signedIn(largestText: true)
        try tapTab("Plan", in: app)
        guard app.staticTexts["Synthetic Morning Routine"].waitForExistence(timeout: 15) else { throw fixtureFailure() }
        try audit(app, screen: "Assigned morning routine largest text")
        let record = app.buttons["routine-morning-record"]
        for _ in 0..<10 where !record.isHittable { app.swipeUp() }
        XCTAssertTrue(record.isHittable)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Assigned routine record action reachable"; screenshot.lifetime = .keepAlways; add(screenshot)
        for _ in 0..<10 where !app.buttons["Evening"].isHittable { app.swipeDown() }
        app.buttons["Evening"].tap()
        guard app.staticTexts["Synthetic Evening Routine"].waitForExistence(timeout: 10) else { throw fixtureFailure() }
        try audit(app, screen: "Assigned evening routine largest text")
        app.terminate()
    }

    /// Parent stops only the owned local device API after the explicit marker.
    /// User must have positioned the camera at the prepared neutral subject before this scenario begins.
    @MainActor func testPhysicalCameraSettingsGrantAndOfflineCapture() async throws {
        let app = try signedIn(largestText: false)
        try tapTab("Record", in: app)
        app.tabBars.buttons["Capture"].tap()
        app.buttons["Take Photo"].tap()
        let shutter = app.buttons["Take Picture"]
        if !shutter.waitForExistence(timeout: 3) {
        guard app.staticTexts["cameraPermissionMessage"].waitForExistence(timeout: 5) else { throw fixtureFailure() }
        app.buttons["Open Settings"].tap()
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        let camera = settings.switches["Camera"]
        guard camera.waitForExistence(timeout: 10) else { throw fixtureFailure() }
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: camera)
        await fulfillment(of: [ready], timeout: 10)
        guard camera.isHittable else { throw fixtureFailure() }
        if camera.value as? String == "0" {
            // Settings exposes a whole-row switch frame; touch its trailing toggle.
            camera.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        }
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '1'"), object: camera)
        await fulfillment(of: [enabled], timeout: 10)
        guard camera.value as? String == "1" else {
            let hierarchy = XCTAttachment(string: settings.debugDescription)
            hierarchy.name = "Settings camera grant failed"; hierarchy.lifetime = .keepAlways; add(hierarchy)
            let screenshot = XCTAttachment(screenshot: settings.screenshot())
            screenshot.name = "Settings camera switch"; screenshot.lifetime = .keepAlways; add(screenshot)
            throw fixtureFailure()
        }
        app.activate()
        guard app.buttons["Take Photo"].waitForExistence(timeout: 10) else { throw fixtureFailure() }
        app.buttons["Take Photo"].tap()
        } else {
            print("MVP camera already authorized after prior Settings recovery; continuing actual capture")
        }
        guard shutter.waitForExistence(timeout: 10) else { throw fixtureFailure() }
        print("MVP READY_FOR_API_OUTAGE: stop only local device API3002 within20seconds")
        try await Task.sleep(for: .seconds(20))
        shutter.tap()
        let use = app.buttons["Use Photo"]
        guard use.waitForExistence(timeout: 10) else { throw fixtureFailure() }
        use.tap()
        let save = app.buttons["photoReviewSave"]
        guard save.waitForExistence(timeout: 10) else { throw fixtureFailure() }
        save.tap()
        guard app.staticTexts["Couldn't share"].waitForExistence(timeout: 45) else { throw fixtureFailure() }
        XCTAssertTrue(app.buttons["Retry"].exists)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Synthetic camera capture recoverable offline share failure"
        attachment.lifetime = .keepAlways; add(attachment)
        app.terminate()
    }

    /// Parent transfers the exact test-target A store with both apps stopped; B starts absent.
    @MainActor func testPhysicalGeneratedHistoryIsolatedAcrossAccountSwitch() throws {
        let app = try signedIn(largestText: false)
        guard app.images["Latest progress photo"].waitForExistence(timeout: 10) else { throw fixtureFailure() }
        try tapTab("Record", in: app)
        guard app.staticTexts["photoCount"].waitForExistence(timeout: 10),
              app.staticTexts["photoCount"].label.filter(\.isNumber) == "1" else { throw fixtureFailure() }
        let photos = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Dated photo'"))
        guard photos.count == 1 else { throw fixtureFailure() }
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = "Physical A generated local history"; a.lifetime = .keepAlways; add(a)
        try tapTab("Today", in: app); app.buttons["Profile"].tap()
        app.buttons["Sign out"].tap()
        guard app.buttons["authSubmit"].waitForExistence(timeout: 10) else { throw fixtureFailure() }
        let env = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(env["CLEARAF_MVP_OTHER_EMAIL"])
        let password = try XCTUnwrap(env["CLEARAF_MVP_OTHER_PASSWORD"])
        app.textFields["Enter your email"].tap(); app.textFields["Enter your email"].typeText(email)
        app.secureTextFields["Enter your password"].tap(); app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
        guard app.tabBars.buttons["Today"].waitForExistence(timeout: 15) else { throw fixtureFailure() }
        if app.staticTexts["Save Password?"].waitForExistence(timeout: 3), app.buttons["Not Now"].isHittable { app.buttons["Not Now"].tap() }
        for coldLaunch in [false, true] {
            if coldLaunch { app.terminate(); app.launch() }
            try tapTab("Today", in: app)
            guard !app.images["Latest progress photo"].exists,
                  !app.staticTexts["Shared"].exists else { throw fixtureFailure() }
            try tapTab("Record", in: app)
            guard app.staticTexts["photoCount"].waitForExistence(timeout: 10),
                  app.staticTexts["photoCount"].label.filter(\.isNumber) == "0",
                  photos.count == 0, !app.staticTexts["Shared"].exists else { throw fixtureFailure() }
        }
        let b = XCTAttachment(screenshot: app.screenshot())
        b.name = "Physical B empty history after cold launch"; b.lifetime = .keepAlways; add(b)
        try tapTab("Today", in: app); app.buttons["Profile"].tap(); app.buttons["Sign out"].tap()
        guard app.buttons["authSubmit"].waitForExistence(timeout: 10) else { throw fixtureFailure() }
        app.terminate()
    }

    /// Parent restarts local API before this test. Existing account session/capture is retained.
    @MainActor func testPhysicalRetryCaptureAndAccountIsolation() throws {
        let app = XCUIApplication(); app.launch()
        guard app.tabBars.buttons["Record"].waitForExistence(timeout: 15) else { throw fixtureFailure() }
        try tapTab("Record", in: app)
        if app.buttons["Retry"].firstMatch.waitForExistence(timeout: 3) {
            app.buttons["Retry"].firstMatch.tap()
            print("MVP explicit Retry used")
        } else {
            print("MVP checking durable automatic retry on launch")
        }
        guard app.staticTexts["Shared"].waitForExistence(timeout: 30) else { throw fixtureFailure() }
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Same synthetic capture shared after retry"; screenshot.lifetime = .keepAlways; add(screenshot)
        try tapTab("Today", in: app); app.buttons["Profile"].tap()
        for _ in 0..<8 where !app.buttons["Sign out"].isHittable { app.swipeUp() }
        app.buttons["Sign out"].tap()
        let env = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(env["CLEARAF_MVP_OTHER_EMAIL"])
        let password = try XCTUnwrap(env["CLEARAF_MVP_OTHER_PASSWORD"])
        guard app.buttons["authSubmit"].waitForExistence(timeout: 10) else { throw fixtureFailure() }
        app.textFields["Enter your email"].tap(); app.textFields["Enter your email"].typeText(email)
        app.secureTextFields["Enter your password"].tap(); app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
        guard app.tabBars.buttons["Today"].waitForExistence(timeout: 15) else { throw fixtureFailure() }
        if app.staticTexts["Save Password?"].waitForExistence(timeout: 3), app.buttons["Not Now"].isHittable { app.buttons["Not Now"].tap() }
        try tapTab("Record", in: app)
        XCTAssertEqual(app.staticTexts["photoCount"].label.filter(\.isNumber), "0")
        XCTAssertFalse(app.staticTexts["Shared"].exists)
        app.terminate(); app.launch()
        try tapTab("Record", in: app)
        XCTAssertEqual(app.staticTexts["photoCount"].label.filter(\.isNumber), "0")
        app.terminate()
    }

    /// Deliberate manual scoped selection: never selects an arbitrary personal library item.
    @MainActor func testPhysicalSelectPreparedSyntheticLibraryPhoto() throws {
        let app = try signedIn(largestText: false)
        try tapTab("Record", in: app)
        let before = try XCTUnwrap(Int(app.staticTexts["photoCount"].label.filter(\.isNumber)))
        app.tabBars.buttons["Capture"].tap(); app.buttons["Choose from Library"].tap()
        print("MVP READY_FOR_SYNTHETIC_SELECTION: user selects only the prepared prepared synthetic photo")
        guard app.buttons["photoReviewSave"].waitForExistence(timeout: 120) else { throw fixtureFailure() }
        app.buttons["photoReviewSave"].tap()
        let expected = String(before + 1)
        let saved = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            app.staticTexts["photoCount"].exists && app.staticTexts["photoCount"].label.filter(\.isNumber) == expected
        }, object: nil)
        guard XCTWaiter.wait(for: [saved], timeout: 120) == .completed else { throw fixtureFailure() }
        guard app.staticTexts["Shared"].waitForExistence(timeout: 30) else { throw fixtureFailure() }
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Selected synthetic photo shared"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.terminate()
    }

    @MainActor private func auditRetainedScreens(largestText: Bool) throws {
        let app = try signedIn(largestText: largestText)
        for tab in ["Today", "Record", "Plan"] {
            try tapTab(tab, in: app)
            try audit(app, screen: tab)
            if tab == "Record" {
                let photo = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Dated photo'")).firstMatch
                if photo.exists {
                    // At accessibility sizes the whole image+date button may exceed the visible
                    // scroll area; target its visible thumbnail, not an obscured label midpoint.
                    for _ in 0..<8 where photo.frame.minY + 50 > app.buttons["Previous"].frame.minY {
                        app.scrollViews.firstMatch.swipeUp()
                    }
                    guard photo.frame.minY + 50 < app.buttons["Previous"].frame.minY else { throw fixtureFailure() }
                    photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()
                    guard app.navigationBars["Photo details"].waitForExistence(timeout: 10) else { throw fixtureFailure() }
                    try audit(app, screen: "Photo detail")
                    let done = app.buttons["Done"]
                    XCTAssertTrue(done.isHittable)
                    done.tap()
                }
            }
            if largestText {
                for _ in 0..<6 { app.scrollViews.firstMatch.swipeUp() }
                try audit(app, screen: tab + " scrolled")
            }
        }
        try tapTab("Today", in: app)
        app.buttons["Profile"].tap()
        try audit(app, screen: "Profile")
        let signOut = app.buttons["Sign out"]
        for _ in 0..<8 where !signOut.isHittable { app.swipeUp() }
        XCTAssertTrue(signOut.isHittable)
        try audit(app, screen: "Profile scrolled")
        app.terminate()
        app.launch()
        guard app.tabBars.buttons["Record"].waitForExistence(timeout: 15) else { throw fixtureFailure() }
        try tapTab("Record", in: app)
        app.tabBars.buttons["Capture"].tap()
        try audit(app, screen: "Capture")
        try revealLibraryAndAudit(app)
        app.terminate()
    }

    @MainActor private func audit(_ app: XCUIApplication, screen: String) throws {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = screen; screenshot.lifetime = .keepAlways; add(screenshot)
        // Preserve each audit type separately; raw findings are never filtered.
        for kind: XCUIAccessibilityAuditType in [.contrast, .textClipped, .sufficientElementDescription,
                                                 .hitRegion, .trait, .dynamicType] {
            try app.performAccessibilityAudit(for: kind)
        }
    }

    @MainActor private func signedIn(largestText: Bool) throws -> XCUIApplication {
        let environment = ProcessInfo.processInfo.environment
        let email = try XCTUnwrap(environment["CLEARAF_MVP_UI_EMAIL"])
        let password = try XCTUnwrap(environment["CLEARAF_MVP_UI_PASSWORD"])
        let app = XCUIApplication()
        app.launchArguments = ["-UIPreferredContentSizeCategoryName", largestText ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        app.launch()
        if app.buttons["Profile"].waitForExistence(timeout: 3) {
            app.buttons["Profile"].tap()
            for _ in 0..<8 where !app.buttons["Sign out"].isHittable { app.swipeUp() }
            app.buttons["Sign out"].tap()
        }
        guard app.buttons["authSubmit"].waitForExistence(timeout: 10) else { throw fixtureFailure() }
        app.textFields["Enter your email"].tap(); app.textFields["Enter your email"].typeText(email)
        app.secureTextFields["Enter your password"].tap(); app.secureTextFields["Enter your password"].typeText(password + "\n")
        app.buttons["authSubmit"].tap()
        guard app.tabBars.buttons["Today"].waitForExistence(timeout: 15) else { throw fixtureFailure() }
        if app.staticTexts["Save Password?"].waitForExistence(timeout: 3), app.buttons["Not Now"].isHittable { app.buttons["Not Now"].tap() }
        return app
    }

    @MainActor private func tapTab(_ name: String, in app: XCUIApplication) throws {
        let tab = app.tabBars.buttons[name]
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: tab)
        guard XCTWaiter.wait(for: [ready], timeout: 10) == .completed else { throw fixtureFailure() }
        tab.tap()
    }

    private func fixtureFailure() -> NSError { NSError(domain: "SyntheticFixtureUI", code: 1) }

    private final class NoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        func urlSession(_ session: URLSession, task: URLSessionTask,
                        willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }
}
