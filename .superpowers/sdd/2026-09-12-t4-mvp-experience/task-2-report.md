# Task 2 report: retained iOS navigation and minimal account flow

## Result

- Patient navigation now exposes exactly **Today**, **Photos**, and **Routines**. `ProgressView` remains the photo-tab implementation type.
- Today retains the latest real local photo and assigned routine status. The prescription and hard-coded clinician cards and their unused implementations were removed.
- Profile now exposes the persisted name editor, signed-in email, recoverable save state, sign-out, a labeled Close control, and the existing truthful account-removal explanation.
- Onboarding is one scrollable factual photo/routine introduction and a trimmed 2–100 character name form. Completion uses a name-only PATCH, shows progress, and leaves the form available with retry after failure.
- Registration collects only name, email, and password. The service keeps its optional skin-classification parameter for legacy callers; the new flow omits it from Supabase metadata.
- Shared fixed-size font aliases now map to semantic Dynamic Type styles. The foreground accent is adaptive by appearance and action-gradient fills remain fixed colors that support white text.
- Existing photo/routine repository entry signatures and account-generation barriers were not changed. Photo paging and physical-device networking remain outside this task.

## TDD evidence

### RED: account payloads and optional registration metadata

Command:

```sh
PATH=/Users/aryansachdev/.local/share/clearaf/node-v24.4.0-darwin-arm64/bin:/Users/aryansachdev/.local/share/clearaf/bin:/opt/homebrew/bin:$PATH \
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
xcodebuild test -project ClearAF.xcodeproj -scheme ClearAF \
  -destination 'platform=iOS Simulator,id=A292A962-7363-48A2-8A85-AEBBBA9A3B92' \
  -derivedDataPath /private/tmp/clearaf-t3-build \
  -clonedSourcePackagesDirPath /private/tmp/clearaf-source-packages \
  -only-testing:ClearAFTests/AccountProfileTests
```

Expected failure: `UpdateProfileRequest` had no `onboarding` or `nameEdit` factory and `SupabaseService` had no `registrationMetadata` helper. Result: **TEST FAILED**, three missing-contract compilation failures.

### RED: appearance-aware contrast

After correcting test-only dictionary typing, the focused command failed only because `Color.primaryActionPurple` and `Color.primaryActionTeal` did not exist. This established the required split between adaptive foreground color and fixed action fills before implementation.

### RED: failed/stale save state

The focused command failed because `AccountSaveState` did not exist. The tests require failed saves and account-change failures to publish an error, stop loading, and never publish success.

### GREEN: focused account tests

The same focused command passed six tests:

- onboarding payload contains only `name` and `onboardingCompleted`
- name-edit payload contains only `name`
- unselected classification metadata contains only `name`
- adaptive foreground and both action endpoints meet 4.5:1 in light and dark appearances
- failed save retains an error state without success
- account-change save failure cannot publish success

Result: **6/6 passed**. Evidence: `/private/tmp/clearaf-t3-build/Logs/Test/Test-ClearAF-2026.09.12_21-29-36--0500.xcresult`.

Measured sRGB contrast pairs:

| Pair | Light | Dark | Target |
| --- | ---: | ---: | ---: |
| foreground purple / system background | 6.42:1 | 7.44:1 | 4.5:1 |
| white / action purple | 6.42:1 | 6.42:1 | 4.5:1 |
| white / action teal | 5.08:1 | 5.08:1 | 4.5:1 |

### Account UI tests

Focused commands used the same project, scheme, Simulator, DerivedData, and package paths above with these selectors:

```sh
-only-testing:ClearAFUITests/AccountFlowUITests/testConfirmationOnboardingColdLaunchAndOfflineLogout
-only-testing:ClearAFUITests/AccountFlowUITests/testSameDeviceAccountSwitchAndPasswordRecovery
```

- Confirmation, name-only onboarding, exact Today/Photos/Routines tab assertions, cold launch, and offline logout: **passed in 48.404s**. Evidence: `/private/tmp/clearaf-t3-build/Logs/Test/Test-ClearAF-2026.09.12_21-31-32--0500.xcresult`.
- Same-device account switch, profile email/name save, sign-out, return to a completed account without onboarding, and password recovery: an initial assertion expected a static name element the profile does not render. The assertion was corrected to the explicit successful-save state. Final run after the shared save-state refactor: **passed in 104.663s**. Evidence: `/private/tmp/clearaf-t3-build/Logs/Test/Test-ClearAF-2026.09.12_21-32-55--0500.xcresult`.

The dedicated photo and routine UI tests were not run because their separate fixtures were outside this account-focused task. `.local/routine-ui-fixture.json` was not changed.

## Broader verification

Full iOS unit command:

```sh
xcodebuild test -quiet -project ClearAF.xcodeproj -scheme ClearAF \
  -destination 'platform=iOS Simulator,id=A292A962-7363-48A2-8A85-AEBBBA9A3B92' \
  -derivedDataPath /private/tmp/clearaf-t3-build \
  -clonedSourcePackagesDirPath /private/tmp/clearaf-source-packages \
  -parallel-testing-enabled NO -only-testing:ClearAFTests
```

Result: **passed**, exit 0. Evidence: `/private/tmp/clearaf-t3-build/Logs/Test/Test-ClearAF-2026.09.12_21-36-53--0500.xcresult`.

A prior default-parallel run passed all changed/account, photo, routine, upload-security, and environment tests but failed `AccountPersistenceTests.typedFetchesResolveOneModelAcrossAccountContainers` because three global `NSManagedObject.entity()` identities differed while multiple container tests ran concurrently. The test passed alone, and the complete suite passed with parallel test execution disabled. No persistence implementation changed in this task.

