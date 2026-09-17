# Letterpress PR 6: iOS Secondary Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the iOS completion calendar (three-state cells), weekly check-in (one question per screen), profile and reminders (one ruled pushed list), sign in, password recovery, onboarding (five steps) and enrollment to Letterpress 1.0, without changing repositories, auth flows, check-in form versioning or the completion API.

**Architecture:** Each screen takes its copy and state mapping from a small pure helper (`CompletionCalendarCopy`, `CalendarCellStyle`, `CheckInFlow`, `AuthForm`, `RecoveryForm`, `ReminderCopy`, `ProfileCopy`, `CareTeamLookup`, `OnboardingStep`/`OnboardingCopy`, `EnrollmentCopy`), tested with Swift Testing. Views are rewritten on the PR 2 primitives plus three shared form pieces added here (`LetterpressProgressRule`, `LetterpressRadioRow`, `LetterpressLabeledField`). Every data call already exists: `/care-support/calendar` (per-day morning/evening counts, verified in `backend/src/services/careSupport.ts` `calendar()`), `/care-support/calendar/events`, the check-in repository's on-disk draft, and `GET /assigned-messages/current` for the care-team name. No backend change, no response-shape change, no `ClearAF/Services` change.

**Tech Stack:** SwiftUI (deployment target 18.5, Swift 5 mode), Swift Testing, XCUITest.

**Spec:** `docs/design/letterpress/spec.md` (authority: §0, §2, §3, §4.1–4.6, §4.8, §5, §6 iOS rows 1, 2, 8, 9, 11 and the tab-bar paragraph on pushed views, §7, §8). Master plan `docs/superpowers/plans/2026-09-17-letterpress-redesign.md` (Global Constraints, Owner decisions, PR 6 roadmap row). PR 3 plan `docs/superpowers/plans/2026-09-17-letterpress-pr3-ios-core.md` (Interfaces: `AppTab`, `LetterpressFormat`, `AdherenceDayState`/`AdherenceWindow`, `TodayCopy.initials`, `UrgentReportEntry(horizontalPadding:)`, `letterpressSheetBackground()`; Today pushes `CheckInView` and presents `ProfileView`; Plan pushes `CompletionCalendarView`). Merged primitives in `ClearAF/Views/Letterpress*.swift` win over PR 2 plan text. Mockup values from `docs/design/letterpress/mobile.dc.html` screens 1, 2, 8, 9, 11.

## Global Constraints

- Everything in the master plan's Global Constraints applies: no schema/RLS/auth/API change; no score, streak, grade, celebration, emoji or promised outcome; ink is the action colour; radii 0 · 4 · 26 · 999 only; sentence case, no exclamation marks; patient dates written out ("15 Sep"), mono stamps uppercase ("15 SEP · 07:12").
- **Untouched behaviour:** every file in `ClearAF/Services/` stays byte-identical. Check-in form versioning, required flags and the draft file (`CheckInRepository.start/update/prepare/send`), reminder scheduling (`ReminderRepository.save`), sign-in/sign-up/recovery calls in `SupabaseService`, `APIService.finishOnboarding/updateName/updateRecoveredPassword/logout`, and enrollment repository calls keep their current code paths. Completion timezone handling is unchanged: calendar dates are the server's reported `localDate`; event times are displayed in the completion's own reported `timeZone`.
- **Ochre:** none on these screens. The mockup's ochre `ASSIGNED` chip is set in ink mono (ochre is only for unread and prescription).
- **One filled ink button per screen:** Calendar = none needed (read-only record, no primary action; noted in §8 pass), Check-in question = Next question / Review answers, review = Send check-in, sent = Done; Profile = Save name (only while the name is edited); Reminders = Save reminders; Sign in = Sign in / Create account; Recovery = Update password; Onboarding = Continue / Save reminders and continue / Finish; Enrollment screening = Continue, not eligible = Notify me (or Update my answers once waitlisted), consent = I understand and agree.
- iOS buttons use `.buttonStyle(.letterpress(...))` (pinned 44pt). Fields use `.letterpressField(isEmpty:)` via `LetterpressLabeledField`. Rules use `LetterpressRule`. Eyebrows use `.letterpressEyebrow()`. Spacing uses `Letterpress.Space.*`. Toggles use `.tint(Letterpress.toggleOn)` (PR 2 carry-in: meets 3:1 against thumb and paper in both appearances). No new colour values.
- **Pushed views** (`CompletionCalendarView`, `CheckInView`, `CheckInHistoryView`, `ProfileView`, `ReminderSettingsView`) own no `NavigationStack`, call `.toolbar(.hidden, for: .tabBar)` and `.toolbar(.visible, for: .navigationBar)`, and add no bottom spacer or bottom safe-area inset. `PushedScreenTests` enforces this.
- Accessibility: every multi-line text uses `.fixedSize(horizontal: false, vertical: true)`; horizontal button pairs become vertical at accessibility sizes; the calendar grid becomes a ruled day list at accessibility sizes; no custom animations (Reduce Motion needs no special case); no glass or materials added (Reduce Transparency unaffected).
- Omitted, not faked (owner decision 1 and `deferred.md`): auto-share, keep originals, PDF export; magic-link sign-in (no send side exists); check-in "due today" and "Save draft" button; clinician credentials line and "photo guide" on onboarding. Tasks 2, 3 and 5 append rows to `docs/design/letterpress/deferred.md`.
- The PR 2 sweep test `ClearAFTests/LetterpressSweepTests.swift` must stay green: no `.red/.blue/.white/.black/.gray…`, no `cornerRadius: <number>`, no `.foregroundStyle(.secondary)`, no `.shadow(`, no retired names.
- Never read `.env*` (except `.env.example`), `.local/`, `handoff-*/` or `Local.generated.xcconfig`.
- iOS test command (referred to below as **TEST**, with suites appended as `-only-testing:ClearAFTests/<Suite>`):
  ```bash
  xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
    -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
    -derivedDataPath /tmp/clearaf-build-lp6 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
    -only-testing:ClearAFTests/<Suite> test | xcbeautify
  ```
  The test action also builds `ClearAFUITests`, so UI-test edits must compile in the task that makes them.
- Every commit message ends with a blank line then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (use a second `-m`).

## Decisions made while planning

