# Letterpress PR 3: iOS Core Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the iOS tab bar (Today · Record · Plan · Notes with capture fused in the centre), Today, the photo record, the post-camera review sheet, Routine and Notes to Letterpress 1.0, and adapt the Release 1 care-status and urgent-report surfaces, without changing repositories, the photo share/review state machine or routine versioning.

**Architecture:** Every screen gets its copy and state mapping from a small pure helper (`LetterpressFormat`, `PhotoTileState`, `RoutineRecordCopy`, `AdherenceWindow`, `TodayCopy`, `NotesCopy`), tested with Swift Testing; views are rewritten on top of the PR 2 primitives. Two additive read-only helpers derive data the screens need from APIs that already exist: `PhotoReviewIndex` (batch `/photo-reviews/status`, for the "Reviewed" tile state) and the 14-day adherence strip (existing `/care-support/calendar` morning/evening counts). No backend change, no response-shape change.

**Tech Stack:** SwiftUI (deployment target 18.5 per `project.pbxproj`, Swift 5 mode), Swift Testing, XCUITest, UIKit appearance proxies.

**Spec:** `docs/design/letterpress/spec.md` (authority: §0, §2, §3, §4.1, §4.3–4.8, §5, §6 iOS rows 3, 4, 5, 7, 10 and Tab bar, §7, §8). Master plan `docs/superpowers/plans/2026-09-17-letterpress-redesign.md` (Global Constraints, Owner decisions, roadmap row PR 3). PR 2 plan `docs/superpowers/plans/2026-09-17-letterpress-pr2-primitives.md` (Task 5 "Produces" names, Task 7 deletions). Mockup values from `docs/design/letterpress/mobile.dc.html` screens 3, 4, 5, 7, 10.

## Global Constraints

- Everything in the master plan's Global Constraints applies: no schema/RLS/auth/API change; no score, streak, grade, celebration, emoji or promised outcome; ink is the action colour; radii 0 · 4 · 26 · 999 only; sentence case, no exclamation marks; patient dates written out ("2 Sep"), mono stamps uppercase ("15 SEP · 07:12").
- **Untouched behaviour:** `ClearAF/Services/*Repository.swift`, `PhotoPageStore.swift` and all models stay byte-identical. Photo state machine (local save → pending → shared → reviewed), routine versioning (`recordCompletion(revision:ticket:)`), message acknowledgement (`acknowledgeVisible` only from Notes while visible), urgent-report freeze/retry and existing pagination (24 per page, Previous/Next) keep their current code paths. The one new Services file, `PhotoReviewIndex.swift`, is a read-only display helper over the existing `PhotoReviewTransport`.
- **Ochre:** `attention.*` only for unread notes (mark bar, eyebrow, tab badge) and, per spec §4.5 and §5, the `Waiting to share` tile label and the stale `Last checked` eyebrow. Urgent reports, errors and care status are said in words with ink or `error`.
- **One filled ink button per screen:** Today = record routine; Record = none when populated (empty state: "Take a photo"); Review sheet = "Save to record"; Plan = record routine; Notes = Send; Urgent = Send.
- iOS buttons use PR 2's `.buttonStyle(.letterpress(...))` (pinned 44pt). Mode switches use `LetterpressPicker`. Fields use `.letterpressField(isEmpty:)`. Rules use `LetterpressRule`. Eyebrows use `.letterpressEyebrow(color:)`. Spacing uses `Letterpress.Space.*`. No new colour values.
- Glass only on the native tab bar, navigation bars and sheets (spec §4.8). The camera stays the native `UIImagePickerController`, unstyled. iOS 26-only APIs and behaviour are gated with `if #available(iOS 26, *)`.
- Photos are never cropped, tinted or filtered: every photo uses `.scaledToFit()` on a `sunk` mat.
- Omitted, not faked (owner decision 1): "Send to Dr. Om" and "Attach to this morning's routine" toggles, PRESCRIPTION chip, "Earlier versions" row, check-in due date, "Attach a photo" in Notes. Tasks 5–7 record the new ones in `docs/design/letterpress/deferred.md`.
- The PR 2 sweep test `ClearAFTests/LetterpressSweepTests.swift` must stay green: no `.red/.blue/.white/.black…`, no `cornerRadius: <number>`, no `.foregroundStyle(.secondary)`, no retired names.
- Never read `.env*` (except `.env.example`), `.local/`, `handoff-*/` or `Local.generated.xcconfig`.
- iOS test command (referred to below as **TEST**, with the suites appended):
  ```bash
  xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
    -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
    -derivedDataPath /tmp/clearaf-build-lp3 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
    -only-testing:ClearAFTests/<Suite> test | xcbeautify
  ```
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (use a second `-m`).

## Decisions made while planning

1. **Fused capture uses the native `TabView`.** A centre `Tab` labelled "Capture" whose selection is intercepted: tapping it presents `DurablePhotoCaptureView` and leaves the current destination selected (`AppTab.route`). A native tab bar cannot draw the mockup's filled ink circle; drawing a custom one over the system bar is forbidden by §4.8 ("a second glass layer over the system tab bar").
2. **Tab labels are Plex Mono Medium 11pt, sentence case** ("Today"), not the mockup's 10px uppercase: §2 sets an 11pt floor for anything but letterspaced eyebrows, and UI tests address tabs by title. On iOS 26 only item text attributes are set, so the Liquid Glass bar stays system-drawn; below 26 a default-background `UITabBarAppearance` carries the same attributes.
3. **Unread badge** is `attention.text` fill with `canvas` text (6.8:1 light, 10.8:1 dark). `attention.mark` with either paper or ink text measures under 4.5:1.
4. **Review sheet is new.** Today a picked photo is saved immediately. The spec's "sheet it returns to" needs a confirm step, so `DurablePhotoCaptureView` now holds the bytes in a `PhotoReviewDraft` and calls `PhotoCaptureSession.capture` only on "Save to record". The state machine after that call is unchanged. While reviewing, interactive dismissal is disabled and Discard asks for confirmation, so work is never lost silently. The optional note uses the existing `notes` parameter of `PhotoRepository.capture` (validated ≤ 10,000 UTF-16 units) and is shared with the photo; the copy says so.
5. **Photo tile states** map from existing data: `uploadState == nil` → On device (only legacy photos; new captures queue immediately), `"pending"` → Waiting to share, `"error"` → Couldn't share (§5 error state, with Retry), `"shared"` → Shared, or Reviewed when the visible page's server IDs appear in the batch `/photo-reviews/status` response (≤ 50 IDs, existing endpoint, patient-scoped by the backend). Any failure, including the endpoint's whole-batch 404, leaves tiles at Shared.
6. **Month rules** group the current page (24 photos, newest first) by capture month. Pagination is unchanged and now reads "Page 2 of 3". Per-month totals are not shown: they would need extra counts per month and could mislead when a month spans pages.
7. **14-day adherence strip is built here.** `/care-support/calendar?month=` already returns per-day `morning`/`evening` completion counts. The strip fetches the one or two months covering the last 14 local days: both > 0 → full ink bar, one → 70% bar, none → 40% `sunk` bar, today outlined. Label "11 of the last 14 days". It counts server-recorded completions only, like the calendar; pending local completions are named in the metadata under the Record button.
8. **Today's routine slot** is morning before 14:00 local and evening after, falling back to whichever slot has an active assignment. Step ticks are local `@State` only (§4.4); the filled button records.
9. **Today loads the conversation** (`messaging.resume` + `openCurrent`) to show the latest unread clinician note and the Notes badge. Reading and acknowledging still happen only in Notes.
10. **Screen titles** switch to Newsreader via `UINavigationBar.appearance()` (§2 "Screen title replaces the bold SF large title"). This also affects PR 6 screens, which is intended.
11. **Notes reference boxes** show an icon, label and "Referenced by {clinician}" instead of an inline thumbnail: thumbnails are signed, short-lived fetches that today happen only when a reference is opened. Opening a reference still shows the photo.
12. **Spec contradiction ruling:** §1/Global say ochre is only for unread and prescription; §4.5 (Waiting to share) and §5 (stale eyebrow) explicitly use `attention.text`. The component-specific rules and mockup agree, so this plan follows them and uses ochre nowhere else.

## File map

| File | Task | Responsibility |
|---|---|---|
| `ClearAF/Views/LetterpressFormat.swift` | 1 | Written-out dates, mono stamps, locale clock |
| `ClearAF/Views/LetterpressChrome.swift` | 1 | Nav-bar titles, tab-bar labels/badge, sheet background (gated) |
| `ClearAF/ClearAFApp.swift` | 1 | Apply chrome appearance at launch |
| `ClearAFTests/LetterpressFormatTests.swift` | 1 | `LetterpressFormatTests`, `LetterpressChromeTests` |
| `ClearAF/Views/AppTab.swift` | 2 | Destinations and capture routing |
| `ClearAF/ContentView.swift` | 2 | `ReadyTabs` native TabView |
| `ClearAF/Views/DashboardViewEnhanced.swift` | 2, 6 | Binding type (2); Today rewrite (6) |
| `ClearAFTests/AppTabTests.swift` | 2 | Tab order and capture routing |
| `ClearAFUITests/AccountFlowUITests.swift`, `ClearAFUITests/MVPExperienceUITests.swift` | 2–5 | Follow tab renames, capture item, review sheet, page and status copy |
| `ClearAF/Services/PhotoReviewIndex.swift` | 3 | Read-only batch reviewed lookup for the visible page |
| `ClearAF/Views/PhotoRecordDisplay.swift` | 3 | `PhotoTileState`, `PhotoMonthGroup`, `PhotoRecordCounts`, `PhotoFrame` |
| `ClearAF/Views/ProgressView.swift` | 3 | Record screen, tiles, list rows, sharing status, detail |
| `ClearAFTests/PhotoRecordTests.swift` | 3 | States, grouping, counts, review index |
| `ClearAF/Views/PhotoReviewSheet.swift` | 4 | `PhotoReviewDraft`, `PhotoReviewCopy`, `PhotoReviewSheet` |
| `ClearAF/Views/PhotoCaptureManager.swift` | 4 | Chooser title; review stage; session takes date and note |
| `ClearAFTests/PhotoReviewSheetTests.swift`, `ClearAFTests/PhotoRepositoryTests.swift` | 4 | Draft rules; capture keeps time and note |
| `ClearAF/Views/RoutineChecklist.swift` | 5 | Checklist rows, checkbox, record panel, `RoutineRecordCopy` |
| `ClearAF/Views/AdherenceStrip.swift` | 5 | `AdherenceWindow`, bars, strip row |
| `ClearAF/Views/RoutineView.swift` | 5 | Plan screen |
| `ClearAFTests/RoutinePresentationTests.swift` | 5 | Copy, event lookup, window |
| `ClearAF/Views/CareStatusCard.swift`, `ClearAF/Views/UrgentReportView.swift` | 6 | Adapted Release 1 surfaces |
| `ClearAFTests/TodayPresentationTests.swift` | 6 | Today, care status and urgent copy |
| `ClearAF/Views/MessagingView.swift` | 7 | Notes screen |
| `ClearAFTests/NotesPresentationTests.swift` | 7 | Notes copy |
| `docs/design/letterpress/deferred.md` | 5, 6, 7 | New omitted controls |

---

### Task 1: Date formatting and native chrome [mechanical]

**Files:**
- Create: `ClearAF/Views/LetterpressFormat.swift`, `ClearAF/Views/LetterpressChrome.swift`, `ClearAFTests/LetterpressFormatTests.swift`
- Modify: `ClearAF/ClearAFApp.swift` (the `init()` PR 2 Task 5 Step 7 wrote)

**Interfaces:**
- Consumes (PR 1/2): `Letterpress.displayFontName(size:italic:)`, `Letterpress.UIWeight.medium.fontName`, `Letterpress.DataWeight.medium.fontName`, `Letterpress.registerFonts()`, `Letterpress.applyControlAppearance()`, `Letterpress.canvas`; test helpers `LetterpressTests.resolved(_:_:)`, `.hex(_:)`, `.contrast(_:_:)`.
- Produces:
  - `enum LetterpressFormat` with `static func dayMonth(_:locale:timeZone:) -> String` ("15 Sep"), `dayMonthYear` ("15 Sep 2026"), `weekdayDayMonth` ("Tue 15 Sep"), `monthYear` ("September 2026"), `stamp` ("15 SEP"), `stampTime` ("15 SEP · 07:12"), `stampYearTime` ("15 SEP 2026 · 07:12"), `clock` ("7:12 am" / "07:12"). Every function is `(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String`.
  - `Letterpress.tabLabelSize: CGFloat` (11), `Letterpress.screenTitleSize: CGFloat` (34), `@MainActor Letterpress.applyChromeAppearance()`.
  - `View.letterpressSheetBackground() -> some View`.

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/LetterpressFormatTests.swift`

```swift
import Testing
import UIKit
@testable import ClearAF

struct LetterpressFormatTests {
    static let instant = ISO8601DateFormatter().date(from: "2026-09-15T07:12:00Z")!
    static let utc = TimeZone(identifier: "UTC")!
    static let us = Locale(identifier: "en_US")

    @Test func patientDatesAreWrittenOut() {
        #expect(LetterpressFormat.dayMonth(Self.instant, locale: Self.us, timeZone: Self.utc) == "15 Sep")
        #expect(LetterpressFormat.dayMonthYear(Self.instant, locale: Self.us, timeZone: Self.utc) == "15 Sep 2026")
        #expect(LetterpressFormat.weekdayDayMonth(Self.instant, locale: Self.us, timeZone: Self.utc) == "Tue 15 Sep")
        #expect(LetterpressFormat.monthYear(Self.instant, locale: Self.us, timeZone: Self.utc) == "September 2026")
    }

    @Test func monoStampsAreUppercaseWith24HourTime() {
        #expect(LetterpressFormat.stamp(Self.instant, locale: Self.us, timeZone: Self.utc) == "15 SEP")
        #expect(LetterpressFormat.stampTime(Self.instant, locale: Self.us, timeZone: Self.utc) == "15 SEP · 07:12")
        #expect(LetterpressFormat.stampYearTime(Self.instant, locale: Self.us, timeZone: Self.utc) == "15 SEP 2026 · 07:12")
    }

    @Test func clockFollowsTheLocaleHourCycleInLowercase() {
        #expect(LetterpressFormat.clock(Self.instant, locale: Self.us, timeZone: Self.utc) == "7:12 am")
        #expect(LetterpressFormat.clock(Self.instant, locale: Locale(identifier: "en_GB"), timeZone: Self.utc) == "07:12")
        let evening = ISO8601DateFormatter().date(from: "2026-09-15T21:30:00Z")!
        #expect(LetterpressFormat.clock(evening, locale: Self.us, timeZone: Self.utc) == "9:30 pm")
    }
}

@MainActor struct LetterpressChromeTests {
    @Test func titlesAndTabLabelsUseLetterpressFacesAndInk() throws {
        Letterpress.registerFonts()
        Letterpress.applyChromeAppearance()
        let large = try #require(UINavigationBar.appearance().largeTitleTextAttributes?[.font] as? UIFont)
        #expect(large.fontName == "Newsreader72pt-Light")
        let inline = try #require(UINavigationBar.appearance().titleTextAttributes?[.font] as? UIFont)
        #expect(inline.fontName == "IBMPlexSans-Medm")
        let tab = try #require(UITabBarItem.appearance().titleTextAttributes(for: .normal)?[.font] as? UIFont)
        #expect(tab.fontName == "IBMPlexMono-Medm")
        #expect(tab.pointSize >= 11)
        let selected = try #require(UITabBarItem.appearance().titleTextAttributes(for: .selected)?[.foregroundColor] as? UIColor)
        let normal = try #require(UITabBarItem.appearance().titleTextAttributes(for: .normal)?[.foregroundColor] as? UIColor)
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            #expect(LetterpressTests.hex(selected.resolvedColor(with: traits)) == LetterpressTests.hex(LetterpressTests.resolved("lp.ink", style)))
            #expect(LetterpressTests.contrast(normal.resolvedColor(with: traits), LetterpressTests.resolved("lp.canvas", style)) >= 4.5)
        }
    }

    @Test func unreadBadgeTextMeetsContrastInBothAppearances() throws {
        Letterpress.applyChromeAppearance()
        let fill = try #require(UITabBarItem.appearance().badgeColor)
        let text = try #require(UITabBarItem.appearance().badgeTextAttributes(for: .normal)?[.foregroundColor] as? UIColor)
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            #expect(LetterpressTests.hex(fill.resolvedColor(with: traits)) == LetterpressTests.hex(LetterpressTests.resolved("lp.attention.text", style)))
            #expect(LetterpressTests.contrast(text.resolvedColor(with: traits), fill.resolvedColor(with: traits)) >= 4.5, "\(style.rawValue)")
        }
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/LetterpressFormatTests -only-testing:ClearAFTests/LetterpressChromeTests`
Expected: build FAIL — `cannot find 'LetterpressFormat' in scope`.

- [ ] **Step 3: Create `ClearAF/Views/LetterpressFormat.swift`**

```swift
import Foundation

/// Date copy (spec §7): patient dates written out ("2 Sep"); mono stamps uppercase with 24-hour time ("15 SEP · 07:12").
enum LetterpressFormat {
    private static func formatter(_ format: String, locale: Locale, timeZone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateFormat = format
        return formatter
    }

    /// "15 Sep"
    static func dayMonth(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        formatter("d MMM", locale: locale, timeZone: timeZone).string(from: date)
    }

    /// "15 Sep 2026"
    static func dayMonthYear(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        formatter("d MMM yyyy", locale: locale, timeZone: timeZone).string(from: date)
    }

    /// "Tue 15 Sep"
    static func weekdayDayMonth(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        formatter("EEE d MMM", locale: locale, timeZone: timeZone).string(from: date)
    }

    /// "September 2026"
    static func monthYear(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        formatter("MMMM yyyy", locale: locale, timeZone: timeZone).string(from: date)
    }

    /// "15 SEP"
    static func stamp(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        dayMonth(date, locale: locale, timeZone: timeZone).uppercased(with: locale)
    }

    /// "15 SEP · 07:12"
    static func stampTime(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        "\(stamp(date, locale: locale, timeZone: timeZone)) · \(formatter("HH:mm", locale: locale, timeZone: timeZone).string(from: date))"
    }

    /// "15 SEP 2026 · 07:12"
    static func stampYearTime(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let day = formatter("d MMM yyyy", locale: locale, timeZone: timeZone).string(from: date).uppercased(with: locale)
        return "\(day) · \(formatter("HH:mm", locale: locale, timeZone: timeZone).string(from: date))"
    }

    /// "7:12 am" where the locale uses a 12-hour clock, "07:12" where it uses 24 hours.
    static func clock(_ date: Date, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("jmm")
        formatter.amSymbol = "am"
        formatter.pmSymbol = "pm"
        // ICU inserts a narrow no-break space before the period; copy uses a plain space.
        return formatter.string(from: date).replacingOccurrences(of: "\u{202F}", with: " ")
    }
}
```

- [ ] **Step 4: Create `ClearAF/Views/LetterpressChrome.swift`**

```swift
import SwiftUI
import UIKit

extension Letterpress {
    static let tabLabelSize: CGFloat = 11
    static let screenTitleSize: CGFloat = 34

