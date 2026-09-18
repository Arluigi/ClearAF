// Renders the ClearAF app icon (light, dark, tinted), apple-touch-icon, favicon.ico and favicon.svg from the
// mark geometry the app itself uses. Run from the repository root: scripts/brand/render-icons.sh
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

@main
struct RenderIcons {
    struct RGB {
        let r: UInt8, g: UInt8, b: UInt8
        var cg: CGColor { CGColor(srgbRed: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255, alpha: 1) }
        var hex: String { String(format: "#%02X%02X%02X", r, g, b) }
    }

    // Spec §10.4–10.5 values.
    static let ink = RGB(r: 0x12, g: 0x13, b: 0x12)
    static let canvas = RGB(r: 0xF2, g: 0xEF, b: 0xE7)
    static let inkDark = RGB(r: 0xEF, g: 0xED, b: 0xE4)
    static let canvasDark = RGB(r: 0x17, g: 0x17, b: 0x16)
    static let tintSource = RGB(r: 0xFF, g: 0xFF, b: 0xFF)
    /// The favicon reproduces the 18px specimen: a 13px frame in an 18px square (letters become the block).
    static let faviconFrameRatio: CGFloat = 13.0 / 18.0

    static func render(side: Int, mark: RGB, background: RGB?, frameRatio: CGFloat, usesBlock: Bool? = nil, forceAlpha: Bool = false) -> CGImage {
        // `forceAlpha` renders an opaque image (every pixel alpha 255) as RGBA rather than RGB: Turbopack's
        // ICO decoder (Rust `image`/`ico` crate) requires the embedded PNG to actually be RGBA, whatever bit
        // count the header declares — a correctly-declared-but-still-RGB payload is rejected too.
        let alpha: CGImageAlphaInfo = (background == nil || forceAlpha) ? .premultipliedLast : .noneSkipLast
        let context = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: 0,
                                space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: alpha.rawValue)!
        let size = CGFloat(side)
        if let background {
            context.setFillColor(background.cg)
            context.fill(CGRect(x: 0, y: 0, width: size, height: size))
        }
        // The geometry is y-down; flip the bitmap context to match.
        context.translateBy(x: 0, y: size)
        context.scaleBy(x: 1, y: -1)
        let placement = LetterpressMarkGeometry.iconPlacement(side: size, frameRatio: frameRatio)
        context.addPath(LetterpressMarkGeometry.path(height: placement.height, origin: placement.origin, usesBlock: usesBlock))
        context.setFillColor(mark.cg)
        context.fillPath(using: .winding)
        return context.makeImage()!
    }

    static func pngData(_ image: CGImage) -> Data {
        let data = NSMutableData()
        let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(destination, image, nil)
        precondition(CGImageDestinationFinalize(destination))
        return data as Data
    }

    static func write(_ data: Data, _ path: String) throws {
        try data.write(to: URL(fileURLWithPath: path))
        print("wrote \(path)")
    }

    /// An .ico holding one 32px PNG (read by every current browser). The ICONDIRENTRY's declared bit count must
    /// match the embedded PNG's actual colour type or strict decoders (Turbopack's Rust `image`/`ico` crate) reject
    /// it outright: colour type 2 (RGB, no alpha) is 24bpp; colour type 6 (RGBA) is 32bpp.
    static func ico(_ png: Data) -> Data {
        let colourType = png[25] // PNG IHDR: 8-byte signature + 4-byte length + 4-byte "IHDR" + 4 width + 4 height + 1 bit depth
        let bitCount: UInt8 = colourType == 6 ? 32 : 24
        var data = Data([0, 0, 1, 0, 1, 0])
        data.append(contentsOf: [32, 32, 0, 0, 1, 0, bitCount, 0])
        withUnsafeBytes(of: UInt32(png.count).littleEndian) { data.append(contentsOf: $0) }
        withUnsafeBytes(of: UInt32(22).littleEndian) { data.append(contentsOf: $0) }
        data.append(png)
        return data
    }

    static func number(_ value: CGFloat) -> String {
        var text = String(format: "%.3f", Double(value))
        while text.hasSuffix("0") { text.removeLast() }
        if text.hasSuffix(".") { text.removeLast() }
        return text
    }

    /// favicon.svg: the block mark in an 18-unit square, ink by default and reversed for dark browser chrome.
    static func faviconSVG() -> String {
        let placement = LetterpressMarkGeometry.iconPlacement(side: 18, frameRatio: faviconFrameRatio)
        let h = placement.height, o = placement.origin
        let w = LetterpressMarkGeometry.width(height: h), s = LetterpressMarkGeometry.stroke(height: h)
        let b = LetterpressMarkGeometry.block(height: h).offsetBy(dx: o.x, dy: o.y)
        func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> String {
            "M\(number(x)) \(number(y))h\(number(w))v\(number(h))h\(number(-w))Z"
        }
        let d = rect(o.x, o.y, w, h) + rect(o.x + s, o.y + s, w - 2 * s, h - 2 * s) + rect(b.minX, b.minY, b.width, b.height)
        return """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18"><style>path{fill:\(ink.hex)}@media (prefers-color-scheme:dark){path{fill:\(inkDark.hex)}}</style><path fill-rule="evenodd" d="\(d)"/></svg>

        """
    }

    static func main() throws {
        let appIcon = "ClearAF/Assets.xcassets/AppIcon.appiconset"
        let frame = LetterpressMarkGeometry.iconFrameRatio
        try write(pngData(render(side: 1024, mark: ink, background: canvas, frameRatio: frame)), "\(appIcon)/AppIcon-light.png")
        try write(pngData(render(side: 1024, mark: inkDark, background: canvasDark, frameRatio: frame)), "\(appIcon)/AppIcon-dark.png")
        try write(pngData(render(side: 1024, mark: tintSource, background: nil, frameRatio: frame)), "\(appIcon)/AppIcon-tinted.png")
        try write(pngData(render(side: 180, mark: ink, background: canvas, frameRatio: frame)), "web-portal/public/apple-touch-icon.png")
        // Force the block: at side 32 the frame height (~23px) clears blockBelowHeight, but §4a is explicit that
        // small sizes show the solid block, not the letters, and favicon.svg (an 18-unit viewBox) already does.
        // forceAlpha: true so the embedded PNG is genuinely RGBA (see render()'s comment on Turbopack's decoder).
        try write(ico(pngData(render(side: 32, mark: ink, background: canvas, frameRatio: faviconFrameRatio, usesBlock: true, forceAlpha: true))), "web-portal/src/app/favicon.ico")
        try write(Data(faviconSVG().utf8), "web-portal/public/favicon.svg")
    }
}
