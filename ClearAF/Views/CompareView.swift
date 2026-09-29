import CoreData
import SwiftUI
import UIKit

/// Compare (spec §6 iOS #6): two of the patient's own photos on a near-black mat, side by side, overlaid or flipped;
/// a filmstrip to pick the pair; and what the record holds between the two capture dates. Photos are fitted, never
/// cropped, aligned, warped or filtered, and each one opens whole in the existing detail sheet. Read-only.
struct ComparePhotosView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var strip = ComparePhotoStrip()
    @StateObject private var timeline = CompareTimelineLoader(access: APIService.shared.access, transport: APIService.shared)
    // Carried from the Task 1–2 review: `CompareTimelineLoader` is view-owned, so `APIService`'s central sign-out
    // cancellation can't reach it. Observing `APIService.shared` here (the same pattern `PhotoReviewStatusView`
    // uses) recomputes `timelineKey` the moment the account changes while Compare is still on screen, so
    // `loadTimeline()`'s guard clears the loader live, in addition to the `.onDisappear` cancel below.
    @ObservedObject private var api = APIService.shared
    @State private var pair = ComparePair<ComparePhoto>()
    @State private var pickedDefault = false
    @State private var mode = CompareMode.sideBySide
    @State private var overlay = 0.5
    @State private var showingLater = true
    /// What the flip stage shows: 0 is the earlier photo, 1 the later. Follows a horizontal drag, then settles on
    /// `showingLater`. The later photo's opacity is this value, the earlier one's is the rest.
    @State private var flipProgress: CGFloat = 1
    /// True while a drag is live; resets on its own when the system cancels one, which never reaches `onEnded`.
    @GestureState private var flipDragging = false
    /// The live drag's axis, locked on its first change so a diagonal drag can't flicker between flip and scroll.
    /// `@State`, not `@GestureState`: gesture state is already reset when `onEnded` runs, and the release must be
    /// judged on the axis the drag locked, not re-derived from where it ended. Keyed by the drag's start location,
    /// so a lock left by a cancelled drag never applies to the next one. Not cleared in the cancel path, which can
    /// run before `onEnded` (gesture state resets first) and would then drop a real flip.
    @State private var flipLock: CompareFlip.Lock?
    @State private var flipWidth: CGFloat = 0
    @State private var detail: ComparePhoto?
    @State private var retry = 0
    /// Counts the patient's own flips and pair picks. The haptic follows it, not `showingLater` or `pair`, which also
    /// change on their own (the default pair, the reset to the later photo when the pair changes).
    @State private var selectionTaps = 0
    /// Each photo's detail sheet grows out of the pane it was opened from.
    @Namespace private var photoZoom

    private typealias Ordered = (earlier: ComparePhoto, later: ComparePhoto)
    private var ordered: Ordered? { pair.ordered(date: \.captureDate) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                stage.padding(.top, Letterpress.Space.s18)
                modePicker.padding(.top, Letterpress.Space.s18)
                filmstrip.padding(.top, Letterpress.Space.s22)
                changed.padding(.top, Letterpress.Space.s28)
                Text(CompareCopy.footnote)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Letterpress.Space.s22)
            }
            .padding(.horizontal, Letterpress.Space.s18)
            .padding(.bottom, Letterpress.Space.s28)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Letterpress.canvas.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .onAppear {
            strip.bind(context: viewContext)
            pickDefaultPair()
        }
        .onChange(of: strip.photos) { pickDefaultPair() }
        .sensoryFeedback(.selection, trigger: selectionTaps)
        .onChange(of: pair) {
            showingLater = true
            flipProgress = 1
            // Clears synchronously, in the same update as the pair change, so the render that reflects the
            // new pair never shows the previous pair's version line, date range or recorded-days row while
            // `.task(id: timelineKey)` is still on its way to reloading them.
            timeline.clear()
        }
        .task(id: timelineKey) { await loadTimeline() }
        .onDisappear {
            strip.dispose()
            timeline.cancel()
        }
        .sheet(item: $detail) { photo in
            Group {
                if let skin = strip.skinPhoto(for: photo) {
                    PhotoDetailView(photo: skin, images: strip.stageImages)
                } else {
                    Text(CompareCopy.photoUnreadable)
                        .font(Letterpress.ui(15, relativeTo: .body))
                        .foregroundStyle(Letterpress.inkSecondary)
                        .padding(Letterpress.Space.s22)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .photoZoomTransition(id: photo.id, in: photoZoom, reduceMotion: reduceMotion)
        }
    }

    // MARK: Header

    private var header: some View {
        adaptiveRow {
            Button("Done") { dismiss() }
                .buttonStyle(.letterpress(.underline))
            if let ordered, let apart = CompareCopy.apart(ordered.earlier.captureDate, ordered.later.captureDate) {
                Text(apart)
                    .font(Letterpress.data(11, weight: .medium, relativeTo: .caption))
                    .tracking(1.5)
                    .textCase(.uppercase)
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
            }
        }
        .padding(.top, Letterpress.Space.s10)
    }

    // MARK: Stage

    @ViewBuilder private var stage: some View {
        if let ordered {
            Group {
                switch mode {
                case .sideBySide: sideBySide(ordered).transition(.opacity)
                case .overlay: overlayStage(ordered).transition(.opacity)
                case .flip: flipStage(ordered).transition(.opacity)
                }
            }
            // Every mode swap is a cross-fade, so it is the same with Reduce Motion on.
            .animation(.smooth(duration: 0.2), value: mode)
        } else if let error = strip.error, strip.photos.isEmpty {
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Text(error)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Try again") { strip.reload() }
                    .buttonStyle(.letterpress(.outlined))
                    .accessibilityLabel("Retry loading photos")
            }
        } else if strip.photos.count < 2 {
            sentence(CompareCopy.emptySentence(total: strip.photos.count))
        } else {
            sentence(CompareCopy.pickTwo)
        }
    }

    private func sideBySide(_ ordered: Ordered) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s18))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Letterpress.Space.s4))
        return layout {
            pane(ordered.earlier, role: .earlier, routines: timeline.response?.routinesAtFrom)
            pane(ordered.later, role: .later, routines: timeline.response?.routinesAtTo)
        }
    }

    private func pane(_ photo: ComparePhoto, role: CompareRole, routines: [CareRoutineRevision]?) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
            Button { detail = photo } label: {
                CompareMat { CompareImage(photo: photo, strip: strip) }
                    .matchedTransitionSource(id: photo.id, in: photoZoom)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(CompareCopy.paneLabel(role: role, date: photo.captureDate))
            .accessibilityHint(CompareCopy.openHint)
            stamp(photo)
            if let line = routines.flatMap(CompareCopy.routineLine) {
                Text(line)
                    .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                    .textCase(.uppercase)
                    .foregroundStyle(Letterpress.inkTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func overlayStage(_ ordered: Ordered) -> some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            CompareMat {
                ZStack {
                    CompareImage(photo: ordered.earlier, strip: strip)
                    CompareImage(photo: ordered.later, strip: strip).opacity(overlay)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(CompareCopy.overlayLabel)
            .accessibilityValue(CompareCopy.overlayValue(overlay))
            twoStamps(ordered)
            HStack(alignment: .firstTextBaseline) {
                Text(CompareCopy.overlaySlider)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
                Spacer(minLength: Letterpress.Space.s10)
                Text(CompareCopy.percent(overlay))
                    .font(Letterpress.data(12, weight: .regular, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.ink)
            }
            .accessibilityHidden(true)
            Slider(value: $overlay, in: 0...1)
                .tint(Letterpress.ink)
                .frame(minHeight: Letterpress.minTouch)
                .accessibilityLabel(CompareCopy.overlaySlider)
                .accessibilityValue(CompareCopy.overlayValue(overlay))
            adaptiveRow {
                Button(CompareCopy.openEarlier) { detail = ordered.earlier }.buttonStyle(.letterpress(.underline))
                Button(CompareCopy.openLater) { detail = ordered.later }.buttonStyle(.letterpress(.underline))
            }
        }
    }

    private func flipStage(_ ordered: Ordered) -> some View {
        let shown = showingLater ? ordered.later : ordered.earlier
        return VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            CompareMat {
                ZStack {
                    CompareImage(photo: ordered.earlier, strip: strip).opacity(1 - flipProgress)
                    CompareImage(photo: ordered.later, strip: strip).opacity(flipProgress)
                }
            }
            .matchedTransitionSource(id: shown.id, in: photoZoom)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { flipWidth = $0 }
            .contentShape(Rectangle())
            .onTapGesture { flip() }
            .simultaneousGesture(flipDrag)
            .onChange(of: flipDragging) { _, dragging in
                // A cancelled drag never reaches `onEnded`: settle back. The lock stays (see `flipLock`).
                if !dragging { withAnimation(flipAnimation) { flipProgress = showingLater ? 1 : 0 } }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(CompareCopy.flipLabel(showingLater: showingLater, date: shown.captureDate))
            .accessibilityHint(CompareCopy.flipHint)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { flip() }
            adaptiveRow {
                Text(showingLater ? CompareRole.later.label : CompareRole.earlier.label)
                    .letterpressEyebrow(color: Letterpress.ink)
                stamp(shown)
            }
            sentence(CompareCopy.flipHelp)
            Button(CompareCopy.openShown) { detail = shown }
                .buttonStyle(.letterpress(.underline))
        }
    }

    private func twoStamps(_ ordered: Ordered) -> some View {
        adaptiveRow {
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text(CompareRole.earlier.label).letterpressEyebrow()
                stamp(ordered.earlier)
            }
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Text(CompareRole.later.label).letterpressEyebrow()
                stamp(ordered.later)
            }
        }
    }

    private func stamp(_ photo: ComparePhoto) -> some View {
        Text(photo.captureDate.map { LetterpressFormat.stampTime($0) } ?? CompareCopy.undatedStamp.uppercased())
            .font(Letterpress.data(11, weight: .medium, relativeTo: .caption))
            .foregroundStyle(Letterpress.ink)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Mode, filmstrip, timeline

    private var modePicker: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
            LetterpressPicker(title: "Compare mode", selection: $mode) {
                ForEach(CompareMode.allCases, id: \.self) { Text($0.title).tag($0) }
            }
            .disabled(ordered == nil)
            if ordered == nil {
                sentence(CompareCopy.modeDisabledReason)
            }
        }
    }

    private var filmstrip: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(CompareCopy.pickEyebrow).letterpressEyebrow()
            // `strip.loadMore()`'s fetch is synchronous (a local Core Data read), so `strip.loading` is set
            // and cleared within the same call and this view never observes it as `true`. No loading state here.
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: Letterpress.Space.s6) {
                    ForEach(strip.photos) { photo in
                        CompareThumbnail(photo: photo, role: pair.role(of: photo, date: \.captureDate), strip: strip) {
                            pair.toggle(photo)
                            selectionTaps += 1
                        }
                        .onAppear { if photo == strip.photos.last { strip.loadMore() } }
                    }
                }
                .padding(.vertical, Letterpress.Space.s4)
            }
            .scrollIndicators(.hidden)
            if let error = strip.error, !strip.photos.isEmpty {
                Text(error)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Try again") { strip.loadMore() }
                    .buttonStyle(.letterpress(.outlined))
                    .accessibilityLabel("Retry loading more photos")
            }
            sentence(CompareCopy.pickHelp)
        }
    }

    private var changed: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            adaptiveRow {
                Text(CompareCopy.changedEyebrow).letterpressEyebrow()
                if case .ready(let checkedAt, true) = timeline.state {
                    Text(RoutineRecordCopy.lastChecked(checkedAt)).letterpressEyebrow(color: Letterpress.attentionText)
                }
            }
            timelineBody
        }
    }

    @ViewBuilder private var timelineBody: some View {
        switch timeline.state {
        case .idle:
            sentence(ordered == nil ? CompareCopy.pickTwo : (hasDates ? CompareCopy.loadingTimeline : CompareCopy.undated))
        case .loading:
            sentence(CompareCopy.loadingTimeline)
        case .unavailable:
            sentence(CompareCopy.timelineUnavailable)
        case .tooFarApart:
            sentence(CompareCopy.tooFarApart)
        case .failed:
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Text(CompareCopy.timelineError)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Try again") { retry += 1 }
                    .buttonStyle(.letterpress(.outlined))
                    .accessibilityLabel("Retry loading what changed in between")
            }
        case .ready(_, let stale):
            let rows = timeline.response.map { CompareTimeline.rows($0) } ?? []
            VStack(alignment: .leading, spacing: 0) {
                if rows.isEmpty {
                    sentence(CompareCopy.nothingRecorded)
                } else {
                    ForEach(rows) { CompareTimelineRowView(row: $0) }
                    LetterpressRule()
                }
                if stale {
                    Button("Try again") { retry += 1 }
                        .buttonStyle(.letterpress(.underline))
                        .padding(.top, Letterpress.Space.s6)
                        .accessibilityLabel("Check what changed in between again")
                }
            }
        }
    }

    // MARK: Helpers

    private func sentence(_ text: String) -> some View {
        Text(text)
            .font(Letterpress.ui(13, relativeTo: .footnote))
            .foregroundStyle(Letterpress.inkSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func adaptiveRow<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s6))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: Letterpress.Space.s18))
        return layout { content() }
    }

    private var hasDates: Bool {
        ordered.map { $0.earlier.captureDate != nil && $0.later.captureDate != nil } ?? false
    }

    private var timelineKey: String {
        guard let ordered else { return "none" }
        let generation = api.access.snapshot()?.generation.uuidString ?? "signed-out"
        return "\(ordered.earlier.id.uriRepresentation().absoluteString)|\(ordered.later.id.uriRepresentation().absoluteString)|\(generation)|\(retry)"
    }

    /// The drag follows the finger (an interactive spring retargets from wherever the last settle left off, so a
    /// drag can catch the photo mid-spring); on release the projected end decides which photo it settles on.
    private var flipDrag: some Gesture {
        DragGesture(minimumDistance: CompareFlip.threshold)
            .updating($flipDragging) { _, dragging, _ in dragging = true }
            .onChanged { value in
                let lock = CompareFlip.Lock.keep(flipLock, start: value.startLocation, translation: value.translation)
                if lock != flipLock { flipLock = lock }
                let base: CGFloat = showingLater ? 1 : 0
                withAnimation(.interactiveSpring) {
                    flipProgress = CompareFlip.progress(base: base, translation: value.translation, axis: lock.axis, width: flipWidth)
                }
            }
            .onEnded { value in
                let base: CGFloat = showingLater ? 1 : 0
                let flips = CompareFlip.commitsFlip(lockedAxis: flipLock?.axis(forDragFrom: value.startLocation), base: base,
                                                    predictedEnd: value.predictedEndTranslation, width: flipWidth)
                flipLock = nil
                if flips { flip() } else { withAnimation(flipAnimation) { flipProgress = base } }
            }
    }

    /// A spring for the settle; with Reduce Motion a short cross-fade (the flip only ever changes opacity).
    private var flipAnimation: Animation {
        reduceMotion ? .smooth(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.9)
    }

    /// The one path for every committed flip (tap, drag, VoiceOver), so each plays exactly one selection tick.
    private func flip() {
        showingLater.toggle()
        selectionTaps += 1
        withAnimation(flipAnimation) { flipProgress = showingLater ? 1 : 0 }
    }

    private func pickDefaultPair() {
        guard !pickedDefault, strip.photos.count >= 2 else { return }
        pickedDefault = true
        pair = ComparePair([strip.photos[1], strip.photos[0]])
    }

    private func loadTimeline() async {
        guard let ordered, let from = ordered.earlier.captureDate, let to = ordered.later.captureDate,
              let ticket = api.access.snapshot(),
              viewContext.userInfo["accountID"] as? UUID == ticket.accountID else {
            timeline.clear()
            return
        }
        await timeline.load(from: from, to: to, ticket: ticket)
    }
}

