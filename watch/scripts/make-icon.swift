// Renders the 1024×1024 watch app icon: swift watch/scripts/make-icon.swift <output.png>
import AppKit

let size = 1024.0
let output = CommandLine.arguments.dropFirst().first ?? "AppIcon.png"

let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size),
    bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

let rect = NSRect(x: 0, y: 0, width: size, height: size)
let honey = NSColor(red: 1.00, green: 0.80, blue: 0.20, alpha: 1)
let amber = NSColor(red: 1.00, green: 0.56, blue: 0.04, alpha: 1)
NSGradient(starting: honey, ending: amber)!.draw(in: rect, angle: -60)

// Faint honeycomb ring behind the glyph gives the Bee association without clutter.
let hex = NSBezierPath()
let center = NSPoint(x: size / 2, y: size / 2)
for i in 0..<6 {
    let angle = Double(i) * .pi / 3 + .pi / 6
    let point = NSPoint(x: center.x + 360 * cos(angle), y: center.y + 360 * sin(angle))
    i == 0 ? hex.move(to: point) : hex.line(to: point)
}
hex.close()
NSColor(white: 0, alpha: 0.10).setFill()
hex.fill()

let ink = NSColor(red: 0.10, green: 0.08, blue: 0.05, alpha: 1)
let config = NSImage.SymbolConfiguration(pointSize: 430, weight: .semibold)
    .applying(.init(paletteColors: [ink]))
let glyph = NSImage(systemSymbolName: "person.wave.2.fill", accessibilityDescription: nil)!
    .withSymbolConfiguration(config)!
let glyphSize = glyph.size
glyph.draw(in: NSRect(x: center.x - glyphSize.width / 2, y: center.y - glyphSize.height / 2,
                      width: glyphSize.width, height: glyphSize.height))

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output))
print("Wrote \(output)")
