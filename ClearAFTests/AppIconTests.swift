import Foundation
import ImageIO
import Testing

/// Spec §10.5: a redrawn full-bleed icon in light, dark and tinted, rendered by scripts/brand/render-icons.sh.
struct AppIconTests {
    static let repoRoot = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    static let iconSet = repoRoot.appendingPathComponent("ClearAF/Assets.xcassets/AppIcon.appiconset")

    struct Catalog: Decodable {
        struct Appearance: Decodable { let appearance: String; let value: String }
        struct Image: Decodable {
            let filename: String
            let idiom: String
            let platform: String?
            let size: String
            let appearances: [Appearance]?
        }
        let images: [Image]
    }

    static func image(_ name: String) throws -> CGImage {
        let url = iconSet.appendingPathComponent(name) as CFURL
        let source = try #require(CGImageSourceCreateWithURL(url, nil))
        return try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
    }

    @Test func contentsDeclaresLightDarkAndTinted() throws {
        let catalog = try JSONDecoder().decode(Catalog.self, from: Data(contentsOf: Self.iconSet.appendingPathComponent("Contents.json")))
        #expect(catalog.images.count == 3)
        var byAppearance: [String: String] = [:]
        for image in catalog.images {
            #expect(image.idiom == "universal")
            #expect(image.platform == "ios")
            #expect(image.size == "1024x1024")
            #expect(image.appearances?.allSatisfy { $0.appearance == "luminosity" } ?? true)
            byAppearance[image.appearances?.first?.value ?? "any"] = image.filename
        }
        #expect(byAppearance == ["any": "AppIcon-light.png", "dark": "AppIcon-dark.png", "tinted": "AppIcon-tinted.png"])
    }

    @Test func iconSetHoldsOnlyTheRenderedIcons() throws {
        // Filtered to .png/.json so an incidental .DS_Store (Finder) doesn't fail this on a real Mac checkout.
        let names = try FileManager.default.contentsOfDirectory(atPath: Self.iconSet.path)
            .filter { $0.hasSuffix(".png") || $0.hasSuffix(".json") }
            .sorted()
        #expect(names == ["AppIcon-dark.png", "AppIcon-light.png", "AppIcon-tinted.png", "Contents.json"])
    }

    @Test func retiredIconSourcesAreDeleted() {
        #expect(!FileManager.default.fileExists(atPath: Self.repoRoot.appendingPathComponent("generate_icon.py").path))
        #expect(!FileManager.default.fileExists(atPath: Self.iconSet.appendingPathComponent("ChatGPT Image Jul 15, 2025, 11_40_24 PM (1).png").path))
    }

    @Test func lightIsInkOnCanvasFullBleedWithTheFrameLifted() throws {
        let icon = try Self.image("AppIcon-light.png")
        #expect(icon.width == 1024 && icon.height == 1024)
        #expect([.none, .noneSkipLast, .noneSkipFirst].contains(icon.alphaInfo), "opaque, no alpha channel")
        let pixels = PixelBuffer(icon)
        #expect(pixels.rgb(0, 0) == 0xF2EFE7, "no baked corner radius")
        #expect(pixels.rgb(1023, 1023) == 0xF2EFE7)
        #expect(pixels.rgb(306, 512) == 0x121312, "left rule")
        #expect(pixels.rgb(512, 232) == 0x121312, "top rule at 230.4, above true centre")
        #expect(pixels.rgb(512, 755) == 0x121312, "bottom rule")
        #expect(pixels.rgb(512, 765) == 0xF2EFE7)
        #expect(pixels.rgb(512, 400) == 0xF2EFE7, "frame is open")
    }

    @Test func darkIsReversedOnNearBlack() throws {
        let icon = try Self.image("AppIcon-dark.png")
        #expect([.none, .noneSkipLast, .noneSkipFirst].contains(icon.alphaInfo))
        let pixels = PixelBuffer(icon)
        #expect(pixels.rgb(0, 0) == 0x171716)
        #expect(pixels.rgb(306, 512) == 0xEFEDE4)
        #expect(pixels.rgb(512, 232) == 0xEFEDE4)
        #expect(pixels.rgb(512, 400) == 0x171716)
    }

    @Test func tintedIsMonochromeOnTransparent() throws {
        let pixels = PixelBuffer(try Self.image("AppIcon-tinted.png"))
        #expect(pixels.alpha(0, 0) == 0)
        #expect(pixels.alpha(512, 400) == 0)
        #expect(pixels.alpha(306, 512) == 255)
        #expect(pixels.rgb(306, 512) == 0xFFFFFF)
    }
}