    /// Native bars (spec §2, §4.8, §6 tab bar): Newsreader screen titles, Plex inline titles, mono tab labels,
    /// ink selection, unread badge in attention.text. The system keeps its own materials and geometry.
    @MainActor static func applyChromeAppearance() {
        let ink = UIColor(named: "lp.ink")!
        let tertiary = UIColor(named: "lp.ink.tertiary")!
        let largeTitle = UIFont(name: displayFontName(size: screenTitleSize, italic: false), size: screenTitleSize)
            ?? .preferredFont(forTextStyle: .largeTitle)
        let inlineTitle = UIFont(name: UIWeight.medium.fontName, size: 17) ?? .preferredFont(forTextStyle: .headline)
        let navigation = UINavigationBar.appearance()
        navigation.largeTitleTextAttributes = [.font: UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: largeTitle), .foregroundColor: ink]
        navigation.titleTextAttributes = [.font: UIFontMetrics(forTextStyle: .headline).scaledFont(for: inlineTitle), .foregroundColor: ink]

        let tabFont = UIFont(name: DataWeight.medium.fontName, size: tabLabelSize) ?? .preferredFont(forTextStyle: .caption2)
        let normal: [NSAttributedString.Key: Any] = [.font: tabFont, .foregroundColor: tertiary]
        let selected: [NSAttributedString.Key: Any] = [.font: tabFont, .foregroundColor: ink]
        let badge = UIColor(named: "lp.attention.text")!
        let badgeText: [NSAttributedString.Key: Any] = [.foregroundColor: UIColor(named: "lp.canvas")!]
        let item = UITabBarItem.appearance()
        item.setTitleTextAttributes(normal, for: .normal)
        item.setTitleTextAttributes(selected, for: .selected)
        item.badgeColor = badge
        item.setBadgeTextAttributes(badgeText, for: .normal)

        if #available(iOS 26, *) {
            // Liquid Glass tab bar: leave the system appearance object alone so the material stays native.
        } else {
            let appearance = UITabBarAppearance()
            appearance.configureWithDefaultBackground()
            for layout in [appearance.stackedLayoutAppearance, appearance.inlineLayoutAppearance, appearance.compactInlineLayoutAppearance] {
                layout.normal.titleTextAttributes = normal
                layout.selected.titleTextAttributes = selected
                layout.normal.iconColor = tertiary
                layout.selected.iconColor = ink
                layout.normal.badgeBackgroundColor = badge
                layout.normal.badgeTextAttributes = badgeText
            }
            UITabBar.appearance().standardAppearance = appearance
            UITabBar.appearance().scrollEdgeAppearance = appearance
        }
    }
}

extension View {
    /// Sheets use the system glass on iOS 26 (spec §4.8) and the paper canvas on earlier systems.
    @ViewBuilder func letterpressSheetBackground() -> some View {
        if #available(iOS 26, *) {
            self
        } else {
            presentationBackground(Letterpress.canvas)
        }
    }
}
```

- [ ] **Step 5: Apply at launch** — in `ClearAF/ClearAFApp.swift` replace the `init()` with:

```swift
    init() {
        Letterpress.registerFonts()
        Letterpress.applyControlAppearance()
        Letterpress.applyChromeAppearance()
    }
```

- [ ] **Step 6: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/LetterpressFormatTests -only-testing:ClearAFTests/LetterpressChromeTests`
Expected: PASS (5 tests). If `clockFollowsTheLocaleHourCycleInLowercase` fails with a visible difference in spacing, print `Array(result.unicodeScalars)` once, add that scalar to the `replacingOccurrences` call, and rerun only that test.

- [ ] **Step 7: Commit**

```bash
git add ClearAF/Views/LetterpressFormat.swift ClearAF/Views/LetterpressChrome.swift ClearAF/ClearAFApp.swift ClearAFTests/LetterpressFormatTests.swift
git commit -m "ios: add Letterpress date formats and native bar appearance" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Tab bar — Today · Record · Plan · Notes with fused capture [judgment]

**Files:**
- Create: `ClearAF/Views/AppTab.swift`, `ClearAFTests/AppTabTests.swift`
- Modify (full rewrite): `ClearAF/ContentView.swift`
- Modify: `ClearAF/Views/DashboardViewEnhanced.swift` (binding type and two assignments only), `ClearAFUITests/AccountFlowUITests.swift`, `ClearAFUITests/MVPExperienceUITests.swift`

**Interfaces:**
- Consumes: `Letterpress.ink`, `Letterpress.Space.s18`, `Letterpress.Radius.sheet` (PR 2); `DurablePhotoCaptureView` (existing).
- Produces: `enum AppTab: Hashable, CaseIterable { case today, record, capture, plan, notes }` with `title: String`, `systemImage: String`, `static let destinations: [AppTab]`, `static func route(_ requested: AppTab, from current: AppTab) -> (selection: AppTab, startsCapture: Bool)`. `DashboardViewEnhanced(selectedTab: Binding<AppTab>)`. UI tests address tabs as `Today`, `Record`, `Capture`, `Plan`, `Notes`.

- [ ] **Step 1: Write the failing test** — `ClearAFTests/AppTabTests.swift`

```swift
import Testing
@testable import ClearAF

struct AppTabTests {
    @Test func fourDestinationsWithCaptureInTheCentre() {
        #expect(AppTab.allCases == [.today, .record, .capture, .plan, .notes])
        #expect(AppTab.allCases.map(\.title) == ["Today", "Record", "Capture", "Plan", "Notes"])
        #expect(AppTab.destinations == [.today, .record, .plan, .notes])
    }

