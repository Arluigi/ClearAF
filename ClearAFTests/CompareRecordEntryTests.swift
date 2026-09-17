import Foundation
import Testing
@testable import ClearAF

struct CompareRecordEntryTests {
    @Test func compareOpensOnlyWhenPresentableAndNeverOverTheCamera() {
        #expect(!PhotoRecordLayout.presentsCompare(.compare, capturing: false, presentable: false))
        #expect(PhotoRecordLayout.presentsCompare(.compare, capturing: false, presentable: true))
        #expect(!PhotoRecordLayout.presentsCompare(.compare, capturing: true, presentable: true), "never stacks on the camera sheet")
        #expect(!PhotoRecordLayout.presentsCompare(.grid, capturing: false, presentable: true))
        #expect(PhotoRecordLayout.showsCompareEmpty(.compare, total: 0))
        #expect(PhotoRecordLayout.showsCompareEmpty(.compare, total: 1))
        #expect(!PhotoRecordLayout.showsCompareEmpty(.compare, total: 2))
        #expect(!PhotoRecordLayout.showsCompareEmpty(.list, total: 0))
        #expect(PhotoRecordLayout.compare.browsing(fallback: .list) == .list)
        #expect(PhotoRecordLayout.grid.browsing(fallback: .list) == .grid)
    }

    /// Regression for the present/dismiss loop at Compare's entry: `presentsCompare` takes a latched
    /// `presentable` flag, not a live total, so a store's total dropping to 0 (as `dispose()` does on
    /// `onDisappear`, including the one SwiftUI can fire on the presenting view as the cover itself appears)
    /// structurally cannot flip presentation back off while the Compare segment stays selected.
    @Test func presentationDoesNotDependOnATotalThatDroppedToZero() {
        // Selected with two photos, then the store's total is zeroed (as dispose() does) without the
        // segment changing: presentation must still hold, because `presentsCompare` never reads a total.
        let presentable = true // latched at selection time, while total was >= 2
        #expect(PhotoRecordLayout.presentsCompare(.compare, capturing: false, presentable: presentable),
                "a total dropping to 0 after selection must not be able to dismiss the cover")
    }

    @Test func recordOffersGridListCompareAndPresentsCompareFullScreen() throws {
        let text = try String(contentsOf: LetterpressSweepTests.repoRoot.appendingPathComponent("ClearAF/Views/ProgressView.swift"), encoding: .utf8)
        let grid = try #require(text.range(of: "Text(\"Grid\").tag(PhotoRecordLayout.grid)"))
        let list = try #require(text.range(of: "Text(\"List\").tag(PhotoRecordLayout.list)"))
        let compare = try #require(text.range(of: "Text(\"Compare\").tag(PhotoRecordLayout.compare)"))
        #expect(grid.lowerBound < list.lowerBound && list.lowerBound < compare.lowerBound)
        #expect(text.contains(".fullScreenCover(isPresented: comparing)"))
        #expect(text.contains("ComparePhotosView().environment(\\.managedObjectContext, viewContext)"))
        #expect(text.contains("CompareEmptyState(total: store.total)"))
    }
}
