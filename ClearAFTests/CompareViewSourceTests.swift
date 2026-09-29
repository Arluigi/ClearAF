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

    /// Design audit C4: Flip follows the finger and settles with a spring; Reduce Motion keeps a short cross-fade
    /// (never nil: the feedback stays), and nothing in Compare moves or scales a photo.
    @Test func motionRespectsReduceMotionAndFlipIsACrossfade() throws {
        let text = try Self.source()
        #expect(text.contains("@Environment(\\.accessibilityReduceMotion) private var reduceMotion"))
        #expect(!text.contains("reduceMotion ? nil"), "Reduce Motion swaps motion for a fade, it never removes it")
        #expect(text.contains("reduceMotion ? .smooth(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.9)"))
        #expect(text.contains(".animation(.smooth(duration: 0.2), value: mode)"), "mode swaps are a cross-fade")
        let animations = text.components(separatedBy: ".animation(").count - 1
        let fades = text.components(separatedBy: ".animation(.smooth(duration: 0.2), value: ").count - 1
        #expect(animations > 0 && animations == fades, "every implicit animation is an opacity fade")
        // The flip is an opacity cross-fade driven by the tracked progress.
        #expect(text.contains(".opacity(1 - flipProgress)") && text.contains(".opacity(flipProgress)"))
        #expect(text.contains("@GestureState private var flipDragging = false"))
        #expect(text.contains("CompareFlip.progress(base: base, translation: value.translation, width: flipWidth)"))
        #expect(text.contains("predictedEnd: value.predictedEndTranslation"))
        #expect(text.contains("if later != showingLater { flip() }"), "a committed drag goes through flip(), one tick")
        #expect(text.contains(".onTapGesture { flip() }") && text.contains(".accessibilityAction { flip() }"))
        #expect(text.components(separatedBy: "withAnimation(").count - 1 == 4,
                "drag tracking, settle back after a drag, settle after a cancelled drag, and flip()")
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

    /// Regression: the timeline used to render `timeline.response` for the newly-picked pair before
    /// `.task(id: timelineKey)` got around to reloading it, so the version line, date range and recorded-days
    /// row could briefly describe the previous pair. `timeline.clear()` inside the existing `.onChange(of:
    /// pair)` runs synchronously with the pair change, before the next render, so the stale response can never
    /// be shown against the new pair.
    @Test func timelineClearsSynchronouslyWhenThePairChanges() throws {
        let text = try Self.source()
        let onChange = try #require(text.range(of: ".onChange(of: pair)"))
        let after = text[onChange.upperBound...].prefix(500)
        #expect(after.contains("timeline.clear()"), "the pair's onChange clears the timeline before the next render, not only .task(id:)")
    }

    /// Regression: an empty sheet used to render when `strip.skinPhoto(for:)` returned nil (an object ID from
    /// a torn-down context). The sheet must say the photo can't be opened instead of showing nothing.
    @Test func detailSheetNamesAnUnreadablePhotoInsteadOfRenderingEmpty() throws {
        let text = try Self.source()
        let sheet = try #require(text.range(of: ".sheet(item: $detail)"))
        let body = text[sheet.upperBound...].prefix(400)
        #expect(body.contains("CompareCopy.photoUnreadable"), "a missing skin photo shows the unreadable-photo copy, not an empty sheet")
    }

    /// The strip's fetch is synchronous, so its `loading` flag is never observably true; the dead branch it
    /// used to gate must be gone rather than left unreachable.
    @Test func noDeadLoadingBranchRemains() throws {
        let text = try Self.source()
        #expect(!text.contains("strip.loading && strip.photos.isEmpty"), "the dead loading sentence branch was removed")
        #expect(!text.contains("&& !strip.loading"), "the always-true loading guard was removed")
    }

    /// Every "Try again" button reads distinctly to VoiceOver, since a screen with several says the same word.
    @Test func tryAgainButtonsHaveDistinctAccessibilityLabels() throws {
        let text = try Self.source()
        let labels = text.components(separatedBy: "Button(\"Try again\")").dropFirst().compactMap { chunk -> String? in
            guard let range = chunk.range(of: #"\.accessibilityLabel\("([^"]+)"\)"#, options: .regularExpression) else { return nil }
            return String(chunk[range])
        }
        #expect(labels.count == 4, "every \"Try again\" button carries an accessibilityLabel")
        #expect(Set(labels).count == labels.count, "no two \"Try again\" buttons share the same accessibilityLabel")
    }

    /// The header (Done + "N days apart") and the flip caption (role + stamp) squeeze at accessibility sizes
    /// unless they use the same `adaptiveRow` layout as the other comparable rows.
    @Test func headerAndFlipCaptionUseAdaptiveRow() throws {
        let text = try Self.source()
        let header = try #require(text.range(of: "private var header: some View {"))
        #expect(text[header.upperBound...].prefix(80).contains("adaptiveRow"), "the header uses adaptiveRow")
        let flip = try #require(text.range(of: "private func flipStage(_ ordered: Ordered) -> some View {"))
        let flipBody = text[flip.upperBound...].prefix(1500)
        #expect(flipBody.contains("adaptiveRow"), "the flip caption uses adaptiveRow")
    }
}

/// Flip's drag as values (design audit C4).
struct CompareFlipTests {
    @Test func dragFollowsTheFingerAcrossThePane() {
        // Showing later (1): dragging right by a quarter of the pane shows a quarter of the earlier photo.
        #expect(CompareFlip.progress(base: 1, translation: CGSize(width: 75, height: 0), width: 300) == 0.75)
        #expect(CompareFlip.progress(base: 0, translation: CGSize(width: -150, height: 10), width: 300) == 0.5)
        // Clamped at either photo.
        #expect(CompareFlip.progress(base: 1, translation: CGSize(width: -200, height: 0), width: 300) == 1)
        #expect(CompareFlip.progress(base: 1, translation: CGSize(width: 900, height: 0), width: 300) == 0)
        // A mostly vertical drag is a scroll, and an unmeasured pane changes nothing.
        #expect(CompareFlip.progress(base: 1, translation: CGSize(width: 60, height: 120), width: 300) == 1)
        #expect(CompareFlip.progress(base: 0, translation: CGSize(width: -60, height: 0), width: 0) == 0)
    }

    @Test func releaseSettlesOnTheProjectedSide() {
        // A slow drag past halfway flips; short of it springs back.
        #expect(!CompareFlip.settlesOnLater(base: 1, predictedEnd: CGSize(width: 180, height: 0), width: 300))
        #expect(CompareFlip.settlesOnLater(base: 1, predictedEnd: CGSize(width: 120, height: 0), width: 300))
        // A short flick whose projection passes halfway flips.
        #expect(CompareFlip.settlesOnLater(base: 0, predictedEnd: CGSize(width: -240, height: 0), width: 300))
        #expect(!CompareFlip.settlesOnLater(base: 0, predictedEnd: CGSize(width: -60, height: 0), width: 300))
    }
}