/// Flip as values. Earlier sits left of later (as in side by side), so dragging right pulls the earlier photo in and
/// dragging left the later one, the way Photos moves to a newer picture. A drag that starts mostly vertical is a
/// scroll and never flips, however it moves afterwards.
enum CompareFlip {
    /// The drag's minimum distance. Progress counts from here, so the first tracked frame doesn't jump by it.
    static let threshold: CGFloat = 24

    /// Decided once, from a drag's first change.
    static func axis(of translation: CGSize) -> Axis {
        abs(translation.width) > abs(translation.height) ? .horizontal : .vertical
    }

    static func progress(base: CGFloat, translation: CGSize, axis: Axis, width: CGFloat) -> CGFloat {
        guard width > 0, axis == .horizontal else { return base }
        let travelled = max(0, abs(translation.width) - threshold)
        let dx = translation.width < 0 ? -travelled : travelled
        return min(1, max(0, base - dx / width))
    }

    /// Where a released drag settles: past halfway, projected from the drag's velocity, it flips.
    static func settlesOnLater(base: CGFloat, predictedEnd: CGSize, axis: Axis, width: CGFloat) -> Bool {
        progress(base: base, translation: predictedEnd, axis: axis, width: width) > 0.5
    }

    /// Whether a released drag commits a flip, judged on the axis it locked. No lock (it never tracked) is a scroll.
    static func commitsFlip(lockedAxis: Axis?, base: CGFloat, predictedEnd: CGSize, width: CGFloat) -> Bool {
        guard let lockedAxis else { return false }
        return settlesOnLater(base: base, predictedEnd: predictedEnd, axis: lockedAxis, width: width) != (base > 0.5)
    }

