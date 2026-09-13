# Accessibility disposition

Raw audits are **failed**, not filtered or relabeled passing. Final covering command exited65: largest retained screen audit16 findings and assigned routine audit2 findings. Text-clipped, description, hit-region and trait passes produced no findings in that run. The normal-size prior run also retained raw findings; prior real gray/Next/sign-out contrast and name clipping were fixed.

Each of the18 final issue crops is preserved below, in chronological issue order. Original xcresult: `/Users/aryansachdev/Library/Developer/Xcode/DerivedData/ClearAF-haxdzzkifazxnearaexuqthkknfe/Logs/Test/Test-ClearAF-2026.09.13_00-12-42--0500.xcresult`; full export `/private/tmp/clearaf-t4-final-covering-attachments`. Full screenshots/issue descriptions and logs remain local; crops here contain no credentials or account identifiers.

| # | Element | Evidence and disposition |
|---|---|---|
| 1 | Today date | [Crop](audit-crops/issue-01.png). Visible black date on white; bottom edge enters system glass. Source primary text; no failed text color established. |
| 2 | Today sharing status | [Crop](audit-crops/issue-02.png). Crop is tab bar over content; source secondary palette minimum6.7846. |
| 3 | Today Take another photo | [Crop](audit-crops/issue-03.png). Crop is offscreen black padding/button edge, no text pixels. |
| 4 | Photos sharing status | [Crop](audit-crops/issue-04.png). Crop is selected Photos tab, not sharing text. |
| 5 | Photos first date | [Crop](audit-crops/issue-05.png). Crop is Previous/Page footer, not date. |
| 6 | Photos second date | [Crop](audit-crops/issue-06.png). Crop is Capture footer, not date. |
| 7 | Detail Done | [Crop](audit-crops/issue-07.png). Toolbar uses semantic body yet grows much less than content; fully visible/actionable. Raw partial Dynamic Type is a real presentation limitation; screenshot evidence does not establish its platform root cause. |
| 8 | Photos scrolled sharing status | [Crop](audit-crops/issue-08.png). Crop is selected Photos tab, not sharing text. |
| 9 | Photos scrolled first date | [Crop](audit-crops/issue-09.png). Crop is Previous/Page footer, not date. |
| 10 | Photos scrolled second date | [Crop](audit-crops/issue-10.png). Crop is Capture footer, not date. |
| 11 | Routines last refreshed | [Crop](audit-crops/issue-11.png). Text enters system bottom glass; full screenshot and crop confirm occlusion, source secondary palette passes. |
| 12 | Profile scrolled Email | [Crop](audit-crops/issue-12.png). Label is behind translucent Close toolbar; actual email text visible black and wraps, sign-out reachable. |
| 13 | Capture library before scroll | [Crop](audit-crops/issue-13.png). Offscreen crop contains button edge/black padding; subsequent actual-frame follow-up required. |
| 14 | Capture Cancel | [Crop](audit-crops/issue-14.png). Toolbar label remains readable/actionable; reduced visual growth remains a real partial Dynamic Type limitation. |
| 15 | Capture library false-hittable follow-up | [Crop](audit-crops/issue-15.png). Repeated offscreen crop: initial isHittable check was inadequate; corrected to actual frame and ScrollView swipe. |
| 16 | Capture Cancel repeat | [Crop](audit-crops/issue-16.png). Repeated native toolbar partial Dynamic Type. |
| 17 | Assigned morning last refreshed | [Crop](audit-crops/issue-17.png). Last-refreshed footer enters tab-bar glass; source palette passes, scroll permits routine action. |
| 18 | Assigned evening last refreshed | [Crop](audit-crops/issue-18.png). Same footer/glass crop on evening; source palette passes. |

## Measured fixes and limits

Resolved light/dark UIKit secondary and error colors across four backgrounds have16 ratios, minimum6.7846:1 ([full values](contrast-evidence.json)). Actual original Next text/background screenshot measured3.5534 and destructive Sign out3.1996: real failures, now explicit primary/error colors. Normal follow-up no longer reports those controls. List text screenshot measured5.3602 despite the raw contrast flag; the underlying label/background passed. Measurements used sRGB AppKit image samples and WCAG luminance formula.

WCAG contrast guidance excludes inactive and invisible content and uses underlying colors rather than antialias fringe pixels. This supports identifying occluded/disabled crops; it does not waive visible text defects. [W3C contrast minimum guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

Largest tests navigated real Photo Details (guarding its navigation bar), Profile editing/signout and morning/evening routines; title/name/date/status text wraps, and record/close controls remain accessible. Raw toolbar Dynamic Type findings remain explicit. Capture's initial isHittable-only reachability assertion was misleading; follow-up uses screen-frame containment and actual ScrollView movement. No full accessibility certification is claimed.

Focused follow-up `testCaptureLibraryAtLargestTextVisibleReachability` completed32.822s with actual screen-frame guard and ScrollView swipe. All five other audit types passed; only Cancel partial Dynamic Type remains. Command exit65 preserved at `/private/tmp/clearaf-t4-capture-visible.log`. [Actual largest-text visible library control](audit-crops/capture-visible.png) proves title/button wrapping and both Take Photo and Choose from Library fit after scrolling. No production change was required for that offscreen contrast finding.

Review clarification: semantic labels and operability do not establish full visual Dynamic Type scaling or an equivalent large-content alternative. Done/Cancel remain smaller than accessibility-sized body content; native placement makes framework capping plausible, but the exact root cause is not established by these screenshots. Full Dynamic Type support and a green accessibility gate are not claimed. Source colors plus occluded crops also do not prove every underlying label was fully visible; routine reachability still has that isHittable-only evidence limitation. Two opt-in writers returned without fixture work in the 55-test covering total; their separate opt-in runs establish the actual fixture evidence.
