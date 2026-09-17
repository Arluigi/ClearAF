import Foundation
import Testing
@testable import ClearAF

struct CompareRecordEntryTests {
    @Test func compareOpensOnlyWithTwoPhotosAndNeverOverTheCamera() {
        #expect(!PhotoRecordLayout.presentsCompare(.compare, total: 1, capturing: false))
        #expect(PhotoRecordLayout.presentsCompare(.compare, total: 2, capturing: false))
        #expect(!PhotoRecordLayout.presentsCompare(.compare, total: 2, capturing: true), "never stacks on the camera sheet")
        #expect(!PhotoRecordLayout.presentsCompare(.grid, total: 40, capturing: false))
        #expect(PhotoRecordLayout.showsCompareEmpty(.compare, total: 0))
        #expect(PhotoRecordLayout.showsCompareEmpty(.compare, total: 1))
        #expect(!PhotoRecordLayout.showsCompareEmpty(.compare, total: 2))
        #expect(!PhotoRecordLayout.showsCompareEmpty(.list, total: 0))
        #expect(PhotoRecordLayout.compare.browsing(fallback: .list) == .list)
        #expect(PhotoRecordLayout.grid.browsing(fallback: .list) == .grid)
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
