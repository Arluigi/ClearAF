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
    @State private var detail: ComparePhoto?
    @State private var retry = 0

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
        .onChange(of: pair) { showingLater = true }
        .task(id: timelineKey) { await loadTimeline() }
        .onDisappear {
            strip.dispose()
            timeline.cancel()
        }
        .sheet(item: $detail) { photo in
            if let skin = strip.skinPhoto(for: photo) {
                PhotoDetailView(photo: skin, images: strip.stageImages)
            }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(alignment: .center, spacing: Letterpress.Space.s10) {
            Button("Done") { dismiss() }
                .buttonStyle(.letterpress(.underline))
            Spacer(minLength: Letterpress.Space.s10)
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
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: mode)
        } else if let error = strip.error, strip.photos.isEmpty {
            VStack(alignment: .leading, spacing: Letterpress.Space.s10) {
                Text(error)
                    .font(Letterpress.ui(15, relativeTo: .body))
                    .foregroundStyle(Letterpress.error)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Try again") { strip.reload() }
                    .buttonStyle(.letterpress(.outlined))
            }
        } else if strip.photos.count < 2 && !strip.loading {
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
                    CompareImage(photo: ordered.earlier, strip: strip).opacity(showingLater ? 0 : 1)
                    CompareImage(photo: ordered.later, strip: strip).opacity(showingLater ? 1 : 0)
                }
                .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: showingLater)
            }
            .contentShape(Rectangle())
            .onTapGesture { showingLater.toggle() }
            .simultaneousGesture(DragGesture(minimumDistance: 24).onEnded { value in
                let width = abs(value.translation.width)
                if width > Letterpress.minTouch && width > abs(value.translation.height) { showingLater.toggle() }
            })
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(CompareCopy.flipLabel(showingLater: showingLater, date: shown.captureDate))
            .accessibilityHint(CompareCopy.flipHint)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { showingLater.toggle() }
            HStack(alignment: .firstTextBaseline) {
                Text(showingLater ? CompareRole.later.label : CompareRole.earlier.label)
                    .letterpressEyebrow(color: Letterpress.ink)
                Spacer(minLength: Letterpress.Space.s10)
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
            if strip.loading && strip.photos.isEmpty {
                sentence(CompareCopy.loadingPhotos)
            }
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: Letterpress.Space.s6) {
                    ForEach(strip.photos) { photo in
                        CompareThumbnail(photo: photo, role: pair.role(of: photo, date: \.captureDate), strip: strip) {
                            pair.toggle(photo)
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

/// One photo, fitted inside its mat and never cropped. Decodes once per photo; a failed read says so in words.
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
        .task(id: photo.id) {
            image = strip.image(for: photo, maxPixelSize: ComparePhotoStrip.stagePixelSize, in: strip.stageImages)
            unreadable = image == nil
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
                            Image(uiImage: image).resizable().scaledToFit()
                        }
                    }
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
            image = strip.image(for: photo, maxPixelSize: ComparePhotoStrip.thumbnailPixelSize, in: strip.thumbnails)
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