    /// One drag's axis, tied to where that drag started.
    struct Lock: Equatable {
        let start: CGPoint
        let axis: Axis

        /// The same drag keeps its lock; a new drag (another start) locks from its first change.
        static func keep(_ lock: Lock?, start: CGPoint, translation: CGSize) -> Lock {
            if let lock, lock.start == start { return lock }
            return Lock(start: start, axis: CompareFlip.axis(of: translation))
        }

        func axis(forDragFrom start: CGPoint) -> Axis? { start == self.start ? axis : nil }
    }
}

/// Record's Compare segment with fewer than two photos (spec §5 empty: serif title, one sentence, one action).
struct CompareEmptyState: View {
    let total: Int
    let takePhoto: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
            Text(CompareCopy.emptyTitle)
                .font(Letterpress.display(28, relativeTo: .title))
                .foregroundStyle(Letterpress.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text(CompareCopy.emptySentence(total: total))
                .font(Letterpress.ui(15, relativeTo: .body))
                .foregroundStyle(Letterpress.inkSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Button(CompareCopy.emptyAction, action: takePhoto)
                .buttonStyle(.letterpress(.filled, fullWidth: true))
                .padding(.top, Letterpress.Space.s6)
        }
        .accessibilityIdentifier("compareEmpty")
    }
}

