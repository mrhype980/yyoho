import SwiftUI

// Super Earth blue and yellow, like the app's default theme.
enum HD {
    static let accent = Color(red: 1.0, green: 0.91, blue: 0.12)
    static let text = Color.white
    static let muted = Color.white.opacity(0.62)
    static let track = Color.white.opacity(0.14)
    static let good = Color(red: 0.36, green: 0.89, blue: 0.54)
    static let bad = Color(red: 1.0, green: 0.35, blue: 0.32)
    static let amber = Color(red: 1.0, green: 0.70, blue: 0.0)
    static let background = LinearGradient(
        colors: [Color(red: 0.04, green: 0.08, blue: 0.15), Color(red: 0.09, green: 0.16, blue: 0.29)],
        startPoint: .topLeading, endPoint: .bottomTrailing)

    static func tone(_ chip: Chip?) -> Color {
        switch chip?.cls ?? "" {
        case "ok": return good
        case "bad": return bad
        default: return muted
        }
    }
}

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        var v: UInt64 = 0
        guard s.count == 6, Scanner(string: s).scanHexInt64(&v) else {
            self = Color(red: 0.43, green: 0.78, blue: 1.0)
            return
        }
        self = Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}

extension View {
    // macOS 14 wants the background declared as the widget's container; macOS 13 just draws it.
    @ViewBuilder
    func hdBackground() -> some View {
        if #available(macOS 14.0, *) {
            self.containerBackground(for: .widget) { HD.background }
        } else {
            self.background(HD.background)
        }
    }
}