1. **No API added.** `GET /care-support/calendar?month=` already returns `{ month, days: [{ localDate, morning, evening }] }` from real completion rows (a SQL `count(*) FILTER (WHERE timeOfDay=…)` per reported local date). Both → solid ink cell, one → half-split cell, none → `sunk` cell, exactly the PR 3 `AdherenceWindow.build` mapping, which the calendar reuses. The per-day list uses the existing `/care-support/calendar/events` (paginated, 20 per page).
2. **Calendar count is mono, not serif.** The mockup sets "24" in Newsreader; §8 requires every number in mono with tabular figures. The count reads "24" + "OF 30 DAYS" where 30 is the days elapsed in the month (all days for a past month). The sentence names the split: "Both routines recorded on 18 days, one routine on 6 days, none on 6 days." No percentage.
3. **Calendar cell treatments** (all ≥ 4.5:1, tested): both = ink fill, `canvas` number; one = top half ink, bottom half `sunk`, `ink` number in the bottom half; none = `sunk` fill, `ink.tertiary` number; future = no fill, `ink.future` number (never on `sunk`); today = 1.5pt ink outline with the day's fill inset 3pt (today with none = no fill, `ink` number). Selected day = 2pt ink bar under the cell. The week starts on the locale's `firstWeekday` (mockup is Monday-first). "Next month" is shown only while viewing a past month.
4. **Check-in draft already exists.** `CheckInRepository` writes the draft to `Application Support/Accounts/<id>/check-in.json` on every `update`. So there is no "Save draft" button: the header states "Draft saved on this device". The page index is view state; on open it resumes at the first unanswered question (or the review page once submitted). Required questions block "Next question" with a spoken reason; the review page lists every answer, each row returns to its question, and "Send check-in" uses the unchanged `CheckInValidation.answers` gate then `prepare` + `send`. Tapping a selected option on an optional question clears it (the old picker's "Choose an option").
5. **Magic link omitted.** `SupabaseService` has `handleCallback` (exchanges a PKCE code for confirmation and recovery links) and `verifyOTP`, but no send side (`signInWithOTP`). Adding one is an auth-flow change (§0). Recorded in `deferred.md`.
6. **Sign-in errors are inline, not an alert** (§5 error: keep the work, name the problem). "Forgot password" is always enabled; with an empty email it tells you to enter one instead of silently disabling. Self sign-up stays (mockup's "Invited by a practice?" copy describes a flow that doesn't exist). Placeholders are examples only (`name@example.com`); UI tests move to identifiers `authName`, `authEmail`, `authPassword`, `authForgotPassword`, `recoveryPassword`.
7. **Wordmark placeholder** `ClearAFWordmark`: "clear" + italic "af" in Newsreader Light 22, tracking 0.18em, lowercase, accessibility label "ClearAF". PR 8 replaces it with the lockup.
8. **Profile is pushed from Today** (`navigationDestination(isPresented:)` replaces PR 3's sheet); "Close profile" becomes the system back button. The ruled list: header (initials, serif name, "PATIENT SINCE 30 JUL 2026" from `currentUser.createdAt`) → Care team → Reminders → Account (name, email, account removal) → Sign out + version meta. Reminders show as summary rows (title, schedule, mono time or Off) that push `ReminderSettingsView`, which keeps the existing explicit Save (it asks for notification permission, so toggling on Profile must not schedule silently).
9. **Care team name from real data:** `GET /assigned-messages/current` (existing, `requirePatient`, read-only) returns the assigned `clinicianName`. `CareTeamLookup` maps it to assigned / no clinician yet / couldn't load, and a failed refresh keeps a name already shown. The mockup's "MD · Medical & cosmetic dermatology" credential line has no data and is omitted.
10. **Onboarding has five real steps:** 01 what you'll do, 02 who reads your record (care team row), 03 what stays private, 04 reminder times (the shared `ReminderRows`; the button saves only if something changed), 05 your name (`finishOnboarding`, unchanged). "Skip" jumps to step 05 because the name is required. The mockup's "Everything you record is private until you share it" is false (photos share after upload, `deferred.md`) and "We hold the last one up as a guide" contradicts §6 #4 (no capture overlay); both are replaced with accurate copy. The primary button row is pinned below the scroll view at non-accessibility sizes so the step header and action stay visible. The urgent-report entry and Sign out move from ContentView's overlay into the onboarding footer; `UrgentReportButton` becomes unused and is deleted.
11. **Enrollment** keeps its `List` for the native navigation-link state picker, but in `.plain` style on canvas with rule-tinted separators; the pregnancy question becomes `LetterpressRadioRow`s (UI test still taps "None of these" until selected). Not-eligible and consent drop the surface card for rules, a serif title and exactly one filled button.
12. **Spec/mockup contradictions ruled:** §6 #1 says magic link is "already supported" (it isn't, decision 5); mockup mono uppercase "SKIP" vs §2 "control labels never mono, never uppercase" (spec wins: Plex "Skip"); mockup 10px weekday letters vs §2's 11pt floor (spec wins: 11); mockup ochre "ASSIGNED" chips vs §1 ochre-only rule (spec wins); mockup profile note "the app has all four behaviours today" (false, `deferred.md`).

## File map

| File | Task | Responsibility |
|---|---|---|
| `ClearAF/Views/CompletionCalendarView.swift` | 1 | `CalendarCell`, `CalendarTally`, `CompletionCalendarCopy`, `CalendarCellStyle`, calendar screen, day events (replaces `CompletionDayView`) |
| `ClearAFTests/CompletionCalendarTests.swift` | 1 | Cells, tally, grid offsets, labels, event copy, cell contrast |
| `ClearAFTests/PushedScreenTests.swift` | 1, 2, 4 | Pushed views hide the tab bar, own no stack, no bottom spacer; Today pushes Profile; toggles tinted |
| `ClearAF/Views/LetterpressForm.swift` | 2 | `LetterpressProgressRule`, `LetterpressRadioRow`, `LetterpressLabeledField` |
| `ClearAF/Views/CheckInView.swift` | 2 | `CheckInFlow`, one-question check-in, `CheckInHistoryView` |
| `ClearAFTests/CheckInFlowTests.swift` | 2 | `CheckInFlowTests`, `LetterpressFormTests` |
| `ClearAF/Views/AuthenticationView.swift` | 3 | `AuthForm`, `ClearAFWordmark`, sign in / create account (replaces `CustomTextField`) |
| `ClearAF/Views/PasswordRecoveryView.swift` | 3 | `RecoveryForm`, new-password screen |
| `ClearAFTests/AuthPresentationTests.swift` | 3 | Validation, labels, copy rules |
| `ClearAF/Views/CareTeam.swift` | 4 | `CareTeamState`, `CareTeamLookup`, `CareTeamRow` |
| `ClearAF/Views/ProfileView.swift` | 4 | `ProfileCopy`, ruled profile list |
| `ClearAF/Views/ReminderSettingsView.swift` | 4 | `ReminderCopy`, `ReminderSummaryRow`, `ReminderRows`, reminders screen |
| `ClearAF/Views/DashboardViewEnhanced.swift` | 4 | Profile sheet → push (one modifier) |
| `ClearAFTests/ProfilePresentationTests.swift` | 4 | Reminder summaries, profile copy, care-team lookup |
| `ClearAF/Views/OnboardingView.swift` | 5 | `OnboardingStep`, `OnboardingCopy`, five-step onboarding |
| `ClearAF/ContentView.swift`, `ClearAF/Views/UrgentReportView.swift` | 5 | Drop onboarding overlay; delete `UrgentReportButton` |
| `ClearAFTests/OnboardingTests.swift` | 5 | Steps, counters, copy, button labels |
| `ClearAF/Views/EnrollmentView.swift` | 6 | Adapted screening, not eligible, consent |
| `ClearAFTests/EnrollmentTests.swift` | 6 | Append `EnrollmentCopyTests` |
| `ClearAFUITests/AccountFlowUITests.swift`, `ClearAFUITests/MVPExperienceUITests.swift` | 3, 4, 5 | Field identifiers, profile back/scroll, five-step onboarding |
| `docs/design/letterpress/deferred.md` | 2, 3, 5 | New omitted controls |

---

### Task 1: Completion calendar — three-state cells and the day's events [judgment]

**Files:**
- Create: `ClearAFTests/CompletionCalendarTests.swift`, `ClearAFTests/PushedScreenTests.swift`
- Modify (full rewrite): `ClearAF/Views/CompletionCalendarView.swift`

**Interfaces:**
- Consumes (PR 3): `AdherenceDayState { both, one, neither }`, `AdherenceWindow.build(dates:calendars:)`, `LetterpressFormat.monthYear/dayMonth/weekdayDayMonth(_:locale:timeZone:)`. Existing: `CompletionCalendar`, `CompletionCalendarEvent`, `CareRoutineCompletion`, `CareRoutineRevision`, `RoutineTimeOfDay`, `SupportDates.days(_:)`, `RoutineDates.localDate(_:zone:)`, `RoutineDates.instant(_:)`, `APIService.fetchCompletionCalendar(month:ticket:)`, `APIService.fetchCompletionDay(date:page:ticket:)`; test helpers `LetterpressTests.resolved(_:_:)`, `.contrast(_:_:)`, `LetterpressSweepTests.sources(in:)`.
- Produces:
  - `enum CalendarCell: Equatable { case recorded(AdherenceDayState), future }`; `struct CalendarTally: Equatable { both, one, neither; recorded; elapsed }`.
  - `enum CompletionCalendarCopy` — `footnote`, `cells(month:calendar:today:) -> [CalendarCell]`, `tally(_:) -> CalendarTally`, `countLabel(_:) -> String`, `sentence(_:) -> String`, `leadingBlanks(month:firstWeekday:) -> Int`, `weekdaySymbols(firstWeekday:locale:) -> [String]`, `defaultSelection(month:cells:today:) -> String?`, `monthTitle(_:locale:)`, `eyebrow(_:locale:)`, `stateWords(_:)`, `dayLabel(_:cell:isToday:locale:)`, `eventTime(_ completion: CareRoutineCompletion) -> String`, `eventTitle(_ routine:)`, `eventMeta(_ routine:)`, `missingSlots(recorded:date:today:) -> [String]`, `date(_ localDate: String) -> Date?`.
  - `enum CalendarCellStyle` — `enum Fill: Equatable { case none, solid(String), split(top: String, bottom: String) }`, `fill(_:isToday:)`, `text(_:isToday:) -> String`, `background(_:isToday:) -> String`, `todayOutline: CGFloat` (1.5), `todayInset: CGFloat` (3).
  - `CompletionCalendarView()` initialiser unchanged (PR 3 `AdherenceStripRow` pushes it). `CompletionDayView` is removed.
  - `struct PushedScreenTests` with `static let pushed: [String]`.
- Reviewers: per-task review (state mapping). No access or shape change: both calls are the ones the screen already made.

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/CompletionCalendarTests.swift`

```swift
import Foundation
import Testing
import UIKit
@testable import ClearAF

struct CompletionCalendarTests {
    static let us = Locale(identifier: "en_US")

    private func september(_ days: [CompletionCalendar.Day]) -> CompletionCalendar {
        CompletionCalendar(month: "2026-09", days: days)
    }

    private func routine(_ slot: RoutineTimeOfDay) -> CareRoutineRevision {
        CareRoutineRevision(id: UUID(), userId: UUID(), timeOfDay: slot, version: 4, createdBy: UUID(),
                            createdAt: "2026-09-02T09:00:00.000Z", name: "Synthetic Morning Routine", isActive: true,
                            steps: [CareRoutineStep(title: "Step", instructions: "")])
    }

    @Test func cellsAreBothOneNoneOrFutureFromRealCounts() {
        let calendar = september([
            CompletionCalendar.Day(localDate: "2026-09-01", morning: 1, evening: 1),
            CompletionCalendar.Day(localDate: "2026-09-02", morning: 0, evening: 2),
        ])
        let cells = CompletionCalendarCopy.cells(month: "2026-09", calendar: calendar, today: "2026-09-04")
        #expect(cells.count == 30)
        #expect(cells[0] == .recorded(.both))
        #expect(cells[1] == .recorded(.one))
        #expect(cells[2] == .recorded(.neither))
        #expect(cells[3] == .recorded(.neither))
        #expect(cells[4] == .future)
        #expect(cells[29] == .future)
    }

    @Test func tallyCountsElapsedDaysAndNeverGrades() {
        let tally = CompletionCalendarCopy.tally([.recorded(.both), .recorded(.one), .recorded(.neither), .recorded(.neither), .future])
        #expect(tally == CalendarTally(both: 1, one: 1, neither: 2))
        #expect(tally.recorded == 2 && tally.elapsed == 4)
        #expect(CompletionCalendarCopy.countLabel(tally) == "of 4 days")
        #expect(CompletionCalendarCopy.sentence(tally) == "Both routines recorded on 1 day, one routine on 1 day, none on 2 days.")
        #expect(CompletionCalendarCopy.sentence(CalendarTally(both: 0, one: 0, neither: 3)) == "No completions recorded this month.")
        #expect(!CompletionCalendarCopy.sentence(tally).contains("%"))
    }

    @Test func gridStartsOnTheLocaleFirstWeekday() {
        // 1 September 2026 is a Tuesday.
        #expect(CompletionCalendarCopy.leadingBlanks(month: "2026-09", firstWeekday: 1) == 2)
        #expect(CompletionCalendarCopy.leadingBlanks(month: "2026-09", firstWeekday: 2) == 1)
        #expect(CompletionCalendarCopy.weekdaySymbols(firstWeekday: 2, locale: Self.us) == ["M", "T", "W", "T", "F", "S", "S"])
        #expect(CompletionCalendarCopy.weekdaySymbols(firstWeekday: 1, locale: Self.us).first == "S")
    }

    @Test func selectionDefaultsToTodayOrTheLastRecordedDay() {
        let cells: [CalendarCell] = [.recorded(.both), .recorded(.neither), .recorded(.one), .recorded(.neither)]
            + Array(repeating: .recorded(.neither), count: 27)
        #expect(CompletionCalendarCopy.defaultSelection(month: "2026-09", cells: Array(cells.prefix(30)), today: "2026-09-17") == "2026-09-17")
        #expect(CompletionCalendarCopy.defaultSelection(month: "2026-08", cells: cells, today: "2026-09-17") == "2026-08-03")
        #expect(CompletionCalendarCopy.defaultSelection(month: "2026-08", cells: Array(repeating: .recorded(.neither), count: 31), today: "2026-09-17") == nil)
    }

    @Test func labelsAreWrittenOutAndSpeakTheState() {
        #expect(CompletionCalendarCopy.monthTitle("2026-09", locale: Self.us) == "September 2026")
        #expect(CompletionCalendarCopy.eyebrow("2026-09-15", locale: Self.us) == "15 Sep")
        #expect(CompletionCalendarCopy.dayLabel("2026-09-15", cell: .recorded(.one), isToday: true, locale: Self.us) == "Tue 15 Sep, one routine recorded, today")
        #expect(CompletionCalendarCopy.dayLabel("2026-09-17", cell: .future, isToday: false, locale: Self.us) == "Thu 17 Sep, upcoming")
    }

    @Test func eventsUseTheReportedTimeZoneAndNameMissingSlots() {
        let completion = CareRoutineCompletion(id: UUID(), userId: UUID(), revisionId: UUID(),
                                               completedAt: "2026-09-15T12:14:00.000Z", localDate: "2026-09-15",
                                               timeZone: "America/Chicago", receivedAt: "2026-09-15T12:15:00.000Z")
        #expect(CompletionCalendarCopy.eventTime(completion) == "07:14")
        #expect(CompletionCalendarCopy.eventTitle(routine(.morning)) == "Morning recorded")
        #expect(CompletionCalendarCopy.eventMeta(routine(.morning)) == "Synthetic Morning Routine · V4")
        #expect(CompletionCalendarCopy.missingSlots(recorded: [.morning], date: "2026-09-15", today: "2026-09-15") == ["Evening not recorded yet"])
        #expect(CompletionCalendarCopy.missingSlots(recorded: [], date: "2026-09-14", today: "2026-09-15") == ["Morning not recorded", "Evening not recorded"])
    }

    @Test func cellNumbersMeetContrastOnWhatSitsBehindThemInBothAppearances() {
        let cases: [(CalendarCell, Bool)] = [(.recorded(.both), false), (.recorded(.one), false), (.recorded(.neither), false), (.future, false),
                                             (.recorded(.both), true), (.recorded(.one), true), (.recorded(.neither), true)]
        #expect(CalendarCellStyle.fill(.future, isToday: false) == .none)
        #expect(CalendarCellStyle.text(.future, isToday: false) == "lp.ink.future")
        #expect(CalendarCellStyle.fill(.recorded(.one), isToday: false) == .split(top: "lp.ink", bottom: "lp.sunk"))
        for style in [UIUserInterfaceStyle.light, .dark] {
            for (cell, isToday) in cases {
                let text = LetterpressTests.resolved(CalendarCellStyle.text(cell, isToday: isToday), style)
                let background = LetterpressTests.resolved(CalendarCellStyle.background(cell, isToday: isToday), style)
                #expect(LetterpressTests.contrast(text, background) >= 4.5, "\(cell) today=\(isToday) \(style.rawValue)")
                if CalendarCellStyle.text(cell, isToday: isToday) == "lp.ink.future" {
                    #expect(CalendarCellStyle.background(cell, isToday: isToday) != "lp.sunk")
                }
            }
        }
    }
}
```

`ClearAFTests/PushedScreenTests.swift`:

```swift
import Foundation
import Testing

/// Pushed detail views (spec §6 tab bar, §8): no tab bar, no bottom spacer, no nested navigation stack.
struct PushedScreenTests {
    static let pushed = ["CompletionCalendarView.swift"]

    @Test func pushedScreensHideTheTabBarAndNestNoNavigationStack() throws {
        let files = try LetterpressSweepTests.sources(in: ["ClearAF/Views"])
        for name in Self.pushed {
            let file = try #require(files.first { $0.path.hasSuffix("/" + name) }, "\(name) not found")
            #expect(file.text.contains(".toolbar(.hidden, for: .tabBar)"), "\(name) must hide the tab bar")
            #expect(file.text.contains(".toolbar(.visible, for: .navigationBar)"), "\(name) must show its back button")
            #expect(!file.text.contains("NavigationStack"), "\(name) is pushed and must not own a NavigationStack")
            #expect(!file.text.contains("safeAreaInset(edge: .bottom"), "\(name) must not add a bottom spacer")
        }
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/CompletionCalendarTests -only-testing:ClearAFTests/PushedScreenTests`
Expected: build FAIL — `cannot find 'CompletionCalendarCopy' in scope`.

- [ ] **Step 3: Replace `ClearAF/Views/CompletionCalendarView.swift`**

```swift
import SwiftUI

/// A day in the completion calendar (spec §4.6): recorded state for today and earlier, future after today.
enum CalendarCell: Equatable {
    case recorded(AdherenceDayState)
    case future
}

struct CalendarTally: Equatable {
    let both: Int
    let one: Int
    let neither: Int
    var recorded: Int { both + one }
    var elapsed: Int { both + one + neither }
}

/// Copy and state for the calendar. Counts only; never a percentage, grade or target (spec §4.6, §7).
enum CompletionCalendarCopy {
    static let footnote = "Shows completions that reached your care team. Anything still waiting to upload is listed on Plan."
    private static let utc = TimeZone(identifier: "UTC")!

    /// Server per-day counts mapped exactly as the 14-day strip maps them; days after today are future.
    static func cells(month: String, calendar: CompletionCalendar, today: String) -> [CalendarCell] {
        let dates = SupportDates.days(month)
        let states = AdherenceWindow.build(dates: dates, calendars: [calendar]).states
        return zip(dates, states).map { date, state in date > today ? .future : .recorded(state) }
    }

    static func tally(_ cells: [CalendarCell]) -> CalendarTally {
        var both = 0, one = 0, neither = 0
        for cell in cells {
            switch cell {
            case .recorded(.both): both += 1
            case .recorded(.one): one += 1
            case .recorded(.neither): neither += 1
            case .future: break
            }
        }
        return CalendarTally(both: both, one: one, neither: neither)
    }

    /// Set under the mono count and uppercased by the view: "OF 30 DAYS".
    static func countLabel(_ tally: CalendarTally) -> String { "of \(tally.elapsed) \(tally.elapsed == 1 ? "day" : "days")" }

    static func sentence(_ tally: CalendarTally) -> String {
        guard tally.recorded > 0 else { return "No completions recorded this month." }
        return "Both routines recorded on \(days(tally.both)), one routine on \(days(tally.one)), none on \(days(tally.neither))."
    }

    private static func days(_ count: Int) -> String { count == 1 ? "1 day" : "\(count) days" }

    static func leadingBlanks(month: String, firstWeekday: Int) -> Int {
        guard let first = date("\(month)-01") else { return 0 }
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.timeZone = utc
        return (gregorian.component(.weekday, from: first) - firstWeekday + 7) % 7
    }

    static func weekdaySymbols(firstWeekday: Int, locale: Locale) -> [String] {
        var gregorian = Calendar(identifier: .gregorian)
        gregorian.locale = locale
        let symbols = gregorian.veryShortStandaloneWeekdaySymbols
        return (0..<7).map { symbols[(firstWeekday - 1 + $0) % 7] }
    }

    static func defaultSelection(month: String, cells: [CalendarCell], today: String) -> String? {
        let dates = SupportDates.days(month)
        if dates.contains(today) { return today }
        return zip(dates, cells).last(where: { $0.1 == .recorded(.both) || $0.1 == .recorded(.one) })?.0
    }

    static func monthTitle(_ month: String, locale: Locale = .current) -> String {
        date("\(month)-01").map { LetterpressFormat.monthYear($0, locale: locale, timeZone: utc) } ?? month
    }

    static func eyebrow(_ localDate: String, locale: Locale = .current) -> String {
        date(localDate).map { LetterpressFormat.dayMonth($0, locale: locale, timeZone: utc) } ?? localDate
    }

    static func stateWords(_ cell: CalendarCell) -> String {
        switch cell {
        case .recorded(.both): "both routines recorded"
        case .recorded(.one): "one routine recorded"
        case .recorded(.neither): "no completion recorded"
        case .future: "upcoming"
        }
    }

    static func dayLabel(_ localDate: String, cell: CalendarCell, isToday: Bool, locale: Locale = .current) -> String {
        let day = date(localDate).map { LetterpressFormat.weekdayDayMonth($0, locale: locale, timeZone: utc) } ?? localDate
        return "\(day), \(stateWords(cell))\(isToday ? ", today" : "")"
    }

    /// 24-hour time in the zone the patient reported with the completion, so it agrees with its local date.
    static func eventTime(_ completion: CareRoutineCompletion) -> String {
        guard let instant = RoutineDates.instant(completion.completedAt) else { return "—" }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: completion.timeZone) ?? .current
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: instant)
    }

    static func eventTitle(_ routine: CareRoutineRevision) -> String { "\(routine.timeOfDay.title) recorded" }

    static func eventMeta(_ routine: CareRoutineRevision) -> String { "\(routine.name) · V\(routine.version)" }

    static func missingSlots(recorded: [RoutineTimeOfDay], date: String, today: String) -> [String] {
        RoutineTimeOfDay.allCases.filter { !recorded.contains($0) }
            .map { "\($0.title) not recorded\(date == today ? " yet" : "")" }
    }

    /// "yyyy-MM-dd" is already the patient's calendar day, so it is parsed and formatted in UTC to avoid shifting it.
    static func date(_ localDate: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = utc
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter.date(from: localDate)
    }
}

/// Cell treatments by token name, so the contrast test resolves exactly what the view draws.
enum CalendarCellStyle {
    enum Fill: Equatable {
        case none
        case solid(String)
        case split(top: String, bottom: String)
    }

    static let todayOutline: CGFloat = 1.5
    static let todayInset: CGFloat = 3

    static func fill(_ cell: CalendarCell, isToday: Bool) -> Fill {
        switch cell {
        case .future: .none
        case .recorded(.both): .solid("lp.ink")
        case .recorded(.one): .split(top: "lp.ink", bottom: "lp.sunk")
        case .recorded(.neither): isToday ? .none : .solid("lp.sunk")
        }
    }

    static func text(_ cell: CalendarCell, isToday: Bool) -> String {
        switch cell {
        case .future: "lp.ink.future"
        case .recorded(.both): "lp.canvas"
        case .recorded(.one): "lp.ink"
        case .recorded(.neither): isToday ? "lp.ink" : "lp.ink.tertiary"
        }
    }

    /// The colour directly behind the day number (split cells put the number in the bottom half).
    static func background(_ cell: CalendarCell, isToday: Bool) -> String {
        switch fill(cell, isToday: isToday) {
        case .none: "lp.canvas"
        case .solid(let name): name
        case .split(_, let bottom): bottom
        }
    }
}

/// Completion calendar (spec §6 #8). Pushed from Plan: no tab bar, no bottom spacer.
struct CompletionCalendarView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var monthDate = Date()
    @State private var calendar: CompletionCalendar?
    @State private var loadFailed = false
    @State private var selected: String?

    private var month: String { String(RoutineDates.localDate(monthDate, zone: .current).prefix(7)) }
    private var today: String { RoutineDates.localDate(Date(), zone: .current) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                if let calendar {
                    populated(calendar)
                } else if loadFailed {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                        Text("Couldn't load \(CompletionCalendarCopy.monthTitle(month)).")
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                            .fixedSize(horizontal: false, vertical: true)
                        Button("Try again") { Task { await load() } }
                            .buttonStyle(.letterpress(.outlined))
                    }
                    .padding(.top, Letterpress.Space.s22)
                } else {
                    HStack(spacing: Letterpress.Space.s10) {
                        SwiftUI.ProgressView().tint(Letterpress.inkTertiary)
                        Text("Loading \(CompletionCalendarCopy.monthTitle(month))")
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                    .padding(.top, Letterpress.Space.s22)
                }
                Text(CompletionCalendarCopy.footnote)
                    .font(Letterpress.ui(12, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s22)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.top, Letterpress.Space.s10)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .navigationTitle("Completion history")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .task(id: month) { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(CompletionCalendarCopy.monthTitle(month))
                .font(Letterpress.display(34, relativeTo: .largeTitle))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            ViewThatFits(in: .horizontal) {
                HStack {
                    previousButton
                    Spacer()
                    nextButton
                }
                VStack(alignment: .leading, spacing: 0) {
                    previousButton
                    nextButton
                }
            }
        }
    }

    private var previousButton: some View {
        Button("Previous month") { move(-1) }.buttonStyle(.letterpress(.underline))
    }

    @ViewBuilder private var nextButton: some View {
        if month < String(today.prefix(7)) {
            Button("Next month") { move(1) }.buttonStyle(.letterpress(.underline))
        }
    }

    @ViewBuilder private func populated(_ calendar: CompletionCalendar) -> some View {
        let dates = SupportDates.days(month)
        let cells = CompletionCalendarCopy.cells(month: month, calendar: calendar, today: today)
        let tally = CompletionCalendarCopy.tally(cells)
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s10))
            : AnyLayout(HStackLayout(alignment: .center, spacing: Letterpress.Space.s14))
        layout {
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text("\(tally.recorded)")
                    .font(Letterpress.data(28, weight: .medium, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                Text(CompletionCalendarCopy.countLabel(tally))
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                    .textCase(.uppercase)
                    .foregroundStyle(Letterpress.inkTertiary)
            }
            if !dynamicTypeSize.isAccessibilitySize {
                Rectangle().fill(Letterpress.rule).frame(width: 1, height: Letterpress.minTouch).accessibilityHidden(true)
            }
            Text(CompletionCalendarCopy.sentence(tally))
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, Letterpress.Space.s18)
        .accessibilityElement(children: .combine)
        if dynamicTypeSize.isAccessibilitySize {
            dayList(dates: dates, cells: cells)
                .padding(.top, Letterpress.Space.s22)
        } else {
            grid(dates: dates, cells: cells)
                .padding(.top, Letterpress.Space.s22)
            legend
                .padding(.top, Letterpress.Space.s18)
        }
        LetterpressRule()
            .padding(.top, Letterpress.Space.s22)
        if let selected, dates.contains(selected), selected <= today {
            CompletionDayEvents(date: selected, today: today)
                .id(selected)
        }
    }

    private func grid(dates: [String], cells: [CalendarCell]) -> some View {
        let firstWeekday = Calendar.current.firstWeekday
        let columns = Array(repeating: GridItem(.flexible(), spacing: Letterpress.Space.s6), count: 7)
        return LazyVGrid(columns: columns, spacing: Letterpress.Space.s14) {
            ForEach(Array(CompletionCalendarCopy.weekdaySymbols(firstWeekday: firstWeekday, locale: .current).enumerated()), id: \.offset) { _, symbol in
                Text(symbol)
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption2))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .accessibilityHidden(true)
            }
            ForEach(0..<CompletionCalendarCopy.leadingBlanks(month: month, firstWeekday: firstWeekday), id: \.self) { _ in
                Color.clear.aspectRatio(1, contentMode: .fit).accessibilityHidden(true)
            }
            ForEach(Array(zip(dates, cells)), id: \.0) { pair in
                let (date, cell) = pair
                Button { selected = date } label: {
                    CalendarDayCell(day: Int(date.suffix(2)) ?? 0, cell: cell, isToday: date == today, isSelected: selected == date)
                }
                .buttonStyle(.plain)
                .disabled(cell == .future)
                .accessibilityLabel(CompletionCalendarCopy.dayLabel(date, cell: cell, isToday: date == today))
                .accessibilityHint(cell == .future ? "" : "Shows what was recorded")
                .accessibilityAddTraits(selected == date ? .isSelected : [])
            }
        }
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
    }

    private func dayList(dates: [String], cells: [CalendarCell]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(zip(dates, cells)), id: \.0) { pair in
                let (date, cell) = pair
                Button { selected = date } label: {
                    Text(CompletionCalendarCopy.dayLabel(date, cell: cell, isToday: date == today))
                        .font(Letterpress.ui(16, weight: date == today ? .medium : .body, relativeTo: .body))
                        .foregroundStyle(cell == .future ? Letterpress.inkFuture : Letterpress.ink)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, Letterpress.Space.s10)
                        .padding(.leading, Letterpress.Space.s10)
                        .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
                        .overlay(alignment: .top) { LetterpressRule() }
                        .overlay(alignment: .leading) {
                            if selected == date { Rectangle().fill(Letterpress.ink).frame(width: 2) }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(cell == .future)
                .accessibilityAddTraits(selected == date ? .isSelected : [])
            }
            LetterpressRule()
        }
    }

    private var legend: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: Letterpress.Space.s14) { legendItems }
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) { legendItems }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder private var legendItems: some View {
        legendItem("Both routines") { Letterpress.ink }
        legendItem("One routine") { VStack(spacing: 0) { Letterpress.ink; Letterpress.sunk } }
        legendItem("None recorded") { Letterpress.sunk }
        legendItem("Today") { Rectangle().strokeBorder(Letterpress.ink, lineWidth: CalendarCellStyle.todayOutline) }
    }

    private func legendItem<Swatch: View>(_ title: String, @ViewBuilder swatch: () -> Swatch) -> some View {
        HStack(spacing: Letterpress.Space.s6) {
            swatch().frame(width: 13, height: 13)
            Text(title)
                .font(Letterpress.ui(12, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkSecondary)
        }
    }

    private func move(_ value: Int) {
        calendar = nil
        loadFailed = false
        selected = nil
        monthDate = Calendar.current.date(byAdding: .month, value: value, to: monthDate) ?? monthDate
    }

    private func load() async {
        guard let ticket = APIService.shared.access.snapshot() else { return }
        let requested = month
        calendar = nil
        loadFailed = false
        do {
            let result = try await APIService.shared.fetchCompletionCalendar(month: requested, ticket: ticket)
            try Task.checkCancellation()
            try APIService.shared.access.require(ticket)
            guard month == requested else { return }
            calendar = result
            let cells = CompletionCalendarCopy.cells(month: requested, calendar: result, today: today)
            selected = CompletionCalendarCopy.defaultSelection(month: requested, cells: cells, today: today)
        } catch {
            guard !Task.isCancelled, month == requested, APIService.shared.access.snapshot() == ticket else { return }
            loadFailed = true
        }
    }
}

private struct CalendarDayCell: View {
    let day: Int
    let cell: CalendarCell
    let isToday: Bool
    let isSelected: Bool