/// 4:5 mat with square corners (spec §4.5). Under Compare's dark scheme `surface` is near-black.
private struct CompareMat<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        Rectangle()
            .fill(Letterpress.surface)
            .aspectRatio(4 / 5, contentMode: .fit)
            .overlay { content() }
    }
}

/// One photo, fitted inside its mat and never cropped. Read and decoded off the main thread, once per photo; the
/// empty mat stands in until then, and a failed read says so in words.
private struct CompareImage: View {
    let photo: ComparePhoto
    let strip: ComparePhotoStrip
    @State private var image: UIImage?
    @State private var unreadable = false

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .accessibilityHidden(true)
                    .transition(.opacity)
            } else if unreadable {
                Text(CompareCopy.photoUnreadable)
                    .font(Letterpress.ui(13, relativeTo: .footnote))
                    .foregroundStyle(Letterpress.inkSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(Letterpress.Space.s10)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.smooth(duration: 0.2), value: image != nil)
        .task(id: photo.id) {
            image = nil; unreadable = false
            let loaded = await strip.image(for: photo, maxPixelSize: ComparePhotoStrip.stagePixelSize, in: strip.stageImages)
            guard !Task.isCancelled else { return }
            image = loaded; unreadable = loaded == nil
        }
    }
}

/// A filmstrip thumbnail: 60×75pt (88×110 at accessibility sizes), inset ink outline and a role word when picked.
private struct CompareThumbnail: View {
    let photo: ComparePhoto
    let role: CompareRole?
    let strip: ComparePhotoStrip
    let toggle: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var image: UIImage?