    @Test func captureIsAnActionThatKeepsTheCurrentDestination() {
        for current in AppTab.destinations {
            let route = AppTab.route(.capture, from: current)
            #expect(route.selection == current)
            #expect(route.startsCapture)
        }
        let route = AppTab.route(.plan, from: .today)
        #expect(route.selection == .plan)
        #expect(!route.startsCapture)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/AppTabTests`
Expected: build FAIL — `cannot find 'AppTab' in scope`.

- [ ] **Step 3: Create `ClearAF/Views/AppTab.swift`**

```swift
/// The four destinations (spec §6 tab bar). `capture` sits in the centre of the bar as an action and is never selected.
enum AppTab: Hashable, CaseIterable {
    case today, record, capture, plan, notes

    static let destinations: [AppTab] = [.today, .record, .plan, .notes]

    var title: String {
        switch self {
        case .today: "Today"
        case .record: "Record"
        case .capture: "Capture"
        case .plan: "Plan"
        case .notes: "Notes"
        }
    }

    var systemImage: String {
        switch self {
        case .today: "sun.max"
        case .record: "square.grid.2x2"
        case .capture: "camera"
        case .plan: "checklist"
        case .notes: "text.bubble"
        }
    }

    /// A tap on Capture opens the camera sheet and leaves the current destination selected.
    static func route(_ requested: AppTab, from current: AppTab) -> (selection: AppTab, startsCapture: Bool) {
        requested == .capture ? (current, true) : (requested, false)
    }
}
```

- [ ] **Step 4: Replace `ClearAF/ContentView.swift`**

```swift
import SwiftUI
import CoreData

struct ContentView: View {
    @StateObject private var apiService = APIService.shared
    @State private var showingUrgent = false
    @Environment(\.scenePhase) private var scenePhase
    var body: some View {
        Group {
            switch apiService.phase {
            case .loading:
                VStack { SwiftUI.ProgressView(); Text("Opening your account…") }
            case .signedOut:
                AuthenticationView {}
            case .profileError:
                VStack(spacing: 20) {
                    Text("Unable to open your account").font(.title2)
                    Text(apiService.accountError).multilineTextAlignment(.center)
                    Button("Try again") { apiService.retryProfile() }
                    Button("Sign out") { apiService.logout() }
                }.padding()
            case .recovery:
                PasswordRecoveryView()
            case .enrollment:
                EnrollmentView()
            case .onboarding:
                OnboardingView {}
                    .overlay(alignment: .topTrailing) {
                        HStack(spacing: Letterpress.Space.s18) {
                            UrgentReportButton(isPresented: $showingUrgent)
                            Button("Sign out") { apiService.logout() }
                        }
                        .padding()
                    }
                    .sheet(isPresented: $showingUrgent) { UrgentReportView() }
            case .ready:
                ReadyTabs()
            }
        }
        .environment(\.managedObjectContext, apiService.persistence.container.viewContext)
        .id(apiService.access.snapshot()?.generation)
        .task { apiService.start(); resumeRepositories() }
        .onChange(of: apiService.phase) { _, _ in
            // The onboarding urgent sheet belongs to one phase and one login; never carry it into the next.
            showingUrgent = false
            resumeRepositories()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { resumeRepositories() }
            else { apiService.photos.cancel(); apiService.routines.cancel() }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
            guard scenePhase == .active, apiService.phase == .ready else { return }
            let ticket = apiService.access.snapshot()
            Task { @MainActor in
                guard apiService.access.snapshot() == ticket else { return }
                await apiService.routines.refresh()
            }
        }
        .overlay(alignment: .bottom) { PhotoPersistenceErrorView(repository: apiService.photos) }
        .onOpenURL { url in
            Task { @MainActor in
                do { try await SupabaseService.shared.handleCallback(url) }
                catch { apiService.accountError = "This link is invalid or expired. Request a new one." }
            }
        }
    }
    private func resumeRepositories() {
        guard scenePhase == .active, (apiService.phase == .ready || apiService.phase == .onboarding), let ticket = apiService.access.snapshot() else { return }
        Task { @MainActor in
            await apiService.reminders.resume(ticket: ticket)
            await apiService.reminders.refreshPermission()
        }
        apiService.photos.resume(context: apiService.persistence.container.viewContext, ticket: ticket)
        apiService.routines.resume(accountID: ticket.accountID, ticket: ticket)
    }
}

/// Native tab bar (spec §6): four destinations, capture fused in the centre as an action, ink tint, unread badge on Notes.
private struct ReadyTabs: View {
    @State private var selection: AppTab = .today
    @State private var capturing = false
    @ObservedObject private var messaging = APIService.shared.messaging

    var body: some View {
        TabView(selection: Binding(get: { selection }, set: { requested in
            let route = AppTab.route(requested, from: selection)
            selection = route.selection
            if route.startsCapture { capturing = true }
        })) {
            Tab(AppTab.today.title, systemImage: AppTab.today.systemImage, value: AppTab.today) {
                DashboardViewEnhanced(selectedTab: $selection)
            }
            Tab(AppTab.record.title, systemImage: AppTab.record.systemImage, value: AppTab.record) {
                ProgressView()
            }
            Tab(AppTab.capture.title, systemImage: AppTab.capture.systemImage, value: AppTab.capture) {
                Letterpress.canvas.ignoresSafeArea().accessibilityHidden(true)
            }
            Tab(AppTab.plan.title, systemImage: AppTab.plan.systemImage, value: AppTab.plan) {
                RoutineView()
            }
            Tab(AppTab.notes.title, systemImage: AppTab.notes.systemImage, value: AppTab.notes) {
                MessagingView()
            }
            .badge(messaging.conversation?.unreadCount ?? 0)
        }
        .tint(Letterpress.ink)
        .sheet(isPresented: $capturing) { DurablePhotoCaptureView() }
    }
}

private struct PhotoPersistenceErrorView: View {
    @ObservedObject var repository: PhotoRepository
    var body: some View {
        if let error = repository.lastError {
            Text(error).font(.callout).padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: Letterpress.Radius.sheet)).padding()
        }
    }
}
```

- [ ] **Step 5: Follow the binding type in `ClearAF/Views/DashboardViewEnhanced.swift`** (Task 6 rewrites this file; these edits only keep it compiling)

```bash
perl -pi -e '
  s/\@Binding var selectedTab: Int/\@Binding var selectedTab: AppTab/g;
  s/selectedTab = 1\b/selectedTab = .record/g;
  s/selectedTab = 2\b/selectedTab = .plan/g;
  s/DashboardViewEnhanced\(selectedTab: \.constant\(0\)\)/DashboardViewEnhanced(selectedTab: .constant(.today))/g;
' ClearAF/Views/DashboardViewEnhanced.swift
grep -n "selectedTab" ClearAF/Views/DashboardViewEnhanced.swift
```
Expected `grep`: every `@Binding var selectedTab` line reads `AppTab`; assignments read `.record` / `.plan`; no bare integers.

- [ ] **Step 6: Rename tabs in the UI tests**

```bash
perl -pi -e '
  s/(tabBars\.buttons\[|tapTab\()"Photos"/$1"Record"/g;
  s/(tabBars\.buttons\[|tapTab\()"Routines"/$1"Plan"/g;
  s/\["Today", "Photos", "Routines"\]/["Today", "Record", "Plan"]/g;
  s/(screen|tab) == "Photos"/$1 == "Record"/g;
  s/(screen|tab) == "Routines"/$1 == "Plan"/g;
  s/app\.buttons\["Capture photo"\]/app.tabBars.buttons["Capture"]/g;
' ClearAFUITests/AccountFlowUITests.swift ClearAFUITests/MVPExperienceUITests.swift
grep -n '"Photos"\|"Routines"\|Capture photo' ClearAFUITests/*.swift
```
Expected `grep`: only `AccountFlowUITests.swift` lines with `navigationBars.matching(identifier: "Photos")` (the system picker) and the comment about the system Photos view.

- [ ] **Step 7: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/AppTabTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: build succeeds (UI test target included); PASS.

- [ ] **Step 8: Commit**

```bash
git add ClearAF/Views/AppTab.swift ClearAF/ContentView.swift ClearAF/Views/DashboardViewEnhanced.swift ClearAFTests/AppTabTests.swift ClearAFUITests
git commit -m "ios: native tab bar with Today, Record, Plan, Notes and fused capture" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Review note: per-task reviewer confirms capture never becomes the selected tab on iOS 18 and iOS 26 simulators (tap Capture from each destination, dismiss, destination unchanged).

---
### Task 3: Photo record — month rules, four named states, native Grid/List [judgment]

**Files:**
- Create: `ClearAF/Services/PhotoReviewIndex.swift`, `ClearAF/Views/PhotoRecordDisplay.swift`, `ClearAFTests/PhotoRecordTests.swift`
- Modify (full rewrite): `ClearAF/Views/ProgressView.swift`
- Modify: `ClearAFUITests/MVPExperienceUITests.swift`, `ClearAFUITests/AccountFlowUITests.swift`

**Interfaces:**
- Consumes: `PhotoPageStore` (`photos`, `total`, `page`, `hasPrevious`, `hasNext`, `previous()`, `next()`, `refresh()`, `bind(context:)`, `dispose()`, `images`, `pageSize`), `PhotoReviewTransport.fetchPhotoReviews(photoIDs:ticket:)`, `PhotoReview`, `PhotoReviewResponse`, `AccountAccess`, `PhotoImageLoader.image(data:key:maxPixelSize:)`; Task 1 `LetterpressFormat`, `letterpressSheetBackground()`; PR 2 primitives.
- Produces (Task 6 relies on these):
  - `@MainActor final class PhotoReviewIndex: ObservableObject` — `init(access: AccountAccess, transport: any PhotoReviewTransport)`, `static let batchLimit = 50`, `@Published private(set) var reviewed: Set<UUID>`, `static func sharedServerIDs(_ photos: [SkinPhoto], accountID: UUID) -> [UUID]`, `func isReviewed(_ photo: SkinPhoto) -> Bool`, `func load(photos: [SkinPhoto], ticket: AccountAccess.Ticket) async`, `func cancel()`.
  - `enum PhotoTileState: Equatable { case onDevice, waitingToShare, couldNotShare, shared, reviewed }` — `static func of(uploadState: String?, reviewed: Bool) -> PhotoTileState`, `label: String`, `color: Color`, `func action(compact: Bool) -> String?`.
  - `struct PhotoMonthGroup<Item>: Identifiable` — `id: String`, `title: String`, `items: [Item]`, `static func group(_ items: [Item], date: (Item) -> Date?, locale: Locale = .current, timeZone: TimeZone = .current) -> [PhotoMonthGroup<Item>]`.
  - `enum PhotoRecordCounts` — `headline(total:) -> String`, `pages(total:pageSize:) -> Int`, `shared(in: NSManagedObjectContext) -> Int?`.
  - `struct PhotoFrame: View` — `init(photo: SkinPhoto, images: PhotoImageLoader, maxPixelSize: Int)`; 4:5 `sunk` mat, photo `.scaledToFit()`.
  - `struct PhotoSharingStatusView: View` — `init(photo: SkinPhoto, compact: Bool = false, reviewed: Bool = false)` (source-compatible with the PR 2 call sites).
  - `struct PhotoDetailView: View` — `init(photo: SkinPhoto, images: PhotoImageLoader, reviewed: Bool = false)`, navigation title "Photo details".
- Reviewers: `care-access-reviewer` (photo data, new read of `/photo-reviews/status` from Record). `api-contract-checker` not required: the request and `PhotoReviewResponse` shape are the existing ones.

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/PhotoRecordTests.swift`

```swift
import CoreData
import Foundation
import Testing
@testable import ClearAF

@MainActor struct PhotoRecordTests {
    @Test func tileStatesAreNamedInWords() {
        #expect(PhotoTileState.of(uploadState: nil, reviewed: false) == .onDevice)
        #expect(PhotoTileState.of(uploadState: "pending", reviewed: true) == .waitingToShare)
        #expect(PhotoTileState.of(uploadState: "error", reviewed: false) == .couldNotShare)
        #expect(PhotoTileState.of(uploadState: "shared", reviewed: false) == .shared)
        #expect(PhotoTileState.of(uploadState: "shared", reviewed: true) == .reviewed)
        #expect([PhotoTileState.onDevice, .waitingToShare, .shared, .reviewed].map(\.label) == ["On device", "Waiting to share", "Shared", "Reviewed"])
        #expect(PhotoTileState.couldNotShare.label == "Couldn't share")
    }

    @Test func tilesOfferOnlyRetryWhileRowsKeepShareAndRetry() {
        #expect(PhotoTileState.couldNotShare.action(compact: true) == "Retry")
        for state in [PhotoTileState.onDevice, .waitingToShare, .shared, .reviewed] {
            #expect(state.action(compact: true) == nil)
        }
        #expect(PhotoTileState.onDevice.action(compact: false) == "Share")
        #expect(PhotoTileState.waitingToShare.action(compact: false) == "Retry")
        #expect(PhotoTileState.couldNotShare.action(compact: false) == "Retry")
        #expect(PhotoTileState.shared.action(compact: false) == nil)
        #expect(PhotoTileState.reviewed.action(compact: false) == nil)
    }

    @Test func pagePhotosAreGroupedUnderMonthRules() {
        let iso = ISO8601DateFormatter()
        let dates: [Date?] = ["2026-09-15T07:12:00Z", "2026-09-01T07:00:00Z", "2026-08-31T21:00:00Z", "2025-08-30T08:00:00Z"]
            .map { iso.date(from: $0) } + [nil]
        let groups = PhotoMonthGroup<Date?>.group(dates, date: { $0 }, locale: Locale(identifier: "en_US"), timeZone: TimeZone(identifier: "UTC")!)
        #expect(groups.map(\.title) == ["September 2026", "August 2026", "August 2025", "Undated"])
        #expect(groups.map(\.items.count) == [2, 1, 1, 1])
        #expect(Set(groups.map(\.id)).count == groups.count)
    }

    @Test func countsAndPagesKeepExistingPagination() throws {
        #expect(PhotoRecordCounts.headline(total: 1) == "1 photo")
        #expect(PhotoRecordCounts.headline(total: 46) == "46 photos")
        #expect(PhotoRecordCounts.pages(total: 0, pageSize: 24) == 1)
        #expect(PhotoRecordCounts.pages(total: 24, pageSize: 24) == 1)
        #expect(PhotoRecordCounts.pages(total: 49, pageSize: 24) == 3)
        let store = PersistenceController(inMemory: true)
        let context = store.container.viewContext
        for state in ["shared", "shared", "pending", "error"] { _ = photo(context, state: state, server: nil) }
        try context.save()
        #expect(PhotoRecordCounts.shared(in: context) == 2)
    }

    @Test func reviewIndexMarksOnlyConfirmedSharedPhotos() async {
        let access = AccountAccess(), ticket = access.activate(UUID())
        let store = PersistenceController(inMemory: true)
        let context = store.container.viewContext
        context.userInfo["accountID"] = ticket.accountID
        let reviewedID = UUID(), sharedID = UUID()
        let reviewed = photo(context, state: "shared", server: reviewedID)
        let shared = photo(context, state: "shared", server: sharedID)
        let pending = photo(context, state: "pending", server: nil)
        let transport = ReviewFake()
        transport.reviewedIDs = [reviewedID]
        let index = PhotoReviewIndex(access: access, transport: transport)
        await index.load(photos: [reviewed, shared, pending], ticket: ticket)
        #expect(transport.calls == [[reviewedID, sharedID]])
        #expect(index.isReviewed(reviewed))
        #expect(!index.isReviewed(shared))
        #expect(!index.isReviewed(pending))
        transport.extra = UUID()
        await index.load(photos: [reviewed, shared], ticket: ticket)
        #expect(!index.isReviewed(reviewed), "a response naming a photo that was not requested is discarded")
    }

    @Test func reviewIndexFallsBackToSharedOnFailureAndNeverCrossesAccounts() async {
        let access = AccountAccess(), ticket = access.activate(UUID())
        let store = PersistenceController(inMemory: true)
        let context = store.container.viewContext
        context.userInfo["accountID"] = ticket.accountID
        let id = UUID()
        let reviewed = photo(context, state: "shared", server: id)
        let transport = ReviewFake()
        transport.reviewedIDs = [id]
        let index = PhotoReviewIndex(access: access, transport: transport)
        await index.load(photos: [reviewed], ticket: ticket)
        #expect(index.isReviewed(reviewed))
        transport.fail = true
        await index.load(photos: [reviewed], ticket: ticket)
        #expect(!index.isReviewed(reviewed))
        transport.fail = false
        let other = access.activate(UUID())
        await index.load(photos: [reviewed], ticket: other)
        #expect(!index.isReviewed(reviewed))
        await index.load(photos: [reviewed], ticket: ticket)
        #expect(!index.isReviewed(reviewed), "a replaced ticket cannot publish")
        #expect(transport.calls.count == 2, "another account's photo IDs and a stale ticket never reach the network")
    }

    @Test func reviewIndexBatchesAtTheEndpointLimit() async {
        let access = AccountAccess(), ticket = access.activate(UUID())
        let store = PersistenceController(inMemory: true)
        let context = store.container.viewContext
        context.userInfo["accountID"] = ticket.accountID
        let photos = (0..<60).map { _ in photo(context, state: "shared", server: UUID()) }
        let transport = ReviewFake()
        let index = PhotoReviewIndex(access: access, transport: transport)
        await index.load(photos: photos, ticket: ticket)
        #expect(transport.calls.map(\.count) == [50, 10])
    }

    private func photo(_ context: NSManagedObjectContext, state: String?, server: UUID?) -> SkinPhoto {
        let photo = SkinPhoto(context: context)
        photo.id = UUID()
        photo.captureDate = Date()
        photo.uploadState = state
        photo.serverID = server?.uuidString.lowercased()
        return photo
    }
}

@MainActor private final class ReviewFake: PhotoReviewTransport {
    var reviewedIDs: Set<UUID> = []
    var calls: [[UUID]] = []
    var extra: UUID?
    var fail = false
    func fetchPhotoReviews(photoIDs: [UUID], ticket: AccountAccess.Ticket) async throws -> PhotoReviewResponse {
        calls.append(photoIDs)
        if fail { throw URLError(.notConnectedToInternet) }
        var rows = photoIDs.filter(reviewedIDs.contains)
            .map { PhotoReview(photoId: $0, reviewerName: "Synthetic Clinician", reviewedAt: "2026-09-15T08:02:00.000Z") }
        if let extra { rows.append(PhotoReview(photoId: extra, reviewerName: "Synthetic Clinician", reviewedAt: "2026-09-15T08:02:00.000Z")) }
        return PhotoReviewResponse(reviews: rows)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/PhotoRecordTests`
Expected: build FAIL — `cannot find 'PhotoTileState' in scope`.

- [ ] **Step 3: Create `ClearAF/Services/PhotoReviewIndex.swift`**

```swift
import Combine
import CoreData
import Foundation

/// Which shared photos on the visible Record page a clinician has marked reviewed. Read-only display helper over
/// the existing `/photo-reviews/status` batch read (≤ 50 IDs). A failed or unverifiable lookup leaves tiles at "Shared".
@MainActor final class PhotoReviewIndex: ObservableObject {
    static let batchLimit = 50
    @Published private(set) var reviewed: Set<UUID> = []
    private let access: AccountAccess
    private let transport: any PhotoReviewTransport
    private var requestID = UUID()

    init(access: AccountAccess, transport: any PhotoReviewTransport) {
        self.access = access
        self.transport = transport
    }

    /// Server IDs of shared photos that belong to the signed-in account's store, without duplicates.
    static func sharedServerIDs(_ photos: [SkinPhoto], accountID: UUID) -> [UUID] {
        var seen = Set<UUID>()
        return photos.compactMap { photo in
            guard photo.uploadState == "shared",
                  photo.managedObjectContext?.userInfo["accountID"] as? UUID == accountID,
                  let raw = photo.serverID, let id = UUID(uuidString: raw),
                  seen.insert(id).inserted else { return nil }
            return id
        }
    }

    func isReviewed(_ photo: SkinPhoto) -> Bool {
        guard photo.uploadState == "shared", let raw = photo.serverID, let id = UUID(uuidString: raw) else { return false }
        return reviewed.contains(id)
    }

    func cancel() {
        requestID = UUID()
        reviewed = []
    }

    func load(photos: [SkinPhoto], ticket: AccountAccess.Ticket) async {
        let request = UUID()
        requestID = request
        let ids = Self.sharedServerIDs(photos, accountID: ticket.accountID)
        guard !ids.isEmpty else { reviewed = []; return }
        var found = Set<UUID>()
        do {
            for start in stride(from: 0, to: ids.count, by: Self.batchLimit) {
                let chunk = Array(ids[start..<min(start + Self.batchLimit, ids.count)])
                try access.require(ticket)
                let response = try await transport.fetchPhotoReviews(photoIDs: chunk, ticket: ticket)
                try access.require(ticket)
                try Task.checkCancellation()
                guard requestID == request else { return }
                let requested = Set(chunk)
                guard response.reviews.allSatisfy({ requested.contains($0.photoId) && $0.date != nil }) else {
                    throw URLError(.cannotParseResponse)
                }
                found.formUnion(response.reviews.map(\.photoId))
            }
            reviewed = found
        } catch {
            guard requestID == request else { return }
            reviewed = []
        }
    }
}
```

- [ ] **Step 4: Create `ClearAF/Views/PhotoRecordDisplay.swift`**

```swift
import CoreData
import SwiftUI

/// Photo tile states in words (spec §4.5). "Couldn't share" is the §5 error state and keeps Retry.
enum PhotoTileState: Equatable {
    case onDevice, waitingToShare, couldNotShare, shared, reviewed

    static func of(uploadState: String?, reviewed: Bool) -> PhotoTileState {
        switch uploadState {
        case "pending": return .waitingToShare
        case "error": return .couldNotShare
        case "shared": return reviewed ? .reviewed : .shared
        default: return .onDevice
        }
    }

    var label: String {
        switch self {
        case .onDevice: "On device"
        case .waitingToShare: "Waiting to share"
        case .couldNotShare: "Couldn't share"
        case .shared: "Shared"
        case .reviewed: "Reviewed"
        }
    }

    var color: Color {
        switch self {
        case .waitingToShare: Letterpress.attentionText
        case .couldNotShare: Letterpress.error
        case .onDevice, .shared, .reviewed: Letterpress.inkSecondary
        }
    }

    /// Tiles show only the error recovery; list rows and the detail sheet keep the existing Share and Retry actions.
    func action(compact: Bool) -> String? {
        switch self {
        case .couldNotShare: "Retry"
        case .onDevice: compact ? nil : "Share"
        case .waitingToShare: compact ? nil : "Retry"
        case .shared, .reviewed: nil
        }
    }
}

/// A run of photos from one capture month, in page order (newest first).
struct PhotoMonthGroup<Item>: Identifiable {
    let id: String
    let title: String
    let items: [Item]

    static func group(_ items: [Item], date: (Item) -> Date?, locale: Locale = .current, timeZone: TimeZone = .current) -> [PhotoMonthGroup<Item>] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        var groups: [(key: String, title: String, items: [Item])] = []
        for item in items {
            let key: String
            let title: String
            if let value = date(item) {
                let parts = calendar.dateComponents([.year, .month], from: value)
                key = String(format: "%04d-%02d", parts.year ?? 0, parts.month ?? 0)
                title = LetterpressFormat.monthYear(value, locale: locale, timeZone: timeZone)
            } else {
                key = "undated"
                title = "Undated"
            }
            if let last = groups.last, last.key == key {
                groups[groups.count - 1].items.append(item)
            } else {
                groups.append((key, title, [item]))
            }
        }
        return groups.enumerated().map { index, group in
            PhotoMonthGroup(id: "\(group.key)#\(index)", title: group.title, items: group.items)
        }
    }
}

enum PhotoRecordCounts {
    static func headline(total: Int) -> String { total == 1 ? "1 photo" : "\(total) photos" }

    static func pages(total: Int, pageSize: Int) -> Int { max(1, (total + pageSize - 1) / pageSize) }

    static func shared(in context: NSManagedObjectContext) -> Int? {
        let request = SkinPhoto.fetchRequest()
        request.predicate = NSPredicate(format: "uploadState == %@", "shared")
        return try? context.count(for: request)
    }
}

/// 4:5 neutral mat, square corners; the photo is fitted, never cropped or tinted (spec §4.5).
struct PhotoFrame: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    let maxPixelSize: Int

    var body: some View {
        Rectangle()
            .fill(Letterpress.sunk)
            .aspectRatio(4 / 5, contentMode: .fit)
            .overlay {
                if let bytes = photo.photoData,
                   let image = images.image(data: bytes, key: photo.objectID.uriRepresentation().absoluteString, maxPixelSize: maxPixelSize) {
                    Image(uiImage: image).resizable().scaledToFit()
                } else {
                    Image(systemName: "photo").foregroundStyle(Letterpress.inkTertiary).accessibilityHidden(true)
                }
            }
            .clipShape(Rectangle())
    }
}
```

- [ ] **Step 5: Replace `ClearAF/Views/ProgressView.swift`**

```swift
import SwiftUI
import UIKit
import CoreData

enum PhotoRecordLayout: Hashable { case grid, list }

/// Record (spec §6 #5): month rules over the existing 24-photo pages, 4:5 tiles with named states, native Grid/List.
struct ProgressView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @StateObject private var store = PhotoPageStore()
    @StateObject private var reviews = PhotoReviewIndex(access: APIService.shared.access, transport: APIService.shared)
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var layout = PhotoRecordLayout.grid
    @State private var sharedCount: Int?
    @State private var capturing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    LetterpressPicker(title: "Photo layout", selection: $layout) {
                        Text("Grid").tag(PhotoRecordLayout.grid)
                        Text("List").tag(PhotoRecordLayout.list)
                    }
                    .padding(.top, Letterpress.Space.s14)
                    content
                        .padding(.top, Letterpress.Space.s18)
                    if !store.photos.isEmpty {
                        pagination.padding(.top, Letterpress.Space.s22)
                    }
                }
                .padding(.horizontal, Letterpress.Space.s22)
                .padding(.bottom, Letterpress.Space.s28)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Letterpress.canvas.ignoresSafeArea())
            .navigationTitle("Record")
            .refreshable { store.refresh() }
            .sheet(isPresented: $capturing) { DurablePhotoCaptureView() }
            .onAppear { store.bind(context: viewContext) }
            .onDisappear { store.dispose(); reviews.cancel() }
            .task(id: reviewKey) { await loadReviews() }
        }
    }

    private var header: some View {
        HStack(spacing: Letterpress.Space.s6) {
            Text(PhotoRecordCounts.headline(total: store.total))
                .accessibilityIdentifier("photoCount")
            if let sharedCount, store.total > 0 {
                Text("· \(sharedCount) shared")
            }
        }
        .font(Letterpress.data(12, weight: .regular, relativeTo: .footnote))
        .foregroundStyle(Letterpress.inkTertiary)
    }

    @ViewBuilder private var content: some View {
        if store.loading && store.photos.isEmpty {
            Text("Loading your photos")
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.inkSecondary)
        } else if let error = store.error {
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Text(error).font(Letterpress.ui(15, relativeTo: .body)).foregroundStyle(Letterpress.error)
                Button("Try again") { store.refresh() }.buttonStyle(.letterpress(.outlined))
            }
        } else if store.photos.isEmpty {
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Text("No photos yet")
                    .font(Letterpress.display(28, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                Text("Take the first one today. Photos are saved on this device first, then shared with your care team.")
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Take a photo") { capturing = true }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .padding(.top, Letterpress.Space.s6)
            }
        } else {
            let groups = PhotoMonthGroup<SkinPhoto>.group(store.photos, date: { $0.captureDate })
            ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
                monthRule(group.title, first: index == 0)
                if layout == .grid {
                    LazyVGrid(columns: columns, alignment: .leading, spacing: Letterpress.Space.s14) {
                        ForEach(group.items, id: \.objectID) { photo in
                            PhotoGridCell(photo: photo, images: store.images, reviewed: reviews.isReviewed(photo))
                        }
                    }
                } else {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(group.items, id: \.objectID) { photo in
                            PhotoListRow(photo: photo, images: store.images, reviewed: reviews.isReviewed(photo))
                        }
                    }
                }
            }
        }
    }

    private var columns: [GridItem] {
        let count = dynamicTypeSize.isAccessibilitySize ? 1 : 3
        return Array(repeating: GridItem(.flexible(), spacing: Letterpress.Space.s6, alignment: .top), count: count)
    }

    private func monthRule(_ title: String, first: Bool) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            if !first { LetterpressRule() }
            Text(title).letterpressEyebrow()
        }
        .padding(.top, first ? 0 : Letterpress.Space.s18)
        .padding(.bottom, Letterpress.Space.s10)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private var pagination: some View {
        let pages = PhotoRecordCounts.pages(total: store.total, pageSize: PhotoPageStore.pageSize)
        let stack = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: Letterpress.Space.s10))
            : AnyLayout(HStackLayout(spacing: Letterpress.Space.s10))
        return stack {
            Button("Previous") { store.previous() }
                .buttonStyle(.letterpress(.outlined, fullWidth: true))
                .disabled(!store.hasPrevious)
            Text("Page \(store.page + 1) of \(pages)")
                .font(Letterpress.data(12, weight: .regular, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: true, vertical: true)
            Button("Next") { store.next() }
                .buttonStyle(.letterpress(.outlined, fullWidth: true))
                .disabled(!store.hasNext)
        }
    }

    private var reviewKey: String {
        guard let ticket = APIService.shared.access.snapshot() else { return "none" }
        let ids = PhotoReviewIndex.sharedServerIDs(store.photos, accountID: ticket.accountID)
        return "\(ticket.generation.uuidString)-\(store.total)-\(ids.map(\.uuidString).joined(separator: ","))"
    }

    private func loadReviews() async {
        guard let ticket = APIService.shared.access.snapshot(),
              viewContext.userInfo["accountID"] as? UUID == ticket.accountID else {
            reviews.cancel(); sharedCount = nil; return
        }
        sharedCount = PhotoRecordCounts.shared(in: viewContext)
        await reviews.load(photos: store.photos, ticket: ticket)
    }
}

private func datedPhotoLabel(_ photo: SkinPhoto) -> String {
    photo.captureDate.map { "Dated photo, \(LetterpressFormat.dayMonthYear($0))" } ?? "Dated photo"
}

private struct PhotoGridCell: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    let reviewed: Bool
    @State private var showingDetail = false

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
            Button { showingDetail = true } label: {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    PhotoFrame(photo: photo, images: images, maxPixelSize: 400)
                    if let date = photo.captureDate {
                        Text(LetterpressFormat.stamp(date))
                            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                            .foregroundStyle(Letterpress.inkTertiary)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(datedPhotoLabel(photo))
            PhotoSharingStatusView(photo: photo, compact: true, reviewed: reviewed)
        }
        .sheet(isPresented: $showingDetail) { PhotoDetailView(photo: photo, images: images, reviewed: reviewed) }
    }
}

private struct PhotoListRow: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    let reviewed: Bool
    @State private var showingDetail = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let stack = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s10))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Letterpress.Space.s14))
        stack {
            Button { showingDetail = true } label: {
                PhotoFrame(photo: photo, images: images, maxPixelSize: 400).frame(width: 72)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(datedPhotoLabel(photo))
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                if let date = photo.captureDate {
                    Text(LetterpressFormat.dayMonthYear(date))
                        .font(Letterpress.ui(16, weight: .medium, relativeTo: .headline))
                        .foregroundStyle(Letterpress.ink)
                }
                if let notes = photo.notes, !notes.isEmpty {
                    Text(notes)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .lineLimit(2)
                }
                PhotoSharingStatusView(photo: photo, reviewed: reviewed)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, Letterpress.Space.s14)
        .overlay(alignment: .top) { LetterpressRule() }
        .sheet(isPresented: $showingDetail) { PhotoDetailView(photo: photo, images: images, reviewed: reviewed) }
    }
}

struct PhotoSharingStatusView: View {
    @ObservedObject var photo: SkinPhoto
    var compact = false
    var reviewed = false
    @State private var errorMessage: String?

    var body: some View {
        let state = PhotoTileState.of(uploadState: photo.uploadState, reviewed: reviewed)
        VStack(alignment: .leading, spacing: 0) {
            Text(state.label)
                .font(Letterpress.ui(compact ? 11 : 13, weight: .regular, relativeTo: .caption))
                .foregroundStyle(state.color)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("photoSharingStatus")
            if let action = state.action(compact: compact) {
                Button(action) {
                    do { try APIService.shared.photos.share(photo) }
                    catch { errorMessage = error.localizedDescription }
                }
                .buttonStyle(.letterpress(.underline))
            }
        }
        .alert("Unable to share photo", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: { Text(errorMessage ?? "") }
    }
}

struct PhotoDetailView: View {
    @ObservedObject var photo: SkinPhoto
    let images: PhotoImageLoader
    var reviewed = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                    if let bytes = photo.photoData,
                       let image = images.image(data: bytes, key: photo.objectID.uriRepresentation().absoluteString, maxPixelSize: 1600) {
                        Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("Full photo")
                    }
                    if let date = photo.captureDate {
                        Text(LetterpressFormat.stampYearTime(date))
                            .font(Letterpress.data(12, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.ink)
                    }
                    PhotoSharingStatusView(photo: photo, reviewed: reviewed)
                    LetterpressRule()
                    PhotoReviewStatusView(photo: photo)
                    if let notes = photo.notes, !notes.isEmpty {
                        LetterpressRule()
                        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                            Text("Your note").letterpressEyebrow()
                            Text(notes).font(Letterpress.ui(16, relativeTo: .body)).foregroundStyle(Letterpress.ink)
                        }
                    }
                    Text("Photo removal is not available yet.")
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                .padding(Letterpress.Space.s22)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Photo details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .letterpressSheetBackground()
    }
}

#Preview {
    ProgressView()
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
        .preferredColorScheme(.dark)
}

private struct PhotoReviewStatusView: View {
    @ObservedObject var photo: SkinPhoto
    @ObservedObject private var reviews = APIService.shared.photoReviews
    @ObservedObject private var api = APIService.shared
    @State private var retry = 0

    private var sharedID: UUID? {
        guard photo.uploadState == "shared",
              let account = api.access.snapshot()?.accountID,
              photo.managedObjectContext?.userInfo["accountID"] as? UUID == account,
              let id = photo.serverID else { return nil }
        return UUID(uuidString: id)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Text("Clinician review").letterpressEyebrow()
            Group {
                if photo.uploadState != "shared" {
                    Text("This photo has not been shared with your care team.")
                } else {
                    switch reviews.state {
                    case .loading:
                        Text("Loading review status")
                    case .unavailable:
                        Text("Review status is unavailable.")
                        Button("Retry review status") { retry += 1 }.buttonStyle(.letterpress(.outlined))
                    case .notReviewed:
                        Text("Not yet marked reviewed.")
                    case .reviewed(let review):
                        Text("Reviewed by \(review.reviewerName)")
                        if let date = review.date {
                            Text("\(LetterpressFormat.dayMonthYear(date)), \(LetterpressFormat.clock(date))")
                        }
                    }
                }
            }
            .font(Letterpress.ui(15, relativeTo: .subheadline))
            .foregroundStyle(Letterpress.inkSecondary)
        }
        .accessibilityIdentifier("photoReviewStatus")
        .task(id: "\(sharedID?.uuidString ?? "none")-\(api.access.snapshot()?.generation.uuidString ?? "none")-\(retry)") {
            reviews.cancel()
            guard let id = sharedID, let ticket = api.access.snapshot() else { return }
            await reviews.load(photoID: id, ticket: ticket)
        }
        .onDisappear { reviews.cancel() }
    }
}
```

- [ ] **Step 6: Follow the copy in the UI tests**

```bash
perl -pi -e '
  s/app\.staticTexts\["Page \\\(page\)"\]\.waitForExistence\(timeout: 5\)/app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Page \\(page) of")).firstMatch.waitForExistence(timeout: 5)/g;
  s/navigationBars\["Photo Details"\]/navigationBars["Photo details"]/g;
' ClearAFUITests/MVPExperienceUITests.swift
perl -pi -e 's/app\.staticTexts\["1 photos"\]/app.staticTexts["1 photo"]/g' ClearAFUITests/AccountFlowUITests.swift
grep -n 'Page \\\|Photo Details\|1 photos' ClearAFUITests/*.swift
```
Expected `grep`: only the new `BEGINSWITH` line.

- [ ] **Step 7: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/PhotoRecordTests -only-testing:ClearAFTests/PhotoDisplayTests -only-testing:ClearAFTests/PhotoReviewTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: PASS (7 new tests; existing photo and sweep suites unchanged).

- [ ] **Step 8: Review and commit**

Dispatch `care-access-reviewer` on the staged diff (focus: `PhotoReviewIndex` account binding and request staleness, no photo bytes or notes leave through the new path). Fix findings, rerun Step 7.

```bash
git add ClearAF/Services/PhotoReviewIndex.swift ClearAF/Views/PhotoRecordDisplay.swift ClearAF/Views/ProgressView.swift ClearAFTests/PhotoRecordTests.swift ClearAFUITests
git commit -m "ios: photo record with month rules and named tile states" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: After the camera — the review sheet [judgment]

**Files:**
- Create: `ClearAF/Views/PhotoReviewSheet.swift`, `ClearAFTests/PhotoReviewSheetTests.swift`
- Modify: `ClearAF/Views/PhotoCaptureManager.swift` (title line of `PhotoCaptureView`; whole `DurablePhotoCaptureView` and `PhotoCaptureSession` declarations), `ClearAFTests/PhotoRepositoryTests.swift` (append), `ClearAFUITests/MVPExperienceUITests.swift`, `ClearAFUITests/AccountFlowUITests.swift`

**Interfaces:**
- Consumes: `PhotoRepository.capture(_:date:notes:ticket:)` (existing, unchanged), `PhotoImageLoader`, `HapticManager.success()`, Task 1 `LetterpressFormat.stampYearTime`, `letterpressSheetBackground()`, PR 2 primitives.
- Produces:
  - `struct PhotoReviewDraft: Equatable` — `static let noteLimit = 10_000`, `let bytes: Data`, `let capturedAt: Date`, `var note: String`, `trimmedNote: String`, `noteProblem: String?`, `canSave: Bool`.
  - `enum PhotoReviewCopy` — `noteLabel`, `notePlaceholder`, `afterSave`, `saveLabel(saving:) -> String`.
  - `struct PhotoReviewSheet: View` — `init(draft: Binding<PhotoReviewDraft>, saving: Bool, onRetake: @escaping () -> Void, onDiscard: @escaping () -> Void, onSave: @escaping () -> Void)`; accessibility identifiers `photoReviewSave`, `photoReviewNote`.
  - `PhotoCaptureSession.capture(_ bytes: Data, date: Date = Date(), notes: String = "", repository:ticket:onSaved:)` — the two new parameters default, so existing call sites and tests compile unchanged.
- Omitted per `deferred.md`: "Send to Dr. Om" and "Attach to this morning's routine" toggles. The native camera (`CameraImagePicker`) and library picker are not touched.
- Reviewers: `care-access-reviewer` (photo capture path; the patient's note is now populated and uploaded with the photo through the existing `complete` call).

- [ ] **Step 1: Write the failing tests**

`ClearAFTests/PhotoReviewSheetTests.swift`:

```swift
import Foundation
import Testing
@testable import ClearAF

struct PhotoReviewSheetTests {
    @Test func noteIsOptionalTrimmedAndBoundedWithoutLosingText() {
        var draft = PhotoReviewDraft(bytes: Data([0xff, 0xd8, 0xff]), capturedAt: Date(timeIntervalSince1970: 0))
        #expect(draft.canSave)
        #expect(draft.trimmedNote == "")
        draft.note = "  Jaw looks calmer \n"
        #expect(draft.trimmedNote == "Jaw looks calmer")
        draft.note = String(repeating: "a", count: PhotoReviewDraft.noteLimit + 1)
        #expect(!draft.canSave)
        #expect(draft.noteProblem == "Shorten the note to 10,000 characters or fewer. Your text is kept.")
        #expect(draft.note.count == PhotoReviewDraft.noteLimit + 1)
    }

    @Test func copySaysWhatSavingDoes() {
        #expect(PhotoReviewCopy.saveLabel(saving: false) == "Save to record")
        #expect(PhotoReviewCopy.saveLabel(saving: true) == "Saving…")
        #expect(PhotoReviewCopy.noteLabel == "Note for this photo · optional")
        #expect(PhotoReviewCopy.afterSave == "Saved on this device first, then shared with your care team, note included. You'll see “Waiting to share” until it lands.")
    }
}
```

Append to `ClearAFTests/PhotoRepositoryTests.swift`:

```swift
@MainActor extension PhotoRepositoryTests {
    @Test func reviewedCaptureKeepsItsCaptureTimeAndNote() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let access = AccountAccess(), transport = CaptureTransport()
        let ticket = access.activate(UUID())
        let store = try PersistenceController(accountID: ticket.accountID, directory: root)
        defer { close(store) }
        let repository = PhotoRepository(access: access, transport: transport)
        repository.resume(context: store.container.viewContext, ticket: ticket)
        defer { repository.cancel() }
        let takenAt = Date(timeIntervalSince1970: 1_789_456_320)
        let session = PhotoCaptureSession()
        let completion = try session.capture(jpeg(), date: takenAt, notes: "Chin drier than last week",
                                             repository: repository, ticket: ticket, onSaved: { _ in })
        #expect(completion == .saved)
        let saved = try #require(session.photo)
        #expect(saved.captureDate == takenAt)
        #expect(saved.notes == "Chin drier than last week")
        #expect(saved.uploadState == "pending")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/PhotoReviewSheetTests -only-testing:ClearAFTests/PhotoRepositoryTests`
Expected: build FAIL — `cannot find 'PhotoReviewDraft' in scope` and `extra arguments 'date', 'notes' in call`.

- [ ] **Step 3: Create `ClearAF/Views/PhotoReviewSheet.swift`**

```swift
import SwiftUI
import UIKit

/// A picked photo that has not been saved yet.
struct PhotoReviewDraft: Equatable {
    static let noteLimit = 10_000
    let bytes: Data
    let capturedAt: Date
    var note = ""

    var trimmedNote: String { note.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Mirrors `PhotoRepository`'s notes validation so the problem is named before Save, with the text kept.
    var noteProblem: String? {
        trimmedNote.utf16.count > Self.noteLimit ? "Shorten the note to 10,000 characters or fewer. Your text is kept." : nil
    }

    var canSave: Bool { noteProblem == nil }
}

enum PhotoReviewCopy {
    static let noteLabel = "Note for this photo · optional"
    static let notePlaceholder = "For example: chin is drier than last week"
    static let afterSave = "Saved on this device first, then shared with your care team, note included. You'll see “Waiting to share” until it lands."
    static func saveLabel(saving: Bool) -> String { saving ? "Saving…" : "Save to record" }
}

/// The sheet the native camera or library picker returns to (spec §6 #4). Nothing is saved until Save to record.
struct PhotoReviewSheet: View {
    @Binding var draft: PhotoReviewDraft
    let saving: Bool
    let onRetake: () -> Void
    let onDiscard: () -> Void
    let onSave: () -> Void
    @State private var images = PhotoImageLoader()
    @State private var confirmingDiscard = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(LetterpressFormat.stampYearTime(draft.capturedAt))
                            .font(Letterpress.data(12, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.ink)
                        Spacer(minLength: Letterpress.Space.s10)
                        Button("Retake", action: onRetake)
                            .buttonStyle(.letterpress(.underline))
                            .disabled(saving)
                    }
                    preview
                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                        Text(PhotoReviewCopy.noteLabel).letterpressEyebrow()
                        TextField(PhotoReviewCopy.notePlaceholder, text: $draft.note, axis: .vertical)
                            .lineLimit(1...6)
                            .letterpressField(isEmpty: draft.note.isEmpty)
                            .disabled(saving)
                            .accessibilityIdentifier("photoReviewNote")
                        if let problem = draft.noteProblem {
                            Text(problem)
                                .font(Letterpress.ui(13, relativeTo: .footnote))
                                .foregroundStyle(Letterpress.error)
                        }
                    }
                    Button(PhotoReviewCopy.saveLabel(saving: saving), action: onSave)
                        .buttonStyle(.letterpress(.filled, fullWidth: true))
                        .disabled(saving || !draft.canSave)
                        .accessibilityIdentifier("photoReviewSave")
                    Text(PhotoReviewCopy.afterSave)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(Letterpress.Space.s22)
            }
            .navigationTitle("Review photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Discard") { confirmingDiscard = true }.disabled(saving)
                }
            }
            .confirmationDialog("Discard this photo?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                Button("Discard photo", role: .destructive, action: onDiscard)
                Button("Keep reviewing", role: .cancel) {}
            } message: {
                Text("It hasn't been saved to your record.")
            }
            .onDisappear { images.clear() }
        }
    }

    private var preview: some View {
        Rectangle()
            .fill(Letterpress.sunk)
            .aspectRatio(4 / 5, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .overlay {
                if let image = images.image(data: draft.bytes, key: "review-\(draft.capturedAt.timeIntervalSince1970)", maxPixelSize: 1600) {
                    Image(uiImage: image).resizable().scaledToFit()
                }
            }
            .overlay { Rectangle().strokeBorder(Letterpress.ink, lineWidth: 1.5) }
            .accessibilityElement()
            .accessibilityLabel("Photo to review, not saved yet")
            .accessibilityAddTraits(.isImage)
    }
}
```

- [ ] **Step 4: Edit `ClearAF/Views/PhotoCaptureManager.swift`**

4a. In `PhotoCaptureView.body`, replace the title line:
```swift
                    Text(title).font(.largeTitle).bold().multilineTextAlignment(.center)
```
with
```swift
                    Text(title).font(Letterpress.display(34, relativeTo: .largeTitle)).foregroundStyle(Letterpress.ink).multilineTextAlignment(.center)
```

4b. Replace the whole `struct DurablePhotoCaptureView: View { … }` declaration (from its leading comment line `// Every retained entry point uses the same durable account-bound capture.` to its closing brace) with:

```swift
// Every retained entry point uses the same durable account-bound capture. The picked photo is reviewed first;
// Save to record commits it on the device and the existing upload worker shares it.
struct DurablePhotoCaptureView: View {
    var onSaved: (SkinPhoto) throws -> Void = { _ in }
    @Environment(\.dismiss) private var dismiss
    @State private var errorMessage: String?
    @State private var attachmentFailed = false
    @State private var session = PhotoCaptureSession()
    @State private var captureTicket = APIService.shared.access.snapshot()
    @State private var review: PhotoReviewDraft?
    @State private var saving = false

    var body: some View {
        Group {
            if review != nil {
                PhotoReviewSheet(
                    draft: Binding(get: { review ?? PhotoReviewDraft(bytes: Data(), capturedAt: Date()) }, set: { review = $0 }),
                    saving: saving,
                    onRetake: { review = nil },
                    onDiscard: { review = nil; dismiss() },
                    onSave: save)
            } else {
                PhotoCaptureView(title: "Add a dated photo", subtitle: "Your photo is saved on this device, then shared with your care team.") { bytes in
                    review = PhotoReviewDraft(bytes: bytes, capturedAt: Date())
                }
            }
        }
        // An unsaved photo is never dropped by a swipe; Discard asks first.
        .interactiveDismissDisabled(review != nil)
        .letterpressSheetBackground()
        .alert(attachmentFailed ? "Photo saved" : "Unable to save photo",
               isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { finishAlert() } })) {
            Button(attachmentFailed ? "Done" : "OK") { finishAlert() }
        } message: { Text(errorMessage ?? "") }
    }

    private func save() {
        guard let draft = review, draft.canSave, !saving else { return }
        saving = true
        defer { saving = false }
        do {
            let completion = try session.capture(draft.bytes, date: draft.capturedAt, notes: draft.trimmedNote,
                repository: APIService.shared.photos, ticket: captureTicket, onSaved: onSaved)
            if completion == .saved {
                HapticManager.success()
                dismiss()
            } else {
                attachmentFailed = true
                errorMessage = "Your photo is saved in Photos, but could not be attached here."
            }
        } catch {
            // The draft stays on screen so Save repeats the same action.
            attachmentFailed = false
            errorMessage = error.localizedDescription
        }
    }

    private func finishAlert() {
        errorMessage = nil
        // Attachment failure does not invite another capture: the durable photo already exists.
        if attachmentFailed { dismiss() }
    }
}
```

4c. Replace the whole `@MainActor final class PhotoCaptureSession { … }` declaration with:

```swift
/// One picker presentation owns one durable capture, even if attaching it fails.
@MainActor final class PhotoCaptureSession {
    enum Completion: Equatable { case saved, savedWithoutAttachment }
    private(set) var photo: SkinPhoto?
    private var completion = Completion.savedWithoutAttachment

    func capture(_ bytes: Data, date: Date = Date(), notes: String = "", repository: PhotoRepository,
                 ticket: AccountAccess.Ticket?, onSaved: (SkinPhoto) throws -> Void) throws -> Completion {
        guard photo == nil else { return completion }
        let photo = try repository.capture(bytes, date: date, notes: notes, ticket: ticket)
        self.photo = photo
        do {
            try onSaved(photo)
            completion = .saved
        } catch {
            completion = .savedWithoutAttachment
        }
        return completion
    }
}
```

- [ ] **Step 5: Save the reviewed photo in the UI tests**

`ClearAFUITests/MVPExperienceUITests.swift`, in `testPhysicalCameraSettingsGrantAndOfflineCapture`, after `use.tap()` insert:
```swift
        let save = app.buttons["photoReviewSave"]
        guard save.waitForExistence(timeout: 10) else { throw fixtureFailure() }
        save.tap()
```
In `testPhysicalSelectPreparedSyntheticLibraryPhoto`, after the `print("MVP READY_FOR_SYNTHETIC_SELECTION: …")` line insert:
```swift
        guard app.buttons["photoReviewSave"].waitForExistence(timeout: 120) else { throw fixtureFailure() }
        app.buttons["photoReviewSave"].tap()
```
`ClearAFUITests/AccountFlowUITests.swift`, in `testSyntheticPhotoCaptureSharesAndSurvivesColdLaunch`, after `image.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()` insert:
```swift
        XCTAssertTrue(app.buttons["photoReviewSave"].waitForExistence(timeout: 10))
        app.buttons["photoReviewSave"].tap()
```

- [ ] **Step 6: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/PhotoReviewSheetTests -only-testing:ClearAFTests/PhotoRepositoryTests -only-testing:ClearAFTests/PhotoPickerConversionTests -only-testing:ClearAFTests/PhotoDisplayTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: PASS, including `throwingAttachmentCannotTurnSavedPhotoIntoAnotherCapture` unchanged.

- [ ] **Step 7: Review and commit**

Dispatch `care-access-reviewer` on the staged diff (focus: nothing persists before Save; the capture ticket is still the one taken when the sheet opened; the note goes only through `PhotoRepository.capture` validation). Fix findings, rerun Step 6.

```bash
git add ClearAF/Views/PhotoReviewSheet.swift ClearAF/Views/PhotoCaptureManager.swift ClearAFTests/PhotoReviewSheetTests.swift ClearAFTests/PhotoRepositoryTests.swift ClearAFUITests
git commit -m "ios: review sheet after the camera with optional note and Save to record" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: Plan — routine checklist, record panel and 14-day strip [judgment]

**Files:**
- Create: `ClearAF/Views/RoutineChecklist.swift`, `ClearAF/Views/AdherenceStrip.swift`, `ClearAFTests/RoutinePresentationTests.swift`
- Modify (full rewrite): `ClearAF/Views/RoutineView.swift`
- Modify: `ClearAFUITests/AccountFlowUITests.swift`, `docs/design/letterpress/deferred.md`

**Interfaces:**
- Consumes: `RoutineRepository` (`snapshot`, `pending`, `localDate`, `lastRefreshed`, `isRefreshing`, `isCached`, `lastError`, `status(for:)`, `routine(for:)`, `recordCompletion(revision:ticket:)`, `refresh()`, `retry()`), `RoutineDailyStatus`, `CareRoutineRevision`, `CareRoutineCompletion`, `PendingRoutineCompletion`, `RoutineDates.instant/localDate`, `CompletionCalendar` + `CompletionCalendar.Day`, `APIService.fetchCompletionCalendar(month:ticket:)`, `CompletionCalendarView` (existing, restyled in PR 6); Task 1 `LetterpressFormat`.
- Produces (Task 6 relies on these):
  - `enum RoutineRecordCopy` — `action(_ slot: RoutineTimeOfDay) -> String`, `button(_ slot: RoutineTimeOfDay, status: RoutineDailyStatus) -> String`, `status(_ status: RoutineDailyStatus, completedAt: String?, timeZone: String?, locale: Locale = .current) -> String`, `assignment(_ routine: CareRoutineRevision, locale: Locale = .current, timeZone: TimeZone = .current) -> String`, `versionNote(_ routine: CareRoutineRevision, localDate: String, pendingCount: Int, locale: Locale = .current) -> String`, `lastChecked(_ date: Date, now: Date = Date(), locale: Locale = .current, timeZone: TimeZone = .current) -> String`, `todaysEvent(for revisionID: UUID, completions: [CareRoutineCompletion], pending: [PendingRoutineCompletion], localDate: String) -> (completedAt: String, timeZone: String)?`.
  - `struct RoutineChecklist: View` — `init(steps: [CareRoutineStep], ticked: Binding<Set<Int>>)`; `struct RoutineCheckbox: View` (`static let size: CGFloat = 22`).
  - `struct RoutineRecordPanel: View` — `init(routine: CareRoutineRevision, repository: RoutineRepository, identifierPrefix: String, showsVersionNote: Bool = true, actionError: Binding<String?>)`; identifiers `"\(identifierPrefix)-record"`, `"\(identifierPrefix)-status"`.
  - `enum AdherenceDayState: Equatable { case both, one, neither }`; `struct AdherenceWindow: Equatable` (`length = 14`, `dates`, `states`, `recordedDays`, `summary`, `static dates(endingOn:timeZone:)`, `static months(for:)`, `static build(dates:calendars:)`); `struct AdherenceBars: View` (`static func fraction(_:) -> CGFloat`); `struct AdherenceStripRow: View` (`init(repository: RoutineRepository)`).
- Status copy changes that UI tests follow: recorded status reads `Recorded at 7:14 am. Comes back tomorrow.`; unrecorded stays `Not recorded today`.
- Reviewers: per-task review only (no access or shape change; the calendar read is the one `CompletionCalendarView` already makes).

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/RoutinePresentationTests.swift`

```swift
import Foundation
import Testing
@testable import ClearAF

struct RoutinePresentationTests {
    static let utc = TimeZone(identifier: "UTC")!
    static let us = Locale(identifier: "en_US")

    private func routine(version: Int = 4, steps: Int = 3, slot: RoutineTimeOfDay = .morning) -> CareRoutineRevision {
        CareRoutineRevision(id: UUID(), userId: UUID(), timeOfDay: slot, version: version, createdBy: UUID(),
                            createdAt: "2026-09-02T09:00:00.000Z", name: "Synthetic Morning Routine", isActive: true,
                            steps: (0..<steps).map { CareRoutineStep(title: "Step \($0 + 1)", instructions: "") })
    }

    @Test func recordCopyNamesTheSlotAndEachSavedState() {
        #expect(RoutineRecordCopy.button(.morning, status: .unrecorded) == "Record this morning")
        #expect(RoutineRecordCopy.button(.evening, status: .unrecorded) == "Record this evening")
        #expect(RoutineRecordCopy.button(.morning, status: .pending) == "Saved on this device")
        #expect(RoutineRecordCopy.button(.morning, status: .recorded) == "Recorded")
        #expect(RoutineRecordCopy.status(.unrecorded, completedAt: nil, timeZone: nil) == "Not recorded today")
        #expect(RoutineRecordCopy.status(.pending, completedAt: nil, timeZone: nil) == "Saved on this device. Waiting to upload.")
        #expect(RoutineRecordCopy.status(.recorded, completedAt: nil, timeZone: nil) == "Recorded today. Comes back tomorrow.")
    }

    @Test func recordedTimeUsesTheCompletionsOwnTimeZone() {
        let text = RoutineRecordCopy.status(.recorded, completedAt: "2026-09-15T11:14:00.000Z", timeZone: "America/New_York", locale: Self.us)
        #expect(text == "Recorded at 7:14 am. Comes back tomorrow.")
    }

    @Test func metadataUnderTheActionIsInWords() {
        #expect(RoutineRecordCopy.assignment(routine(), locale: Self.us, timeZone: Self.utc) == "Assigned on 2 Sep · 3 steps")
        #expect(RoutineRecordCopy.assignment(routine(steps: 1), locale: Self.us, timeZone: Self.utc) == "Assigned on 2 Sep · 1 step")
        #expect(RoutineRecordCopy.versionNote(routine(), localDate: "2026-09-15", pendingCount: 0, locale: Self.us)
                == "Records against v4 for Tue 15 Sep, in your time zone.")
        #expect(RoutineRecordCopy.versionNote(routine(), localDate: "2026-09-15", pendingCount: 1, locale: Self.us)
                == "Records against v4 for Tue 15 Sep, in your time zone. One completion is still waiting to upload.")
        #expect(RoutineRecordCopy.versionNote(routine(), localDate: "2026-09-15", pendingCount: 2, locale: Self.us)
                == "Records against v4 for Tue 15 Sep, in your time zone. 2 completions are still waiting to upload.")
    }

    @Test func lastCheckedShowsTheDayOnlyWhenItIsNotToday() {
        let iso = ISO8601DateFormatter()
        let checked = iso.date(from: "2026-09-15T08:40:00Z")!
        #expect(RoutineRecordCopy.lastChecked(checked, now: iso.date(from: "2026-09-15T12:00:00Z")!, locale: Self.us, timeZone: Self.utc) == "Last checked 8:40 am")
        #expect(RoutineRecordCopy.lastChecked(checked, now: iso.date(from: "2026-09-16T09:00:00Z")!, locale: Self.us, timeZone: Self.utc) == "Last checked 15 Sep, 8:40 am")
    }

    @Test func todaysEventPrefersTheServerRecordOverThePendingOne() {
        let revision = UUID(), user = UUID()
        let server = CareRoutineCompletion(id: UUID(), userId: user, revisionId: revision, completedAt: "2026-09-15T07:14:00.000Z",
                                           localDate: "2026-09-15", timeZone: "UTC", receivedAt: "2026-09-15T07:15:00.000Z")
        let queued = PendingRoutineCompletion(id: UUID(), userId: user, revisionId: revision, completedAt: "2026-09-15T07:20:00.000Z",
                                              localDate: "2026-09-15", timeZone: "Europe/London")
        let both = RoutineRecordCopy.todaysEvent(for: revision, completions: [server], pending: [queued], localDate: "2026-09-15")
        #expect(both?.completedAt == "2026-09-15T07:14:00.000Z")
        let pendingOnly = RoutineRecordCopy.todaysEvent(for: revision, completions: [], pending: [queued], localDate: "2026-09-15")
        #expect(pendingOnly?.timeZone == "Europe/London")
        #expect(RoutineRecordCopy.todaysEvent(for: revision, completions: [server], pending: [], localDate: "2026-09-16") == nil)
    }

    @Test func windowIsTheLast14LocalDaysEndingToday() {
        let now = ISO8601DateFormatter().date(from: "2026-09-03T02:00:00Z")!
        let dates = AdherenceWindow.dates(endingOn: now, timeZone: TimeZone(identifier: "America/Los_Angeles")!)
        #expect(dates.count == 14)
        #expect(dates.first == "2026-08-20")
        #expect(dates.last == "2026-09-02")
        #expect(AdherenceWindow.months(for: dates) == ["2026-08", "2026-09"])
    }

    @Test func threeStatesComeFromRealCompletionCounts() {
        let calendar = CompletionCalendar(month: "2026-09", days: [
            CompletionCalendar.Day(localDate: "2026-09-01", morning: 1, evening: 1),
            CompletionCalendar.Day(localDate: "2026-09-02", morning: 0, evening: 2),
        ])
        let window = AdherenceWindow.build(dates: ["2026-09-01", "2026-09-02", "2026-09-03"], calendars: [calendar])
        #expect(window.states == [.both, .one, .neither])
        #expect(window.recordedDays == 2)
        #expect(AdherenceBars.fraction(.both) == 1)
        #expect(AdherenceBars.fraction(.one) == 0.7)
        #expect(AdherenceBars.fraction(.neither) == 0.4)
    }

    @Test func summaryIsACountNeverAPercentage() {
        let window = AdherenceWindow(dates: Array(repeating: "2026-09-01", count: 14),
                                     states: Array(repeating: .both, count: 11) + Array(repeating: .neither, count: 3))
        #expect(window.summary == "11 of the last 14 days")
        #expect(!window.summary.contains("%"))
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/RoutinePresentationTests`
Expected: build FAIL — `cannot find 'RoutineRecordCopy' in scope`.

- [ ] **Step 3: Create `ClearAF/Views/RoutineChecklist.swift`**

```swift
import SwiftUI

/// Copy for recording a routine (spec §4.4, §5, §7). Version, time zone and the upload queue sit under the action.
enum RoutineRecordCopy {
    static func action(_ slot: RoutineTimeOfDay) -> String {
        slot == .morning ? "Record this morning" : "Record this evening"
    }

    static func button(_ slot: RoutineTimeOfDay, status: RoutineDailyStatus) -> String {
        switch status {
        case .unrecorded: action(slot)
        case .pending: "Saved on this device"
        case .recorded: "Recorded"
        }
    }

    /// The sentence under the button. A recorded time is shown in the time zone the completion was made in.
    static func status(_ status: RoutineDailyStatus, completedAt: String?, timeZone: String?, locale: Locale = .current) -> String {
        switch status {
        case .unrecorded:
            return "Not recorded today"
        case .pending:
            return "Saved on this device. Waiting to upload."
        case .recorded:
            guard let completedAt, let date = RoutineDates.instant(completedAt) else { return "Recorded today. Comes back tomorrow." }
            let zone = timeZone.flatMap(TimeZone.init(identifier:)) ?? .current
            return "Recorded at \(LetterpressFormat.clock(date, locale: locale, timeZone: zone)). Comes back tomorrow."
        }
    }

    static func assignment(_ routine: CareRoutineRevision, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let steps = routine.steps.count == 1 ? "1 step" : "\(routine.steps.count) steps"
        guard let date = RoutineDates.instant(routine.createdAt) else { return "Assigned by your clinician · \(steps)" }
        return "Assigned on \(LetterpressFormat.dayMonth(date, locale: locale, timeZone: timeZone)) · \(steps)"
    }

    static func versionNote(_ routine: CareRoutineRevision, localDate: String, pendingCount: Int, locale: Locale = .current) -> String {
        var sentence = "Records against v\(routine.version) for \(dayLabel(localDate, locale: locale)), in your time zone."
        if pendingCount == 1 {
            sentence += " One completion is still waiting to upload."
        } else if pendingCount > 1 {
            sentence += " \(pendingCount) completions are still waiting to upload."
        }
        return sentence
    }

    static func lastChecked(_ date: Date, now: Date = Date(), locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let time = LetterpressFormat.clock(date, locale: locale, timeZone: timeZone)
        return calendar.isDate(date, inSameDayAs: now)
            ? "Last checked \(time)"
            : "Last checked \(LetterpressFormat.dayMonth(date, locale: locale, timeZone: timeZone)), \(time)"
    }

    static func todaysEvent(for revisionID: UUID, completions: [CareRoutineCompletion], pending: [PendingRoutineCompletion],
                            localDate: String) -> (completedAt: String, timeZone: String)? {
        if let done = completions.first(where: { $0.revisionId == revisionID && $0.localDate == localDate }) {
            return (done.completedAt, done.timeZone)
        }
        if let queued = pending.first(where: { $0.revisionId == revisionID && $0.localDate == localDate }) {
            return (queued.completedAt, queued.timeZone)
        }
        return nil
    }

    /// `localDate` is already the patient's calendar day, so it is formatted in UTC to avoid shifting it.
    private static func dayLabel(_ localDate: String, locale: Locale) -> String {
        let utc = TimeZone(identifier: "UTC")!
        let parser = DateFormatter()
        parser.calendar = Calendar(identifier: .gregorian)
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.timeZone = utc
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: localDate) else { return localDate }
        return LetterpressFormat.weekdayDayMonth(date, locale: locale, timeZone: utc)
    }
}

/// Ruled checklist (spec §4.4). Ticks are local and reversible; recording is the filled button.
struct RoutineChecklist: View {
    let steps: [CareRoutineStep]
    @Binding var ticked: Set<Int>

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                RoutineChecklistRow(step: step, isTicked: ticked.contains(index)) {
                    if ticked.contains(index) { ticked.remove(index) } else { ticked.insert(index) }
                }
                .overlay(alignment: .top) { LetterpressRule() }
            }
            LetterpressRule()
        }
    }
}

private struct RoutineChecklistRow: View {
    let step: CareRoutineStep
    let isTicked: Bool
    let toggle: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: Letterpress.Space.s10) {
            Button(action: toggle) {
                RoutineCheckbox(isTicked: isTicked)
                    .frame(width: Letterpress.minTouch, height: Letterpress.minTouch, alignment: .topLeading)
                    .padding(.top, 2)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(step.title)
            .accessibilityValue(isTicked ? "Ticked" : "Not ticked")
            .accessibilityHint("Ticks this step on this device. Recording the routine is separate.")
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text(step.title)
                    .font(Letterpress.ui(17, weight: .medium, relativeTo: .headline))
                    .foregroundStyle(Letterpress.ink)
                    .strikethrough(isTicked, color: Letterpress.ink.opacity(0.32))
                if !step.instructions.isEmpty {
                    Text(step.instructions)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, Letterpress.Space.s4)
        }
        .padding(.vertical, Letterpress.Space.s10)
        .contentShape(Rectangle())
        .onTapGesture(perform: toggle)
    }
}

struct RoutineCheckbox: View {
    static let size: CGFloat = 22
    let isTicked: Bool

    var body: some View {
        ZStack {
            Rectangle().fill(isTicked ? Letterpress.ink : Color.clear)
            Rectangle().strokeBorder(Letterpress.ink, lineWidth: 1.5)
            if isTicked {
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Letterpress.canvas)
            }
        }
        .frame(width: Self.size, height: Self.size)
        .accessibilityHidden(true)
    }
}

/// The filled record action with its state sentence and demoted version metadata.
struct RoutineRecordPanel: View {
    let routine: CareRoutineRevision
    @ObservedObject var repository: RoutineRepository
    let identifierPrefix: String
    var showsVersionNote = true
    @Binding var actionError: String?

    var body: some View {
        let ticket = APIService.shared.access.snapshot()
        let status = repository.status(for: routine)
        let event = RoutineRecordCopy.todaysEvent(for: routine.id, completions: repository.snapshot?.completions ?? [],
                                                  pending: repository.pending, localDate: repository.localDate)
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Button(RoutineRecordCopy.button(routine.timeOfDay, status: status)) {
                do {
                    _ = try repository.recordCompletion(revision: routine, ticket: ticket)
                    actionError = nil
                } catch { actionError = error.localizedDescription }
            }
            .buttonStyle(.letterpress(.filled, fullWidth: true))
            .disabled(status != .unrecorded)
            .accessibilityIdentifier("\(identifierPrefix)-record")
            Text(RoutineRecordCopy.status(status, completedAt: event?.completedAt, timeZone: event?.timeZone))
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
                .accessibilityIdentifier("\(identifierPrefix)-status")
            if showsVersionNote {
                Text(RoutineRecordCopy.versionNote(routine, localDate: repository.localDate, pendingCount: repository.pending.count))
                    .font(Letterpress.ui(12, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
```

- [ ] **Step 4: Create `ClearAF/Views/AdherenceStrip.swift`**

```swift
import SwiftUI

/// Days in the strip (spec §4.6), from the server's per-day morning/evening completion counts.
enum AdherenceDayState: Equatable { case both, one, neither }

struct AdherenceWindow: Equatable {
    static let length = 14
    let dates: [String]
    let states: [AdherenceDayState]

    var recordedDays: Int { states.filter { $0 != .neither }.count }
    /// A count, never a grade or percentage (spec §4.6, §7).
    var summary: String { "\(recordedDays) of the last \(Self.length) days" }

    static func dates(endingOn today: Date, timeZone: TimeZone) -> [String] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let start = calendar.startOfDay(for: today)
        return (0..<length).reversed().compactMap { offset in
            calendar.date(byAdding: .day, value: -offset, to: start).map { RoutineDates.localDate($0, zone: timeZone) }
        }
    }

    static func months(for dates: [String]) -> [String] {
        var months: [String] = []
        for month in dates.map({ String($0.prefix(7)) }) where !months.contains(month) { months.append(month) }
        return months
    }

    static func build(dates: [String], calendars: [CompletionCalendar]) -> AdherenceWindow {
        let days = Dictionary(calendars.flatMap(\.days).map { ($0.localDate, $0) }, uniquingKeysWith: { first, _ in first })
        return AdherenceWindow(dates: dates, states: dates.map { date -> AdherenceDayState in
            guard let day = days[date] else { return .neither }
            switch (day.morning > 0, day.evening > 0) {
            case (true, true): return .both
            case (false, false): return .neither
            default: return .one
            }
        })
    }
}

struct AdherenceBars: View {
    static let barWidth: CGFloat = 6
    static let height: CGFloat = 22
    let window: AdherenceWindow

    static func fraction(_ state: AdherenceDayState) -> CGFloat {
        switch state {
        case .both: 1
        case .one: 0.7
        case .neither: 0.4
        }
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: Letterpress.Space.s4) {
            ForEach(Array(window.states.enumerated()), id: \.offset) { index, state in
                Rectangle()
                    .fill(state == .neither ? Letterpress.sunk : Letterpress.ink)
                    .frame(width: Self.barWidth, height: Self.height * Self.fraction(state))
                    .overlay {
                        if index == window.states.count - 1 {
                            Rectangle().strokeBorder(Letterpress.ink, lineWidth: 1.5)
                        }
                    }
            }
        }
        .frame(height: Self.height, alignment: .bottom)
        .accessibilityHidden(true)
    }
}

/// "Completion history" row on Plan: summary, bars, link to the calendar.
struct AdherenceStripRow: View {
    @ObservedObject var repository: RoutineRepository
    @State private var window: AdherenceWindow?
    @State private var failed = false

    var body: some View {
        NavigationLink { CompletionCalendarView() } label: {
            HStack(spacing: Letterpress.Space.s10) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text("Completion history")
                        .font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline))
                        .foregroundStyle(Letterpress.ink)
                    Text(detail)
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(failed ? Letterpress.error : Letterpress.inkTertiary)
                }
                Spacer(minLength: Letterpress.Space.s10)
                if let window { AdherenceBars(window: window) }
                Image(systemName: "chevron.right")
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: Letterpress.minTouch)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("Completion history, \(detail)")
        .task(id: "\(repository.localDate)-\(repository.snapshot?.completions.count ?? 0)") { await load() }
    }

    private var detail: String {
        if let window { return window.summary }
        return failed ? "Couldn't load the last 14 days" : "Loading the last 14 days"
    }

    private func load() async {
        guard let ticket = APIService.shared.access.snapshot() else { return }
        failed = false
        let dates = AdherenceWindow.dates(endingOn: Date(), timeZone: .current)
        do {
            var calendars: [CompletionCalendar] = []
            for month in AdherenceWindow.months(for: dates) {
                calendars.append(try await APIService.shared.fetchCompletionCalendar(month: month, ticket: ticket))
                try Task.checkCancellation()
                try APIService.shared.access.require(ticket)
            }
            window = AdherenceWindow.build(dates: dates, calendars: calendars)
        } catch {
            guard !Task.isCancelled, APIService.shared.access.snapshot() == ticket else { return }
            window = nil
            failed = true
        }
    }
}
```

- [ ] **Step 5: Replace `ClearAF/Views/RoutineView.swift`**

```swift
import SwiftUI

/// Plan (spec §6 #7): AM/PM switch, checklist, one filled record action, metadata under it, 14-day strip.
struct RoutineView: View {
    @ObservedObject private var repository = APIService.shared.routines
    @State private var selectedSlot: RoutineTimeOfDay = .morning
    @State private var actionError: String?
    @State private var ticked: [UUID: Set<Int>] = [:]

    var body: some View {
        let ticket = APIService.shared.access.snapshot()
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                    LetterpressPicker(title: "Time of day", selection: $selectedSlot) {
                        ForEach(RoutineTimeOfDay.allCases, id: \.self) { slot in
                            Text(slot.title).tag(slot)
                        }
                    }
                    freshness
                    if let error = actionError ?? repository.lastError {
                        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                            Text(error)
                                .font(Letterpress.ui(15, relativeTo: .body))
                                .foregroundStyle(Letterpress.error)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("routine-error")
                            Button("Retry") {
                                Task { @MainActor in
                                    guard APIService.shared.access.snapshot() == ticket else { return }
                                    actionError = nil
                                    await repository.retry()
                                }
                            }
                            .buttonStyle(.letterpress(.outlined))
                        }
                    }
                    content
                    LetterpressRule()
                    AdherenceStripRow(repository: repository)
                }
                .padding(.horizontal, Letterpress.Space.s22)
                .padding(.vertical, Letterpress.Space.s18)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(Letterpress.canvas.ignoresSafeArea())
            .navigationTitle("Routine")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { @MainActor in
                            guard APIService.shared.access.snapshot() == ticket else { return }
                            actionError = nil
                            await repository.refresh()
                        }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                            .labelStyle(.iconOnly)
                            .frame(minWidth: Letterpress.minTouch, minHeight: Letterpress.minTouch)
                    }
                    .disabled(repository.isRefreshing)
                }
            }
            .refreshable {
                guard APIService.shared.access.snapshot() == ticket else { return }
                await repository.refresh()
            }
            .onChange(of: selectedSlot) { _, _ in actionError = nil }
        }
    }

    @ViewBuilder private var freshness: some View {
        if repository.isRefreshing {
            Text(repository.snapshot == nil ? "Loading your routine" : "Checking for changes")
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
        } else if repository.isCached, let refreshed = repository.lastRefreshed {
            Text(RoutineRecordCopy.lastChecked(refreshed))
                .letterpressEyebrow(color: Letterpress.attentionText)
        }
    }

    @ViewBuilder private var content: some View {
        if let routine = repository.routine(for: selectedSlot) {
            if routine.isActive {
                assignment(routine)
            } else {
                emptyState(title: "No active \(selectedSlot.rawValue) routine",
                           sentence: "Your clinician archived version \(routine.version). Contact your care team if you need guidance.")
            }
        } else if repository.snapshot != nil {
            emptyState(title: "No \(selectedSlot.rawValue) routine yet", sentence: "Your clinician’s assignment will appear here.")
        } else if !repository.isRefreshing {
            emptyState(title: "Routine not loaded", sentence: "Pull down or tap Refresh to load your assignment.")
        }
    }

    private func assignment(_ routine: CareRoutineRevision) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(routine.name)
                        .font(Letterpress.display(22, relativeTo: .title2))
                        .foregroundStyle(Letterpress.ink)
                    Spacer(minLength: Letterpress.Space.s10)
                    Text("V\(routine.version)")
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(Letterpress.inkTertiary)
                }
                Text(RoutineRecordCopy.assignment(routine))
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
            }
            RoutineChecklist(steps: routine.steps, ticked: Binding(get: { ticked[routine.id] ?? [] }, set: { ticked[routine.id] = $0 }))
            RoutineRecordPanel(routine: routine, repository: repository,
                               identifierPrefix: "routine-\(routine.timeOfDay.rawValue)", actionError: $actionError)
                .padding(.top, Letterpress.Space.s4)
        }
    }

    private func emptyState(title: String, sentence: String) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Text(title)
                .font(Letterpress.display(24, relativeTo: .title2))
                .foregroundStyle(Letterpress.ink)
            Text(sentence)
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
```

- [ ] **Step 6: Follow the status copy in `ClearAFUITests/AccountFlowUITests.swift`**

```bash
perl -pi -e '
  s/NSPredicate\(format: "label == \x27Recorded today\x27"\)/NSPredicate(format: "label BEGINSWITH \x27Recorded at\x27")/g;
  s/XCTAssertEqual\(app\.staticTexts\["routine-morning-status"\]\.label, "Recorded today"\)/XCTAssertTrue(app.staticTexts["routine-morning-status"].label.hasPrefix("Recorded at"))/g;
' ClearAFUITests/AccountFlowUITests.swift
grep -n "Recorded today" ClearAFUITests/*.swift
```
Expected: no output.

- [ ] **Step 7: Record the omissions** — append to the table in `docs/design/letterpress/deferred.md`:

```markdown
| iOS Routine | PRESCRIPTION chip on steps | Routine steps carry no prescription flag |
| iOS Routine | "Earlier versions of this routine" row | No patient API lists previous routine versions |
| iOS Routine | "Assigned by Dr. Om" byline | Revisions store the author's ID, not a name; the byline reads "Assigned on 2 Sep" |
```

- [ ] **Step 8: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/RoutinePresentationTests -only-testing:ClearAFTests/RoutineRepositoryTests -only-testing:ClearAFTests/CareSupportTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: PASS (8 new tests; repository and calendar suites unchanged).

- [ ] **Step 9: Commit**

```bash
git add ClearAF/Views/RoutineChecklist.swift ClearAF/Views/AdherenceStrip.swift ClearAF/Views/RoutineView.swift ClearAFTests/RoutinePresentationTests.swift ClearAFUITests/AccountFlowUITests.swift docs/design/letterpress/deferred.md
git commit -m "ios: Plan screen with ruled checklist, record panel and 14-day strip" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: Today, care status and urgent reports [judgment]

**Files:**
- Create: `ClearAFTests/TodayPresentationTests.swift`
- Modify (full rewrite): `ClearAF/Views/DashboardViewEnhanced.swift`, `ClearAF/Views/CareStatusCard.swift`, `ClearAF/Views/UrgentReportView.swift`
- Modify: `docs/design/letterpress/deferred.md`

**Interfaces:**
- Consumes: Task 2 `AppTab`; Task 3 `PhotoFrame`, `PhotoSharingStatusView`; Task 5 `RoutineChecklist`, `RoutineRecordPanel`; Task 1 `LetterpressFormat`, `letterpressSheetBackground()`; `APIService.shared.careDecisions.load(ticket:)`, `.urgentReports.load(ticket:)`, `.messaging.resume(_:)`, `.messaging.openCurrent()`, `.messaging.conversation/messages`, `.checkIns.draft`; `CheckInView()`, `ProfileView()`, `DurablePhotoCaptureView()`; `View.accessibleButton(label:hint:value:)` (PR 2 `InteractionHelpers.swift`).
- Produces:
  - `enum TodayCopy` — `greeting(hour: Int) -> String`, `initials(_ name: String?) -> String`, `slot(hour: Int, morning: CareRoutineRevision?, evening: CareRoutineRevision?) -> RoutineTimeOfDay?`, `latestUnread(_ messages: [AssignedMessage]) -> AssignedMessage?`, `needsTodaySlot(latest: Date?, now: Date, calendar: Calendar) -> Bool`.
  - `CareStatusCopy.byline(_ decision: CareDecision, locale: Locale = .current, timeZone: TimeZone = .current) -> String` (existing `title`, `refund`, `nextSteps` unchanged).
  - `UrgentReportCopy.disabledReason: String`, `UrgentReportCopy.meta(_ report: UrgentReport, locale: Locale = .current, timeZone: TimeZone = .current) -> String` (existing `emergency`, `sent`, `status` unchanged).
  - `UrgentReportEntry(horizontalPadding: CGFloat = Letterpress.Space.s22)` and `UrgentReportButton(isPresented:)` keep their initialisers; identifiers `urgentEntry`, `urgentEmergencyNotice`, `urgentSent`, `urgentCategory`, `urgentDescription`, `urgentSend`, `urgentError`, `careStatusCard` are kept.
- Retired: `DailyPhotoCardEnhanced`, `DailyTasksCardEnhanced`, `CareLinksCard`, `PhotoDisplaySection`, `DashboardPhotoPreview`. `AnimatedScoreDisplay`, `StreakIndicator`, `ProgressInsight`, `EnhancedProgressBar` no longer exist on `main` (verified while planning); Step 7 proves they stay gone.
- Reviewers: `care-access-reviewer` (Today now opens the assigned conversation to show an unread note; acknowledgement must remain Notes-only).

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/TodayPresentationTests.swift`

```swift
import Foundation
import Testing
@testable import ClearAF

struct TodayPresentationTests {
    static let utc = TimeZone(identifier: "UTC")!
    static let us = Locale(identifier: "en_US")

    private func routine(_ slot: RoutineTimeOfDay, active: Bool = true) -> CareRoutineRevision {
        CareRoutineRevision(id: UUID(), userId: UUID(), timeOfDay: slot, version: 1, createdBy: UUID(),
                            createdAt: "2026-09-02T09:00:00.000Z", name: "Synthetic", isActive: active,
                            steps: [CareRoutineStep(title: "Step", instructions: "")])
    }

    private func message(_ sender: String, unread: Bool, sentAt: String) -> AssignedMessage {
        let patient = UUID(), clinician = UUID()
        return AssignedMessage(id: UUID(), patientId: patient, clinicianId: clinician,
                               senderId: sender == "patient" ? patient : clinician, senderType: sender,
                               recipientId: sender == "patient" ? clinician : patient,
                               recipientType: sender == "patient" ? "dermatologist" : "patient",
                               content: "Synthetic note", sentAt: sentAt, unreadForMe: unread, reference: nil, origin: "native")
    }

    @Test func greetingFollowsTheHour() {
        #expect(TodayCopy.greeting(hour: 8) == "Good morning,")
        #expect(TodayCopy.greeting(hour: 13) == "Good afternoon,")
        #expect(TodayCopy.greeting(hour: 19) == "Good evening,")
        #expect(TodayCopy.greeting(hour: 23) == "Good night,")
    }

    @Test func initialsComeFromTheRealName() {
        #expect(TodayCopy.initials("Synthetic UI Patient") == "SU")
        #expect(TodayCopy.initials("aryan") == "A")
        #expect(TodayCopy.initials(nil) == "")
        #expect(TodayCopy.initials("   ") == "")
    }

    @Test func routineSlotFollowsTheTimeOfDayAndFallsBackToWhatIsAssigned() {
        let morning = routine(.morning), evening = routine(.evening)
        #expect(TodayCopy.slot(hour: 9, morning: morning, evening: evening) == .morning)
        #expect(TodayCopy.slot(hour: 14, morning: morning, evening: evening) == .evening)
        #expect(TodayCopy.slot(hour: 20, morning: morning, evening: nil) == .morning)
        #expect(TodayCopy.slot(hour: 9, morning: routine(.morning, active: false), evening: evening) == .evening)
        #expect(TodayCopy.slot(hour: 9, morning: nil, evening: nil) == nil)
    }

    @Test func unreadNoteIsTheLatestUnreadClinicianMessage() {
        let older = message("dermatologist", unread: true, sentAt: "2026-09-14T16:12:00.000Z")
        let newer = message("dermatologist", unread: true, sentAt: "2026-09-15T08:03:00.000Z")
        let read = message("dermatologist", unread: false, sentAt: "2026-09-15T09:00:00.000Z")
        let mine = message("patient", unread: false, sentAt: "2026-09-15T10:00:00.000Z")
        #expect(TodayCopy.latestUnread([older, newer, read, mine])?.id == newer.id)
        #expect(TodayCopy.latestUnread([read, mine]) == nil)
    }

    @Test func todaySlotAppearsUntilTodaysPhotoExists() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = Self.utc
        let iso = ISO8601DateFormatter()
        let now = iso.date(from: "2026-09-15T12:00:00Z")!
        #expect(TodayCopy.needsTodaySlot(latest: nil, now: now, calendar: calendar))
        #expect(TodayCopy.needsTodaySlot(latest: iso.date(from: "2026-09-14T23:00:00Z")!, now: now, calendar: calendar))
        #expect(!TodayCopy.needsTodaySlot(latest: iso.date(from: "2026-09-15T07:12:00Z")!, now: now, calendar: calendar))
    }

    @Test func careStatusBylineUsesTheClinicianNameAndAWrittenDate() {
        let decision = CareDecision(id: UUID(), patientId: UUID(), clinicianId: UUID(), clinicianName: "Synthetic Clinician",
                                    decision: "needs_in_person", patientMessage: nil, photoId: nil, refundStatus: "not_applicable",
                                    refundUpdatedAt: nil, createdAt: "2026-09-02T09:00:00.000Z")
        #expect(CareStatusCopy.byline(decision, locale: Self.us, timeZone: Self.utc) == "From Synthetic Clinician on 2 Sep 2026")
    }

    @Test func urgentReportsAreDescribedInWords() {
        let report = UrgentReport(id: UUID(), patientId: UUID(), category: "other", description: "Synthetic", status: "acknowledged",
                                  createdAt: "2026-09-14T12:00:00.000Z", acknowledgedAt: nil, resolvedAt: nil, resolutionNote: nil)
        #expect(UrgentReportCopy.meta(report, locale: Self.us, timeZone: Self.utc) == "14 Sep, 12:00 pm · Seen by your care team")
        #expect(UrgentReportCopy.disabledReason == "Choose what's happening and describe it to send.")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/TodayPresentationTests`
Expected: build FAIL — `cannot find 'TodayCopy' in scope`.

- [ ] **Step 3: Replace `ClearAF/Views/DashboardViewEnhanced.swift`**

```swift
import SwiftUI
import CoreData

enum TodayCopy {
    static func greeting(hour: Int) -> String {
        switch hour {
        case 5..<12: "Good morning,"
        case 12..<17: "Good afternoon,"
        case 17..<22: "Good evening,"
        default: "Good night,"
        }
    }

    static func initials(_ name: String?) -> String {
        (name ?? "").split(separator: " ").prefix(2).compactMap(\.first).map { String($0).uppercased() }.joined()
    }

    /// Morning before 14:00, evening after; falls back to whichever slot has an active assignment.
    static func slot(hour: Int, morning: CareRoutineRevision?, evening: CareRoutineRevision?) -> RoutineTimeOfDay? {
        let hasMorning = morning?.isActive == true
        let hasEvening = evening?.isActive == true
        if hour < 14 { return hasMorning ? .morning : (hasEvening ? .evening : nil) }
        return hasEvening ? .evening : (hasMorning ? .morning : nil)
    }

    static func latestUnread(_ messages: [AssignedMessage]) -> AssignedMessage? {
        messages.last { $0.senderType == "dermatologist" && $0.unreadForMe }
    }

    static func needsTodaySlot(latest: Date?, now: Date, calendar: Calendar) -> Bool {
        guard let latest else { return true }
        return !calendar.isDate(latest, inSameDayAs: now)
    }
}

/// Today (spec §6 #3): greeting → photo rail → checklist → unread note → check-in row, rule-separated.
struct DashboardViewEnhanced: View {
    @Binding var selectedTab: AppTab
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        entity: User.entity(),
        sortDescriptors: [NSSortDescriptor(keyPath: \User.joinDate, ascending: false)],
        animation: .default)
    private var users: FetchedResults<User>
    @Environment(\.scenePhase) private var scenePhase
    @State private var showingProfile = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    TodayGreeting(name: users.first?.name, showingProfile: $showingProfile)
                        .padding(.horizontal, Letterpress.Space.s22)
                    LetterpressRule(weight: .major)
                        .padding(.horizontal, Letterpress.Space.s22)
                    CareStatusSection()
                        .padding(.top, Letterpress.Space.s18)
                    UrgentReportEntry()
                        .padding(.top, Letterpress.Space.s18)
                    TodayPhotoRail(selectedTab: $selectedTab)
                        .padding(.top, Letterpress.Space.s22)
                    TodayRoutineSection(selectedTab: $selectedTab)
                        .padding(.horizontal, Letterpress.Space.s22)
                        .padding(.top, Letterpress.Space.s22)
                    TodayUnreadNote(selectedTab: $selectedTab)
                        .padding(.horizontal, Letterpress.Space.s22)
                        .padding(.top, Letterpress.Space.s22)
                    TodayCheckInRow()
                        .padding(.horizontal, Letterpress.Space.s22)
                        .padding(.top, Letterpress.Space.s22)
                }
                .padding(.bottom, Letterpress.Space.s28)
            }
            .background(Letterpress.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .task { await refresh() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { Task { await refresh() } }
            }
            .sheet(isPresented: $showingProfile) {
                ProfileView()
                    .environment(\.managedObjectContext, viewContext)
            }
        }
    }

    /// Care status, urgent reports and the assigned conversation change on the clinician's side.
    /// Opening the conversation here only reads it; acknowledging notes happens in Notes while they are on screen.
    private func refresh() async {
        guard let ticket = APIService.shared.access.snapshot() else { return }
        await APIService.shared.careDecisions.load(ticket: ticket)
        await APIService.shared.urgentReports.load(ticket: ticket)
        do { try APIService.shared.messaging.resume(ticket) } catch { return }
        await APIService.shared.messaging.openCurrent()
    }
}

private struct TodayGreeting: View {
    let name: String?
    @Binding var showingProfile: Bool

    var body: some View {
        let now = Date()
        VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
            HStack {
                Text(LetterpressFormat.weekdayDayMonth(now)).letterpressEyebrow()
                Spacer()
                Button {
                    HapticManager.light()
                    showingProfile = true
                } label: {
                    Group {
                        let initials = TodayCopy.initials(name)
                        if initials.isEmpty {
                            Image(systemName: "person").font(Letterpress.ui(13, relativeTo: .caption))
                        } else {
                            Text(initials).font(Letterpress.data(11, relativeTo: .caption))
                        }
                    }
                    .foregroundStyle(Letterpress.canvas)
                    .frame(width: 30, height: 30)
                    .background(Letterpress.ink, in: Circle())
                    .frame(width: Letterpress.minTouch, height: Letterpress.minTouch)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibleButton(label: "Profile", hint: "Open your profile settings")
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(TodayCopy.greeting(hour: Calendar.current.component(.hour, from: now)))
                    .font(Letterpress.display(40, relativeTo: .largeTitle))
                if let name, !name.isEmpty {
                    Text(name).font(Letterpress.display(40, italic: true, relativeTo: .largeTitle))
                }
            }
            .foregroundStyle(Letterpress.ink)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, Letterpress.Space.s10)
        .padding(.bottom, Letterpress.Space.s18)
    }
}

private struct TodayPhotoRail: View {
    static let tileWidth: CGFloat = 112
    @Binding var selectedTab: AppTab
    @FetchRequest(fetchRequest: Self.recentRequest(), animation: .default)
    private var photos: FetchedResults<SkinPhoto>
    @State private var images = PhotoImageLoader()
    @State private var capturing = false

    private static func recentRequest() -> NSFetchRequest<SkinPhoto> {
        let request = SkinPhoto.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(key: "captureDate", ascending: false), NSSortDescriptor(key: "id", ascending: false)]
        request.fetchLimit = 3
        return request
    }

    var body: some View {
        let needsToday = TodayCopy.needsTodaySlot(latest: photos.first?.captureDate, now: Date(), calendar: .current)
        let shown = Array(photos.prefix(needsToday ? 2 : 3))
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            HStack(alignment: .firstTextBaseline) {
                Text("Photo record").letterpressEyebrow()
                Spacer()
                Button("View all") { selectedTab = .record }.buttonStyle(.letterpress(.underline))
            }
            .padding(.horizontal, Letterpress.Space.s22)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: Letterpress.Space.s6) {
                    if needsToday { todaySlot }
                    ForEach(Array(shown.enumerated()), id: \.element.objectID) { index, photo in
                        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                            PhotoFrame(photo: photo, images: images, maxPixelSize: 400)
                                .accessibilityElement()
                                .accessibilityAddTraits(.isImage)
                                .accessibilityLabel(index == 0 ? "Latest progress photo" : "Dated photo")
                            if let date = photo.captureDate {
                                Text(LetterpressFormat.stamp(date))
                                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                                    .foregroundStyle(Letterpress.inkTertiary)
                            }
                            PhotoSharingStatusView(photo: photo, compact: true)
                        }
                        .frame(width: Self.tileWidth)
                    }
                }
                .padding(.horizontal, Letterpress.Space.s22)
            }
        }
        .sheet(isPresented: $capturing) { DurablePhotoCaptureView() }
        .onDisappear { images.clear() }
    }

    private var todaySlot: some View {
        Button { capturing = true } label: {
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Rectangle()
                    .fill(Letterpress.sunk)
                    .aspectRatio(4 / 5, contentMode: .fit)
                    .overlay {
                        VStack(spacing: Letterpress.Space.s6) {
                            Image(systemName: "camera").foregroundStyle(Letterpress.ink)
                            Text("Today").letterpressEyebrow(color: Letterpress.ink)
                        }
                    }
                    .overlay { Rectangle().strokeBorder(Letterpress.ink, lineWidth: 1.5) }
                Text(LetterpressFormat.stamp(Date()))
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                    .foregroundStyle(Letterpress.ink)
            }
            .frame(width: Self.tileWidth)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("Take today's photo")
    }
}

private struct TodayRoutineSection: View {
    @Binding var selectedTab: AppTab
    @ObservedObject private var repository = APIService.shared.routines
    @State private var ticked: [UUID: Set<Int>] = [:]
    @State private var actionError: String?

    var body: some View {
        let slot = TodayCopy.slot(hour: Calendar.current.component(.hour, from: Date()),
                                  morning: repository.routine(for: .morning), evening: repository.routine(for: .evening))
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            LetterpressRule()
            if let slot, let routine = repository.routine(for: slot) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(slot.title) routine").letterpressEyebrow()
                    Spacer()
                    Text("V\(routine.version)")
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(Letterpress.inkTertiary)
                }
                .padding(.top, Letterpress.Space.s10)
                RoutineChecklist(steps: routine.steps, ticked: Binding(get: { ticked[routine.id] ?? [] }, set: { ticked[routine.id] = $0 }))
                RoutineRecordPanel(routine: routine, repository: repository, identifierPrefix: "today-routine",
                                   showsVersionNote: false, actionError: $actionError)
                    .padding(.top, Letterpress.Space.s6)
            } else {
                Text("Routine").letterpressEyebrow().padding(.top, Letterpress.Space.s10)
                Text(repository.snapshot == nil ? "Your routine hasn't loaded yet." : "No routine assigned yet.")
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
            }
            if actionError != nil || repository.lastError != nil {
                Text("Routines need attention.")
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.error)
            }
            Button("Open Plan") { selectedTab = .plan }.buttonStyle(.letterpress(.underline))
        }
    }
}

private struct TodayUnreadNote: View {
    @Binding var selectedTab: AppTab
    @ObservedObject private var messaging = APIService.shared.messaging

    var body: some View {
        if let pair = messaging.conversation, let message = TodayCopy.latestUnread(messaging.messages) {
            Button { selectedTab = .notes } label: {
                VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                    Text("Unread · \(pair.clinicianName)").letterpressEyebrow(color: Letterpress.attentionText)
                    Text(message.content)
                        .font(Letterpress.display(17, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                        .lineLimit(4)
                        .multilineTextAlignment(.leading)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, Letterpress.Space.s14)
                .overlay(alignment: .leading) { Rectangle().fill(Letterpress.attentionMark).frame(width: 3) }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens Notes")
        }
    }
}

private struct TodayCheckInRow: View {
    @ObservedObject private var checkIns = APIService.shared.checkIns

    var body: some View {
        NavigationLink { CheckInView() } label: {
            HStack(spacing: Letterpress.Space.s14) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text("Check-in")
                        .font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline))
                        .foregroundStyle(Letterpress.ink)
                    Text(checkIns.draft == nil ? "Answer the questions your clinician set" : "Draft saved on this device")
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                Spacer(minLength: Letterpress.Space.s10)
                Text(checkIns.draft == nil ? "Start" : "Continue")
                    .font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline))
                    .foregroundStyle(Letterpress.ink)
                    .underline()
            }
            .padding(.horizontal, Letterpress.Space.s18)
            .padding(.vertical, Letterpress.Space.s14)
            .frame(minHeight: Letterpress.minTouch)
            .overlay { Rectangle().strokeBorder(Letterpress.ink.opacity(0.2), lineWidth: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    DashboardViewEnhanced(selectedTab: .constant(.today))
        .environment(\.managedObjectContext, PersistenceController.preview.container.viewContext)
}
```

- [ ] **Step 4: Replace `ClearAF/Views/CareStatusCard.swift`**

```swift
import SwiftUI

enum CareStatusCopy {
    static func title(for decision: String) -> String {
        switch decision {
        case "refer_out": return "Online care isn't the right fit right now"
        case "needs_in_person": return "Your clinician recommends an in-person visit"
        default: return "An update from your care team"
        }
    }
    static func refund(_ status: String) -> String? {
        switch status {
        case "pending": return "Refund: being processed"
        case "issued": return "Refund: issued"
        default: return nil
        }
    }
    static let nextSteps = [
        "Book a visit with an in-person dermatologist.",
        "Your photos and history stay available in ClearAF.",
        "You can still message your care team.",
    ]
    static func byline(_ decision: CareDecision, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        guard let date = RoutineDates.instant(decision.createdAt) else { return "From \(decision.clinicianName)" }
        return "From \(decision.clinicianName) on \(LetterpressFormat.dayMonthYear(date, locale: locale, timeZone: timeZone))"
    }
}

/// Shown on Today only while the latest decision moves care away from asynchronous online care.
struct CareStatusSection: View {
    @ObservedObject private var repository = APIService.shared.careDecisions
    var body: some View {
        if let decision = repository.current, decision.decision != "async_care" {
            CareStatusCard(decision: decision)
        }
    }
}

/// Adapted to Letterpress: eyebrow, serif title, clinician words with a 2pt ink rule (§4.7), ruled next steps.
struct CareStatusCard: View {
    let decision: CareDecision
    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text("Care update").letterpressEyebrow()
            Text(CareStatusCopy.title(for: decision.decision))
                .font(Letterpress.display(24, relativeTo: .title2))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(CareStatusCopy.byline(decision))
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let message = decision.patientMessage, !message.isEmpty {
                Text(message)
                    .font(Letterpress.display(17, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, Letterpress.Space.s14)
                    .overlay(alignment: .leading) { Rectangle().fill(Letterpress.ink).frame(width: 2) }
            }
            VStack(alignment: .leading, spacing: 0) {
                Text("Next steps").letterpressEyebrow().padding(.bottom, Letterpress.Space.s6)
                ForEach(CareStatusCopy.nextSteps, id: \.self) { step in
                    Text(step)
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, Letterpress.Space.s10)
                        .overlay(alignment: .top) { LetterpressRule() }
                }
                LetterpressRule()
            }
            .padding(.top, Letterpress.Space.s6)
            if let refund = CareStatusCopy.refund(decision.refundStatus) {
                Text(refund)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Letterpress.Space.s22)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("careStatusCard")
    }
}
```

- [ ] **Step 5: Replace `ClearAF/Views/UrgentReportView.swift`**

```swift
import SwiftUI

enum UrgentReportCopy {
    static let emergency = "If you have trouble breathing, swelling of your face, lips or throat, or feel seriously unwell, call 911 now."
    static let sent = "Sent. It's flagged as urgent at the top of your care team's queue."
    static let disabledReason = "Choose what's happening and describe it to send."
    static func status(_ status: String) -> String {
        switch status {
        case "acknowledged": return "Seen by your care team"
        case "resolved": return "Resolved"
        default: return "Open"
        }
    }
    static func meta(_ report: UrgentReport, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let state = status(report.status)
        guard let date = RoutineDates.instant(report.createdAt) else { return state }
        return "\(LetterpressFormat.dayMonth(date, locale: locale, timeZone: timeZone)), \(LetterpressFormat.clock(date, locale: locale, timeZone: timeZone)) · \(state)"
    }
}

/// The "Something's wrong?" row on Today and at the top of each enrollment step. Said in words; no warning colour.
struct UrgentReportEntry: View {
    /// 22 on Today; 0 where the row sits inside a padded container.
    var horizontalPadding: CGFloat = Letterpress.Space.s22
    @State private var showing = false
    var body: some View {
        Button { showing = true } label: {
            HStack(spacing: Letterpress.Space.s14) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text("Something's wrong?")
                        .font(Letterpress.ui(16, weight: .medium, relativeTo: .headline))
                        .foregroundStyle(Letterpress.ink)
                    Text("Tell your care team about a reaction or sudden change")
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .accessibilityHidden(true)
            }
            .multilineTextAlignment(.leading)
            .padding(.vertical, Letterpress.Space.s10)
            .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
            .overlay(alignment: .top) { LetterpressRule() }
            .overlay(alignment: .bottom) { LetterpressRule() }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, horizontalPadding)
        .accessibilityIdentifier("urgentEntry")
        .sheet(isPresented: $showing) { UrgentReportView() }
    }
}

/// Compact entry for the onboarding overlay, so an urgent report is possible in every signed-in phase.
struct UrgentReportButton: View {
    @Binding var isPresented: Bool
    var body: some View {
        Button("Something's wrong?") { isPresented = true }
            .buttonStyle(.letterpress(.underline))
            .accessibilityIdentifier("urgentEntry")
            .accessibilityHint("Tell your care team about a reaction or sudden change")
    }
}

struct UrgentReportView: View {
    @ObservedObject private var repository = APIService.shared.urgentReports
    @Environment(\.dismiss) private var dismiss
    private let question = "What's happening?"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s22) {
                    emergencyNotice
                    if repository.sent != nil {
                        Text(UrgentReportCopy.sent)
                            .font(Letterpress.ui(16, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("urgentSent")
                    } else {
                        composer
                    }
                    if !repository.reports.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("Recent reports").letterpressEyebrow().padding(.bottom, Letterpress.Space.s6)
                            ForEach(repository.reports) { UrgentReportRow(report: $0) }
                            LetterpressRule()
                        }
                    }
                }
                .padding(Letterpress.Space.s22)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Something's wrong?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .task {
                repository.startNew()
                guard let ticket = APIService.shared.access.snapshot() else { return }
                await repository.load(ticket: ticket)
            }
        }
        .letterpressSheetBackground()
    }

    private var emergencyNotice: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Text("Emergency").letterpressEyebrow(color: Letterpress.ink)
            Text(UrgentReportCopy.emergency)
                .font(Letterpress.ui(16, weight: .medium, relativeTo: .callout))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.leading, Letterpress.Space.s14)
        .overlay(alignment: .leading) { Rectangle().fill(Letterpress.ink).frame(width: 2) }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("urgentEmergencyNotice")
    }

    // The draft lives in the account-scoped repository, so closing the sheet or a phase change never loses it.
    private var category: Binding<UrgentCategory?> {
        Binding(get: { repository.draft.category },
                set: { repository.updateDraft(UrgentDraft(category: $0, description: repository.draft.description)) })
    }
    private var details: Binding<String> {
        Binding(get: { repository.draft.description },
                set: { repository.updateDraft(UrgentDraft(category: repository.draft.category, description: $0)) })
    }

    private var composer: some View {
        let frozen = repository.pending != nil
        let count = repository.draft.description.utf16.count
        return VStack(alignment: .leading, spacing: Letterpress.Space.s22) {
            VStack(alignment: .leading, spacing: 0) {
                Text(question).letterpressEyebrow().padding(.bottom, Letterpress.Space.s6)
                ForEach(UrgentCategory.allCases) { option in
                    let selected = repository.draft.category == option
                    Button { category.wrappedValue = option } label: {
                        HStack(spacing: Letterpress.Space.s14) {
                            Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                                .font(Letterpress.ui(20, relativeTo: .body))
                                .foregroundStyle(Letterpress.ink)
                                .accessibilityHidden(true)
                            Text(option.title)
                                .font(Letterpress.ui(16, relativeTo: .body))
                                .foregroundStyle(Letterpress.ink)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .padding(.vertical, Letterpress.Space.s10)
                        .frame(minHeight: Letterpress.minTouch)
                        .overlay(alignment: .top) { LetterpressRule() }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(frozen)
                    .accessibilityAddTraits(selected ? [.isSelected] : [])
                }
                LetterpressRule()
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("urgentCategory")
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                Text("Details").letterpressEyebrow()
                TextField("Describe what's happening", text: details, axis: .vertical)
                    .lineLimit(3...8)
                    .letterpressField(isEmpty: repository.draft.description.isEmpty)
                    .accessibilityIdentifier("urgentDescription")
                    .disabled(frozen)
                Text("\(count) / 2000")
                    .font(Letterpress.data(12, weight: .regular, relativeTo: .caption))
                    .foregroundStyle(count > 2000 ? Letterpress.error : Letterpress.inkSecondary)
            }
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Button(action: send) {
                    Text(repository.sending ? "Sending…" : frozen ? "Retry" : "Send")
                }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(!canSend)
                .accessibilityIdentifier("urgentSend")
                if let error = repository.error {
                    Text(error)
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.error)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("urgentError")
                } else if !canSend && !repository.sending {
                    Text(UrgentReportCopy.disabledReason)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
            }
        }
    }

    private var canSend: Bool {
        guard !repository.sending else { return false }
        if repository.pending != nil { return true }
        let count = repository.draft.description.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count
        return repository.draft.category != nil && (1...2000).contains(count)
    }

    private func send() {
        guard canSend, let ticket = APIService.shared.access.snapshot() else { return }
        let draft = repository.draft
        let chosen = repository.pending?.category ?? draft.category ?? .other
        Task { await repository.send(category: chosen, description: draft.description, ticket: ticket) }
    }
}

private struct UrgentReportRow: View {
    let report: UrgentReport
    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
            Text(UrgentCategory(rawValue: report.category)?.title ?? UrgentCategory.other.title)
                .font(Letterpress.ui(16, weight: .medium, relativeTo: .headline))
                .foregroundStyle(Letterpress.ink)
            Text(UrgentReportCopy.meta(report))
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
            if let note = report.resolutionNote, !note.isEmpty {
                Text(note)
                    .font(Letterpress.display(16, relativeTo: .callout))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Letterpress.Space.s10)
        .overlay(alignment: .top) { LetterpressRule() }
        .accessibilityElement(children: .combine)
    }
}
```

- [ ] **Step 6: Record the omission** — append to the table in `docs/design/letterpress/deferred.md`:

```markdown
| iOS Today | Check-in "4 questions · due today" | No check-in schedule; the form loads only inside Check-in |
```

- [ ] **Step 7: Run to verify it passes, and prove the retired Today components are gone**

Run: TEST with `-only-testing:ClearAFTests/TodayPresentationTests -only-testing:ClearAFTests/SafetyTests -only-testing:ClearAFTests/EnrollmentTests -only-testing:ClearAFTests/MessagingTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: PASS (7 new tests; `careDecisionWording` unchanged).
Run: `grep -rnE "AnimatedScoreDisplay|StreakIndicator|ProgressInsight|EnhancedProgressBar|DailyPhotoCardEnhanced|DailyTasksCardEnhanced|CareLinksCard|PhotoDisplaySection|TodayPhotoActionAppearance" ClearAF ClearAFTests ClearAFUITests`
Expected: no output.

- [ ] **Step 8: Review and commit**

Dispatch `care-access-reviewer` on the staged diff (focus: Today's `messaging.resume`/`openCurrent` is read-only and ticket-bound; nothing calls `acknowledgeVisible` outside `MessagingView`; the urgent composer still freezes and retries through the repository). Fix findings, rerun Step 7.

```bash
git add ClearAF/Views/DashboardViewEnhanced.swift ClearAF/Views/CareStatusCard.swift ClearAF/Views/UrgentReportView.swift ClearAFTests/TodayPresentationTests.swift docs/design/letterpress/deferred.md
git commit -m "ios: Today with photo rail, checklist and unread note; adapt care status and urgent reports" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---
### Task 7: Notes — serif clinician turns, sunk replies, reference boxes [judgment]

**Files:**
- Create: `ClearAFTests/NotesPresentationTests.swift`
- Modify (full rewrite): `ClearAF/Views/MessagingView.swift`
- Modify: `docs/design/letterpress/deferred.md`

**Interfaces:**
- Consumes: `MessagingRepository` (`conversation`, `messages`, `draft`, `nextCursor`, `error`, `loading`, `sending`, `opened`, `resume(_:)`, `openCurrent()`, `load(older:)`, `edit(_:)`, `send()`, `acknowledgeVisible(_:)`), `AssignedMessage`, `AssignedConversation`, `MessageReference`, `MessageReferenceDetail`, `APIService.messageReference(pair:id:ticket:)`, `.messagePhotoThumbnail(id:ticket:)`; Task 1 `LetterpressFormat`, `letterpressSheetBackground()`.
- Produces: `enum NotesCopy` — `stamp(_ message: AssignedMessage, clinicianName: String, locale: Locale = .current, timeZone: TimeZone = .current) -> String`, `referenceTitle(_ reference: MessageReference, locale: Locale = .current, timeZone: TimeZone = .current) -> String`, `referenceMeta(clinicianName: String) -> String`, `count(_ characters: Int) -> String`, `sendLabel(sending: Bool, attempted: Bool) -> String`, `unreadHeader(_ count: Int) -> String?`, `emergency: String`.
- Behaviour kept verbatim: the visible-frame preference, `acknowledgeVisible` conditions (`active && scenePhase == .active && selected == nil`), `.task` resume/open, `onDisappear`, `onChange(of: selected?.id)`, the reference sheet's ticket, type and ID checks.
- Reviewers: `care-access-reviewer` (messaging view; confirm read acknowledgement and reference validation are unchanged).

- [ ] **Step 1: Write the failing test** — `ClearAFTests/NotesPresentationTests.swift`

```swift
import Foundation
import Testing
@testable import ClearAF

struct NotesPresentationTests {
    static let utc = TimeZone(identifier: "UTC")!
    static let us = Locale(identifier: "en_US")

    private func message(_ sender: String, sentAt: String = "2026-09-14T16:12:00.000Z") -> AssignedMessage {
        let patient = UUID(), clinician = UUID()
        return AssignedMessage(id: UUID(), patientId: patient, clinicianId: clinician,
                               senderId: sender == "patient" ? patient : clinician, senderType: sender,
                               recipientId: sender == "patient" ? clinician : patient,
                               recipientType: sender == "patient" ? "dermatologist" : "patient",
                               content: "Synthetic", sentAt: sentAt, unreadForMe: false, reference: nil, origin: "native")
    }

    @Test func stampsAreMonoWithTheRealClinicianName() {
        #expect(NotesCopy.stamp(message("dermatologist"), clinicianName: "Synthetic Clinician", locale: Self.us, timeZone: Self.utc)
                == "14 SEP · 16:12 · SYNTHETIC CLINICIAN")
        #expect(NotesCopy.stamp(message("patient"), clinicianName: "Synthetic Clinician", locale: Self.us, timeZone: Self.utc)
                == "14 SEP · 16:12 · YOU")
    }

    @Test func referencesAreLabelledInWords() {
        let labelled = MessageReference(type: "photo", id: UUID(), available: true, label: "Friday photo", occurredAt: nil)
        let dated = MessageReference(type: "photo", id: UUID(), available: true, label: nil, occurredAt: "2026-09-12T08:00:00.000Z")
        let routine = MessageReference(type: "routineRevision", id: UUID(), available: true, label: nil, occurredAt: nil)
        #expect(NotesCopy.referenceTitle(labelled, locale: Self.us, timeZone: Self.utc) == "Friday photo")
        #expect(NotesCopy.referenceTitle(dated, locale: Self.us, timeZone: Self.utc) == "Photo · 12 Sep")
        #expect(NotesCopy.referenceTitle(routine, locale: Self.us, timeZone: Self.utc) == "Routine feedback")
        #expect(NotesCopy.referenceMeta(clinicianName: "Synthetic Clinician") == "Referenced by Synthetic Clinician")
    }

    @Test func composerCopyCoversEachState() {
        #expect(NotesCopy.count(0) == "0 / 4000")
        #expect(NotesCopy.sendLabel(sending: false, attempted: false) == "Send")
        #expect(NotesCopy.sendLabel(sending: true, attempted: true) == "Sending…")
        #expect(NotesCopy.sendLabel(sending: false, attempted: true) == "Retry message")
        #expect(NotesCopy.unreadHeader(0) == nil)
        #expect(NotesCopy.unreadHeader(2) == "2 unread")
        #expect(NotesCopy.emergency == "Not for emergencies. Use Something's wrong? on Today.")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/NotesPresentationTests`
Expected: build FAIL — `cannot find 'NotesCopy' in scope`.

- [ ] **Step 3: Replace `ClearAF/Views/MessagingView.swift`**

```swift
import SwiftUI

enum NotesCopy {
    static let emergency = "Not for emergencies. Use Something's wrong? on Today."

    static func stamp(_ message: AssignedMessage, clinicianName: String, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let who = (message.senderType == "patient" ? "You" : clinicianName).uppercased(with: locale)
        guard let date = RoutineDates.instant(message.sentAt) else { return who }
        return "\(LetterpressFormat.stampTime(date, locale: locale, timeZone: timeZone)) · \(who)"
    }

    static func referenceTitle(_ reference: MessageReference, locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        if let label = reference.label, !label.isEmpty { return label }
        if let when = reference.occurredAt.flatMap(RoutineDates.instant) {
            return "\(reference.type == "photo" ? "Photo" : "Routine") · \(LetterpressFormat.dayMonth(when, locale: locale, timeZone: timeZone))"
        }
        return reference.type == "photo" ? "Photo feedback" : "Routine feedback"
    }

    static func referenceMeta(clinicianName: String) -> String { "Referenced by \(clinicianName)" }
    static func count(_ characters: Int) -> String { "\(characters) / 4000" }
    static func sendLabel(sending: Bool, attempted: Bool) -> String { sending ? "Sending…" : attempted ? "Retry message" : "Send" }
    static func unreadHeader(_ count: Int) -> String? { count > 0 ? "\(count) unread" : nil }
}

/// Notes (spec §6 #10, §4.7): clinician words in the display serif with a 2pt ink rule, own replies in a sunk block,
/// mono stamps, labelled reference boxes, no bubbles.
struct MessagingView: View {
    @ObservedObject private var repository = APIService.shared.messaging
    @State private var selected: AssignedMessage?
    @State private var visible: Set<UUID> = []
    @State private var active = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 0) {
                if let pair = repository.conversation {
                    header(pair)
                    GeometryReader { viewport in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: Letterpress.Space.s22) {
                                if repository.nextCursor != nil {
                                    Button("Load older") { Task { await repository.load(older: true) } }
                                        .buttonStyle(.letterpress(.underline))
                                        .frame(maxWidth: .infinity)
                                        .disabled(repository.loading)
                                }
                                if repository.messages.isEmpty && !repository.loading {
                                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                                        Text("No notes yet")
                                            .font(Letterpress.display(28, relativeTo: .title))
                                            .foregroundStyle(Letterpress.ink)
                                        Text("Write to \(pair.clinicianName) below.")
                                            .font(Letterpress.ui(15, relativeTo: .body))
                                            .foregroundStyle(Letterpress.inkSecondary)
                                    }
                                }
                                ForEach(repository.messages) { message in
                                    NoteTurn(message: message, clinicianName: pair.clinicianName) { selected = message }
                                        .background(GeometryReader { geometry in
                                            Color.clear.preference(key: VisibleMessageFrames.self, value: [message.id: geometry.frame(in: .named("messageViewport"))])
                                        })
                                }
                            }
                            .padding(.horizontal, Letterpress.Space.s22)
                            .padding(.vertical, Letterpress.Space.s18)
                        }
                        .coordinateSpace(name: "messageViewport")
                        .onPreferenceChange(VisibleMessageFrames.self) { frames in
                            visible = Set(frames.filter { $0.value.intersects(CGRect(origin: .zero, size: viewport.size)) }.keys)
                            if active && scenePhase == .active && selected == nil { Task { await repository.acknowledgeVisible(visible) } }
                        }
                    }
                    composer
                } else if repository.opened {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                        Text("No care team yet")
                            .font(Letterpress.display(28, relativeTo: .title))
                            .foregroundStyle(Letterpress.ink)
                        Text("A conversation becomes available when a clinician is assigned to your account.")
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.inkSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(Letterpress.Space.s22)
                } else {
                    Button("Open current conversation") { Task { await repository.openCurrent() } }
                        .buttonStyle(.letterpress(.outlined))
                        .padding(Letterpress.Space.s22)
                }
                statusLines
            }
            .background(Letterpress.canvas.ignoresSafeArea())
            .navigationTitle("Notes")
            .toolbar {
                Button("Refresh", systemImage: "arrow.clockwise") {
                    Task {
                        await repository.openCurrent()
                        if active && scenePhase == .active && selected == nil { await repository.acknowledgeVisible(visible) }
                    }
                }
                .disabled(repository.loading || repository.sending)
            }
            .sheet(item: $selected) { message in
                if let pair = repository.conversation { MessageReferenceView(message: message, pair: pair) }
            }
            .task {
                active = true
                guard let ticket = APIService.shared.access.snapshot() else { return }
                do { try repository.resume(ticket); await repository.openCurrent() } catch { }
            }
            .onDisappear { active = false; visible = [] }
            .onChange(of: selected?.id) { _, id in
                if id == nil && active && scenePhase == .active { Task { await repository.acknowledgeVisible(visible) } }
            }
        }
    }

    private func header(_ pair: AssignedConversation) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            HStack(alignment: .firstTextBaseline) {
                Text(pair.clinicianName).letterpressEyebrow()
                Spacer()
                if let unread = NotesCopy.unreadHeader(pair.unreadCount) {
                    Text(unread)
                        .font(Letterpress.data(11, relativeTo: .caption))
                        .foregroundStyle(Letterpress.attentionText)
                }
            }
            LetterpressRule(weight: .major)
        }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.top, Letterpress.Space.s6)
    }

    private var composer: some View {
        let content = repository.draft?.content ?? ""
        return VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            LetterpressRule()
            HStack(alignment: .bottom, spacing: Letterpress.Space.s10) {
                TextField("Write a note", text: Binding(get: { repository.draft?.content ?? "" }, set: { try? repository.edit($0) }), axis: .vertical)
                    .lineLimit(1...5)
                    .letterpressField(isEmpty: content.isEmpty)
                    .disabled(repository.sending)
                Button(NotesCopy.sendLabel(sending: repository.sending, attempted: repository.draft?.attempted == true)) {
                    Task { await repository.send() }
                }
                .buttonStyle(.letterpress(.filled))
                .disabled(repository.sending || content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            HStack(alignment: .firstTextBaseline) {
                Text(NotesCopy.emergency)
                    .font(Letterpress.ui(12, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: Letterpress.Space.s10)
                Text(NotesCopy.count(content.count))
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkTertiary)
            }
        }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.bottom, Letterpress.Space.s10)
    }

    @ViewBuilder private var statusLines: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
            if repository.loading {
                Text("Loading your notes").font(Letterpress.ui(13, relativeTo: .footnote)).foregroundStyle(Letterpress.inkSecondary)
            }
            if let error = repository.error {
                Text(error)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("messagesError")
            }
            Text("Refresh to check for new notes.")
                .font(Letterpress.ui(12, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkTertiary)
        }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.bottom, Letterpress.Space.s6)
    }
}

private struct NoteTurn: View {
    let message: AssignedMessage
    let clinicianName: String
    let openReference: () -> Void

    var body: some View {
        if message.senderType == "patient" { patient } else { clinician }
    }

    private var stamp: some View {
        Text(NotesCopy.stamp(message, clinicianName: clinicianName))
            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
            .foregroundStyle(Letterpress.inkTertiary)
    }

    private var clinician: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            if message.unreadForMe { Text("Unread").letterpressEyebrow(color: Letterpress.attentionText) }
            stamp
            Text(message.content)
                .font(Letterpress.display(17, relativeTo: .body))
                .foregroundStyle(Letterpress.ink)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            if let reference = message.reference { referenceBox(reference) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, Letterpress.Space.s14)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(message.unreadForMe ? Letterpress.attentionMark : Letterpress.ink)
                .frame(width: message.unreadForMe ? 3 : 2)
        }
    }

    private var patient: some View {
        VStack(alignment: .trailing, spacing: Letterpress.Space.s6) {
            stamp
            Text(message.content)
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.ink)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Letterpress.Space.s14)
                .background(Letterpress.sunk)
            Text("Sent")
                .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkTertiary)
            if let reference = message.reference { referenceBox(reference) }
        }
        .padding(.leading, Letterpress.Space.s44)
    }

    private func referenceBox(_ reference: MessageReference) -> some View {
        Button(action: openReference) {
            HStack(spacing: Letterpress.Space.s10) {
                Image(systemName: reference.type == "photo" ? "photo" : "checklist")
                    .font(Letterpress.ui(17, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .frame(width: 28)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text(NotesCopy.referenceTitle(reference))
                        .font(Letterpress.ui(13, weight: .medium, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.ink)
                    Text(NotesCopy.referenceMeta(clinicianName: clinicianName))
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(Letterpress.inkTertiary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .accessibilityHidden(true)
            }
            .padding(Letterpress.Space.s10)
            .frame(minHeight: Letterpress.minTouch)
            .overlay { Rectangle().strokeBorder(Letterpress.ink.opacity(0.2), lineWidth: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the linked feedback")
    }
}

private struct VisibleMessageFrames: PreferenceKey {
    static var defaultValue: [UUID: CGRect] = [:]
    static func reduce(value: inout [UUID: CGRect], nextValue: () -> [UUID: CGRect]) { value.merge(nextValue(), uniquingKeysWith: { _, new in new }) }
}

private struct MessageReferenceView: View {
    let message: AssignedMessage; let pair: AssignedConversation
    @Environment(\.dismiss) private var dismiss
    @State private var detail: MessageReferenceDetail?
    @State private var image: UIImage?
    @State private var unavailable = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
                    if unavailable {
                        Text("This referenced record is unavailable.")
                            .font(Letterpress.ui(15, relativeTo: .body)).foregroundStyle(Letterpress.inkSecondary)
                    } else if let detail {
                        Text(detail.reference.label ?? "Feedback reference")
                            .font(Letterpress.display(24, relativeTo: .title2)).foregroundStyle(Letterpress.ink)
                        if let routine = detail.routine {
                            Text("\(routine.timeOfDay.capitalized) · v\(routine.version)")
                                .font(Letterpress.data(12, weight: .regular, relativeTo: .footnote)).foregroundStyle(Letterpress.inkSecondary)
                            VStack(alignment: .leading, spacing: 0) {
                                ForEach(Array(routine.steps.enumerated()), id: \.offset) { _, step in
                                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                                        Text(step.title).font(Letterpress.ui(16, weight: .medium, relativeTo: .headline)).foregroundStyle(Letterpress.ink)
                                        Text(step.instructions).font(Letterpress.ui(13, relativeTo: .footnote)).foregroundStyle(Letterpress.inkSecondary)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, Letterpress.Space.s10)
                                    .overlay(alignment: .top) { LetterpressRule() }
                                }
                                LetterpressRule()
                            }
                        }
                        if let photo = detail.photo {
                            Text(RoutineDates.instant(photo.captureDate).map { LetterpressFormat.stampYearTime($0) } ?? photo.captureDate)
                                .font(Letterpress.data(12, relativeTo: .footnote)).foregroundStyle(Letterpress.ink)
                            if let image {
                                Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("Referenced photo")
                            } else {
                                Text("Photo preview unavailable.")
                                    .font(Letterpress.ui(15, relativeTo: .body)).foregroundStyle(Letterpress.inkSecondary)
                            }
                        }
                    } else {
                        Text("Loading the linked feedback")
                            .font(Letterpress.ui(15, relativeTo: .body)).foregroundStyle(Letterpress.inkSecondary)
                    }
                }
                .padding(Letterpress.Space.s22)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Linked feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Done") { dismiss() } }
            .task {
                let api = APIService.shared
                guard let ticket = api.access.snapshot(), let reference = message.reference else { unavailable = true; return }
                do {
                    let result = try await api.messageReference(pair: pair, id: message.id, ticket: ticket)
                    try api.access.require(ticket); try Task.checkCancellation()
                    guard result.reference.id == reference.id, result.reference.type == reference.type, result.reference.available else { unavailable = true; return }
                    if reference.type == "routineRevision" { guard let routine = result.routine, routine.id == reference.id, routine.userId == pair.patientId else { unavailable = true; return } }
                    else if reference.type == "photo" {
                        guard result.photo?.id == reference.id else { unavailable = true; return }
                        let bytes = try await api.messagePhotoThumbnail(id: reference.id, ticket: ticket)
                        try api.access.require(ticket); try Task.checkCancellation(); image = UIImage(data: bytes)
                    } else { unavailable = true; return }
                    detail = result
                } catch { unavailable = true }
            }
        }
        .letterpressSheetBackground()
    }
}
```

- [ ] **Step 4: Record the omission** — append to the table in `docs/design/letterpress/deferred.md`:

```markdown
| iOS Notes | "Attach a photo" | Patient notes carry no photo reference; the client rejects a patient message with one |
```

- [ ] **Step 5: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/NotesPresentationTests -only-testing:ClearAFTests/MessagingTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: PASS (3 new tests; `MessagingTests` unchanged).

- [ ] **Step 6: Review and commit**

Dispatch `care-access-reviewer` on the staged diff (compare the old and new `MessagingView` acknowledgement and reference-validation lines; they must be logically identical). Fix findings, rerun Step 5.

```bash
git add ClearAF/Views/MessagingView.swift ClearAFTests/NotesPresentationTests.swift docs/design/letterpress/deferred.md
git commit -m "ios: Notes with serif clinician turns, sunk replies and reference boxes" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: PR 3 verification [mechanical]

**Files:** none, unless a check fails (fix, then rerun only that check).

- [ ] **Step 1: iOS unit tests and UI-test compile**

Run:
```bash
xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
  -derivedDataPath /tmp/clearaf-build-lp3 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  -only-testing:ClearAFTests test | xcbeautify
```
Expected: build succeeds (the `ClearAFUITests` target compiles with the renamed tabs, capture item, review-sheet taps and status predicates); every `ClearAFTests` suite passes, including `LetterpressSweepTests`, `LetterpressPrimitivesTests`, and the new `LetterpressFormatTests`, `LetterpressChromeTests`, `AppTabTests`, `PhotoRecordTests`, `PhotoReviewSheetTests`, `RoutinePresentationTests`, `TodayPresentationTests`, `NotesPresentationTests`.

- [ ] **Step 2: Scope fence check**

Run: `git diff --stat origin/main...HEAD -- ClearAF/Services backend supabase web-portal`
Expected: exactly one line, `ClearAF/Services/PhotoReviewIndex.swift | … +` (new file). Any other path is a scope violation: revert it.

- [ ] **Step 3: Bounded visual pass** (one pass; fix regressions only, no new structure)

Seed a local synthetic patient with an assigned morning and evening routine, at least 30 photos in mixed states and one unread clinician note (existing loopback fixtures under `scripts/`). Using the `xcodebuildmcp-cli` skill, build and run on the iPhone 17 simulator and take screenshots in light and dark, plus Today and Record at the largest accessibility text size. Record pass/fail per bullet for the PR description:
- Tab bar: Today · Record · Capture · Plan · Notes in the native bar; mono labels; ink selection; tapping Capture opens the capture sheet and the previous tab stays selected; Notes shows the unread badge.
- Today: date eyebrow, serif greeting with italic name, 2pt ink rule; Something's wrong? ruled row with no red; photo rail with TODAY slot or three 4:5 tiles; checklist ticks and un-ticks locally; exactly one filled button (Record this morning/evening); unread note with ochre bar and `Unread · {clinician}`; bordered Check-in row.
- Record: count line, native Grid/List segmented, month eyebrows with hairline rules, 3-column 4:5 tiles with mono dates and `On device` / `Waiting to share` (ochre text) / `Shared` / `Reviewed` / `Couldn't share` + Retry; `Page 1 of 2` with outlined Previous/Next; photo detail shows the uncropped photo.
- Capture → Choose from Library (Simulator): review sheet shows a 4:5 fitted preview with ink border, `15 SEP 2026 · 07:12`-style stamp, Retake, optional note on a baseline rule, one filled Save to record, sentence under it; swipe-down does not dismiss; Discard asks first; after Save the new tile reads Waiting to share, then Shared.
- Plan: Morning/Evening segmented; serif routine name with `V4`; ruled checklist; Record button; status sentence; version note; `Last checked …` ochre eyebrow only when offline; Completion history row with 14 bars (today outlined) and "N of the last 14 days"; row opens the calendar.
- Notes: clinician eyebrow + 2pt rule header; serif clinician turns with ink rule (ochre bar while unread), sunk patient blocks with `YOU` stamps and `Sent`; reference box opens Linked feedback; baseline-rule composer with filled Send and `0 / 4000`.
- Urgent sheet (from Today): Emergency block with ink rule, radio rows, Details field with count, filled Send, recent reports in words.
- Every screen: no purple, blue, teal or red; no card shadows; buttons ≥ 44pt; largest text size doesn't clip (Record grid becomes one column, pagination stacks).
- Reduce Transparency on: tab bar and sheets become opaque and remain legible.

- [ ] **Step 4: §8 acceptance checklist** for Today, Record, After the camera, Plan, Notes (spec §8): mark each item pass/fail in the PR description, citing the Step 3 screenshot.

- [ ] **Step 5: Review agents**

`care-access-reviewer` on the whole branch diff (photo record reviewed lookup, capture review stage, Today's conversation read, Notes). `api-contract-checker` is not required: no request or response shape changed and the backend is untouched; state that in the PR. Run `/code-review` on the branch.

---

## Carry-ins from the PR 2 iOS review (apply inside the named task)

- **Task 2** (`ContentView.swift`): the photo persistence error banner currently uses `.regularMaterial`. Replace it with a solid `Letterpress.surface` fill and a 1px rule; error messages are reading surfaces, not glass chrome (spec §4.8).
- **Task 3** (photo tiles): the Share/Retry button inside compact grid cells inherits the 16pt, 44pt-tall button style. Add a compact button size that keeps a 44pt hit area without growing the tile, and use it there.
- **Task 3** (`LetterpressPicker`): segmented fonts are resolved once at launch, so a live Dynamic Type change doesn't rescale them. Re-resolve on `dynamicTypeSize` changes, or document why that can't be done.
- **Task 6** (`UrgentReportView.swift` emergency notice row): it lost its red wash in PR 2. Restore emphasis without a hue: a 2px ink leading rule, medium-weight title, and the existing error-coloured icon.
- **Task 6** (roadmap): `EnrollmentView` is not in this PR; PR 6 adapts it with sign-in and onboarding.
