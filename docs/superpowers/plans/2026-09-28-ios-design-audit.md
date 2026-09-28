# iOS design audit fixes: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the findings of the 2026-09-28 Apple-design audit of the patient iOS app: safety and keyboard gaps, missing feedback and motion, and photo inspection and performance.

**Architecture:** Three independent PRs, run in order, each on its own branch and worktree off `main`. The PRs are A: quick fixes (safety, keyboard, Notes, banner), B: feel (haptics, springs, step transitions, VoiceOver announcements, stable loading), and C: photos (zoom, off-main decoding, anchored transitions, a tracked Flip gesture). Client-only: no API, schema or backend change.

**Tech Stack:** SwiftUI and UIKit bridging, deployment target iOS 18.5, built with Xcode 27 / iOS 27 SDK. Tests use Swift Testing (`@Test`, `#expect`) in `ClearAFTests/`. Many tests pin source text (read the `.swift` file and `#expect(text.contains(...))`); follow that convention where behaviour isn't unit-testable.

**Spec:** the audit findings (summarised under each task) and `docs/design/letterpress/spec.md` (Letterpress 1.0). `docs/design/letterpress/deferred.md` lists controls that must NOT be built.

## Global Constraints

- Deployment target is **iOS 18.5**. iOS 18 APIs need no `#available`. iOS 26/27 APIs must be gated with `if #available(iOS 27, *)` (or 26) and have an 18.5 fallback. Verified iOS 27 additions: `.navigationTransition(.crossFade)`, `swipeActionsContainer()`, `.reorderable()`, `.pickerStyle(.tabs)`, toolbar `visibilityPriority`.
- Letterpress: ink is the action colour; ochre (`attention*`) only for unread/prescription. Native iOS controls. No scores, streaks, grades, emoji, celebration or motivational copy. Sentence-case copy. Text a patient must act on is ≥ 13pt.
- Fonts come from `Letterpress.display/ui/data`, never `.system(...)` / `.callout`.
- Springs, not fixed-duration easing, for user-driven motion: default `.snappy` (critically damped feel); `.smooth` for content swaps. No bounce except after a flick.
- Reduce Motion: replace moves/zooms with opacity cross-fades; keep fades. Never remove feedback entirely.
- Haptics via SwiftUI `.sensoryFeedback` only (iOS 17+). Utility: only on outcomes (selection change, success, error), never on navigation.
- Spec §6 Compare is a `fullScreenCover` by recorded decision (docs/superpowers/plans/2026-09-17-letterpress-pr7-compare.md:77). Keep it.
- `segmented` pickers: no `matchedGeometryEffect` (spec line 165).
- Never read `.env*`, `.local/`, `handoff-*/`, `Local.generated.xcconfig`.
- Only one `xcodebuild` at a time on this machine, in the foreground.

**Build and test** (from the worktree root):
```sh
xcodebuild -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=27.0' -parallel-testing-enabled NO \
  -derivedDataPath /tmp/clearaf-build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
  -only-testing:ClearAFTests test | xcbeautify
```
Unit tests only (`-only-testing:ClearAFTests`). The UI suite needs the local stack plus recovery ordering and is out of scope.

## Review Focus

1. **Largest accessibility text size.** New toggles, banners and the zoom view must not clip. Rows that switch to stacks must keep switching.
2. **Reduce Motion on.** Every new transition falls back to opacity; nothing jumps without any transition.
3. **VoiceOver.** Merged elements (routine row, note bubble, photo tile) read once, in a sensible order, with the right trait (toggle/button). Announcements don't double up with focus moves.
4. **Account switch / sign-out mid-flight.** Off-main photo decoding and pending-message rows must not show one account's data after a switch. Check `access.snapshot()` tickets where the existing code does.
5. **Rapid repeated input.** Double-tapping Save/Send/Flip/tick must not double-submit or leave the UI stuck in a pending state.

---

## PR A: quick fixes (branch `ios-audit/quick-fixes`)

### Task A1: Tappable 911 on the urgent report sheet
**Files:** `ClearAF/Views/UrgentReportView.swift` (near the emergency copy, ~line 108); test `ClearAFTests/SafetyTests.swift`.
- [ ] Test (source pin): `UrgentReportView.swift` contains `URL(string: "tel:911")` and `Link(`.
- [ ] Add under the emergency sentence:
```swift
Link(UrgentReportCopy.call911, destination: URL(string: "tel:911")!)
    .buttonStyle(.letterpress(.outlined, fullWidth: true))
```
with `static let call911 = "Call 911"` in `UrgentReportCopy`.
- [ ] Also make the details field take focus once a category is chosen (`@FocusState`, set in `.onChange(of: category)`), and add `.scrollDismissesKeyboard(.interactively)`.
- [ ] Build, test, commit `fix(ios): make 911 tappable on the urgent report sheet`.