    var body: some View {
        let width: CGFloat = dynamicTypeSize.isAccessibilitySize ? 88 : 60
        Button(action: toggle) {
            VStack(alignment: .leading, spacing: Letterpress.Space.s4) {
                Rectangle()
                    .fill(Letterpress.surface)
                    .frame(width: width, height: width * 5 / 4)
                    .overlay {
                        if let image {
                            Image(uiImage: image).resizable().scaledToFit().transition(.opacity)
                        }
                    }
                    .animation(.smooth(duration: 0.2), value: image != nil)
                    .overlay {
                        if role != nil {
                            Rectangle().strokeBorder(Letterpress.ink, lineWidth: 1.5)
                        }
                    }
                if let role {
                    Text(role.label)
                        .letterpressEyebrow(color: Letterpress.ink)
                        .fixedSize(horizontal: true, vertical: true)
                } else {
                    Text(photo.captureDate.map { LetterpressFormat.stamp($0) } ?? CompareCopy.undatedStamp.uppercased())
                        .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                        .foregroundStyle(Letterpress.inkTertiary)
                        .fixedSize(horizontal: true, vertical: true)
                }
            }
            .frame(minWidth: width, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(CompareCopy.thumbnailLabel(date: photo.captureDate))
        .accessibilityValue(role?.accessibilityValue ?? "")
        .accessibilityAddTraits(role == nil ? [] : .isSelected)
        .task(id: photo.id) {
            let loaded = await strip.image(for: photo, maxPixelSize: ComparePhotoStrip.thumbnailPixelSize, in: strip.thumbnails)
            guard !Task.isCancelled else { return }
            image = loaded
        }
    }
}

/// One ruled timeline row: mono date column, then the change in words and any answers as given.
private struct CompareTimelineRowView: View {
    let row: CompareTimelineRow
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Letterpress.Space.s4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: Letterpress.Space.s14))
        layout {
            Text(row.date)
                .font(Letterpress.data(11, weight: .regular, relativeTo: .caption))
                .foregroundStyle(Letterpress.inkTertiary)
                .frame(minWidth: dynamicTypeSize.isAccessibilitySize ? nil : 72, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: Letterpress.Space.s6) {
                Text(row.text)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.ink)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(Array(row.answers.enumerated()), id: \.offset) { _, answer in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(answer.prompt)
                            .font(Letterpress.ui(13, relativeTo: .footnote))
                            .foregroundStyle(Letterpress.inkSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(answer.answer)
                            .font(Letterpress.ui(15, relativeTo: .body))
                            .foregroundStyle(Letterpress.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, Letterpress.Space.s10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { LetterpressRule() }
        .accessibilityElement(children: .combine)
    }
}