    private var isSplit: Bool {
        if case .split = CalendarCellStyle.fill(cell, isToday: isToday) { return true }
        return false
    }

    var body: some View {
        ZStack(alignment: isSplit ? .bottom : .center) {
            cellFill
                .padding(isToday ? CalendarCellStyle.todayInset : 0)
            Text("\(day)")
                .font(Letterpress.data(12, weight: cell == .future ? .regular : .medium, relativeTo: .caption))
                .foregroundStyle(Color(CalendarCellStyle.text(cell, isToday: isToday)))
                .padding(.bottom, isSplit ? Letterpress.Space.s4 : 0)
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .overlay {
            if isToday { Rectangle().strokeBorder(Letterpress.ink, lineWidth: CalendarCellStyle.todayOutline) }
        }
        .overlay(alignment: .bottom) {
            if isSelected {
                Rectangle().fill(Letterpress.ink).frame(height: 2).offset(y: Letterpress.Space.s6)
            }
        }
        .contentShape(Rectangle())
    }

    @ViewBuilder private var cellFill: some View {
        switch CalendarCellStyle.fill(cell, isToday: isToday) {
        case .none:
            Color.clear
        case .solid(let name):
            Color(name)
        case .split(let top, let bottom):
            VStack(spacing: 0) {
                Color(top)
                Color(bottom)
            }
        }
    }
}

/// The selected day's recorded events, beneath the calendar (spec §6 #8). Pagination is the endpoint's own.
private struct CompletionDayEvents: View {
    let date: String
    let today: String
    @State private var events: [CompletionCalendarEvent] = []
    @State private var page = 1
    @State private var totalPages = 1
    @State private var loading = true
    @State private var failed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(CompletionCalendarCopy.eyebrow(date))
                .letterpressEyebrow()
                .padding(.top, Letterpress.Space.s18)
                .padding(.bottom, Letterpress.Space.s10)
                .accessibilityAddTraits(.isHeader)
            if loading {
                Text("Loading this day")
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
            } else if failed {
                VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                    Text("Couldn't load this day.")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.error)
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(.letterpress(.underline))
                }
            } else {
                ForEach(events) { event in
                    row(time: CompletionCalendarCopy.eventTime(event.completion),
                        title: CompletionCalendarCopy.eventTitle(event.routine),
                        meta: CompletionCalendarCopy.eventMeta(event.routine),
                        recorded: true)
                }
                if totalPages <= 1 {
                    ForEach(CompletionCalendarCopy.missingSlots(recorded: events.map(\.routine.timeOfDay), date: date, today: today), id: \.self) { title in
                        row(time: "—", title: title, meta: nil, recorded: false)
                    }
                }
                LetterpressRule()
                if totalPages > 1 {
                    HStack(spacing: Letterpress.Space.s10) {
                        Button("Previous") { page -= 1 }
                            .buttonStyle(.letterpress(.outlined))
                            .disabled(page <= 1)
                        Spacer(minLength: 0)
                        Text("Page \(page) of \(totalPages)")
                            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                            .foregroundStyle(Letterpress.inkTertiary)
                        Spacer(minLength: 0)
                        Button("Next") { page += 1 }
                            .buttonStyle(.letterpress(.outlined))
                            .disabled(page >= totalPages)
                    }
                    .padding(.top, Letterpress.Space.s14)
                }
            }
        }
        .task(id: page) { await load() }
    }

    private func row(time: String, title: String, meta: String?, recorded: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s14) {
            Text(time)
                .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkTertiary)
                .frame(minWidth: Letterpress.minTouch, alignment: .leading)
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text(title)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(recorded ? Letterpress.ink : Letterpress.inkSecondary)
                if let meta {
                    Text(meta)
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(Letterpress.inkTertiary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, Letterpress.Space.s10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { LetterpressRule() }
        .accessibilityElement(children: .combine)
    }

    private func load() async {
        guard let ticket = APIService.shared.access.snapshot() else { return }
        loading = true
        failed = false
        do {
            let result = try await APIService.shared.fetchCompletionDay(date: date, page: page, ticket: ticket)
            try Task.checkCancellation()
            try APIService.shared.access.require(ticket)
            events = result.data
            totalPages = max(result.pagination.totalPages, 1)
            loading = false
        } catch {
            guard !Task.isCancelled, APIService.shared.access.snapshot() == ticket else { return }
            loading = false
            failed = true
        }
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/CompletionCalendarTests -only-testing:ClearAFTests/PushedScreenTests -only-testing:ClearAFTests/LetterpressSweepTests -only-testing:ClearAFTests/RoutinePresentationTests`
Expected: PASS (7 calendar tests, 1 pushed-screen test, sweep and PR 3 strip tests unchanged). If `gridStartsOnTheLocaleFirstWeekday` fails on the symbol array, print `Calendar(identifier: .gregorian).veryShortStandaloneWeekdaySymbols` once and confirm it is Sunday-first before changing the index formula.

- [ ] **Step 5: Commit**

```bash
git add ClearAF/Views/CompletionCalendarView.swift ClearAFTests/CompletionCalendarTests.swift ClearAFTests/PushedScreenTests.swift
git commit -m "ios: three-state completion calendar with the day's events beneath" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Weekly check-in — one question per screen, review, submit at the end [judgment]

**Files:**
- Create: `ClearAF/Views/LetterpressForm.swift`, `ClearAFTests/CheckInFlowTests.swift`
- Modify (full rewrite): `ClearAF/Views/CheckInView.swift`
- Modify: `ClearAFTests/PushedScreenTests.swift` (`pushed` array), `docs/design/letterpress/deferred.md`

**Interfaces:**
- Consumes: `CheckInRepository` (`draft`, `status`, `error`, `resume(_:)`, `start(_:ticket:)`, `update(_:ticket:)`, `prepare(ticket:)`, `send(ticket:)`), `CheckInForm`, `CheckInQuestion`, `CheckInOption`, `CheckInAnswer`, `CheckInDraft`, `CheckInResponse`, `CheckInValidation.answers(_:questions:)`, `APIService.fetchCheckInForm(ticket:)`, `.fetchCheckInResponses(page:ticket:)`; PR 3 `LetterpressFormat.stampTime`.
- Produces (Tasks 3–6 rely on these):
  - `struct LetterpressProgressRule: View` — `init(completed: Int, total: Int)`, `static func isFilled(_ segment: Int, completed: Int) -> Bool`, `static let height: CGFloat = 2`.
  - `struct LetterpressRadioRow: View` — `init(title: String, selected: Bool, action: @escaping () -> Void)`; ruled, ≥ 44pt, `.isSelected` trait.
  - `struct LetterpressLabeledField<Field: View>: View` — `init(label: String, isEmpty: Bool, message: String? = nil, isError: Bool = false, @ViewBuilder field: @escaping () -> Field)`.
  - `enum CheckInFlow` — `textLimit`, `advanceReason`, `lengthReason`, `sendReason`, `footnote`, `readers`, `answer(for:in:)`, `isAnswered(_:in:)`, `isTooLong(_:in:)`, `canAdvance(_:in:)`, `resumeIndex(_:)`, `progress(index:count:)`, `eyebrow(_:)`, `requirement(_:)`, `summary(_:in:)`, `count(_:)`, `status(_:)`, `sendLabel(_:submitted:)`, `stamp(_:)`.
  - `CheckInView()` and `CheckInHistoryView()` initialisers unchanged. Identifiers: `checkInProgress`, `checkInStatus`, `checkInText`, `checkInBack`, `checkInNext`, `checkInSend`, `checkInError`, `checkInDone`.
- Reviewers: per-task review (draft/state sequencing). Form versioning, required flags and the draft file are untouched: the view only calls the repository methods it already called.

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/CheckInFlowTests.swift`

```swift
import Foundation
import Testing
import SwiftUI
import UIKit
@testable import ClearAF

struct CheckInFlowTests {
    let better = CheckInOption(id: UUID(), label: "Better than last week")
    let worse = CheckInOption(id: UUID(), label: "Worse than last week")
    let owner = UUID()

    private var choice: CheckInQuestion {
        CheckInQuestion(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!, prompt: "How is the dryness this week?",
                        type: .choice, required: true, options: [better, worse])
    }
    private var text: CheckInQuestion {
        CheckInQuestion(id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!, prompt: "Anything to add?",
                        type: .text, required: false, options: [])
    }
    private func draft(_ answers: [CheckInAnswer], submitted: Bool = false) -> CheckInDraft {
        let form = CheckInForm(id: UUID(), userId: owner, version: 2, createdBy: UUID(), createdAt: "2026-09-13T12:00:00.000Z",
                               title: "Weekly check-in", isActive: true, questions: [choice, text])
        return CheckInDraft(id: UUID(), form: form, answers: answers, submittedAt: submitted ? "2026-09-15T07:12:00.000Z" : nil)
    }

    @Test func requiredQuestionsBlockNextUntilAnswered() {
        #expect(!CheckInFlow.canAdvance(choice, in: []))
        #expect(CheckInFlow.canAdvance(choice, in: [CheckInAnswer(questionId: choice.id, text: nil, optionId: better.id)]))
        #expect(CheckInFlow.canAdvance(text, in: []))
        let long = CheckInAnswer(questionId: text.id, text: String(repeating: "a", count: 2001), optionId: nil)
        #expect(CheckInFlow.isTooLong(text, in: [long]))
        #expect(!CheckInFlow.canAdvance(text, in: [long]))
        let requiredText = CheckInQuestion(id: UUID(), prompt: "Describe it", type: .text, required: true, options: [])
        #expect(!CheckInFlow.canAdvance(requiredText, in: [CheckInAnswer(questionId: requiredText.id, text: "   ", optionId: nil)]))
    }

    @Test func resumeStartsAtTheFirstUnansweredQuestionOrReview() {
        #expect(CheckInFlow.resumeIndex(draft([])) == 0)
        #expect(CheckInFlow.resumeIndex(draft([CheckInAnswer(questionId: choice.id, text: nil, optionId: worse.id)])) == 1)
        let both = [CheckInAnswer(questionId: choice.id, text: nil, optionId: worse.id), CheckInAnswer(questionId: text.id, text: "Chin", optionId: nil)]
        #expect(CheckInFlow.resumeIndex(draft(both)) == 2)
        #expect(CheckInFlow.resumeIndex(draft([CheckInAnswer(questionId: choice.id, text: nil, optionId: worse.id)], submitted: true)) == 2)
    }

    @Test func progressEyebrowAndSummariesUseWords() {
        #expect(CheckInFlow.progress(index: 1, count: 4) == "2 OF 4")
        #expect(CheckInFlow.progress(index: 4, count: 4) == "REVIEW")
        #expect(CheckInFlow.eyebrow(draft([]).form) == "Weekly check-in · V2")
        #expect(CheckInFlow.requirement(choice) == "Required. Your clinician reads these alongside your photos.")
        #expect(CheckInFlow.summary(choice, in: []) == "Not answered · required")
        #expect(CheckInFlow.summary(text, in: []) == "Not answered")
        #expect(CheckInFlow.summary(choice, in: [CheckInAnswer(questionId: choice.id, text: nil, optionId: better.id)]) == "Better than last week")
        #expect(CheckInFlow.count("Chin still flaky") == "16 / 2000")
    }

    @Test func statusAndSendLabelsNameWhereTheWorkIs() {
        #expect(CheckInFlow.status(.draft) == "Draft saved on this device")
        #expect(CheckInFlow.status(.failed) == "Couldn't send. Your answers are saved on this device.")
        #expect(CheckInFlow.sendLabel(.draft, submitted: false) == "Send check-in")
        #expect(CheckInFlow.sendLabel(.failed, submitted: true) == "Retry sending")
        #expect(CheckInFlow.sendLabel(.sending, submitted: true) == "Sending…")
        for copy in [CheckInFlow.advanceReason, CheckInFlow.sendReason, CheckInFlow.footnote, CheckInFlow.lengthReason] {
            #expect(!copy.contains("!"))
        }
    }
}

@MainActor struct LetterpressFormTests {
    @Test func radioRowKeepsA44PointTarget() {
        let size = UIHostingController(rootView: LetterpressRadioRow(title: "Yes", selected: false) {}
            .environment(\.dynamicTypeSize, .xSmall))
            .sizeThatFits(in: CGSize(width: 320, height: 1000))
        #expect(size.height >= 44)
    }

    @Test func progressRuleFillsReachedSteps() {
        #expect(LetterpressProgressRule.isFilled(0, completed: 2))
        #expect(LetterpressProgressRule.isFilled(1, completed: 2))
        #expect(!LetterpressProgressRule.isFilled(2, completed: 2))
        #expect(LetterpressProgressRule.height == 2)
    }
}
```

In `ClearAFTests/PushedScreenTests.swift` change the list to:

```swift
    static let pushed = ["CompletionCalendarView.swift", "CheckInView.swift"]
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/CheckInFlowTests -only-testing:ClearAFTests/LetterpressFormTests -only-testing:ClearAFTests/PushedScreenTests`
Expected: build FAIL — `cannot find 'CheckInFlow' in scope`.

- [ ] **Step 3: Create `ClearAF/Views/LetterpressForm.swift`**

```swift
import SwiftUI

/// Step progress (spec §6 #2, #9): one 2pt rule per step, ink for steps reached. The mono counter beside it carries
/// the meaning, so the rule is hidden from VoiceOver.
struct LetterpressProgressRule: View {
    static let height: CGFloat = 2
    static let pendingOpacity: Double = 0.2

    let completed: Int
    let total: Int

    static func isFilled(_ segment: Int, completed: Int) -> Bool { segment < completed }

    var body: some View {
        HStack(spacing: Letterpress.Space.s4) {
            ForEach(0..<max(total, 1), id: \.self) { segment in
                Rectangle()
                    .fill(Self.isFilled(segment, completed: completed) ? Letterpress.ink : Letterpress.ink.opacity(Self.pendingOpacity))
                    .frame(height: Self.height)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }
}

/// Single-choice row: ruled, 44pt minimum, radio mark in ink, selection spoken as a trait.
struct LetterpressRadioRow: View {
    let title: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Letterpress.Space.s14) {
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .font(Letterpress.ui(20, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .accessibilityHidden(true)
                Text(title)
                    .font(Letterpress.ui(16, weight: selected ? .medium : .body, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, Letterpress.Space.s10)
            .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
            .overlay(alignment: .top) { LetterpressRule() }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

/// Persistent mono label above a baseline-rule field, with a note or validation message beneath (spec §4.2).
/// Placeholders are examples only; the label names the field.
struct LetterpressLabeledField<Field: View>: View {
    let label: String
    let isEmpty: Bool
    var message: String? = nil
    var isError = false
    @ViewBuilder let field: () -> Field

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Text(label)
                .letterpressEyebrow()
                .accessibilityHidden(true)
            field()
                .letterpressField(isEmpty: isEmpty)
            if let message {
                Text(message)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(isError ? Letterpress.error : Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
```

- [ ] **Step 4: Replace `ClearAF/Views/CheckInView.swift`**

```swift
import SwiftUI

/// Check-in copy and page logic (spec §6 #9). Validation stays in `CheckInValidation`; this only decides what a page shows.
enum CheckInFlow {
    static let textLimit = 2000
    static let advanceReason = "Answer this question to continue. It's required."
    static let lengthReason = "Shorten your answer to 2,000 characters or fewer."
    static let sendReason = "Answer every required question before sending."
    static let footnote = "Answers are sent together at the end. Your draft stays on this device until you send it."
    static let readers = "Your clinician reads these alongside your photos."

    static func answer(for question: CheckInQuestion, in answers: [CheckInAnswer]) -> CheckInAnswer? {
        answers.first { $0.questionId == question.id }
    }

    static func isAnswered(_ question: CheckInQuestion, in answers: [CheckInAnswer]) -> Bool {
        guard let answer = answer(for: question, in: answers) else { return false }
        switch question.type {
        case .text: return !(answer.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .choice: return question.options.contains { $0.id == answer.optionId }
        }
    }

    static func isTooLong(_ question: CheckInQuestion, in answers: [CheckInAnswer]) -> Bool {
        question.type == .text && (answer(for: question, in: answers)?.text ?? "").utf16.count > textLimit
    }

    static func canAdvance(_ question: CheckInQuestion, in answers: [CheckInAnswer]) -> Bool {
        !isTooLong(question, in: answers) && (!question.required || isAnswered(question, in: answers))
    }

    /// First unanswered question; the review page once everything is answered or the response was submitted.
    static func resumeIndex(_ draft: CheckInDraft) -> Int {
        let questions = draft.form.questions
        guard draft.submittedAt == nil else { return questions.count }
        return questions.firstIndex { !isAnswered($0, in: draft.answers) } ?? questions.count
    }

    static func progress(index: Int, count: Int) -> String {
        index >= count ? "REVIEW" : "\(index + 1) OF \(count)"
    }

    static func eyebrow(_ form: CheckInForm) -> String { "\(form.title) · V\(form.version)" }

    static func requirement(_ question: CheckInQuestion) -> String {
        "\(question.required ? "Required" : "Optional"). \(readers)"
    }

    static func summary(_ question: CheckInQuestion, in answers: [CheckInAnswer]) -> String {
        guard isAnswered(question, in: answers), let answer = answer(for: question, in: answers) else {
            return question.required ? "Not answered · required" : "Not answered"
        }
        return answer.text ?? question.options.first { $0.id == answer.optionId }?.label ?? "Not answered"
    }

    static func count(_ text: String) -> String { "\(text.utf16.count) / \(textLimit)" }

    static func status(_ status: CheckInRepository.Status) -> String {
        switch status {
        case .draft: "Draft saved on this device"
        case .pending: "Waiting to send. Saved on this device."
        case .sending: "Sending…"
        case .failed: "Couldn't send. Your answers are saved on this device."
        case .sent: "Sent"
        }
    }

    static func sendLabel(_ status: CheckInRepository.Status, submitted: Bool) -> String {
        if status == .sending { return "Sending…" }
        return submitted ? "Retry sending" : "Send check-in"
    }

    static func stamp(_ timestamp: String) -> String {
        RoutineDates.instant(timestamp).map { LetterpressFormat.stampTime($0) } ?? timestamp
    }
}

/// Weekly check-in (spec §6 #9). Pushed from Today: no tab bar, no bottom spacer.
struct CheckInView: View {
    @ObservedObject private var repository = APIService.shared.checkIns
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var form: CheckInForm?
    @State private var loaded = false
    @State private var error: String?
    @State private var index = 0
    @State private var positionedDraft: UUID?

    var body: some View {
        let ticket = APIService.shared.access.snapshot()
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                content(ticket)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.top, Letterpress.Space.s10)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .navigationTitle("Check-in")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .task { await load(ticket) }
        .refreshable { await load(ticket) }
        .onChange(of: repository.draft?.id, initial: true) { _, id in
            guard let draft = repository.draft, positionedDraft != id else { return }
            index = CheckInFlow.resumeIndex(draft)
            positionedDraft = id
        }
    }

    @ViewBuilder private func content(_ ticket: AccountAccess.Ticket?) -> some View {
        if let draft = repository.draft {
            let questions = draft.form.questions
            let position = min(index, questions.count)
            header(position: position, count: questions.count)
            if let error {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text(error)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.error)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Try again") { Task { await load(ticket) } }
                        .buttonStyle(.letterpress(.underline))
                }
                .padding(.top, Letterpress.Space.s14)
            }
            if repository.status == .sent {
                sentPage(draft, ticket)
            } else if position < questions.count {
                questionPage(draft, question: questions[position], position: position, ticket: ticket)
            } else {
                reviewPage(draft, ticket)
            }
        } else if let error {
            emptyState(title: "Couldn't load your check-in", detail: error) {
                Button("Try again") { Task { await load(ticket) } }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
            }
        } else if loaded {
            let archived = form?.isActive == false
            emptyState(title: archived ? "This check-in was archived" : "No check-in yet",
                       detail: archived ? "Your clinician archived it. Past responses are still available."
                                        : "When your clinician sets questions, they'll appear here.") {
                historyLink
            }
        } else {
            HStack(spacing: Letterpress.Space.s10) {
                SwiftUI.ProgressView().tint(Letterpress.inkTertiary)
                Text("Loading your check-in")
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
            }
            .padding(.top, Letterpress.Space.s22)
        }
    }

    private func header(position: Int, count: Int) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s10) {
                Text(CheckInFlow.progress(index: position, count: count))
                    .font(Letterpress.data(11, relativeTo: .caption))
                    .foregroundStyle(Letterpress.ink)
                    .accessibilityIdentifier("checkInProgress")
                Spacer(minLength: Letterpress.Space.s10)
                Text(CheckInFlow.status(repository.status))
                    .font(Letterpress.ui(12, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkTertiary)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("checkInStatus")
            }
            LetterpressProgressRule(completed: min(position + 1, count), total: count)
        }
    }

    @ViewBuilder private func questionPage(_ draft: CheckInDraft, question: CheckInQuestion, position: Int, ticket: AccountAccess.Ticket?) -> some View {
        let answers = draft.answers
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(CheckInFlow.eyebrow(draft.form)).letterpressEyebrow()
            Text(question.prompt)
                .font(Letterpress.display(28, relativeTo: .title))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            reason(CheckInFlow.requirement(question))
        }
        .padding(.top, Letterpress.Space.s22)
        newerFormNote(draft)
        Group {
            switch question.type {
            case .choice:
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(question.options) { option in
                        let selected = CheckInFlow.answer(for: question, in: answers)?.optionId == option.id
                        LetterpressRadioRow(title: option.label, selected: selected) {
                            // Tapping the chosen option of an optional question clears it.
                            let value: UUID? = selected && !question.required ? nil : option.id
                            update(CheckInAnswer(questionId: question.id, text: nil, optionId: value), ticket)
                        }
                    }
                    LetterpressRule()
                }
            case .text:
                let text = CheckInFlow.answer(for: question, in: answers)?.text ?? ""
                LetterpressLabeledField(label: "Your answer", isEmpty: text.isEmpty, message: CheckInFlow.count(text),
                                        isError: CheckInFlow.isTooLong(question, in: answers)) {
                    TextField(text: textBinding(question, ticket), prompt: nil, axis: .vertical) { Text(question.prompt) }
                        .lineLimit(3...10)
                        .accessibilityIdentifier("checkInText")
                }
            }
        }
        .padding(.top, Letterpress.Space.s22)
        .disabled(draft.submittedAt != nil)
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            let layout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: Letterpress.Space.s10))
                : AnyLayout(HStackLayout(spacing: Letterpress.Space.s10))
            layout {
                if position > 0 {
                    Button("Back") { index = position - 1 }
                        .buttonStyle(.letterpress(.outlined, fullWidth: dynamicTypeSize.isAccessibilitySize))
                        .accessibilityIdentifier("checkInBack")
                }
                Button(position == draft.form.questions.count - 1 ? "Review answers" : "Next question") { index = position + 1 }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(!CheckInFlow.canAdvance(question, in: answers))
                    .accessibilityIdentifier("checkInNext")
            }
            if CheckInFlow.isTooLong(question, in: answers) {
                reason(CheckInFlow.lengthReason)
            } else if !CheckInFlow.canAdvance(question, in: answers) {
                reason(CheckInFlow.advanceReason)
            }
            reason(CheckInFlow.footnote)
        }
        .padding(.top, Letterpress.Space.s28)
    }

    @ViewBuilder private func reviewPage(_ draft: CheckInDraft, _ ticket: AccountAccess.Ticket?) -> some View {
        let submitted = draft.submittedAt != nil
        let valid = CheckInValidation.answers(draft.answers, questions: draft.form.questions)
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(CheckInFlow.eyebrow(draft.form)).letterpressEyebrow()
            Text(submitted ? "Your answers" : "Review your answers")
                .font(Letterpress.display(28, relativeTo: .title))
                .foregroundStyle(Letterpress.ink)
                .accessibilityAddTraits(.isHeader)
        }
        .padding(.top, Letterpress.Space.s22)
        newerFormNote(draft)
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(draft.form.questions.enumerated()), id: \.element.id) { position, question in
                Button { index = position } label: {
                    HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s10) {
                        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                            Text(question.prompt)
                                .font(Letterpress.ui(15, weight: .medium, relativeTo: .subheadline))
                                .foregroundStyle(Letterpress.ink)
                            Text(CheckInFlow.summary(question, in: draft.answers))
                                .font(Letterpress.ui(15, relativeTo: .body))
                                .foregroundStyle(Letterpress.inkSecondary)
                        }
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        if !submitted {
                            Image(systemName: "chevron.right")
                                .font(Letterpress.ui(13, relativeTo: .footnote))
                                .foregroundStyle(Letterpress.inkTertiary)
                                .accessibilityHidden(true)
                        }
                    }
                    .padding(.vertical, Letterpress.Space.s10)
                    .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
                    .overlay(alignment: .top) { LetterpressRule() }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(submitted)
                .accessibilityHint(submitted ? "" : "Change this answer")
            }
            LetterpressRule()
        }
        .padding(.top, Letterpress.Space.s22)
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Button(CheckInFlow.sendLabel(repository.status, submitted: submitted)) { send(ticket) }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(repository.status == .sending || !valid)
                .accessibilityIdentifier("checkInSend")
            if let failure = repository.error {
                Text(failure)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("checkInError")
            } else if !valid {
                reason(CheckInFlow.sendReason)
            }
            reason(CheckInFlow.footnote)
            historyLink
        }
        .padding(.top, Letterpress.Space.s28)
    }

    @ViewBuilder private func sentPage(_ draft: CheckInDraft, _ ticket: AccountAccess.Ticket?) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
            Text(CheckInFlow.eyebrow(draft.form)).letterpressEyebrow()
            Text("Check-in sent")
                .font(Letterpress.display(28, relativeTo: .title))
                .foregroundStyle(Letterpress.ink)
                .accessibilityAddTraits(.isHeader)
            reason(CheckInFlow.readers)
            if let submittedAt = draft.submittedAt {
                Text("SENT \(CheckInFlow.stamp(submittedAt))")
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkTertiary)
            }
        }
        .padding(.top, Letterpress.Space.s22)
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Button("Done") { dismiss() }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .accessibilityIdentifier("checkInDone")
            if let form, form.isActive {
                Button("Start another check-in") {
                    guard let ticket else { return }
                    do { try repository.start(form, ticket: ticket) }
                    catch { self.error = "Your new draft couldn't be saved. Try again." }
                }
                .buttonStyle(.letterpress(.outlined, fullWidth: true))
            }
            historyLink
        }
        .padding(.top, Letterpress.Space.s28)
    }

    @ViewBuilder private func newerFormNote(_ draft: CheckInDraft) -> some View {
        if loaded, form?.id != draft.form.id {
            reason("This response keeps the form you started. A newer assignment does not change it.")
                .padding(.top, Letterpress.Space.s14)
        }
    }

    private var historyLink: some View {
        NavigationLink("Response history") { CheckInHistoryView() }
            .buttonStyle(.letterpress(.underline))
    }

    private func emptyState<Action: View>(title: String, detail: String, @ViewBuilder action: () -> Action) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
            Text(title)
                .font(Letterpress.display(28, relativeTo: .title))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(detail)
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            action().padding(.top, Letterpress.Space.s10)
        }
        .padding(.top, Letterpress.Space.s22)
    }

    private func reason(_ text: String) -> some View {
        Text(text)
            .font(Letterpress.ui(13, relativeTo: .footnote))
            .foregroundStyle(Letterpress.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func textBinding(_ question: CheckInQuestion, _ ticket: AccountAccess.Ticket?) -> Binding<String> {
        Binding(
            get: { CheckInFlow.answer(for: question, in: repository.draft?.answers ?? [])?.text ?? "" },
            set: { update(CheckInAnswer(questionId: question.id, text: $0, optionId: nil), ticket) }
        )
    }

    private func update(_ answer: CheckInAnswer, _ ticket: AccountAccess.Ticket?) {
        guard let ticket else { return }
        do { try repository.update(answer, ticket: ticket); error = nil }
        catch { self.error = "Your edit couldn't be saved. Try again." }
    }

    private func send(_ ticket: AccountAccess.Ticket?) {
        guard let ticket else { return }
        do {
            try repository.prepare(ticket: ticket)
            Task { await repository.send(ticket: ticket) }
        } catch {
            self.error = "Answer the required questions and check the length before sending."
        }
    }

    private func load(_ ticket: AccountAccess.Ticket?) async {
        guard let ticket else { return }
        do {
            try repository.resume(ticket)
            let current = try await APIService.shared.fetchCheckInForm(ticket: ticket)
            try APIService.shared.access.require(ticket)
            form = current
            loaded = true
            error = nil
            if repository.draft == nil, let current, current.isActive { try repository.start(current, ticket: ticket) }
        } catch {
            guard APIService.shared.access.snapshot() == ticket else { return }
            self.error = "Check your connection, then try again. Any draft stays on this device."
        }
    }
}

/// Past responses, newest first (existing endpoint and pagination).
struct CheckInHistoryView: View {
    @State private var records: [CheckInResponse] = []
    @State private var page = 1
    @State private var totalPages = 1
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if loading {
                    Text("Loading your responses")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                } else if let error {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                        Text(error)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                        Button("Try again") { Task { await load() } }
                            .buttonStyle(.letterpress(.underline))
                    }
                } else if records.isEmpty {
                    Text("No responses yet")
                        .font(Letterpress.display(28, relativeTo: .title))
                        .foregroundStyle(Letterpress.ink)
                    Text("Check-ins you send appear here.")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .padding(.top, Letterpress.Space.s10)
                }
                ForEach(records) { record in
                    VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                        Text(CheckInFlow.eyebrow(record.form))
                            .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                        Text("SENT \(CheckInFlow.stamp(record.submittedAt)) · RECEIVED \(CheckInFlow.stamp(record.receivedAt))")
                            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                            .foregroundStyle(Letterpress.inkTertiary)
                        DisclosureGroup("Answers") {
                            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                                ForEach(record.form.questions) { question in
                                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                                        Text(question.prompt)
                                            .font(Letterpress.ui(14, weight: .medium, relativeTo: .subheadline))
                                            .foregroundStyle(Letterpress.ink)
                                        Text(CheckInFlow.summary(question, in: record.answers))
                                            .font(Letterpress.ui(14, relativeTo: .subheadline))
                                            .foregroundStyle(Letterpress.inkSecondary)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            .padding(.top, Letterpress.Space.s6)
                        }
                        .font(Letterpress.ui(14, weight: .medium, relativeTo: .subheadline))
                        .tint(Letterpress.ink)
                    }
                    .padding(.vertical, Letterpress.Space.s14)
                    .overlay(alignment: .top) { LetterpressRule() }
                }
                if !records.isEmpty { LetterpressRule() }
                if totalPages > 1 {
                    HStack(spacing: Letterpress.Space.s10) {
                        Button("Previous") { page -= 1; Task { await load() } }
                            .buttonStyle(.letterpress(.outlined))
                            .disabled(page <= 1 || loading)
                        Spacer(minLength: 0)
                        Text("Page \(page) of \(totalPages)")
                            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                            .foregroundStyle(Letterpress.inkTertiary)
                        Spacer(minLength: 0)
                        Button("Next") { page += 1; Task { await load() } }
                            .buttonStyle(.letterpress(.outlined))
                            .disabled(page >= totalPages || loading)
                    }
                    .padding(.top, Letterpress.Space.s14)
                }
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.top, Letterpress.Space.s18)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .navigationTitle("Responses")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        guard let ticket = APIService.shared.access.snapshot(), !loading else { return }
        loading = true
        error = nil
        records = []
        defer { loading = false }
        do {
            let result = try await APIService.shared.fetchCheckInResponses(page: page, ticket: ticket)
            try APIService.shared.access.require(ticket)
            records = result.data
            totalPages = max(result.pagination.totalPages, 1)
        } catch {
            if APIService.shared.access.snapshot() == ticket { self.error = "Couldn't load your responses." }
        }
    }
}
```

- [ ] **Step 5: Record the omitted controls** — append these rows to the table in `docs/design/letterpress/deferred.md`:

```markdown
| iOS Check-in | "due today" in the eyebrow | No check-in schedule; forms carry no due date |
| iOS Check-in | "Save draft" button | Not needed: the draft file is written on every answer; the header says "Draft saved on this device" |
```

- [ ] **Step 6: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/CheckInFlowTests -only-testing:ClearAFTests/LetterpressFormTests -only-testing:ClearAFTests/PushedScreenTests -only-testing:ClearAFTests/CareSupportTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: PASS (4 flow tests, 2 form tests, pushed screens now covering two files; `CareSupportTests` repository tests unchanged).

- [ ] **Step 7: Commit**

```bash
git add ClearAF/Views/LetterpressForm.swift ClearAF/Views/CheckInView.swift ClearAFTests/CheckInFlowTests.swift ClearAFTests/PushedScreenTests.swift docs/design/letterpress/deferred.md
git commit -m "ios: one-question check-in with review and send at the end" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Review note: per-task reviewer confirms, on the Simulator with a synthetic form, that a draft survives leaving and reopening Check-in, the page resumes at the first unanswered question, a failed send shows "Retry sending" with answers frozen, and the response sent equals the draft (`CareSupportTests` already covers the repository side).

