import Foundation
import SwiftUI
import Testing
@testable import ClearAF

@MainActor
struct LetterpressLockupTests {
    static let repoRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()

    func render<V: View>(_ view: V) throws -> PixelBuffer {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        return PixelBuffer(try #require(renderer.cgImage))
    }

    @Test func markFitsTheLargestFourByFiveFrameCentred() {
        let box = LetterpressMark().path(in: CGRect(x: 0, y: 0, width: 100, height: 100)).boundingRect
        #expect(abs(box.height - 100) < 1e-9)
        #expect(abs(box.width - 80) < 1e-9)
        #expect(abs(box.minX - 10) < 1e-9)
    }

    @Test func renderedMarkPutsInkOnEveryRuleAndLeavesTheFrameOpen() throws {
        let pixels = try render(LetterpressMark().fill(Color.black).frame(width: 57.6, height: 72).background(Color.white))
        #expect(pixels.width == 58 && pixels.height == 72)
        #expect(pixels.luma(1, 36) < 16, "left rule")
        #expect(pixels.luma(56, 36) < 16, "right rule")
        #expect(pixels.luma(28, 1) < 16, "top rule")
        #expect(pixels.luma(28, 70) < 16, "bottom rule")
        #expect(pixels.luma(28, 20) > 239, "inside the frame, above the letters")
    }

    @Test func signInLockupShowsTheWordmark() {
        #expect(LetterpressLockup.signInHeight == 28)
        #expect(LetterpressMarkGeometry.showsWordmark(height: LetterpressLockup.signInHeight))
    }

    @Test func lockupIsMarkThenGapThenWordmark() throws {
        let pixels = try render(LetterpressLockup(height: 28).background(Color.white))
        #expect(pixels.width >= 96)
        #expect(pixels.luma(0, pixels.height / 2) < 60, "the mark's left rule starts the lockup")
        // Mark is 22.4 wide and the gap is 11.2, so column 28 is clear from top to bottom.
        #expect((0..<pixels.height).allSatisfy { pixels.luma(28, $0) > 200 })
        #expect((34..<pixels.width).contains { x in (0..<pixels.height).contains { pixels.luma(x, $0) < 60 } }, "wordmark is drawn")
    }

    @Test func signInScreensUseTheLockupAndThePlaceholderIsGone() throws {
        for file in ["ClearAF/Views/AuthenticationView.swift", "ClearAF/Views/PasswordRecoveryView.swift"] {
            let source = try String(contentsOf: Self.repoRoot.appendingPathComponent(file), encoding: .utf8)
            #expect(source.contains("LetterpressLockup(height: LetterpressLockup.signInHeight)"), "\(file)")
        }
        let placeholder = "ClearAF" + "Wordmark"
        for folder in ["ClearAF", "ClearAFTests", "ClearAFUITests"] {
            let walker = FileManager.default.enumerator(at: Self.repoRoot.appendingPathComponent(folder), includingPropertiesForKeys: nil)
            while let url = walker?.nextObject() as? URL {
                guard url.pathExtension == "swift" else { continue }
                #expect(!(try String(contentsOf: url, encoding: .utf8)).contains(placeholder), "\(url.lastPathComponent)")
            }
        }
    }
}
