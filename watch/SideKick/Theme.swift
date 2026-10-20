import SwiftUI

enum Theme {
    static let honey = Color(red: 1.0, green: 0.78, blue: 0.20)
    static let amber = Color(red: 1.0, green: 0.56, blue: 0.04)
    static let ink = Color(red: 0.10, green: 0.08, blue: 0.05)
    static let youOwe = Color.orange
    static let theyOwe = Color.cyan
    static let tile = Color.white.opacity(0.08)

    static var pageBackground: some ShapeStyle {
        LinearGradient(colors: [honey.opacity(0.35), .black], startPoint: .top, endPoint: .center)
    }
}

/// Small rounded panel used for every section on the card.
struct Tile<Content: View>: View {
    var accent: Color? = nil
    @ViewBuilder var content: Content

    var body: some View {
        HStack(spacing: 0) {
            if let accent {
                RoundedRectangle(cornerRadius: 2).fill(accent).frame(width: 3).padding(.vertical, 2)
            }
            content
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
        }
        .background(Theme.tile, in: RoundedRectangle(cornerRadius: 10))
    }
}

struct SectionLabel: View {
    let text: String
    let systemImage: String
    var color: Color = .secondary

    var body: some View {
        Label(text.uppercased(), systemImage: systemImage)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(color)
    }
}
