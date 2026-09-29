import Foundation
import Testing
import UIKit
@testable import ClearAF

/// Zoom on the photo detail (design audit C2): the maths as values, the wiring as source pins.
@MainActor struct ZoomablePhotoViewTests {
    @Test func smallerContentIsCentredAndLargerContentIsNot() {
        let bounds = CGSize(width: 300, height: 400)
        #expect(ZoomablePhotoView.centeredInset(content: CGSize(width: 300, height: 200), bounds: bounds)
                == UIEdgeInsets(top: 100, left: 0, bottom: 100, right: 0))
        #expect(ZoomablePhotoView.centeredInset(content: CGSize(width: 100, height: 400), bounds: bounds)
                == UIEdgeInsets(top: 0, left: 100, bottom: 0, right: 100))
        #expect(ZoomablePhotoView.centeredInset(content: CGSize(width: 900, height: 1200), bounds: bounds) == .zero,
                "zoomed past the bounds, content scrolls instead of being inset")
    }

    @Test func thePhotoIsFittedNeverCropped() {
        #expect(ZoomablePhotoView.fittedSize(CGSize(width: 4000, height: 3000), in: CGSize(width: 300, height: 400))
                == CGSize(width: 300, height: 225))
        #expect(ZoomablePhotoView.fittedSize(CGSize(width: 1200, height: 1600), in: CGSize(width: 300, height: 400))
                == CGSize(width: 300, height: 400))
        #expect(ZoomablePhotoView.fittedSize(.zero, in: CGSize(width: 300, height: 400)) == .zero)
    }

    @Test func doubleTapZoomsAboutTheTappedPoint() {
        let rect = ZoomablePhotoView.zoomRect(scale: 2.5, centre: CGPoint(x: 100, y: 200), bounds: CGSize(width: 300, height: 400))
        #expect(rect == CGRect(x: 40, y: 120, width: 120, height: 160))
        #expect(ZoomablePhotoView.maximumScale == 6 && ZoomablePhotoView.doubleTapScale == 2.5
                && ZoomablePhotoView.fullResolutionScale == 1.5)
    }

    @Test func scrollViewIsConfiguredForZoomAndVoiceOver() throws {
        let view = ZoomingScrollView()
        #expect(view.minimumZoomScale == 1 && view.maximumZoomScale == 6 && view.bouncesZoom)
        #expect(view.contentInsetAdjustmentBehavior == .never)
        #expect(view.isAccessibilityElement && view.accessibilityTraits.contains(.image))
        #expect(view.accessibilityCustomActions?.map(\.name) == ["Zoom in", "Reset zoom"])
        view.show(UIImage(), photoID: "a", label: "Photo, 28 Sep 2026")
        #expect(view.accessibilityLabel == "Photo, 28 Sep 2026")
    }

    @Test func detailUsesTheZoomableViewAndLoadsFullResolutionOnZoom() throws {
        let text = try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views/ProgressView.swift"), encoding: .utf8)
        #expect(text.contains("ZoomablePhotoView(image: fullImage ?? image"))
        #expect(text.contains("photoID: PhotoImageKey.of(photo), onZoomIn: loadFullResolution)"))
        #expect(text.contains("await images.fullImage(data: data)"))
    }
}