### Task A2: Sign-in keyboard flow, AutoFill and specific errors
**Files:** `ClearAF/Views/AuthenticationView.swift`, `ClearAF/Views/PasswordRecoveryView.swift`; tests `ClearAFTests/AuthPresentationTests.swift`.
- [ ] Add `private enum Field { case name, email, password }` and `@FocusState private var focus: Field?`. Each field: `.focused($focus, equals: …)`, `.submitLabel(.next)` + `.onSubmit { focus = next }`; the last field gets `.submitLabel(.go)` and `.onSubmit { if <the existing enabled condition> { <existing submit action> } }`.
- [ ] Password: `.textContentType(isRegistering ? .newPassword : .password)`. Recovery screen: `.newPassword` on both fields, focus chaining the same way, `.scrollDismissesKeyboard(.interactively)`.
- [ ] Show/Hide toggle: after swapping SecureField↔TextField, restore focus: `.onChange(of: showingPassword) { focus = .password }`.
- [ ] Switching Sign in ↔ Create account must keep `email`; clear only `password` and the failure.
- [ ] Replace the single catch-all failure sentence with a pure mapping function that can be unit-tested, e.g. `AuthForm.failureMessage(for: Error) -> String`: `URLError` (`.notConnectedToInternet`, `.networkConnectionLost`, `.timedOut`) → "You're offline. Check your connection and try again."; otherwise the existing sentence. Inspect how the auth error surfaces from `SupabaseService`/supabase-swift before deciding whether invalid credentials can be told apart; only add a credentials case if the error type exposes it reliably.
- [ ] Tests: the mapping function (offline vs other); source pins for `.newPassword`, `.password`, `submitLabel(.go)`.
- [ ] Commit `fix(ios): keyboard flow, password AutoFill and clearer sign-in errors`.

### Task A3: Notes opens at the newest note
**Files:** `ClearAF/Views/MessagingView.swift`, `ClearAF/Services/MessagingRepository.swift` (read only unless needed); tests `ClearAFTests/MessagingTests.swift` or `NotesPresentationTests.swift`.
- [ ] On the thread ScrollView: `.defaultScrollAnchor(.bottom, for: .initialOffset)`, `.defaultScrollAnchor(.bottom, for: .sizeChanges)`, `.scrollDismissesKeyboard(.interactively)`, `.refreshable { await repository.openCurrent() }` (use the actual refresh entry point the toolbar Refresh button calls).
- [ ] Wrap in `ScrollViewReader`; on `.onChange(of: repository.messages.last?.id)` scroll to it with `withAnimation(reduceMotion ? nil : .snappy) { proxy.scrollTo(id, anchor: .bottom) }`. "Load older" prepends and must NOT jump to the bottom. Only scroll when the last id changes, not the first.
- [ ] Pending note: while `sending` is true, render the outgoing draft text as a note row at the end of the thread with the stamp "SENDING…" (mono eyebrow style used by other stamps), and scroll to it. On failure the existing draft/retry behaviour stays. The composer keeps its current disabled-while-sending behaviour; don't clear the draft before the server confirms (the weekly limit can reject it).
- [ ] VoiceOver: each note's stamp + body becomes one element: `.accessibilityElement(children: .combine)` on a group with a label `"\(who), \(spokenDate): \(content)"`. The reference/photo button stays its own element.
- [ ] Tests: source pins for `defaultScrollAnchor(.bottom`, `refreshable`, `children: .combine`; a unit test for the pending-row copy if it's put in `NotesCopy`.
- [ ] Commit `fix(ios): Notes opens at the newest note and shows a pending send`.