---

### Task 3: Sign in and password recovery — baseline fields, inline errors, text wordmark [judgment]

**Files:**
- Create: `ClearAFTests/AuthPresentationTests.swift`
- Modify (full rewrite): `ClearAF/Views/AuthenticationView.swift`, `ClearAF/Views/PasswordRecoveryView.swift`
- Modify: `ClearAFUITests/AccountFlowUITests.swift`, `ClearAFUITests/MVPExperienceUITests.swift`, `docs/design/letterpress/deferred.md`

**Interfaces:**
- Consumes: Task 2 `LetterpressLabeledField`; `SupabaseService.signIn(email:password:)`, `.signUp(email:password:name:)`, `.requestRecovery(email:)`; `APIService.accountError`, `.updateRecoveredPassword(_:)`, `.logout()`.
- Produces:
  - `enum AuthForm` — `isValid(registering:name:email:password:) -> Bool`, `title(registering:)`, `intro`, `submit(registering:loading:)`, `disabledReason(registering:)`, `modeQuestion(registering:)`, `modeAction(registering:)`, `enum Failure { case signIn, register, recovery }`, `message(_:)`, `confirmationSent`, `recoverySent`, `recoveryNeedsEmail`.
  - `struct ClearAFWordmark: View` (`static let size: CGFloat = 22`, `static let trackingEm: CGFloat = 0.18`). PR 8 replaces its body with the lockup.
  - `enum RecoveryForm` — `minimum = 8`, `problem(password:confirmation:) -> String?`.
  - `AuthenticationView(onAuthenticationSuccess:)` and `PasswordRecoveryView()` initialisers unchanged. Identifiers: `authName`, `authEmail`, `authPassword`, `authShowPassword`, `authSubmit`, `authError`, `authInformation`, `authForgotPassword`, `authMode`, `recoveryPassword`, `recoveryConfirmation`, `recoverySubmit`. `CustomTextField` is deleted.
- Reviewers: `care-access-reviewer` (sign-in and recovery views: confirm the same `SupabaseService`/`APIService` calls, no credential logging, no new auth path).

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/AuthPresentationTests.swift`

```swift
import Testing
@testable import ClearAF

struct AuthPresentationTests {
    @Test func validationKeepsTheExistingRules() {
        #expect(AuthForm.isValid(registering: false, name: "", email: "a", password: "b"))
        #expect(!AuthForm.isValid(registering: false, name: "", email: "", password: "b"))
        #expect(AuthForm.isValid(registering: true, name: "Sam", email: "sam@example.invalid", password: "12345678"))
        #expect(!AuthForm.isValid(registering: true, name: " S ", email: "sam@example.invalid", password: "12345678"))
        #expect(!AuthForm.isValid(registering: true, name: "Sam", email: "sam", password: "12345678"))
        #expect(!AuthForm.isValid(registering: true, name: "Sam", email: "sam@example.invalid", password: "1234567"))
    }

    @Test func labelsAreSentenceCaseAndNameTheWork() {
        #expect(AuthForm.submit(registering: false, loading: false) == "Sign in")
        #expect(AuthForm.submit(registering: false, loading: true) == "Signing in…")
        #expect(AuthForm.submit(registering: true, loading: false) == "Create account")
        #expect(AuthForm.submit(registering: true, loading: true) == "Creating account…")
        #expect(AuthForm.modeQuestion(registering: false) == "No account yet?")
        #expect(AuthForm.modeAction(registering: false) == "Create one")
        #expect(AuthForm.modeAction(registering: true) == "Sign in")
    }

    @Test func copyHasNoExclamationsPlaceholdersOrPromises() {
        let copy = [AuthForm.title(registering: false), AuthForm.title(registering: true), AuthForm.intro,
                    AuthForm.disabledReason(registering: false), AuthForm.disabledReason(registering: true),
                    AuthForm.message(.signIn), AuthForm.message(.register), AuthForm.message(.recovery),
                    AuthForm.confirmationSent, AuthForm.recoverySent, AuthForm.recoveryNeedsEmail]
        for line in copy {
            #expect(!line.contains("!"), "\(line)")
            #expect(!line.contains("Dr. Om"), "\(line)")
        }
        #expect(AuthForm.intro.contains("clinician assigned to you"))
    }

    @Test func recoveryNamesTheProblemBeforeSaving() {
        #expect(RecoveryForm.problem(password: "short", confirmation: "short") == "Use at least 8 characters.")
        #expect(RecoveryForm.problem(password: "long-enough", confirmation: "long-enougH") == "The two passwords don't match yet.")
        #expect(RecoveryForm.problem(password: "long-enough", confirmation: "long-enough") == nil)
    }