Debug Simulator build:

```sh
xcodebuild build -quiet -project ClearAF.xcodeproj -scheme ClearAF -configuration Debug \
  -destination 'platform=iOS Simulator,id=A292A962-7363-48A2-8A85-AEBBBA9A3B92' \
  -derivedDataPath /private/tmp/clearaf-t3-build \
  -clonedSourcePackagesDirPath /private/tmp/clearaf-source-packages
```

Result: **passed**, exit 0.

`git diff --check` passed. Existing warnings remain for a redundant `#require` in `PhotoRepositoryTests` and an unnecessary `await` around Supabase auth-state changes.

## Files changed

- `ClearAF/ContentView.swift`
- `ClearAF/Services/APIService.swift`
- `ClearAF/Services/SupabaseService.swift`
- `ClearAF/Views/AuthenticationView.swift`
- `ClearAF/Views/DashboardViewEnhanced.swift`
- `ClearAF/Views/DesignSystem.swift`
- `ClearAF/Views/OnboardingView.swift`
- `ClearAF/Views/PhotoCaptureManager.swift`
- `ClearAF/Views/ProfileView.swift`
- `ClearAF/Views/ProgressView.swift`
- `ClearAFTests/AccountProfileTests.swift`
- `ClearAFUITests/AccountFlowUITests.swift`

## Synthetic accounts created

These users were absent from `.local/t4-before-ios-users.json` and were created by Task 2 UI runs. They can be deleted by exact ID without retaining passwords:

| ID | Email |
| --- | --- |
| `b32c5d11-cc07-4cd0-b059-79b8e79ac1a9` | `clearaf-ui-d02d66be-38c5-4fda-8a2f-96a07b886e74@example.invalid` |
| `7dfb1a53-7f31-4083-9f6f-0e183d355b6a` | `clearaf-ui-4fe4abd7-3c55-4f7b-805f-77815bbec150@example.invalid` |
| `6ac2897d-25fa-49d4-8bdb-9914dcbc8215` | `clearaf-ui-40910979-68d0-45d0-a9bf-4c606ada9206@example.invalid` |
| `05e66f0a-5e01-4020-833a-9eef69e6dd4f` | `clearaf-ui-2dad9117-e839-4612-b3b3-c4cfc87a1ff6@example.invalid` |
| `4bb5c5d4-dbe4-4e0c-beb7-5d2b1fe6ecbe` | `clearaf-ui-ae52ae5f-96d9-49cf-acbb-1559dfdacfcb@example.invalid` |
| `de5b5788-f997-4da3-8236-586a4c49f117` | `clearaf-ui-207f1311-2634-4d5c-b27f-b8d5fd07a5d5@example.invalid` |
| `adc0a9b2-fa82-4175-8b32-78108f80cfbd` | `clearaf-ui-bbf10f8f-0b79-4440-b4de-65729beb68d1@example.invalid` |
| `bb553f3f-b0a1-4977-9014-f7cea847f6bd` | `clearaf-ui-07ebe515-29c4-42af-8ce0-4fd58a9c1db2@example.invalid` |
| `0b8262e4-b0af-4154-aa78-bbbdd02c3213` | `clearaf-ui-cccc2459-9f33-4a4c-8acf-ac523c035243@example.invalid` |
| `59e94ac8-924f-481c-a365-ae7405c9d555` | `clearaf-ui-48fe036a-b107-4299-8c31-3aeed42b1184@example.invalid` |

## Concerns and boundaries

- The simulator/Xcode runner repeatedly logged `DebuggerLLDB.DebuggerVersionStore.StoreError: no debugger version`; passing test and build results were still produced. One serial attempt also hit a stale Simulator connection UUID, so the named Simulator was shut down, booted, and the same command then passed.
- Legacy onboarding/profile helper view types remain in their source files to avoid broad deletion of shared compile-time references; they are no longer reachable from the retained flows.
- This task does not claim physical-device, camera-permission, photo paging/memory, or Debug Bonjour networking verification; those remain later work under the approved spec.

## Scope correction: registration fields

Review found that offering an optional skin-classification picker still asked new users for a clinical field outside the approved minimal account flow. The picker and all view state/options supporting it were removed from `AuthenticationView`; the optional `SupabaseService.signUp` parameter remains for source compatibility.

TDD RED used the signup/onboarding UI test with `XCTAssertFalse(app.staticTexts["Skin Type"].exists)`. It failed against the existing registration screen in 24.651s, proving the assertion detected the reachable picker. After removal:

- `AccountProfileTests/registrationMetadataOmitsUnselectedSkinClassification`: **passed**, exit 0. Evidence: `/private/tmp/clearaf-t3-build/Logs/Test/Test-ClearAF-2026.09.12_21-43-58--0500.xcresult`.
- `AccountFlowUITests/testConfirmationOnboardingColdLaunchAndOfflineLogout`: **passed in 46.593s**, including the absent-classification assertion and successful name/email/password signup plus name-only onboarding. Evidence: `/private/tmp/clearaf-t3-build/Logs/Test/Test-ClearAF-2026.09.12_21-44-31--0500.xcresult`.

Two further exact synthetic accounts were created while verifying this correction:

| ID | Email |
| --- | --- |
| `60949fbc-0f78-434b-8624-24b89d4f79b9` | `clearaf-ui-dacdaf20-aee1-49d6-bc8a-25a5e1a0e72e@example.invalid` |
| `63b76af8-4cef-4f20-8883-d984de63ea0b` | `clearaf-ui-f65af42e-2280-468b-b907-7f8554c9d800@example.invalid` |
