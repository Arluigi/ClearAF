import SwiftUI
import UIKit

/// One photo you can pinch or double-tap to zoom, up to 6×, on the detail sheet's mat. A UIScrollView gives the
/// native feel (rubber-banding past the limits, zooming about the pinch). The photo is fitted, never cropped at 1×.
/// VoiceOver reads it as one labelled image with "Zoom in" and "Reset zoom" actions.
struct ZoomablePhotoView: UIViewRepresentable {
    let image: UIImage
    let label: String
    /// Identifies the photo shown; a different photo starts again at 1×.
    let photoID: String
    /// Called once per photo, the first time the zoom passes `fullResolutionScale`.
    let onZoomIn: () -> Void

    static let maximumScale: CGFloat = 6
    static let doubleTapScale: CGFloat = 2.5
    static let fullResolutionScale: CGFloat = 1.5

    func makeUIView(context: Context) -> ZoomingScrollView { ZoomingScrollView() }

    func updateUIView(_ view: ZoomingScrollView, context: Context) {
        view.onZoomIn = onZoomIn
        view.show(image, photoID: photoID, label: label)
    }

    /// Insets that centre content smaller than the bounds; zero on an axis where it already fills them.
    static func centeredInset(content: CGSize, bounds: CGSize) -> UIEdgeInsets {
        let horizontal = max(0, (bounds.width - content.width) / 2)
        let vertical = max(0, (bounds.height - content.height) / 2)
        return UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical, right: horizontal)
    }

    /// The image's size when aspect-fitted inside the bounds.
    static func fittedSize(_ image: CGSize, in bounds: CGSize) -> CGSize {
        guard image.width > 0, image.height > 0 else { return .zero }
        let scale = min(bounds.width / image.width, bounds.height / image.height)
        return CGSize(width: image.width * scale, height: image.height * scale)
    }

    /// The content rect that fills the bounds at `scale`, centred on a point in unzoomed content coordinates.
    static func zoomRect(scale: CGFloat, centre: CGPoint, bounds: CGSize) -> CGRect {
        let size = CGSize(width: bounds.width / scale, height: bounds.height / scale)
        return CGRect(x: centre.x - size.width / 2, y: centre.y - size.height / 2, width: size.width, height: size.height)
    }
}

final class ZoomingScrollView: UIScrollView, UIScrollViewDelegate {
    var onZoomIn: () -> Void = {}
    private let imageView = UIImageView()
    private var photoID: String?
    private var laidOutFor: CGSize = .zero
    private var reportedZoomIn = false

    init() {
        super.init(frame: .zero)
        delegate = self
        minimumZoomScale = 1
        maximumZoomScale = ZoomablePhotoView.maximumScale
        bouncesZoom = true
        contentInsetAdjustmentBehavior = .never
        showsHorizontalScrollIndicator = false
        showsVerticalScrollIndicator = false
        decelerationRate = .fast
        backgroundColor = .clear // the SwiftUI mat behind shows through
        imageView.contentMode = .scaleAspectFit
        addSubview(imageView)
        let doubleTap = UITapGestureRecognizer(target: self, action: #selector(doubleTapped(_:)))
        doubleTap.numberOfTapsRequired = 2
        addGestureRecognizer(doubleTap)
        isAccessibilityElement = true
        accessibilityTraits = .image
        accessibilityCustomActions = [
            UIAccessibilityCustomAction(name: "Zoom in") { [weak self] _ in self?.zoomIn() ?? false },
            UIAccessibilityCustomAction(name: "Reset zoom") { [weak self] _ in self?.resetZoom() ?? false },
        ]
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func show(_ image: UIImage, photoID: String, label: String) {
        accessibilityLabel = label
        if photoID != self.photoID {
            self.photoID = photoID
            reportedZoomIn = false
            setZoomScale(1, animated: false)
            imageView.image = image
            laidOutFor = .zero
            setNeedsLayout()
        } else if imageView.image !== image {
            // The same photo decoded at full size: same aspect, so the frame and the zoomed-in rect stay put.
            imageView.image = image
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if bounds.size != laidOutFor, let image = imageView.image {
            laidOutFor = bounds.size
            setZoomScale(1, animated: false)
            let fitted = ZoomablePhotoView.fittedSize(image.size, in: bounds.size)
            imageView.frame = CGRect(origin: .zero, size: fitted)
            contentSize = fitted
        }
        centre()
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        centre()
        accessibilityValue = zoomScale > minimumZoomScale ? "Zoomed in" : nil
        if !reportedZoomIn && zoomScale > ZoomablePhotoView.fullResolutionScale {
            reportedZoomIn = true
            onZoomIn()
        }
    }

    private func centre() {
        contentInset = ZoomablePhotoView.centeredInset(content: imageView.frame.size, bounds: bounds.size)
    }

    @objc private func doubleTapped(_ gesture: UITapGestureRecognizer) {
        if zoomScale > minimumZoomScale {
            _ = resetZoom()
        } else {
            let rect = ZoomablePhotoView.zoomRect(scale: ZoomablePhotoView.doubleTapScale,
                                                  centre: gesture.location(in: imageView), bounds: bounds.size)
            settle { self.zoom(to: rect, animated: $0) }
        }
    }

    private func zoomIn() -> Bool {
        guard zoomScale < maximumZoomScale else { return false }
        let target = min(maximumZoomScale, zoomScale * ZoomablePhotoView.doubleTapScale)
        let visibleCentre = convert(CGPoint(x: bounds.midX, y: bounds.midY), to: imageView)
        let rect = ZoomablePhotoView.zoomRect(scale: target, centre: visibleCentre, bounds: bounds.size)
        settle { self.zoom(to: rect, animated: $0) }
        return true
    }

    private func resetZoom() -> Bool {
        guard zoomScale > minimumZoomScale else { return false }
        settle { self.setZoomScale(self.minimumZoomScale, animated: $0) }
        return true
    }

    /// Zooms with the system animation, or under Reduce Motion as a short cross-fade instead of a zoom.
    private func settle(_ change: @escaping (Bool) -> Void) {
        if UIAccessibility.isReduceMotionEnabled {
            UIView.transition(with: self, duration: 0.2, options: .transitionCrossDissolve) { change(false) }
        } else {
            change(true)
        }
    }
}
