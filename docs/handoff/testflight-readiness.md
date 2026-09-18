# TestFlight readiness

Written 2026-09-17, after the Letterpress 1.0 redesign merged. This is a checklist, not an approval. `CLAUDE.md` still records App Store and TestFlight distribution as on hold pending T5 pilot policy; that hold is the owner's to lift.

There are two ways to put the patient app in someone else's hands. Pick by what you want back from them.

## Route A — direct install (no Apple review)

Best for a demo you're present for, or a single reviewer you trust.

- **Their device, your Mac.** Plug in, then build and install: about five minutes, nothing to submit.
- **Their device, elsewhere.** Add the device UDID in the Apple Developer account, rebuild, and send them the `.ipa` to install with Apple Configurator or Xcode. Clumsy but immediate.
- **Expiry:** a development build lasts 7 days on a personal team, 1 year on a paid one. After that it stops opening and needs reinstalling.
- **Limit:** 100 registered devices per membership year.

## Route B — TestFlight

Best for feedback over weeks, or more than a couple of testers.

**Mechanics**

1. An App Store Connect app record for `com.clearaf.patient` (the Release bundle ID; Debug stays `com.aryansachdev.ClearAF.dev`), with a name, a primary category and an age rating.
2. An archived Release build (`xcodebuild archive`, then export with an App Store distribution profile) uploaded via Xcode or `xcrun altool`.
3. Export compliance answers. The app uses HTTPS only, which is normally the exemption, but it must be answered per build.
4. Testers. **Internal** (up to 100, must be App Store Connect users on your team) get builds immediately, with no review. **External** (up to 10,000) need Apple's Beta App Review, usually a day or two, and a public or emailed invite link.

**What has to exist before external review passes**

| Requirement | State today |
|---|---|
| Privacy policy URL, reachable and specific | Does not exist |
| Privacy nutrition labels (photos, health data, identifiers, messages) | Not filled in |
| Health-data justification: why the app collects skin photos and clinician messages | Not written |
| In-app account deletion, or a documented exemption | **Not implemented, and the policy is explicitly unapproved** (see `docs/handoff/README.md`: the app deliberately shows an unsupported-removal status and must not imply deletion works) |
| A demo account for the reviewer, seeded with synthetic data | Not created |
| A clear beta description saying this is a synthetic demo, not for clinical use | Not written |
| Support URL and a marketing name that doesn't imply a medical device | Not decided |

**The account-deletion one is the real blocker.** Apple requires any app offering account creation to offer in-app account deletion. Refusing on clinical-retention grounds is arguable, but it is an argument you have to make in review, and the repo currently records the policy as unapproved rather than decided. Settle the retention policy first; the App Store answer follows from it.

## What is not blocked

The **clinician** experience needs none of this. The portal is live at `https://clearaf-portal.vercel.app` and works in any browser. A dermatologist evaluating the worklist, photo review, routine authoring, check-ins and messages can do all of it today with a synthetic account.

## Whichever route

- The app is marked synthetic demo only and is not approved for clinical use. Anyone trying it should be told that plainly, and should get a synthetic account.
- Never put real patient data in it. `CLAUDE.md` forbids bringing production patient data onto a dev machine, and the same reasoning applies to a pilot.
- A trial clinician account is created by an operator writing directly to the production database. There is no admin API on purpose: `POST /users/assign-dermatologist` returns 403 with "Assignment requires practice administration". If trial accounts become routine, that decision deserves revisiting rather than repeated one-off writes.
