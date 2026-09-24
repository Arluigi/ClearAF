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

    /// The onboarding reminders step arrives pre-ticked so a patient opts out rather than in, but this must be a
    /// property of onboarding's own starting draft only: `ReminderPreferences()` — what `ReminderSettingsView`
    /// and existing accounts get — must stay off by default.
    @Test func onboardingReminderDraftStartsEnabledButReminderPreferencesItselfDoesNot() {
        let plain = ReminderPreferences()
        #expect(!plain.morning.enabled); #expect(!plain.evening.enabled); #expect(!plain.photo.enabled)
        #expect(!plain.anyEnabled)

        let onboarding = ReminderPreferences.onboardingDefault
        #expect(onboarding.morning.enabled); #expect(onboarding.evening.enabled); #expect(onboarding.photo.enabled)
        #expect(onboarding.anyEnabled)
        // Pre-ticked at the existing default times, not new ones.
        #expect(onboarding.morning.hour == plain.morning.hour); #expect(onboarding.evening.hour == plain.evening.hour)
        #expect(onboarding.photo.hour == plain.photo.hour); #expect(onboarding.weekday == plain.weekday)

        // A patient who unticks everything ends up with the same value `ReminderPreferences()` accounts start
        // with, so `remindersChanged` (`reminderDraft != reminders.preferences`) is false and no save fires —
        // no silent re-enabling on a no-op continue.
        var unticked = onboarding
        unticked.morning.enabled = false; unticked.evening.enabled = false; unticked.photo.enabled = false
        #expect(unticked == plain)
    }
}