    @Test func wordmarkFollowsTheLockupType() {
        #expect(ClearAFWordmark.size == 22)
        #expect(ClearAFWordmark.trackingEm == 0.18)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/AuthPresentationTests`
Expected: build FAIL — `cannot find 'AuthForm' in scope`.

- [ ] **Step 3: Replace `ClearAF/Views/AuthenticationView.swift`**

```swift
import SwiftUI

/// Sign-in copy and validation (spec §6 #1, §5, §7). The rules are the ones the screen already enforced.
enum AuthForm {
    enum Failure { case signIn, register, recovery }

    static let intro = "Photos, routines and notes are shared only with the clinician assigned to you."
    static let confirmationSent = "Check your email to confirm your account, then sign in."
    static let recoverySent = "If an account exists, a password reset email is on its way. Open the link on this device."
    static let recoveryNeedsEmail = "Enter your email above, then choose Forgot password."

    static func isValid(registering: Bool, name: String, email: String, password: String) -> Bool {
        if registering {
            return name.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 && email.contains("@") && password.count >= 8
        }
        return !email.isEmpty && !password.isEmpty
    }

    static func title(registering: Bool) -> String {
        registering ? "Create your account" : "A record of your skin, kept properly."
    }

    static func submit(registering: Bool, loading: Bool) -> String {
        switch (registering, loading) {
        case (false, false): "Sign in"
        case (false, true): "Signing in…"
        case (true, false): "Create account"
        case (true, true): "Creating account…"
        }
    }

    static func disabledReason(registering: Bool) -> String {
        registering ? "Enter your name, email and a password of at least 8 characters." : "Enter your email and password to sign in."
    }

    static func modeQuestion(registering: Bool) -> String { registering ? "Already have an account?" : "No account yet?" }
    static func modeAction(registering: Bool) -> String { registering ? "Sign in" : "Create one" }

    static func message(_ failure: Failure) -> String {
        switch failure {
        case .signIn: "Couldn't sign in. Check your email, password and connection, then try again."
        case .register: "Couldn't create your account. Check your details and connection, then try again."
        case .recovery: "Couldn't send a reset email. Check your connection and try again."
        }
    }
}

/// Text wordmark until the identity PR ships the mark (spec §10.3: Newsreader 300, lowercase, 0.18em, italic "af").
struct ClearAFWordmark: View {
    static let size: CGFloat = 22
    static let trackingEm: CGFloat = 0.18

    var body: some View {
        Text("clear\(Text("af").font(Letterpress.display(Self.size, italic: true, relativeTo: .title2)))")
            .font(Letterpress.display(Self.size, relativeTo: .title2))
            .tracking(Self.size * Self.trackingEm)
            .foregroundStyle(Letterpress.ink)
            .accessibilityLabel("ClearAF")
            .accessibilityAddTraits(.isHeader)
    }
}

/// Sign in and create account (spec §6 #1). Errors are inline and keep what was typed.
struct AuthenticationView: View {
    @StateObject private var supabaseService = SupabaseService.shared
    @ObservedObject private var api = APIService.shared
    @State private var information = ""
    @State private var failure: String?
    @State private var isRegistering = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var showingPassword = false
    @State private var isLoading = false

    let onAuthenticationSuccess: () -> Void

    private var valid: Bool { AuthForm.isValid(registering: isRegistering, name: name, email: email, password: password) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ClearAFWordmark()
                    .padding(.top, Letterpress.Space.s28)
                Text(AuthForm.title(registering: isRegistering))
                    .font(Letterpress.display(34, relativeTo: .largeTitle))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s44)
                Text(AuthForm.intro)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s14)
                fields
                    .padding(.top, Letterpress.Space.s28)
                actions
                    .padding(.top, Letterpress.Space.s28)
                ViewThatFits(in: .horizontal) {
                    HStack {
                        forgotButton
                        Spacer(minLength: Letterpress.Space.s10)
                        modeButton
                    }
                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                        forgotButton
                        modeButton
                    }
                }
                .padding(.top, Letterpress.Space.s18)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Letterpress.canvas.ignoresSafeArea())
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s22) {
            if isRegistering {
                LetterpressLabeledField(label: "Full name", isEmpty: name.isEmpty) {
                    TextField(text: $name, prompt: nil) { Text("Full name") }
                        .textContentType(.name)
                        .textInputAutocapitalization(.words)
                        .accessibilityIdentifier("authName")
                }
            }
            LetterpressLabeledField(label: "Email", isEmpty: email.isEmpty) {
                TextField(text: $email, prompt: Text("name@example.com")) { Text("Email") }
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityIdentifier("authEmail")
            }
            LetterpressLabeledField(label: "Password", isEmpty: password.isEmpty) {
                HStack(spacing: Letterpress.Space.s10) {
                    Group {
                        if showingPassword {
                            TextField(text: $password, prompt: nil) { Text("Password") }
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                        } else {
                            SecureField(text: $password, prompt: nil) { Text("Password") }
                        }
                    }
                    .textContentType(isRegistering ? .newPassword : .password)
                    .accessibilityIdentifier("authPassword")
                    Button(showingPassword ? "Hide" : "Show") { showingPassword.toggle() }
                        .buttonStyle(.letterpress(.underline))
                        .accessibilityLabel(showingPassword ? "Hide password" : "Show password")
                        .accessibilityIdentifier("authShowPassword")
                }
            }
        }
    }

    private var actions: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Button(AuthForm.submit(registering: isRegistering, loading: isLoading)) {
                isRegistering ? registerUser() : loginUser()
            }
            .buttonStyle(.letterpress(.filled, fullWidth: true))
            .disabled(!valid || isLoading)
            .accessibilityIdentifier("authSubmit")
            if let failure {
                Text(failure)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("authError")
            } else if !valid && !isLoading {
                Text(AuthForm.disabledReason(registering: isRegistering))
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !information.isEmpty {
                Text(information)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("authInformation")
            }
            if !api.accountError.isEmpty {
                Text(api.accountError)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    @ViewBuilder private var forgotButton: some View {
        if !isRegistering {
            Button("Forgot password", action: recoverPassword)
                .buttonStyle(.letterpress(.underline))
                .disabled(isLoading)
                .accessibilityIdentifier("authForgotPassword")
        }
    }

    private var modeButton: some View {
        Button {
            isRegistering.toggle()
            clearForm()
        } label: {
            Text("\(AuthForm.modeQuestion(registering: isRegistering)) \(Text(AuthForm.modeAction(registering: isRegistering)).underline().foregroundStyle(Letterpress.ink))")
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.inkSecondary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(minHeight: Letterpress.minTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
        .accessibilityIdentifier("authMode")
    }

    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func registerUser() {
        isLoading = true
        failure = nil
        information = ""
        Task { @MainActor in
            defer { isLoading = false }
            do {
                let hasSession = try await supabaseService.signUp(email: trimmedEmail, password: password,
                                                                  name: name.trimmingCharacters(in: .whitespacesAndNewlines))
                if !hasSession {
                    information = AuthForm.confirmationSent
                    isRegistering = false
                    password = ""
                }
            } catch {
                failure = AuthForm.message(.register)
            }
        }
    }

    private func loginUser() {
        isLoading = true
        failure = nil
        information = ""
        Task { @MainActor in
            defer { isLoading = false }
            do { try await supabaseService.signIn(email: trimmedEmail, password: password) }
            catch { failure = AuthForm.message(.signIn) }
        }
    }

    private func recoverPassword() {
        failure = nil
        guard !trimmedEmail.isEmpty else {
            information = AuthForm.recoveryNeedsEmail
            return
        }
        isLoading = true
        information = ""
        Task { @MainActor in
            defer { isLoading = false }
            do {
                try await supabaseService.requestRecovery(email: trimmedEmail)
                information = AuthForm.recoverySent
            } catch {
                failure = AuthForm.message(.recovery)
            }
        }
    }

    private func clearForm() {
        email = ""
        password = ""
        name = ""
        failure = nil
        showingPassword = false
    }
}

#Preview {
    AuthenticationView {}
}
```

- [ ] **Step 4: Replace `ClearAF/Views/PasswordRecoveryView.swift`**

```swift
import SwiftUI

enum RecoveryForm {
    static let minimum = 8

    static func problem(password: String, confirmation: String) -> String? {
        if password.count < minimum { return "Use at least 8 characters." }
        if password != confirmation { return "The two passwords don't match yet." }
        return nil
    }
}

/// New password after a recovery link (adapted to spec §6 #1). The update call and sign-out after it are unchanged.
struct PasswordRecoveryView: View {
    @State private var password = ""
    @State private var confirmation = ""
    @State private var saving = false
    @State private var error = ""

    var body: some View {
        let problem = RecoveryForm.problem(password: password, confirmation: confirmation)
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                ClearAFWordmark()
                    .padding(.top, Letterpress.Space.s28)
                Text("Choose a new password")
                    .font(Letterpress.display(34, relativeTo: .largeTitle))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s44)
                Text("You opened a reset link. Set a new password, then sign in with it.")
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s14)
                VStack(alignment: .leading, spacing: Letterpress.Space.s22) {
                    LetterpressLabeledField(label: "New password", isEmpty: password.isEmpty) {
                        SecureField(text: $password, prompt: nil) { Text("New password") }
                            .textContentType(.newPassword)
                            .accessibilityIdentifier("recoveryPassword")
                    }
                    LetterpressLabeledField(label: "Confirm password", isEmpty: confirmation.isEmpty) {
                        SecureField(text: $confirmation, prompt: nil) { Text("Confirm password") }
                            .textContentType(.newPassword)
                            .accessibilityIdentifier("recoveryConfirmation")
                    }
                }
                .padding(.top, Letterpress.Space.s28)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Button(saving ? "Saving…" : "Update password", action: save)
                        .buttonStyle(.letterpress(.filled, fullWidth: true))
                        .disabled(saving || problem != nil)
                        .accessibilityIdentifier("recoverySubmit")
                    if !error.isEmpty {
                        Text(error)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                            .fixedSize(horizontal: false, vertical: true)
                    } else if let problem, !saving {
                        Text(problem)
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                    Button("Cancel and sign out") { APIService.shared.logout() }
                        .buttonStyle(.letterpress(.underline))
                        .disabled(saving)
                }
                .padding(.top, Letterpress.Space.s28)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
    }

    private func save() {
        saving = true
        error = ""
        Task { @MainActor in
            defer { saving = false }
            do { try await APIService.shared.updateRecoveredPassword(password) }
            catch { self.error = "Couldn't update your password. Try again or request a new reset email." }
        }
    }
}
```

- [ ] **Step 5: Move UI tests to identifiers**

```bash
perl -pi -e '
  s/textFields\["Enter your full name"\]/textFields["authName"]/g;
  s/textFields\["Enter your email"\]/textFields["authEmail"]/g;
  s/secureTextFields\["Enter your password"\]/secureTextFields["authPassword"]/g;
  s/buttons\["Forgot password\?"\]/buttons["authForgotPassword"]/g;
  s/secureTextFields\["New password \(at least 8 characters\)"\]/secureTextFields["recoveryPassword"]/g;
' ClearAFUITests/AccountFlowUITests.swift ClearAFUITests/MVPExperienceUITests.swift
grep -n 'Enter your\|Forgot password?\|New password (' ClearAFUITests/*.swift
```
Expected `grep`: no output. (`staticTexts["Choose a new password"]` and `staticTexts["authInformation"]` are unchanged and still match.)

- [ ] **Step 6: Record the omitted control** — append to the table in `docs/design/letterpress/deferred.md`:

```markdown
| iOS Sign in | "Use a magic link" | `SupabaseService` exchanges callback codes (confirmation, recovery) but has no send side (`signInWithOTP`); adding one is an auth-flow change (spec §0) |
| iOS Sign in | "Invited by a practice?" line | No invitation flow; patients create their own account |
```

- [ ] **Step 7: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/AuthPresentationTests -only-testing:ClearAFTests/AccountProfileTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: build succeeds including `ClearAFUITests`; PASS (5 auth tests; `registrationMetadataOmitsUnselectedSkinClassification` unchanged).

- [ ] **Step 8: Commit**

```bash
git add ClearAF/Views/AuthenticationView.swift ClearAF/Views/PasswordRecoveryView.swift ClearAFTests/AuthPresentationTests.swift ClearAFUITests docs/design/letterpress/deferred.md
git commit -m "ios: Letterpress sign in and password recovery with inline errors" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Profile and reminders — one ruled pushed list with the real care team [judgment]

**Files:**
- Create: `ClearAF/Views/CareTeam.swift`, `ClearAFTests/ProfilePresentationTests.swift`
- Modify (full rewrite): `ClearAF/Views/ProfileView.swift`, `ClearAF/Views/ReminderSettingsView.swift`
- Modify: `ClearAF/Views/DashboardViewEnhanced.swift` (one modifier), `ClearAFTests/PushedScreenTests.swift`, `ClearAFUITests/AccountFlowUITests.swift`, `ClearAFUITests/MVPExperienceUITests.swift`

**Interfaces:**
- Consumes: Task 2 `LetterpressLabeledField`; PR 3 `TodayCopy.initials(_:)`, `LetterpressFormat.dayMonthYear`; `APIService.currentUser`, `.updateName(_:)`, `.logout()`, `.currentMessages(ticket:)` (existing `MessagingTransport` read of `GET /assigned-messages/current`), `.messaging.conversation`, `.reminders`; `ReminderRepository` (`preferences`, `state`, `resume(ticket:)`, `save(_:ticket:)`, `refreshPermission()`); `ReminderPreferences`, `ReminderTime`; `AccountSaveState`, `AccountName.canSubmit`; `AccountAccess`, `AssignedConversation`; `Letterpress.toggleOn`.
- Produces (Task 5 relies on these):
  - `enum CareTeamState: Equatable { case loading, assigned(String), unassigned, failed }`; `@MainActor enum CareTeamLookup` — `load(access:fetch:) async -> CareTeamState?` (nil when the account changed), `merge(_:_:)`, `title(_:)`, `detail(_:) -> String?`; `struct CareTeamRow: View` (`init()`).
  - `struct ReminderSummaryRow: Equatable, Identifiable { id, title, detail, time: String? }`; `enum ReminderCopy` — `intro`, `deniedHelp`, `time(_:)`, `rows(_:weekdaySymbols:)`, `status(_:)`; `struct ReminderRows: View` (`init(draft: Binding<ReminderPreferences>)`).
  - `enum ProfileCopy` — `since(_:locale:timeZone:) -> String?`, `version(_:) -> String?`, `nameChanged(_:saved:) -> Bool`, `nameHint`.
  - `ProfileView()` and `ReminderSettingsView()` initialisers unchanged; `ProfileView` no longer owns a `NavigationStack` or Close button. Identifiers kept: `profileName`, `profileSaveName`, `profileSaveError`, `profileSaveConfirmation`, `profileEmail`, `profileSignOut`, `reminderStatus`; added `reminderSave`.
- Reviewers: `care-access-reviewer` (Profile and onboarding now read `GET /assigned-messages/current` to show the clinician's name; confirm it is the patient-scoped read that Today and Notes already make and that nothing is acknowledged).

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/ProfilePresentationTests.swift`

```swift
import Foundation
import Testing
@testable import ClearAF

@MainActor struct ProfilePresentationTests {
    static let symbols = Calendar(identifier: .gregorian).weekdaySymbols

    @Test func reminderRowsSummariseScheduleAndTime() {
        var preferences = ReminderPreferences()
        #expect(ReminderCopy.rows(preferences, weekdaySymbols: Self.symbols).map(\.detail) == ["Off", "Off", "Off"])
        #expect(ReminderCopy.rows(preferences, weekdaySymbols: Self.symbols).allSatisfy { $0.time == nil })
        preferences.morning = ReminderTime(enabled: true, hour: 7, minute: 5)
        preferences.photo = ReminderTime(enabled: true, hour: 18, minute: 0)
        preferences.weekday = 1
        let rows = ReminderCopy.rows(preferences, weekdaySymbols: Self.symbols)
        #expect(rows.map(\.title) == ["Morning routine", "Evening routine", "Weekly photo"])
        #expect(rows[0] == ReminderSummaryRow(id: "morning", title: "Morning routine", detail: "Every day", time: "07:05"))
        #expect(rows[2].detail == "Sundays" && rows[2].time == "18:00")
    }

    @Test func reminderStatusIsASentenceWithoutBlame() {
        #expect(ReminderCopy.status(.enabled) == "Reminders are scheduled on this device. Times follow your device's time zone.")
        #expect(ReminderCopy.status(.failed) == "Couldn't update reminders. Check your settings and try again.")
        #expect(ReminderCopy.status(.disabled) == "Reminders are off.")
    }

    @Test func profileCopyUsesRealAccountData() {
        let utc = TimeZone(identifier: "UTC")!
        #expect(ProfileCopy.since("2026-07-30T10:00:00.000Z", locale: Locale(identifier: "en_US"), timeZone: utc) == "Patient since 30 Jul 2026")
        #expect(ProfileCopy.since(nil) == nil)
        #expect(ProfileCopy.version(["CFBundleShortVersionString": "1.0", "CFBundleVersion": "12"]) == "ClearAF 1.0 · build 12")
        #expect(ProfileCopy.version(nil) == nil)
        #expect(!ProfileCopy.nameChanged("  Sam Patient ", saved: "Sam Patient"))
        #expect(ProfileCopy.nameChanged("Sam", saved: "Sam Patient"))
    }

    private func conversation(_ name: String) -> AssignedConversation {
        AssignedConversation(patientId: UUID(), clinicianId: UUID(), patientName: nil, clinicianName: name, lastMessage: nil, unreadCount: 0)
    }

    @Test func careTeamComesFromTheAssignedConversation() async {
        let access = AccountAccess()
        _ = access.activate(UUID())
        #expect(await CareTeamLookup.load(access: access) { _ in self.conversation("Synthetic Clinician") } == .assigned("Synthetic Clinician"))
        #expect(await CareTeamLookup.load(access: access) { _ in nil } == .unassigned)
        #expect(await CareTeamLookup.load(access: access) { _ in throw URLError(.notConnectedToInternet) } == .failed)
        #expect(CareTeamLookup.title(.assigned("Synthetic Clinician")) == "Synthetic Clinician")
        #expect(CareTeamLookup.title(.unassigned) == "No clinician assigned yet")
    }

    @Test func careTeamDropsLateResultsAndKeepsAShownName() async {
        let access = AccountAccess()
        _ = access.activate(UUID())
        let result = await CareTeamLookup.load(access: access) { _ in
            access.invalidate()
            return self.conversation("Previous Account Clinician")
        }
        #expect(result == nil)
        #expect(CareTeamLookup.merge(.assigned("Synthetic Clinician"), .failed) == .assigned("Synthetic Clinician"))
        #expect(CareTeamLookup.merge(.loading, .failed) == .failed)
        #expect(CareTeamLookup.merge(.assigned("Synthetic Clinician"), .unassigned) == .unassigned)
    }
}
```

In `ClearAFTests/PushedScreenTests.swift` replace the `pushed` list and add two tests inside the struct:

```swift
    static let pushed = ["CompletionCalendarView.swift", "CheckInView.swift", "ProfileView.swift", "ReminderSettingsView.swift"]

    @Test func todayPushesProfileInsteadOfPresentingASheet() throws {
        let files = try LetterpressSweepTests.sources(in: ["ClearAF/Views"])
        let today = try #require(files.first { $0.path.hasSuffix("/DashboardViewEnhanced.swift") })
        #expect(today.text.contains(".navigationDestination(isPresented: $showingProfile)"))
        #expect(!today.text.contains(".sheet(isPresented: $showingProfile)"))
    }

    @Test func reminderTogglesUseTheContrastSafeTint() throws {
        let files = try LetterpressSweepTests.sources(in: ["ClearAF/Views"])
        let reminders = try #require(files.first { $0.path.hasSuffix("/ReminderSettingsView.swift") })
        #expect(reminders.text.contains("Toggle("))
        #expect(reminders.text.contains(".tint(Letterpress.toggleOn)"))
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/ProfilePresentationTests -only-testing:ClearAFTests/PushedScreenTests`
Expected: build FAIL — `cannot find 'ReminderCopy' in scope`.

- [ ] **Step 3: Create `ClearAF/Views/CareTeam.swift`**

```swift
import SwiftUI

enum CareTeamState: Equatable {
    case loading
    case assigned(String)
    case unassigned
    case failed
}

/// The assigned clinician's name, from the existing patient-scoped `GET /assigned-messages/current` read.
/// Reading it acknowledges nothing; acknowledgement stays in Notes.
@MainActor enum CareTeamLookup {
    /// Returns nil when the account changed while the request was in flight, so a late answer is never shown.
    static func load(access: AccountAccess,
                     fetch: (AccountAccess.Ticket) async throws -> AssignedConversation?) async -> CareTeamState? {
        guard let ticket = access.snapshot() else { return nil }
        do {
            let conversation = try await fetch(ticket)
            guard access.snapshot() == ticket else { return nil }
            return conversation.map { .assigned($0.clinicianName) } ?? .unassigned
        } catch {
            guard access.snapshot() == ticket else { return nil }
            return .failed
        }
    }

    /// A failed refresh keeps a name already on screen.
    static func merge(_ current: CareTeamState, _ loaded: CareTeamState) -> CareTeamState {
        if loaded == .failed, case .assigned = current { return current }
        return loaded
    }

    static func title(_ state: CareTeamState) -> String {
        switch state {
        case .loading: "Loading your care team"
        case .assigned(let name): name
        case .unassigned: "No clinician assigned yet"
        case .failed: "Couldn't load your care team"
        }
    }

    static func detail(_ state: CareTeamState) -> String? {
        switch state {
        case .loading: nil
        case .assigned: "Reads the photos, check-ins and notes you send"
        case .unassigned: "Their name appears here once one is assigned."
        case .failed: "Check your connection and try again."
        }
    }
}

/// Ruled care-team row used on Profile and onboarding.
struct CareTeamRow: View {
    @State private var state: CareTeamState

    init() {
        _state = State(initialValue: APIService.shared.messaging.conversation.map { .assigned($0.clinicianName) } ?? .loading)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s14) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text(CareTeamLookup.title(state))
                        .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                        .foregroundStyle(state == .failed ? Letterpress.error : Letterpress.ink)
                    if let detail = CareTeamLookup.detail(state) {
                        Text(detail)
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: Letterpress.Space.s10)
                if case .assigned = state {
                    Text("ASSIGNED")
                        .font(Letterpress.data(11, relativeTo: .caption))
                        .foregroundStyle(Letterpress.ink)
                }
            }
            .accessibilityElement(children: .combine)
            if state == .failed {
                Button("Try again") { Task { await reload() } }
                    .buttonStyle(.letterpress(.underline))
            }
        }
        .padding(.vertical, Letterpress.Space.s10)
        .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
        .overlay(alignment: .top) { LetterpressRule() }
        .overlay(alignment: .bottom) { LetterpressRule() }
        .task { await reload() }
    }

    private func reload() async {
        let shown = state
        if state == .failed { state = .loading }
        guard let loaded = await CareTeamLookup.load(access: APIService.shared.access, fetch: {
            try await APIService.shared.currentMessages(ticket: $0)
        }) else { return }
        state = CareTeamLookup.merge(shown, loaded)
    }
}
```

- [ ] **Step 4: Replace `ClearAF/Views/ReminderSettingsView.swift`**

```swift
import SwiftUI

struct ReminderSummaryRow: Equatable, Identifiable {
    let id: String
    let title: String
    let detail: String
    let time: String?
}

enum ReminderCopy {
    static let intro = "Choose reminders that work for you. They stay on this device and pause when you sign out."
    static let deniedHelp = "Allow notifications for ClearAF in iPhone Settings, then try saving again."

    static func time(_ reminder: ReminderTime) -> String { String(format: "%02d:%02d", reminder.hour, reminder.minute) }

    static func rows(_ preferences: ReminderPreferences, weekdaySymbols: [String] = Calendar.current.weekdaySymbols) -> [ReminderSummaryRow] {
        let index = preferences.weekday - 1
        let weekly = weekdaySymbols.indices.contains(index) ? "\(weekdaySymbols[index])s" : "Once a week"
        return [
            row("morning", "Morning routine", preferences.morning, schedule: "Every day"),
            row("evening", "Evening routine", preferences.evening, schedule: "Every day"),
            row("photo", "Weekly photo", preferences.photo, schedule: weekly),
        ]
    }

    private static func row(_ id: String, _ title: String, _ reminder: ReminderTime, schedule: String) -> ReminderSummaryRow {
        ReminderSummaryRow(id: id, title: title, detail: reminder.enabled ? schedule : "Off", time: reminder.enabled ? time(reminder) : nil)
    }

    static func status(_ state: ReminderRepository.State) -> String {
        switch state {
        case .disabled: "Reminders are off."
        case .paused: "Saved preferences. Save to turn reminders on."
        case .saving: "Updating reminders…"
        case .enabled: "Reminders are scheduled on this device. Times follow your device's time zone."
        case .denied: "Notification permission is off. Reminders aren't scheduled."
        case .failed: "Couldn't update reminders. Check your settings and try again."
        }
    }
}

/// Toggle and time rows shared by Reminders and onboarding. Changes stay in `draft` until the screen saves.
struct ReminderRows: View {
    @Binding var draft: ReminderPreferences

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            row("Morning routine", schedule: "Every day", time: $draft.morning)
            row("Evening routine", schedule: "Every day", time: $draft.evening)
            row("Weekly photo", schedule: "Once a week", time: $draft.photo)
            if draft.photo.enabled {
                HStack(spacing: Letterpress.Space.s10) {
                    Text("Day")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                    Spacer(minLength: Letterpress.Space.s10)
                    Picker("Day", selection: $draft.weekday) {
                        ForEach(1...7, id: \.self) { day in Text(Calendar.current.weekdaySymbols[day - 1]).tag(day) }
                    }
                    .pickerStyle(.menu)
                    .tint(Letterpress.ink)
                }
                .frame(minHeight: Letterpress.minTouch)
                .overlay(alignment: .top) { LetterpressRule() }
            }
            LetterpressRule()
        }
    }

    private func row(_ title: String, schedule: String, time: Binding<ReminderTime>) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            Toggle(isOn: time.enabled) {
                VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                    Text(title)
                        .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                    Text(schedule)
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .tint(Letterpress.toggleOn)
            if time.wrappedValue.enabled {
                DatePicker("\(title) time", selection: Binding(get: {
                    Calendar.current.date(from: DateComponents(hour: time.wrappedValue.hour, minute: time.wrappedValue.minute)) ?? Date()
                }, set: { date in
                    time.wrappedValue.hour = Calendar.current.component(.hour, from: date)
                    time.wrappedValue.minute = Calendar.current.component(.minute, from: date)
                }), displayedComponents: .hourAndMinute)
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.ink)
                .tint(Letterpress.ink)
            }
        }
        .padding(.vertical, Letterpress.Space.s10)
        .frame(minHeight: Letterpress.minTouch)
        .overlay(alignment: .top) { LetterpressRule() }
    }
}

/// Reminder settings, pushed from Profile. Saving keeps the existing explicit permission request.
struct ReminderSettingsView: View {
    @ObservedObject private var api = APIService.shared
    @ObservedObject private var repository = APIService.shared.reminders
    @State private var draft = ReminderPreferences()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text(ReminderCopy.intro)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                ReminderRows(draft: $draft)
                    .padding(.top, Letterpress.Space.s22)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Button(repository.state == .saving ? "Saving…" : "Save reminders") {
                        guard let ticket = api.access.snapshot() else { return }
                        Task { await repository.save(draft, ticket: ticket) }
                    }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(repository.state == .saving)
                    .accessibilityIdentifier("reminderSave")
                    Text(ReminderCopy.status(repository.state))
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(repository.state == .failed ? Letterpress.error : Letterpress.inkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("reminderStatus")
                    if repository.state == .denied {
                        Text(ReminderCopy.deniedHelp)
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, Letterpress.Space.s22)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.top, Letterpress.Space.s18)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .navigationTitle("Reminders")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .task {
            if let ticket = api.access.snapshot() { await repository.resume(ticket: ticket) }
            draft = repository.preferences
            await repository.refreshPermission()
        }
    }
}
```

- [ ] **Step 5: Replace `ClearAF/Views/ProfileView.swift`**

```swift
import SwiftUI

enum ProfileCopy {
    static let nameHint = "Use between 2 and 100 characters."
    static let removalTitle = "Account removal is not available yet"
    static let removalMessage = "The practice must finalize its record-retention and deletion process before account removal is enabled. Signing out ends access on this device; it does not delete your account or clinical records."

    /// "Patient since 30 Jul 2026", set in mono and uppercased by the view.
    static func since(_ createdAt: String?, locale: Locale = .current, timeZone: TimeZone = .current) -> String? {
        guard let createdAt, let date = RoutineDates.instant(createdAt) else { return nil }
        return "Patient since \(LetterpressFormat.dayMonthYear(date, locale: locale, timeZone: timeZone))"
    }

    static func version(_ info: [String: Any]?) -> String? {
        guard let short = info?["CFBundleShortVersionString"] as? String, let build = info?["CFBundleVersion"] as? String else { return nil }
        return "ClearAF \(short) · build \(build)"
    }

    static func nameChanged(_ name: String, saved: String?) -> Bool {
        name.trimmingCharacters(in: .whitespacesAndNewlines) != (saved ?? "")
    }
}

/// Profile and settings (spec §6 #11): one ruled list, pushed from Today, no tab bar, no bottom spacer.
/// Auto-share, keep originals and PDF export are omitted (deferred.md).
struct ProfileView: View {
    @ObservedObject private var api = APIService.shared
    @ObservedObject private var reminders = APIService.shared.reminders
    @StateObject private var saveState = AccountSaveState()
    @State private var name = ""
    @State private var showingRemovalInfo = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                LetterpressRule(weight: .major)
                    .padding(.top, Letterpress.Space.s18)
                section("Care team") { CareTeamRow() }
                section("Reminders") { reminderSummary }
                section("Account") { account }
                VStack(alignment: .leading, spacing: Letterpress.Space.s14) {
                    Button("Sign out") { api.logout() }
                        .buttonStyle(.letterpress(.underline))
                        .accessibilityIdentifier("profileSignOut")
                    if let version = ProfileCopy.version(Bundle.main.infoDictionary) {
                        Text(version)
                            .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                            .textCase(.uppercase)
                            .foregroundStyle(Letterpress.inkTertiary)
                    }
                }
                .padding(.top, Letterpress.Space.s28)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.top, Letterpress.Space.s10)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .alert(ProfileCopy.removalTitle, isPresented: $showingRemovalInfo) {
            Button("OK") {}
        } message: {
            Text(ProfileCopy.removalMessage)
        }
        .onAppear { name = api.currentUser?.name ?? "" }
    }

    private var header: some View {
        HStack(spacing: Letterpress.Space.s14) {
            Group {
                let initials = TodayCopy.initials(api.currentUser?.name)
                if initials.isEmpty {
                    Image(systemName: "person").font(Letterpress.ui(17, relativeTo: .body))
                } else {
                    Text(initials).font(Letterpress.data(17, relativeTo: .body))
                }
            }
            .foregroundStyle(Letterpress.canvas)
            .frame(width: 56, height: 56)
            .background(Letterpress.ink, in: Circle())
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text(api.currentUser?.name ?? "Your profile")
                    .font(Letterpress.display(26, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                    .accessibilityAddTraits(.isHeader)
                if let since = ProfileCopy.since(api.currentUser?.createdAt) {
                    Text(since)
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .textCase(.uppercase)
                        .foregroundStyle(Letterpress.inkTertiary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .letterpressEyebrow()
                .padding(.bottom, Letterpress.Space.s10)
                .accessibilityAddTraits(.isHeader)
            content()
        }
        .padding(.top, Letterpress.Space.s22)
    }

    private var reminderSummary: some View {
        let rows = ReminderCopy.rows(reminders.preferences)
        return VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            NavigationLink { ReminderSettingsView() } label: {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(rows) { row in
                        HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s14) {
                            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                                Text(row.title)
                                    .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                                    .foregroundStyle(Letterpress.ink)
                                Text(row.detail)
                                    .font(Letterpress.ui(13, relativeTo: .footnote))
                                    .foregroundStyle(Letterpress.inkSecondary)
                            }
                            .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: Letterpress.Space.s10)
                            if let time = row.time {
                                Text(time)
                                    .font(Letterpress.data(12, weight: .regular, relativeTo: .caption))
                                    .foregroundStyle(Letterpress.ink)
                            }
                            Image(systemName: "chevron.right")
                                .font(Letterpress.ui(13, relativeTo: .footnote))
                                .foregroundStyle(Letterpress.inkTertiary)
                                .accessibilityHidden(true)
                        }
                        .padding(.vertical, Letterpress.Space.s10)
                        .frame(minHeight: Letterpress.minTouch)
                        .overlay(alignment: .top) { LetterpressRule() }
                    }
                    LetterpressRule()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Reminders. " + rows.map { "\($0.title), \($0.time.map { "\($0), " } ?? "")\($0.detail)" }.joined(separator: ". "))
            .accessibilityHint("Change reminder times")
            .accessibilityAddTraits(.isButton)
            Text(ReminderCopy.status(reminders.state))
                .font(Letterpress.ui(13, relativeTo: .footnote))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var account: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
            LetterpressLabeledField(label: "Name", isEmpty: name.isEmpty, message: ProfileCopy.nameHint) {
                TextField(text: $name, prompt: nil, axis: .vertical) { Text("Name") }
                    .textContentType(.name)
                    .accessibilityIdentifier("profileName")
            }
            if ProfileCopy.nameChanged(name, saved: api.currentUser?.name) {
                Button(saveState.isSaving ? "Saving…" : "Save name", action: saveName)
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(!AccountName.canSubmit(name, isSaving: saveState.isSaving))
                    .accessibilityIdentifier("profileSaveName")
            }
            if let saveError = saveState.errorMessage {
                Text(saveError)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("profileSaveError")
            }
            if let saveConfirmation = saveState.successMessage {
                Text(saveConfirmation)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .accessibilityIdentifier("profileSaveConfirmation")
            }
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                Text("Email").letterpressEyebrow().accessibilityHidden(true)
                Text(api.currentUser?.email ?? "Unavailable")
                    .font(Letterpress.ui(16, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Email")
                    .accessibilityValue(api.currentUser?.email ?? "Unavailable")
                    .accessibilityIdentifier("profileEmail")
            }
            Button { showingRemovalInfo = true } label: {
                HStack(spacing: Letterpress.Space.s14) {
                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                        Text("Account removal")
                            .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                        Text("How removal works today")
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: Letterpress.Space.s10)
                    Image(systemName: "chevron.right")
                        .font(Letterpress.ui(13, relativeTo: .footnote))
                        .foregroundStyle(Letterpress.inkTertiary)
                        .accessibilityHidden(true)
                }
                .padding(.vertical, Letterpress.Space.s10)
                .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
                .overlay(alignment: .top) { LetterpressRule() }
                .overlay(alignment: .bottom) { LetterpressRule() }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Explains the current account removal process")
        }
    }

    private func saveName() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard AccountName.canSubmit(trimmed, isSaving: saveState.isSaving) else { return }
        Task { @MainActor in
            await saveState.perform(success: "Name saved",
                                    failure: "Your name could not be saved. Check your connection and try again.") {
                try await APIService.shared.updateName(trimmed)
            }
            if saveState.errorMessage == nil { name = trimmed }
        }
    }
}

#Preview {
    NavigationStack { ProfileView() }
}
```

- [ ] **Step 6: Push Profile from Today**

```bash
perl -0pi -e 's/\.sheet\(isPresented: \$showingProfile\) \{\s*ProfileView\(\)\s*\.environment\(\\\.managedObjectContext, viewContext\)\s*\}/.navigationDestination(isPresented: \$showingProfile) { ProfileView() }/' ClearAF/Views/DashboardViewEnhanced.swift
grep -n "showingProfile" ClearAF/Views/DashboardViewEnhanced.swift
```
Expected `grep`: the `@State` line, the `TodayGreeting(... showingProfile: $showingProfile)` call, `.navigationDestination(isPresented: $showingProfile) { ProfileView() }`, and the greeting's binding and assignment. No `.sheet`. If PR 3 landed the sheet with different whitespace or without the environment modifier and the substitution printed nothing new, edit that modifier by hand to the same one-line `navigationDestination`.

- [ ] **Step 7: Follow the UI tests** (back button replaces Close; Sign out may be below the fold)

```bash
perl -0pi -e '
  s/app\.buttons\["Close profile"\]\.tap\(\)/app.navigationBars["Profile"].buttons.element(boundBy: 0).tap()/g;
  s/app\.buttons\["Profile"\]\.tap\(\);?\s*app\.buttons\["Sign out"\]\.tap\(\)/app.buttons["Profile"].tap()\n        for _ in 0..<8 where !app.buttons["Sign out"].isHittable { app.swipeUp() }\n        app.buttons["Sign out"].tap()/g;
' ClearAFUITests/AccountFlowUITests.swift ClearAFUITests/MVPExperienceUITests.swift
grep -n 'Close profile\|"Profile"\].tap(); app.buttons\["Sign out"\]' ClearAFUITests/*.swift
```
Expected `grep`: no output.

- [ ] **Step 8: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/ProfilePresentationTests -only-testing:ClearAFTests/PushedScreenTests -only-testing:ClearAFTests/ReminderTests -only-testing:ClearAFTests/AccountProfileTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: build succeeds including `ClearAFUITests`; PASS (5 profile tests, 3 pushed-screen tests, reminder repository tests unchanged).

- [ ] **Step 9: Commit**

```bash
git add ClearAF/Views/CareTeam.swift ClearAF/Views/ProfileView.swift ClearAF/Views/ReminderSettingsView.swift ClearAF/Views/DashboardViewEnhanced.swift ClearAFTests/ProfilePresentationTests.swift ClearAFTests/PushedScreenTests.swift ClearAFUITests
git commit -m "ios: pushed profile list with care team and reminder summaries" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Onboarding — five concrete steps with rule progress [judgment]

**Files:**
- Create: `ClearAFTests/OnboardingTests.swift`
- Modify (full rewrite): `ClearAF/Views/OnboardingView.swift`
- Modify: `ClearAF/ContentView.swift` (onboarding case), `ClearAF/Views/UrgentReportView.swift` (delete `UrgentReportButton`), `ClearAFUITests/AccountFlowUITests.swift` (`finishOnboarding` helper), `docs/design/letterpress/deferred.md`

**Interfaces:**
- Consumes: Task 2 `LetterpressProgressRule`, `LetterpressLabeledField`; Task 4 `CareTeamRow`, `ReminderRows`, `ReminderCopy.deniedHelp`; PR 3 `UrgentReportEntry(horizontalPadding:)`; `AccountSaveState`, `AccountName.canSubmit`, `APIService.finishOnboarding(name:)`, `.logout()`, `.reminders` (`preferences`, `state`, `save(_:ticket:)`).
- Produces:
  - `struct OnboardingRow: Equatable { title, detail }`.
  - `enum OnboardingStep: Int, CaseIterable, Identifiable { case routine, careTeam, privacy, reminders, name }` — `counter` ("02/05"), `title`, `shortName`, `next`, `previous`, `nextHint`, `canSkip`, `static let skipTarget`.
  - `enum OnboardingCopy` — `routineIntro`, `routineRows`, `careTeamIntro`, `privacyIntro`, `privacyRows`, `remindersIntro`, `reminderFailure`, `nameIntro`, `nameHint`, `primary(_:remindersChanged:saving:) -> String`.
  - `OnboardingView(onboardingComplete:)` initialiser unchanged. Identifiers: `onboardingContinue` (every step's filled button), `onboardingBack`, `onboardingSkip`, `onboardingName`, `onboardingError`. `onboardingRetry` is removed (Finish retries).
  - `UrgentReportButton` no longer exists.
- Reviewers: `care-access-reviewer` (onboarding privacy copy must match the access model; care-team read as in Task 4).

- [ ] **Step 1: Write the failing tests** — `ClearAFTests/OnboardingTests.swift`

```swift
import Testing
@testable import ClearAF

struct OnboardingTests {
    @Test func fiveStepsInOrderWithMonoCounters() {
        #expect(OnboardingStep.allCases == [.routine, .careTeam, .privacy, .reminders, .name])
        #expect(OnboardingStep.careTeam.counter == "02/05")
        #expect(OnboardingStep.name.counter == "05/05")
        #expect(OnboardingStep.routine.next == .careTeam)
        #expect(OnboardingStep.name.next == nil)
        #expect(OnboardingStep.routine.previous == nil)
        #expect(OnboardingStep.careTeam.nextHint == "Next: what stays private")
        #expect(OnboardingStep.privacy.nextHint == "Next: reminder times")
        #expect(OnboardingStep.name.nextHint == nil)
    }

    @Test func skipLandsOnTheRequiredNameStep() {
        #expect(OnboardingStep.skipTarget == .name)
        #expect(OnboardingStep.allCases.filter(\.canSkip) == [.routine, .careTeam, .privacy, .reminders])
    }

    @Test func promiseIsConcreteAndAccurate() {
        #expect(OnboardingCopy.routineRows.count == 3)
        #expect(OnboardingCopy.privacyRows.count == 3)
        let all = ([OnboardingCopy.routineIntro, OnboardingCopy.careTeamIntro, OnboardingCopy.privacyIntro,
                    OnboardingCopy.remindersIntro, OnboardingCopy.nameIntro, OnboardingCopy.reminderFailure]
                   + OnboardingStep.allCases.map(\.title)
                   + (OnboardingCopy.routineRows + OnboardingCopy.privacyRows).flatMap { [$0.title, $0.detail] })
            .joined(separator: " ")
        for banned in ["!", "streak", "score", "private until you share", "guide", "Dr. Om", "journey"] {
            #expect(!all.localizedCaseInsensitiveContains(banned), "\(banned)")
        }
        let privacy = OnboardingCopy.privacyRows.map(\.detail).joined(separator: " ")
        #expect(privacy.contains("clinician assigned to you"))
        #expect(privacy.contains("shared with your clinician"))
        #expect(privacy.contains("stay on this device"))
    }

    @Test func primaryButtonSaysWhatItWillDo() {
        #expect(OnboardingCopy.primary(.routine, remindersChanged: false, saving: false) == "Continue")
        #expect(OnboardingCopy.primary(.reminders, remindersChanged: false, saving: false) == "Continue")
        #expect(OnboardingCopy.primary(.reminders, remindersChanged: true, saving: false) == "Save reminders and continue")
        #expect(OnboardingCopy.primary(.name, remindersChanged: false, saving: false) == "Finish")
        #expect(OnboardingCopy.primary(.name, remindersChanged: false, saving: true) == "Saving…")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/OnboardingTests`
Expected: build FAIL — `cannot find 'OnboardingStep' in scope`.

- [ ] **Step 3: Replace `ClearAF/Views/OnboardingView.swift`**

```swift
import SwiftUI

struct OnboardingRow: Equatable {
    let title: String
    let detail: String
}

/// Five steps (spec §6 #2): what you do, who reads it, what stays private, reminders, your name.
enum OnboardingStep: Int, CaseIterable, Identifiable {
    case routine, careTeam, privacy, reminders, name

    static let skipTarget: OnboardingStep = .name

    var id: Int { rawValue }
    var counter: String { String(format: "%02d/%02d", rawValue + 1, Self.allCases.count) }
    var next: OnboardingStep? { Self(rawValue: rawValue + 1) }
    var previous: OnboardingStep? { Self(rawValue: rawValue - 1) }
    var canSkip: Bool { self != .name }
    var nextHint: String? { next.map { "Next: \($0.shortName)" } }

    var title: String {
        switch self {
        case .routine: "Here's what you'll do"
        case .careTeam: "Who's looking after your skin?"
        case .privacy: "What stays private"
        case .reminders: "Would reminders help?"
        case .name: "What should we call you?"
        }
    }

    var shortName: String {
        switch self {
        case .routine: "what you'll do"
        case .careTeam: "who reads your record"
        case .privacy: "what stays private"
        case .reminders: "reminder times"
        case .name: "your name"
        }
    }
}

/// Onboarding copy. Every sentence describes something the app does today; nothing motivational.
enum OnboardingCopy {
    static let routineIntro = "Your clinician sets the plan. This is your part of it."
    static let routineRows = [
        OnboardingRow(title: "Take a dated photo", detail: "Same light and angle each time makes changes easier for your clinician to compare."),
        OnboardingRow(title: "Follow the routine you're given", detail: "Morning and evening, set by your clinician. When it changes, you see the new version."),
        OnboardingRow(title: "Answer check-ins", detail: "Your clinician writes the questions. Your answers are sent together when you finish."),
    ]
    static let careTeamIntro = "Your clinician assigns your routines and reads the photos, check-ins and notes you send."
    static let privacyIntro = "Plainly, who can see what."
    static let privacyRows = [
        OnboardingRow(title: "You and your clinician", detail: "Your photos, routines, check-ins and notes are visible to you and the clinician assigned to you."),
        OnboardingRow(title: "Photos are stored privately", detail: "Each photo you save uploads to private storage and is shared with your clinician. It is never public."),
        OnboardingRow(title: "Some things stay on this phone", detail: "Reminder times, and anything you haven't sent yet, stay on this device."),
    ]
    static let remindersIntro = "Optional. Reminders stay on this device and pause when you sign out."
    static let reminderFailure = "Couldn't update reminders. Try again, or skip them for now."
    static let nameIntro = "Your clinician sees this name on your record."
    static let nameHint = "Use between 2 and 100 characters."

    static func primary(_ step: OnboardingStep, remindersChanged: Bool, saving: Bool) -> String {
        if saving { return "Saving…" }
        switch step {
        case .reminders: return remindersChanged ? "Save reminders and continue" : "Continue"
        case .name: return "Finish"
        default: return "Continue"
        }
    }
}

struct OnboardingView: View {
    @StateObject private var saveState = AccountSaveState()
    @ObservedObject private var reminders = APIService.shared.reminders
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var step: OnboardingStep = .routine
    @State private var userName = ""
    @State private var reminderDraft = ReminderPreferences()
    let onboardingComplete: () -> Void

    private var busy: Bool { saveState.isSaving || reminders.state == .saving }
    private var remindersChanged: Bool { reminderDraft != reminders.preferences }
    private var canAdvance: Bool {
        step == .name ? AccountName.canSubmit(userName, isSaving: saveState.isSaving) : !busy
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    stepContent
                    if dynamicTypeSize.isAccessibilitySize {
                        actions.padding(.top, Letterpress.Space.s28)
                    }
                    footer.padding(.top, Letterpress.Space.s44)
                }
                .padding(.horizontal, Letterpress.Space.s22)
                .padding(.top, Letterpress.Space.s28)
                .padding(.bottom, Letterpress.Space.s28)
                .frame(maxWidth: 600, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .id(step)
            if !dynamicTypeSize.isAccessibilitySize {
                // Kept in view below the scroll area on regular text sizes; it scrolls with content at accessibility sizes.
                actions
                    .padding(.horizontal, Letterpress.Space.s22)
                    .padding(.vertical, Letterpress.Space.s14)
                    .frame(maxWidth: 600)
                    .frame(maxWidth: .infinity)
                    .background(Letterpress.canvas)
                    .overlay(alignment: .top) { LetterpressRule() }
            }
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .onAppear {
            if userName.isEmpty { userName = APIService.shared.currentUser?.name ?? "" }
        }
        .onChange(of: step) { _, newStep in
            if newStep == .reminders { reminderDraft = reminders.preferences }
        }
    }

    private var header: some View {
        HStack(spacing: Letterpress.Space.s10) {
            Text(step.counter)
                .font(Letterpress.data(11, relativeTo: .caption))
                .foregroundStyle(Letterpress.ink)
                .accessibilityLabel("Step \(step.rawValue + 1) of \(OnboardingStep.allCases.count)")
            LetterpressProgressRule(completed: step.rawValue + 1, total: OnboardingStep.allCases.count)
            if step.canSkip {
                Button("Skip") { step = OnboardingStep.skipTarget }
                    .buttonStyle(.letterpress(.underline))
                    .disabled(busy)
                    .accessibilityHint("Goes to the last step")
                    .accessibilityIdentifier("onboardingSkip")
            }
        }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.top, Letterpress.Space.s10)
        .frame(minHeight: Letterpress.minTouch)
    }

    @ViewBuilder private var stepContent: some View {
        Text(step.title)
            .font(Letterpress.display(34, relativeTo: .largeTitle))
            .foregroundStyle(Letterpress.ink)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
        switch step {
        case .routine:
            intro(OnboardingCopy.routineIntro)
            numberedRows(OnboardingCopy.routineRows)
        case .careTeam:
            intro(OnboardingCopy.careTeamIntro)
            CareTeamRow()
                .padding(.top, Letterpress.Space.s22)
        case .privacy:
            intro(OnboardingCopy.privacyIntro)
            numberedRows(OnboardingCopy.privacyRows)
        case .reminders:
            intro(OnboardingCopy.remindersIntro)
            ReminderRows(draft: $reminderDraft)
                .padding(.top, Letterpress.Space.s22)
            if reminders.state == .failed {
                message(OnboardingCopy.reminderFailure, isError: true)
            } else if reminders.state == .denied {
                message(ReminderCopy.deniedHelp, isError: false)
            }
        case .name:
            intro(OnboardingCopy.nameIntro)
            LetterpressLabeledField(label: "Your name", isEmpty: userName.isEmpty, message: OnboardingCopy.nameHint) {
                TextField(text: $userName, prompt: nil) { Text("Your name") }
                    .textContentType(.name)
                    .accessibilityIdentifier("onboardingName")
            }
            .padding(.top, Letterpress.Space.s22)
            if let saveError = saveState.errorMessage {
                message(saveError, isError: true)
                    .accessibilityIdentifier("onboardingError")
            }
        }
    }

    private func intro(_ text: String) -> some View {
        Text(text)
            .font(Letterpress.ui(15, relativeTo: .body))
            .foregroundStyle(Letterpress.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Letterpress.Space.s14)
    }

    private func message(_ text: String, isError: Bool) -> some View {
        Text(text)
            .font(Letterpress.ui(15, relativeTo: .body))
            .foregroundStyle(isError ? Letterpress.error : Letterpress.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, Letterpress.Space.s14)
    }

    private func numberedRows(_ rows: [OnboardingRow]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                HStack(alignment: .firstTextBaseline, spacing: Letterpress.Space.s14) {
                    Text(String(format: "%02d", index + 1))
                        .font(Letterpress.data(11, relativeTo: .caption))
                        .foregroundStyle(Letterpress.ink)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                        Text(row.title)
                            .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                        Text(row.detail)
                            .font(Letterpress.ui(14, relativeTo: .subheadline))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, Letterpress.Space.s14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { LetterpressRule() }
                .accessibilityElement(children: .combine)
            }
            LetterpressRule()
        }
        .padding(.top, Letterpress.Space.s22)
    }

    private var actions: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: Letterpress.Space.s10))
            : AnyLayout(HStackLayout(spacing: Letterpress.Space.s10))
        return VStack(spacing: Letterpress.Space.s10) {
            layout {
                if let previous = step.previous {
                    Button("Back") { step = previous }
                        .buttonStyle(.letterpress(.outlined, fullWidth: dynamicTypeSize.isAccessibilitySize))
                        .disabled(busy)
                        .accessibilityIdentifier("onboardingBack")
                }
                Button(OnboardingCopy.primary(step, remindersChanged: remindersChanged, saving: busy), action: advance)
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(!canAdvance)
                    .accessibilityIdentifier("onboardingContinue")
            }
            if let hint = step.nextHint {
                Text(hint)
                    .font(Letterpress.ui(12, relativeTo: .caption))
                    .foregroundStyle(Letterpress.inkTertiary)
            }
        }
    }

    /// The urgent-report entry owns its sheet, so the sheet closes when onboarding ends.
    private var footer: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            UrgentReportEntry(horizontalPadding: 0)
            Button("Sign out") { APIService.shared.logout() }
                .buttonStyle(.letterpress(.underline))
                .disabled(busy)
        }
    }

    private func advance() {
        switch step {
        case .reminders:
            guard remindersChanged, let ticket = APIService.shared.access.snapshot() else {
                step = .name
                return
            }
            Task { @MainActor in
                await reminders.save(reminderDraft, ticket: ticket)
                if reminders.state != .failed { step = .name }
            }
        case .name:
            completeOnboarding()
        default:
            if let next = step.next { step = next }
        }
    }

    private func completeOnboarding() {
        let name = userName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard AccountName.canSubmit(name, isSaving: saveState.isSaving) else { return }
        Task { @MainActor in
            await saveState.perform(success: nil,
                                    failure: "Your profile could not be saved. Check your connection and try again.") {
                try await APIService.shared.finishOnboarding(name: name)
            }
            if saveState.errorMessage == nil { onboardingComplete() }
        }
    }
}

#Preview {
    OnboardingView {}
}
```

- [ ] **Step 4: Remove the onboarding overlay from `ContentView` and the unused button**

```bash
perl -0pi -e '
  s/\n    \@State private var showingUrgent = false//;
  s/OnboardingView \{\}\n\s*\.overlay\(alignment: \.topTrailing\) \{.*?\n\s*\.sheet\(isPresented: \$showingUrgent\) \{ UrgentReportView\(\) \}/OnboardingView {}/s;
  s/\n\s*\/\/ The onboarding urgent sheet belongs to one phase and one login; never carry it into the next\.\n\s*showingUrgent = false//;
' ClearAF/ContentView.swift
perl -0pi -e 's{\n(///[^\n]*\n)*struct UrgentReportButton: View \{.*?\n\}\n}{\n}s' ClearAF/Views/UrgentReportView.swift
grep -rn "showingUrgent\|UrgentReportButton" ClearAF
grep -n "OnboardingView" ClearAF/ContentView.swift
```
Expected: first `grep` prints nothing; second prints one line, `OnboardingView {}`, inside `case .onboarding:`. The `.onChange(of: apiService.phase)` closure keeps only `resumeRepositories()`.

- [ ] **Step 5: Walk the five steps in the UI-test helper** — in `ClearAFUITests/AccountFlowUITests.swift`, replace the body of `finishOnboarding(_:)` after `completeEnrollment(app)`:

old:
```swift
        let button = app.buttons["onboardingContinue"]
        XCTAssertTrue(button.waitForExistence(timeout: 15))
        dismissPasswordPrompt(app)
        await fulfillment(of: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: button)], timeout: 5)
        button.tap()
        XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 15))
```
new:
```swift
        let button = app.buttons["onboardingContinue"]
        XCTAssertTrue(button.waitForExistence(timeout: 15))
        dismissPasswordPrompt(app)
        // Five steps; reminders stay unchanged (no permission prompt) and the last step saves the prefilled name.
        for _ in 0..<5 where !app.tabBars.buttons["Today"].exists {
            await fulfillment(of: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: button)], timeout: 5)
            button.tap()
            _ = app.tabBars.buttons["Today"].waitForExistence(timeout: 2)
        }
        XCTAssertTrue(app.tabBars.buttons["Today"].waitForExistence(timeout: 15))
```

- [ ] **Step 6: Record the omitted content** — append to the table in `docs/design/letterpress/deferred.md`:

```markdown
| iOS Onboarding | Clinician credentials ("MD · Medical & cosmetic dermatology") | No credentials field; only the assigned clinician's name is available |
| iOS Onboarding | "We hold the last one up as a guide" | No capture overlay (spec §6 #4: native camera, no ghost) |
| iOS Onboarding | "Everything you record is private until you share it" | Photos share with the assigned clinician after upload; the copy says so |
```

- [ ] **Step 7: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/OnboardingTests -only-testing:ClearAFTests/AccountProfileTests -only-testing:ClearAFTests/TodayPresentationTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: build succeeds including `ClearAFUITests`; PASS (4 onboarding tests; PR 3 Today/urgent tests unchanged).

- [ ] **Step 8: Commit**

```bash
git add ClearAF/Views/OnboardingView.swift ClearAF/ContentView.swift ClearAF/Views/UrgentReportView.swift ClearAFTests/OnboardingTests.swift ClearAFUITests/AccountFlowUITests.swift docs/design/letterpress/deferred.md
git commit -m "ios: five-step onboarding with care team, privacy and reminders" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Enrollment — screening, not eligible and consent adapted [mechanical]

**Files:**
- Modify (full rewrite): `ClearAF/Views/EnrollmentView.swift`
- Modify: `ClearAFTests/EnrollmentTests.swift` (append a suite)

**Interfaces:**
- Consumes: Task 2 `LetterpressRadioRow`; PR 3 `UrgentReportEntry(horizontalPadding:)`, `LetterpressFormat.dayMonthYear`, `View.letterpressSheetBackground()`; `EnrollmentRepository` (`state`, `loading`, `saving`, `error`, `load`, `submit`, `joinWaitlist`, `acceptConsent`, `clearError`), `EligibilityScreening`, `ConsentDocument`, `ScreeningAnswers`, `ScreeningDates`, `PregnancyAnswer`, `ResidenceOption.all`, `APIService.enrollmentFinished()`.
- Produces: `EnrollmentCopy.continueReason`, `.notCharged`, `.waitlisted`, `.consentEyebrow(version:)` (existing `reasons(for:)` and `fallbackReason` unchanged). `EnrollmentView()` unchanged. Identifiers kept: `enrollmentCancelUpdate`, `enrollmentState`, `enrollmentDOB`, `enrollmentDOBDone`, `enrollmentContinue`, `enrollmentError`, `enrollmentNotEligible`, `enrollmentWaitlisted`, `enrollmentWaitlist`, `enrollmentUpdateAnswers`, `enrollmentAgree`. "None of these" is still a button that reports `selected` when chosen.
- Reviewers: none beyond the branch-level `care-access-reviewer`: same repository calls, same consent version/hash path.

- [ ] **Step 1: Write the failing test** — append to the end of `ClearAFTests/EnrollmentTests.swift`:

```swift

struct EnrollmentCopyTests {
    @Test func stepsExplainThemselvesInWords() {
        #expect(EnrollmentCopy.continueReason == "Answer all three questions to continue.")
        #expect(EnrollmentCopy.notCharged == "You have not been charged.")
        #expect(EnrollmentCopy.waitlisted == "We'll keep your request on file.")
        #expect(EnrollmentCopy.consentEyebrow(version: 3) == "Consent · V3")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: TEST with `-only-testing:ClearAFTests/EnrollmentCopyTests`
Expected: build FAIL — `type 'EnrollmentCopy' has no member 'continueReason'`.

- [ ] **Step 3: Replace `ClearAF/Views/EnrollmentView.swift`**

```swift
import SwiftUI

enum EnrollmentCopy {
    static let fallbackReason = "You're not eligible for online care right now."
    static let continueReason = "Answer all three questions to continue."
    static let notCharged = "You have not been charged."
    static let waitlisted = "We'll keep your request on file."

    static func consentEyebrow(version: Int) -> String { "Consent · V\(version)" }

    /// One sentence per reason, never empty; unknown future codes fall back to a general sentence.
    static func reasons(for screening: EligibilityScreening) -> [String] {
        var lines: [String] = []
        for code in screening.reasons {
            let line: String
            switch code {
            case "state":
                line = screening.stateCode == "NON_US"
                    ? "ClearAF is only available in the United States right now."
                    : "ClearAF isn't available in your state yet."
            case "age": line = "You don't meet the minimum age for online care yet."
            case "pregnancy": line = "ClearAF can't treat you online during pregnancy."
            case "breastfeeding": line = "ClearAF can't treat you online while breastfeeding."
            default: line = fallbackReason
            }
            if !lines.contains(line) { lines.append(line) }
        }
        return lines.isEmpty ? [fallbackReason] : lines
    }
}

/// Eligibility screener, not-eligible outcome and consent, shown between profile load and onboarding
/// (not in the spec; adapted to its fields, rules and single filled action).
struct EnrollmentView: View {
    @ObservedObject private var repository = APIService.shared.enrollment
    @State private var updatingAnswers = false

    var body: some View {
        NavigationStack {
            content
                .background(Letterpress.canvas.ignoresSafeArea())
                .toolbar {
                    if updatingAnswers && repository.state?.status == .ineligible {
                        ToolbarItem(placement: .cancellationAction) {
                            // Back to the not-eligible result (and its waitlist action) without submitting anything.
                            Button("Cancel") { updatingAnswers = false }
                                .accessibilityIdentifier("enrollmentCancelUpdate")
                        }
                    }
                    ToolbarItem(placement: .topBarTrailing) { Button("Sign out") { APIService.shared.logout() } }
                }
        }
        .tint(Letterpress.action)
        .task(id: repository.state?.status) {
            if repository.state?.status == .enrolled { APIService.shared.enrollmentFinished() }
        }
        // A message from one step never carries into the next.
        .onChange(of: repository.state?.status) { _, _ in repository.clearError() }
        .onChange(of: updatingAnswers) { _, _ in repository.clearError() }
    }

    @ViewBuilder private var content: some View {
        switch repository.state?.status {
        case .screeningRequired:
            ScreeningForm(repository: repository) {}
        case .ineligible:
            if updatingAnswers || repository.state?.screening == nil {
                ScreeningForm(repository: repository) { updatingAnswers = false }
            } else if let screening = repository.state?.screening {
                NotEligibleView(repository: repository, screening: screening) { updatingAnswers = true }
            }
        case .consentRequired:
            if let consent = repository.state?.consent { ConsentView(repository: repository, consent: consent) }
        case .enrolled:
            waiting(Text("Opening your account"))
        case nil:
            VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
                UrgentReportEntry(horizontalPadding: 0)
                Spacer()
                if let error = repository.error {
                    Text("Couldn't load your eligibility steps")
                        .font(Letterpress.display(28, relativeTo: .title))
                        .foregroundStyle(Letterpress.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(error)
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    Text("Loading your eligibility steps")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                Button(repository.loading ? "Loading…" : "Reload") {
                    guard let ticket = APIService.shared.access.snapshot() else { return }
                    Task { await repository.load(ticket: ticket) }
                }
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .disabled(repository.loading)
                Spacer()
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.vertical, Letterpress.Space.s18)
            .frame(maxWidth: 600, maxHeight: .infinity, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }

    private func waiting(_ label: Text) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s18) {
            UrgentReportEntry(horizontalPadding: 0)
            Spacer()
            HStack(spacing: Letterpress.Space.s10) {
                SwiftUI.ProgressView().tint(Letterpress.inkTertiary)
                label
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
            }
            Spacer()
        }
        .padding(.horizontal, Letterpress.Space.s22)
        .padding(.vertical, Letterpress.Space.s18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

private struct ScreeningForm: View {
    @ObservedObject var repository: EnrollmentRepository
    let onSubmitted: () -> Void
    @State private var stateCode = ""
    @State private var dateOfBirth: Date?
    @State private var pregnancy: PregnancyAnswer?
    @State private var choosingDate = false
    @State private var draftDate = Date.now
    private let pregnancyQuestion = "Are you currently pregnant, trying to conceive, or breastfeeding?"

    var body: some View {
        // A plain List keeps the native navigation-link state picker; rows sit on canvas with rule-tinted separators.
        List {
            Group {
                UrgentReportEntry(horizontalPadding: 0)
                    .listRowSeparator(.hidden)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Text("A few questions first")
                        .font(Letterpress.display(34, relativeTo: .largeTitle))
                        .foregroundStyle(Letterpress.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text("We check eligibility before you start. Your answers are shared with your care team.")
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.vertical, Letterpress.Space.s10)
                .listRowSeparator(.hidden)
                Picker("State of residence", selection: $stateCode) {
                    Text("Choose").tag("")
                    ForEach(ResidenceOption.all, id: \.code) { option in Text(option.name).tag(option.code) }
                }
                .pickerStyle(.navigationLink)
                .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                .foregroundStyle(Letterpress.ink)
                .frame(minHeight: Letterpress.minTouch)
                .accessibilityIdentifier("enrollmentState")
                Button {
                    draftDate = dateOfBirth ?? Self.defaultBirthDate()
                    choosingDate = true
                } label: {
                    HStack(spacing: Letterpress.Space.s10) {
                        Text("Date of birth")
                            .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                        Spacer(minLength: Letterpress.Space.s10)
                        Text(dateOfBirth.map { LetterpressFormat.dayMonthYear($0) } ?? "Choose")
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(dateOfBirth == nil ? Letterpress.inkSecondary : Letterpress.ink)
                    }
                    .frame(maxWidth: .infinity, minHeight: Letterpress.minTouch, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("enrollmentDOB")
                VStack(alignment: .leading, spacing: 0) {
                    Text(pregnancyQuestion)
                        .font(Letterpress.ui(16, weight: .medium, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, Letterpress.Space.s10)
                    ForEach(PregnancyAnswer.allCases) { answer in
                        LetterpressRadioRow(title: answer.title, selected: pregnancy == answer) { pregnancy = answer }
                    }
                    LetterpressRule()
                }
                .padding(.vertical, Letterpress.Space.s14)
                .listRowSeparator(.hidden)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Button(repository.saving ? "Saving…" : "Continue", action: submit)
                        .buttonStyle(.letterpress(.filled, fullWidth: true))
                        .disabled(!canContinue)
                        .accessibilityIdentifier("enrollmentContinue")
                    if let error = repository.error {
                        Text(error)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("enrollmentError")
                    } else if !canContinue && !repository.saving {
                        Text(EnrollmentCopy.continueReason)
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                    }
                }
                .padding(.vertical, Letterpress.Space.s14)
                .listRowSeparator(.hidden)
            }
            .listRowBackground(Letterpress.canvas)
            .listRowInsets(EdgeInsets(top: 0, leading: Letterpress.Space.s22, bottom: 0, trailing: Letterpress.Space.s22))
            .listRowSeparatorTint(Letterpress.rule)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .sheet(isPresented: $choosingDate) {
            NavigationStack {
                DatePicker("Date of birth", selection: $draftDate, in: ScreeningDates.earliestBirthDate...Date.now, displayedComponents: .date)
                    .datePickerStyle(.wheel)
                    .labelsHidden()
                    .padding()
                    .navigationTitle("Date of birth")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { choosingDate = false } }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { dateOfBirth = draftDate; choosingDate = false }
                                .accessibilityIdentifier("enrollmentDOBDone")
                        }
                    }
            }
            .presentationDetents([.medium])
            .letterpressSheetBackground()
        }
    }

    private var canContinue: Bool { !stateCode.isEmpty && dateOfBirth != nil && pregnancy != nil && !repository.saving }

    private static func defaultBirthDate() -> Date { Calendar.current.date(byAdding: .year, value: -25, to: .now) ?? .now }

    private func submit() {
        guard canContinue, let dateOfBirth, let pregnancy, let ticket = APIService.shared.access.snapshot() else { return }
        let answers = ScreeningAnswers(stateCode: stateCode, dateOfBirth: ScreeningDates.string(from: dateOfBirth), pregnancyStatus: pregnancy.rawValue)
        Task {
            await repository.submit(answers, ticket: ticket)
            if repository.error == nil { onSubmitted() }
        }
    }
}

private struct NotEligibleView: View {
    @ObservedObject var repository: EnrollmentRepository
    let screening: EligibilityScreening
    let onUpdate: () -> Void

    var body: some View {
        let waitlisted = screening.waitlistRequestedAt != nil
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                UrgentReportEntry(horizontalPadding: 0)
                Text("ClearAF can't provide your care right now")
                    .font(Letterpress.display(28, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("enrollmentNotEligible")
                    .padding(.top, Letterpress.Space.s28)
                LetterpressRule(weight: .major)
                    .padding(.top, Letterpress.Space.s18)
                ForEach(EnrollmentCopy.reasons(for: screening), id: \.self) { reason in
                    Text(reason)
                        .font(Letterpress.ui(16, relativeTo: .body))
                        .foregroundStyle(Letterpress.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.vertical, Letterpress.Space.s10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .bottom) { LetterpressRule() }
                }
                Text(EnrollmentCopy.notCharged)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .padding(.top, Letterpress.Space.s14)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    if waitlisted {
                        Text(EnrollmentCopy.waitlisted)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                            .accessibilityIdentifier("enrollmentWaitlisted")
                    } else {
                        Button(repository.saving ? "Saving…" : "Notify me if ClearAF becomes available to me") {
                            guard let ticket = APIService.shared.access.snapshot() else { return }
                            Task { await repository.joinWaitlist(ticket: ticket) }
                        }
                        .buttonStyle(.letterpress(.filled, fullWidth: true))
                        .disabled(repository.saving)
                        .accessibilityIdentifier("enrollmentWaitlist")
                    }
                    // Exactly one filled action: once waitlisted, updating answers is the primary step.
                    Button("Update my answers", action: onUpdate)
                        .buttonStyle(.letterpress(waitlisted ? .filled : .outlined, fullWidth: true))
                        .disabled(repository.saving)
                        .accessibilityIdentifier("enrollmentUpdateAnswers")
                    if let error = repository.error {
                        Text(error)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, Letterpress.Space.s28)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.vertical, Letterpress.Space.s18)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }
}

private struct ConsentView: View {
    @ObservedObject var repository: EnrollmentRepository
    let consent: ConsentDocument

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                UrgentReportEntry(horizontalPadding: 0)
                Text(EnrollmentCopy.consentEyebrow(version: consent.version))
                    .letterpressEyebrow()
                    .padding(.top, Letterpress.Space.s28)
                Text(consent.title)
                    .font(Letterpress.display(28, relativeTo: .title))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, Letterpress.Space.s10)
                LetterpressRule(weight: .major)
                    .padding(.top, Letterpress.Space.s18)
                // Plain string: paragraphs are kept and nothing in the document is interpreted as Markdown.
                Text(verbatim: consent.body)
                    .font(Letterpress.ui(16, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .lineSpacing(Letterpress.Space.s6)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s18)
                VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                    Button(repository.saving ? "Saving…" : "I understand and agree") {
                        guard let ticket = APIService.shared.access.snapshot() else { return }
                        Task { await repository.acceptConsent(ticket: ticket) }
                    }
                    .buttonStyle(.letterpress(.filled, fullWidth: true))
                    .disabled(repository.saving)
                    .accessibilityIdentifier("enrollmentAgree")
                    if let error = repository.error {
                        Text(error)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.error)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, Letterpress.Space.s28)
            }
            .padding(.horizontal, Letterpress.Space.s22)
            .padding(.vertical, Letterpress.Space.s18)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: TEST with `-only-testing:ClearAFTests/EnrollmentCopyTests -only-testing:ClearAFTests/EnrollmentTests -only-testing:ClearAFTests/LetterpressSweepTests`
Expected: PASS (1 new test; existing enrollment repository and reason-copy tests unchanged). If the build reports the `.navigationLink` picker ignores `.foregroundStyle`, delete that one modifier and rerun.

- [ ] **Step 5: Commit**

```bash
git add ClearAF/Views/EnrollmentView.swift ClearAFTests/EnrollmentTests.swift
git commit -m "ios: adapt enrollment screening, outcome and consent to Letterpress" -m "Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: PR 6 verification [mechanical]

**Files:** none, unless a check fails (fix, then rerun only that check).

- [ ] **Step 1: iOS unit tests and UI-test compile**

Run:
```bash
xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
  -derivedDataPath /tmp/clearaf-build-lp6 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  -only-testing:ClearAFTests test | xcbeautify
```
Expected: build succeeds (the `ClearAFUITests` target compiles with the identifier, back-button and onboarding-loop edits); every `ClearAFTests` suite passes, including `LetterpressSweepTests`, `PushedScreenTests` and the new `CompletionCalendarTests`, `CheckInFlowTests`, `LetterpressFormTests`, `AuthPresentationTests`, `ProfilePresentationTests`, `OnboardingTests`, `EnrollmentCopyTests`.

- [ ] **Step 2: Scope fence check**

Run: `git diff --stat origin/main...HEAD -- ClearAF/Services backend supabase web-portal`
Expected: no output (plus PR 3's `ClearAF/Services/PhotoReviewIndex.swift` only if PR 3 is not yet on `origin/main`). Any other path is a scope violation: revert it.

- [ ] **Step 3: One account-flow UI test** (covers sign-in fields, forgot password, five-step onboarding, profile push and back)

Prerequisites, in order: local stack running (`node scripts/local.cjs start`), `cd backend && npm run build`, then `node scripts/recovery.cjs` from the root (CLAUDE.md ordering rule), then `cd backend && npm run dev` in another shell.
Run:
```bash
xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' -parallel-testing-enabled NO \
  -derivedDataPath /tmp/clearaf-build-lp6 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  -only-testing:ClearAFUITests/AccountFlowUITests/testSameDeviceAccountSwitchAndPasswordRecovery test | xcbeautify
```
Expected: PASS through the "Choose a new password" screen. If it fails on a step PR 6 did not touch (photo picker, enrollment prompt timing), record it and move on; do not loop.

- [ ] **Step 4: Bounded visual pass** (one pass; fix regressions only, no new structure)

With a synthetic patient that has a morning and evening routine, completions on mixed days this month and last, and an active check-in form with one required choice question, one optional text question (loopback fixtures under `scripts/`), use the `xcodebuildmcp-cli` skill to build and run on the iPhone 17 simulator. Screenshot each screen in light and dark, and Calendar, Check-in and Profile again at the largest accessibility text size. Record pass/fail per bullet for the PR description:
- Sign in: text wordmark; serif title; mono labels over baseline-rule fields; `name@example.com` example only; Show/Hide; one filled Sign in; a wrong password shows the inline error and keeps both fields; Forgot password with an empty email tells you to enter one; Create one switches mode without animation.
- Password recovery (open a local reset link): serif title, two labelled fields, reason sentence until valid, one filled Update password.
- Enrollment (fresh synthetic account): ruled plain list on canvas; state picker pushes; date written out ("30 Jul 1996"); radio rows; Continue disabled with "Answer all three questions to continue."; consent eyebrow `CONSENT · V1`, serif title, 2pt rule, one filled button.
- Onboarding: `01/05` … `05/05` mono with rule progress; Skip jumps to the name step; step 02 shows the real clinician name or "No clinician assigned yet"; step 04 toggles use the ink/tertiary tint and the button reads "Save reminders and continue" only after a change; Finish opens the tabs; urgent entry and Sign out in the footer.
- Profile (Today → avatar): pushed with a back button, no tab bar, no bottom gap; header initials, serif name, `PATIENT SINCE …`; Care team row with `ASSIGNED` in ink (no ochre); reminder summaries push Reminders; editing the name reveals one filled Save name; Account removal alert; Sign out underlined; version meta.
- Reminders: ruled toggles and times, weekday menu when Weekly photo is on, one filled Save reminders, status sentence.
- Completion calendar (Plan → Completion history): serif month title; mono count `N` + `OF N DAYS`; sentence; three-state cells (solid, half-split with the number in the lower half, sunk), today outlined with an inset fill, future numbers in `ink.future` with no fill, week starting on the locale's first day; legend; selected day's events beneath with mono times in the reported zone and "Evening not recorded yet"; Previous month / Next month; accessibility size shows the ruled day list, nothing clips.
- Check-in (Today → Check-in): `1 OF 2` with rule progress and "Draft saved on this device"; serif question; required question blocks Next with a sentence; leave and reopen resumes at the first unanswered question; Review answers lists both, rows return to their question; Send check-in → "Check-in sent" with `SENT 17 SEP · 09:14` and one filled Done; Response history pushes a ruled list; at accessibility size Back/Next stack vertically.
- Every screen: no hue other than `error`; no card shadows; buttons ≥ 44pt; Reduce Transparency and Reduce Motion on change nothing visible except system bars becoming opaque.

- [ ] **Step 5: §8 acceptance checklist** for Sign in, Onboarding, Completion calendar, Weekly check-in, Profile & settings (plus Password recovery, Reminders and Enrollment as adapted screens): mark each item pass/fail in the PR description, citing the Step 4 screenshot. Note the calendar has no filled button by design (read-only record).

- [ ] **Step 6: Review agents**

`care-access-reviewer` on the whole branch diff (sign-in and recovery views, care-team read from Profile and onboarding, onboarding privacy copy, check-in send path). `api-contract-checker` is not required: no request or response shape changed and the backend is untouched; state that in the PR. Run `/code-review` on the branch.

---

## Carry-ins applied

- **PR 2 toggles:** every `Toggle` on these screens uses `.tint(Letterpress.toggleOn)` (Task 4, enforced by `PushedScreenTests.reminderTogglesUseTheContrastSafeTint`; the colour itself is covered by `LetterpressPrimitivesTests.toggleOnTrackIsVisibleAgainstTheThumbAndThePaper`).
- **PR 3 roadmap:** `EnrollmentView` is adapted here (Task 6). PR 3's decision 10 (Newsreader navigation titles via the appearance proxy) applies to these pushed screens automatically; they use inline titles so the serif display title in content stays the one large title.

---

## Controller notes (added at execution)

- PR 3 is merged (#21). Trust the merged iOS code over this plan's assumptions: `AdherenceWindow`, `LetterpressFormat` (now with cached formatters), `RoutineTickBook`, `TodayCopy`, `UrgentReportEntry`, `letterpressSheetBackground()`, `LetterpressChrome` (which now also tints the unread badge).
- Only ONE xcodebuild run at a time, in the foreground, with a long timeout. Concurrent runs deadlocked this machine for 7 hours.
- The `axe` UI-automation channel is broken on this machine (Xcode 27 / macOS 26.6). Use XCUITest through `xcodebuild` instead of simulated taps.
- Attribution: commits end with a blank line, then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_014Fkk5DxDotGjtsofAxspCT`.