### Task A4: Photo error banner stops covering the tab bar
**Files:** `ClearAF/ContentView.swift:49,103-114`.
- [ ] Remove the root `.overlay(alignment: .bottom)`. Show the banner via `.safeAreaInset(edge: .bottom)` on the content of each `Tab`. Add a small `View` modifier, e.g. `photoErrorInset()`, so the banner sits above the tab bar and the capture control.
- [ ] Banner styling: `Letterpress.ui(15)` body, `Letterpress.error`-coloured rule or icon as other inline errors do; a "Dismiss" underline button that clears the error (add a `dismissError()` on `PhotoRepository` if `lastError` isn't settable from outside); `.transition(.move(edge: .bottom).combined(with: .opacity))` (opacity only under Reduce Motion); announce the text with `AccessibilityNotification.Announcement(text).post()` when it appears.
- [ ] Tests: source pin that ContentView has no `.overlay(alignment: .bottom) { PhotoPersistenceErrorView`; unit test for `dismissError()` if added.
- [ ] Commit `fix(ios): photo error banner sits above the tab bar and can be dismissed`.

### Task A5: Small form fixes
- [ ] `OnboardingView.swift:~204` name field: `.submitLabel(.done).onSubmit { advance() }` (only when advancing is allowed), `.scrollDismissesKeyboard(.interactively)` on the scroll view.
- [ ] `CheckInView.swift` scroll view: `.scrollDismissesKeyboard(.interactively)`.
- [ ] Check-in "edit from Review": when a question is opened from the Review list, the advance button reads "Back to review" and returns to the review index. Add `@State private var returningToReview = false`, set it in the Review row's action, clear it when you return. Put the label in `CheckInFlow` / copy so it's testable. Test in `CheckInFlowTests.swift`.
- [ ] Copy: "Take Photo" → "Take photo", "Choose from Library" → "Choose from library" (`PhotoCaptureManager.swift:55,66,87`) and any test pins that expect the old text.
- [ ] `AdherenceStrip.swift:~89` error text: use `Letterpress.ui(13)` or larger (spec §2), not mono 11.
- [ ] Commit `fix(ios): return key, check-in review return, sentence-case copy`.

### Task A6: Correct the documented iOS target
- [ ] `CLAUDE.md`: "SwiftUI app (iOS 17+)" → "(iOS 18.5+)"; the swiftui row "target is iOS 17: gate iOS 26 APIs" → "target is iOS 18.5; built with Xcode 27. Gate iOS 26/27 APIs such as Liquid Glass and `.crossFade` with `#available`".
- [ ] Commit `docs: the iOS deployment target is 18.5`.

---

## PR B: feel (branch `ios-audit/feel`)

### Task B1: Haptics that mean something
**Files:** `ClearAF/Views/InteractionHelpers.swift`, `DashboardViewEnhanced.swift:105`, `PhotoCaptureManager.swift:175`, `RoutineChecklist.swift`, `MessagingView.swift`, `CheckInView.swift`, `UrgentReportView.swift`, `AuthenticationView.swift`, `CompareView.swift`.
- [ ] Remove the haptic on the profile avatar push (navigation is not an outcome).
- [ ] Replace `HapticManager` uses with `.sensoryFeedback` and delete `HapticManager` once unused (keep `accessibleButton`).
- [ ] Add: `.selection` on routine step tick change; `.success` when the routine becomes recorded (`trigger: status` with a condition closure old == unrecorded && new != unrecorded); `.success` when a note is sent (trigger on the last own message id), a check-in is submitted, an urgent report is sent, or a photo is saved; `.error` when a send/submit/sign-in/photo save fails (trigger on the failure value becoming non-nil); `.selection` on a check-in option choice and on Compare Flip / pair change.
- [ ] Tests: source pins for each `.sensoryFeedback(` site and that `HapticManager` is gone.
- [ ] Commit `feat(ios): sensory feedback on outcomes, not navigation`.

### Task B2: Routine step row is one toggle
**Files:** `ClearAF/Views/RoutineChecklist.swift:119-148`, `ClearAF/Views/LetterpressControls.swift` (new `LetterpressCheckToggleStyle`); tests `RoutinePresentationTests.swift` / `LetterpressPrimitivesTests.swift`.
- [ ] Replace the Button checkbox + `.onTapGesture` row with `Toggle(isOn: binding) { rowLabel }.toggleStyle(.letterpressCheck)`. The style draws the existing checkbox + label, uses `Button { configuration.isOn.toggle() }` so it gets the press state (opacity 0.7 while pressed, as `LetterpressButtonStyle`), keeps 44pt min height, and keeps disabled behaviour (`@Environment(\.isEnabled)`).
- [ ] The row's existing value text ("Ticked") goes away. The toggle trait speaks on/off, and the step title is read once.
- [ ] Check mark change: `.contentTransition(.symbolEffect(.replace))` if it's an SF Symbol, else `.animation(.snappy(duration: 0.2), value: isOn)`.
- [ ] Replace `.system(size: 12, weight: .bold)` at line ~161 with a Letterpress font or an SF Symbol sized via `.imageScale`.
- [ ] Tests: source pins (`Toggle(isOn:`, no `.onTapGesture` in the row); a style test like the existing primitives tests.
- [ ] Commit `feat(ios): routine steps are single native toggles`.

### Task B3: Button release eases
- [ ] `LetterpressButtonStyle.swift:~54`: add `.animation(.snappy(duration: 0.15), value: configuration.isPressed)` after the opacity. Press stays instant because SwiftUI applies isPressed=true immediately; the release eases. Keep the existing pin tests passing.
- [ ] Commit with B2 or on its own.

### Task B4: Directional step transitions and VoiceOver focus
**Files:** `OnboardingView.swift` (step changes ~163, 267, 314; `.id(step)` ScrollView ~122), `CheckInView.swift` (index changes ~225, 229, 258; ScrollView ~91).
- [ ] Track `@State private var forward = true`. Set it before each step change, then change the step inside `withAnimation(.smooth)`.
- [ ] On the step container: `.id(step)` (check-in: `.id(index)`, which also resets the scroll offset per question), and
```swift
.transition(reduceMotion ? .opacity : .asymmetric(
    insertion: .move(edge: forward ? .trailing : .leading).combined(with: .opacity),
    removal: .move(edge: forward ? .leading : .trailing).combined(with: .opacity)))
```
- [ ] `@AccessibilityFocusState private var titleFocused: Bool` on the step title; set it to true in `.onChange(of: step)`.
- [ ] Update the onboarding/check-in source pins if they assert no animation.
- [ ] Commit `feat(ios): onboarding and check-in steps move in the direction you go`.

### Task B5: Announce status and errors to VoiceOver
- [ ] Add to `InteractionHelpers.swift`:
```swift
extension View {
    /// Posts a VoiceOver announcement whenever `message` becomes a new non-nil value.
    func announcing(_ message: String?) -> some View {
        onChange(of: message) { _, new in
            if let new, !new.isEmpty { AccessibilityNotification.Announcement(new).post() }
        }
    }
}
```
- [ ] Apply to: auth failure, recovery failure, check-in failure and "sent" state, urgent report failure and `UrgentReportCopy.sent`, enrollment failure, messaging send failure / limit sentence, routine error (`RoutineView.swift:~23`), profile error and "Name saved" (`ProfileView.swift:~176`), reminder save result.
- [ ] Test: source pins for `.announcing(` at each site.
- [ ] Commit `feat(ios): announce status and errors to VoiceOver`.

### Task B6: Reminders show unsaved changes
**Files:** `ReminderSettingsView.swift:72-156`; tests `ReminderTests.swift`.
- [ ] Track `@State private var edited = false`, set on any draft change made by the user. The `.task` load only assigns `draft` if `!edited` (fixes the clobber).
- [ ] When `draft != repository.preferences`: show the sentence "Not saved yet." (Letterpress secondary ink) near Save. Save is disabled when nothing changed, with the reason sentence per spec ("Nothing to save.").
- [ ] Time pickers appear with `Toggle(isOn: $time.enabled.animation(reduceMotion ? nil : .snappy))` so the picker row slides in.
- [ ] Put the dirty check/copy in a testable helper; test it.
- [ ] Commit `fix(ios): reminder settings show unsaved changes`.

### Task B7: Calendar keeps its layout while loading
**Files:** `CompletionCalendarView.swift:98,116-124,233,324,406,415`; tests `CompletionCalendarTests.swift`.
- [ ] `move()`/`load()` no longer set `calendar = nil`. Keep the previous month visible with `.opacity(loading ? 0.4 : 1)` and `.allowsHitTesting(!loading)`, plus a small "Loading" caption in the header; only show the full-page loading state on the first load.
- [ ] Month count: `.contentTransition(.numericText())` animated with `.snappy`.
- [ ] Replace per-call `DateFormatter()` creation with cached static formatters (follow `LetterpressFormat` patterns).
- [ ] Replace `UIScreen.main.bounds` with `onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }` or container-relative sizing.
- [ ] Commit `fix(ios): the calendar keeps its layout while a month loads`.

### Task B8: Today and root screens
- [ ] `DashboardViewEnhanced.swift`: `.refreshable { await refresh() }` on the scroll view.
- [ ] Avatar circles (`DashboardViewEnhanced.swift:117`, `ProfileView.swift:85`): `@ScaledMetric(relativeTo: .body) private var avatarSize: CGFloat = 30` (56 on Profile) and cap with `.dynamicTypeSize(...DynamicTypeSize.accessibility2)` if needed.
- [ ] Photo rail tile (`:173`): `.accessibilityElement(children: .combine)` and label "Photo, <day month>, <sharing state>".
- [ ] Routine error (`:250`): show the real error sentence and an underline "Open plan" button that sets `selectedTab = .plan`.
- [ ] Greeting (`:99`): wrap in `TimelineView(.everyMinute)` so the time of day updates.
- [ ] `ContentView.swift:11-20` loading/account error: Letterpress canvas background, display font title, `.letterpress(.filled)` "Try again", `.letterpress(.underline)` "Sign out".
- [ ] `LetterpressText.swift:8` eyebrow tracking: `@ScaledMetric(relativeTo: .caption2) private var tracking = 1.6` if the view can own state; otherwise scale via `UIFontMetrics(forTextStyle: .caption2).scaledValue(for:)`.
- [ ] Commit `fix(ios): Today refresh, scalable avatars, clearer labels`.

---

## PR C: photos (branch `ios-audit/photos`)

### Task C1: Decode photos off the main thread
**Files:** `ClearAF/Services/PhotoImageLoader.swift`, `PhotoPageStore.swift`, `ComparePhotoStrip.swift`, `PhotoRecordDisplay.swift:125`, `ProgressView.swift:294`, `PhotoReviewSheet.swift:101`, `CompareView.swift:426-445`; tests `PhotoDisplayTests.swift`, `ComparePhotoStripTests.swift`.
- [ ] Split the loader: a `nonisolated static func downsample(_ data: Data, maxPixelSize: CGFloat) -> UIImage?` (pure ImageIO, thread-safe). Keep the LRU cache on the main actor but add `func image(for key:, data: @Sendable () -> Data?, maxPixelSize:) async -> UIImage?`, which checks the cache, else runs `await Task.detached(priority: .userInitiated) { downsample(...) }.value`, then inserts.
- [ ] Views never decode in `body`. They hold `@State private var image: UIImage?` and load in `.task(id: key)`, with a quiet placeholder (the existing mat/sunk fill, not the "no photo" symbol) until then. Fade in with `.transition(.opacity)` under `.animation(.smooth(duration: 0.2), value: image != nil)`. Distinguish "loading" from "unreadable" (keep the existing unreadable copy).
- [ ] Core Data: fetch bytes off main. Use `container.performBackgroundTask` or a background context `perform` reading `photoData` by `NSManagedObjectID`. Record grid fetch (`PhotoPageStore.swift:38-42`): set `propertiesToFetch` to every attribute except `photoData`, so tiles don't fault in full JPEGs on main.
- [ ] Give the detail view its own cache so a 1600px decode doesn't evict grid thumbnails.
- [ ] Account safety: capture the account ticket before the detached work and drop the result if `access.snapshot()` changed (follow `CompareView`'s existing ticket pattern).
- [ ] Tests: `downsample` returns the expected max dimension for a generated JPEG (see `PixelBuffer.swift` helpers); cache-hit test; source pins that `PhotoFrame`/`PhotoDetailView` have no decode call inside `body`.
- [ ] Commit `perf(ios): decode photos off the main thread`.

### Task C2: Zoomable photo detail
**Files:** create `ClearAF/Views/ZoomablePhotoView.swift`; modify `ProgressView.swift:~290-305` (PhotoDetailView).
- [ ] `UIViewRepresentable` wrapping `UIScrollView` + `UIImageView`: `minimumZoomScale = 1`, `maximumZoomScale = 6`, `bouncesZoom = true`, `contentInsetAdjustmentBehavior = .never`, image centred when smaller than bounds (`layoutSubviews`/`scrollViewDidZoom` centring), double-tap toggles between 1× and 2.5× at the tapped point (`zoom(to:animated:)`). Background matches the current detail background.
- [ ] Full resolution: the detail first shows the 1600px image. When `zoomScale` first exceeds 1.5, decode at the photo's native size off the main thread (C1's `downsample` with `maxPixelSize` = the larger source dimension from `CGImageSourceCopyPropertiesAtIndex`) and swap the image without changing the zoom rect.
- [ ] Accessibility: the image view is an accessibility element labelled "Photo, <day month year>" with `.adjustable`-free default traits `.image`; add the accessibility actions "Zoom in" / "Reset zoom".
- [ ] Reset the zoom when the photo changes.
- [ ] Tests: centring math as a pure static function (`ZoomablePhotoView.centeredInset(content:bounds:)`) unit-tested; source pin in PhotoDetailView.
- [ ] Commit `feat(ios): pinch and double-tap to zoom a photo`.

### Task C3: Photos open from their thumbnail
**Files:** `ProgressView.swift:213,252`, `PhotoRecordDisplay.swift` tiles, `CompareView.swift:68`.
- [ ] `@Namespace private var photoZoom` in the presenting view. On each tile: `.matchedTransitionSource(id: photo.objectID, in: photoZoom)`. On the sheet content: a helper
```swift
extension View {
    @ViewBuilder func photoZoomTransition(id: some Hashable, in ns: Namespace.ID, reduceMotion: Bool) -> some View {
        if reduceMotion, #available(iOS 27, *) { navigationTransition(.crossFade) }
        else { navigationTransition(.zoom(sourceID: id, in: ns)) }
    }
}
```
- [ ] Keep the existing `.sheet(item:)` presentation. The zoom transition works with sheets on iOS 18.
- [ ] Compare panes: same pattern for the pane → detail sheet.
- [ ] Tests: source pins.
- [ ] Commit `feat(ios): photos open from their thumbnail`.

### Task C4: Flip follows your finger
**Files:** `CompareView.swift:~111,195-210`; tests `CompareViewSourceTests.swift` (update pins: the file forbids `withAnimation` and requires the reduce-motion environment; keep reduce motion handling, and replace the `!withAnimation` pin with pins for the new gesture).
- [ ] Replace the one-shot `DragGesture(minimumDistance: 24).onEnded` with a tracked progress: `@State private var flipProgress: CGFloat` (0 = earlier, 1 = later) and `@GestureState` drag offset. The later photo's opacity = the progress while dragging (`base + translation.width / paneWidth`, clamped 0…1, direction matching the current swipe semantics). On end: `let projected = base + value.predictedEndTranslation.width / paneWidth`; the target is `projected > 0.5 ? 1 : 0`; animate with `.spring(response: 0.35, dampingFraction: 0.9)` via `.animation(_, value:)` or `withAnimation` (update the pin), and set `showingLater` from the target.
- [ ] Reduce Motion: keep the opacity cross-fade (`.smooth(duration: 0.2)`), not `nil` (lines 111, 201).
- [ ] The Flip button and the accessibility action still toggle.
- [ ] `.sensoryFeedback(.selection, trigger: showingLater)`.
- [ ] Commit `feat(ios): Flip tracks the swipe and settles with a spring`.

### Task C5: Capture and review polish
**Files:** `PhotoCaptureManager.swift:149-211`, `PhotoReviewSheet.swift:107`, `ProgressView.swift:278,303`.
- [ ] Camera path: move `jpegData(compressionQuality: 0.8)` off the main thread (as the library path at ~253 already does).
- [ ] Save: make it `async`. Set `saving = true`, `await Task.yield()` so "Saving…" renders, then do the write; reset afterwards. Guard re-entry while saving.
- [ ] Retake keeps the typed note: remember `review?.note` before clearing and seed the next draft with it.
- [ ] Labels: "Full photo" → "Photo, <day month year>" (use the existing formatter), and the same for the review preview.
- [ ] Share failure (`ProgressView.swift:278`): replace the alert with the inline pattern used elsewhere ("Couldn't share. Your photo is safe on this device." + Retry) if the tile already shows state; otherwise leave the alert and note why.
- [ ] Tests: retake-keeps-note on whatever draft type exists; source pins.
- [ ] Commit `fix(ios): capture saves visibly, retake keeps your note`.

---

## Per-PR finish (each PR)
1. Full unit test run (command above) passes; `xcodebuild … build` has no new warnings in touched files.
2. `care-access-reviewer` agent for PR A (messaging, auth) and PR C (photos). `api-contract-checker` is not needed (no API shape changes).
3. One code review (`superpowers:requesting-code-review`), fix findings, then re-run only the focused tests.
4. Push, `gh pr create`, wait for `gh pr checks`, merge (squash, matching history), delete branch/worktree.
