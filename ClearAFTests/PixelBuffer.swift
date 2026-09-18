import CoreGraphics

/// Reads an image's pixels in sRGB, top-left origin, for cheap pixel checks.
struct PixelBuffer {
    let width: Int
    let height: Int
    private let bytes: [UInt8]

    init(_ image: CGImage) {
        width = image.width
        height = image.height
        var data = [UInt8](repeating: 0, count: image.width * image.height * 4)
        data.withUnsafeMutableBytes { raw in
            let context = CGContext(data: raw.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8,
                                    bytesPerRow: image.width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
            context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        }
        bytes = data
    }

    private func offset(_ x: Int, _ y: Int) -> Int { (y * width + x) * 4 }

    func rgb(_ x: Int, _ y: Int) -> UInt32 {
        let i = offset(x, y)
        return UInt32(bytes[i]) << 16 | UInt32(bytes[i + 1]) << 8 | UInt32(bytes[i + 2])
    }

    func alpha(_ x: Int, _ y: Int) -> UInt8 { bytes[offset(x, y) + 3] }

    func luma(_ x: Int, _ y: Int) -> Int {
        let i = offset(x, y)
        return (Int(bytes[i]) * 299 + Int(bytes[i + 1]) * 587 + Int(bytes[i + 2]) * 114) / 1000
    }
}
