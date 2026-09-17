import Foundation
import Testing
@testable import ClearAF

/// Rules for Compare that a unit test can only see in source: untouched photos, Reduce Motion, dark mat, no Share.
struct CompareViewSourceTests {
    static func source() throws -> String {
        try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views/CompareView.swift"), encoding: .utf8)
    }

    @Test func photosAreFittedOnTheMatAndNeverAltered() throws {
        let text = try Self.source()
        #expect(text.contains(".scaledToFit()"))
        for banned in ["scaledToFill", "aspectRatio(contentMode: .fill", ".clipped()", ".blur(", ".saturation(", ".contrast(", ".brightness(",
                       ".colorMultiply(", ".grayscale(", ".hueRotation(", ".colorInvert(", "rotation3DEffect", ".rotationEffect(",
                       ".scaleEffect(", ".offset(", "matchedGeometryEffect", "Material", ".glassEffect("] {
            #expect(!text.contains(banned), "CompareView uses \(banned)")
        }
    }

    @Test func motionRespectsReduceMotionAndFlipIsACrossfade() throws {
        let text = try Self.source()
        #expect(text.contains("@Environment(\\.accessibilityReduceMotion) private var reduceMotion"))
        let animations = text.components(separatedBy: ".animation(").count - 1
        let guarded = text.components(separatedBy: ".animation(reduceMotion ? nil :").count - 1
        #expect(animations > 0 && animations == guarded, "every animation is off under Reduce Motion")
        #expect(!text.contains("withAnimation"))
    }

    @Test func compareIsDarkReadOnlyAndOmitsShare() throws {
        let text = try Self.source()
        #expect(text.contains(".preferredColorScheme(.dark)"))
        #expect(text.components(separatedBy: ".letterpress(.filled").count - 1 == 1, "only the empty state's Take a photo is filled")
        #expect(!text.contains("ShareLink") && !text.contains("UIActivityViewController"), "Share is deferred")
        #expect(text.contains("LetterpressPicker(title: \"Compare mode\""))
        #expect(!text.contains("NavigationStack") && !text.contains("safeAreaInset(edge: .bottom"), "no nested stack, no bottom spacer")
        #expect(text.contains("PhotoDetailView(photo:"), "the uncropped photo is reachable")
    }

    /// Carried from the Task 1–2 review: `CompareTimelineLoader` is now view-owned, so the view — not `APIService`'s
    /// central sign-out cancellation, which can't reach a per-view object — must react live to an account change
    /// while Compare stays open, the way `PhotoReviewStatusView` already observes `APIService.shared` for the same
    /// reason, in addition to cancelling on disappear.
    @Test func timelineCancelsWhenTheAccountChangesWhileCompareIsOpen() throws {
        let text = try Self.source()
        #expect(text.contains("@ObservedObject private var api = APIService.shared"),
                "observes account state so the timeline reacts live to sign-out, not only on disappear")
        #expect(text.contains("api.access.snapshot()"), "reads the observed account, not an unobserved singleton reference")
        #expect(text.contains("timeline.cancel()"), "cancelled on disappear, the pattern other repositories use")
        #expect(text.contains("timeline.clear()"), "cleared when the ticket no longer matches the signed-in account")
    }
}
