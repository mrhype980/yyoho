import SwiftUI
import WidgetKit

/* ---------- small building blocks ---------- */

struct Bar: View {
    var value: Double          // 0...100
    var color: Color
    var height: CGFloat = 6
    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(HD.track)
                Capsule().fill(color)
                    .frame(width: max(height, geo.size.width * CGFloat(min(100, max(0, value)) / 100)))
            }
        }
        .frame(height: height)
    }
}

struct Ring: View {
    var value: Double
    var color: Color
    var line: CGFloat = 7
    var body: some View {
        ZStack {
            Circle().stroke(HD.track, lineWidth: line)
            Circle()
                .trim(from: 0, to: CGFloat(min(100, max(0, value)) / 100))
                .stroke(color, style: StrokeStyle(lineWidth: line, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

struct SectionTitle: View {
    var text: String
    var trailing: String = ""
    var body: some View {
        HStack {
            Text(text.uppercased())
                .font(.system(size: 10, weight: .bold))
                .tracking(1.0)
                .foregroundColor(HD.accent)
            Spacer(minLength: 4)
            if !trailing.isEmpty {
                Text(trailing).font(.system(size: 10)).foregroundColor(HD.muted)
            }
        }
    }
}

struct ChipText: View {
    var chip: Chip?
    var body: some View {
        if let t = chip?.text, !t.isEmpty {
            Text(t).font(.system(size: 10, weight: .semibold)).foregroundColor(HD.tone(chip)).lineLimit(1)
        }
    }
}

struct FreshnessDot: View {
    var freshness: Freshness
    var body: some View {
        Circle().fill(color).frame(width: 7, height: 7)
    }
    private var color: Color {
        switch freshness {
        case .fresh: return HD.good
        case .ageing: return HD.amber
        case .stale: return HD.bad
        }
    }
}

/* ---------- rows ---------- */

struct DefenseLine: View {
    var d: DefenseRow
    var showChip: Bool = true
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(d.name).font(.system(size: 12, weight: .bold)).foregroundColor(HD.text).lineLimit(1)
                Spacer(minLength: 4)
                Text(d.left.isEmpty ? "" : d.left + " left")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(d.risk ? HD.bad : HD.muted)
            }
            Bar(value: d.pct, color: Color(hex: d.color), height: 5)
            HStack {
                Text(String(format: "%.1f%% held", d.pct)).font(.system(size: 10)).foregroundColor(HD.muted)
                Spacer(minLength: 4)
                if showChip { ChipText(chip: d.chip) }
            }
        }
    }
}

struct PinLine: View {
    var p: PinRow
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(p.name).font(.system(size: 12, weight: .bold)).foregroundColor(HD.text).lineLimit(1)
                Spacer(minLength: 4)
                Text(String(format: "%.1f%%", p.pct)).font(.system(size: 11, weight: .semibold)).foregroundColor(HD.muted)
            }
            Bar(value: p.pct, color: Color(hex: p.color), height: 5)
            HStack {
                Text(p.region).font(.system(size: 10)).foregroundColor(HD.muted).lineLimit(1)
                Spacer(minLength: 4)
                ChipText(chip: p.chip)
            }
        }
    }
}

/* ---------- messages ---------- */

struct Message: View {
    var title: String
    var detail: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionTitle(text: "Helldivers 2")
            Text(title).font(.system(size: 14, weight: .bold)).foregroundColor(HD.text)
            Text(detail).font(.system(size: 11)).foregroundColor(HD.muted)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/* ---------- the three sizes ---------- */

struct SmallView: View {
    var v: WarView
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                SectionTitle(text: "Major Order")
                FreshnessDot(freshness: v.freshness)
            }
            if let m = v.orders.first {
                Text(String(format: "%.0f%%", m.pct))
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundColor(HD.text)
                Bar(value: m.pct, color: HD.accent, height: 6)
                Text(m.title).font(.system(size: 11, weight: .semibold)).foregroundColor(HD.text).lineLimit(2)
                if let l = m.left { Text(l).font(.system(size: 10)).foregroundColor(HD.muted) }
            } else {
                Text("No Major Order").font(.system(size: 14, weight: .bold)).foregroundColor(HD.text)
            }
            Spacer(minLength: 0)
            if let d = v.defenses.first {
                HStack(spacing: 4) {
                    Text("🛡").font(.system(size: 10))
                    Text(d.name).font(.system(size: 11, weight: .bold)).foregroundColor(HD.text).lineLimit(1)
                    Spacer(minLength: 2)
                    Text(d.left).font(.system(size: 11, weight: .semibold)).foregroundColor(d.risk ? HD.bad : HD.muted)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct MediumView: View {
    var v: WarView
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                SectionTitle(text: "Major Order")
                if let m = v.orders.first {
                    HStack(spacing: 10) {
                        ZStack {
                            Ring(value: m.pct, color: HD.accent)
                            Text(String(format: "%.0f%%", m.pct))
                                .font(.system(size: 15, weight: .heavy, design: .rounded)).foregroundColor(HD.text)
                        }
                        .frame(width: 56, height: 56)
                    }
                    Text(m.title).font(.system(size: 11, weight: .semibold)).foregroundColor(HD.text).lineLimit(2)
                    if let l = m.left { Text(l).font(.system(size: 10)).foregroundColor(HD.muted) }
                    ChipText(chip: m.chip)
                } else {
                    Text("No Major Order").font(.system(size: 13, weight: .bold)).foregroundColor(HD.text)
                }
                Spacer(minLength: 0)
            }
            .frame(width: 118, alignment: .leading)

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    SectionTitle(text: "Defenses", trailing: v.updated)
                    FreshnessDot(freshness: v.freshness)
                }
                if v.defenses.isEmpty {
                    Text("No planets under attack.").font(.system(size: 11)).foregroundColor(HD.muted)
                } else {
                    ForEach(Array(v.defenses.prefix(2))) { d in DefenseLine(d: d) }
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct LargeView: View {
    var v: WarView
    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                SectionTitle(text: "Helldivers 2", trailing: v.updated)
                FreshnessDot(freshness: v.freshness)
            }
            if let m = v.orders.first {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(m.title).font(.system(size: 13, weight: .bold)).foregroundColor(HD.text).lineLimit(1)
                        Spacer(minLength: 4)
                        Text(String(format: "%.0f%%", m.pct)).font(.system(size: 13, weight: .heavy, design: .rounded)).foregroundColor(HD.accent)
                    }
                    Bar(value: m.pct, color: HD.accent, height: 7)
                    HStack {
                        Text(m.left ?? "").font(.system(size: 10)).foregroundColor(HD.muted)
                        Spacer(minLength: 4)
                        ChipText(chip: m.chip)
                    }
                }
            } else {
                Text("No Major Order right now.").font(.system(size: 12)).foregroundColor(HD.muted)
            }

            SectionTitle(text: "Defenses (\(v.defenseTotal))")
            if v.defenses.isEmpty {
                Text("No planets under attack.").font(.system(size: 11)).foregroundColor(HD.muted)
            } else {
                ForEach(Array(v.defenses.prefix(3))) { d in DefenseLine(d: d) }
            }

            SectionTitle(text: "Pinned planets")
            if v.pins.isEmpty {
                Text(v.pinCount == 0 ? "Pin planets in the tracker to follow them here."
                                     : "None of your pinned planets has a campaign right now.")
                    .font(.system(size: 11)).foregroundColor(HD.muted)
            } else {
                ForEach(Array(v.pins.prefix(3))) { p in PinLine(p: p) }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/* ---------- the widget ---------- */

struct WarWidgetView: View {
    var entry: WarEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        content
            .padding(2)
            .environment(\.colorScheme, .dark)
            .hdBackground()
    }

    @ViewBuilder
    private var content: some View {
        if let snap = entry.snapshot {
            let v = WarView(snap, at: entry.date)
            if !v.hasData {
                Message(title: "Waiting for war data", detail: "Keep Helldivers 2 War Tracker open. This fills in within a minute.")
            } else {
                switch family {
                case .systemSmall: SmallView(v: v)
                case .systemMedium: MediumView(v: v)
                default: LargeView(v: v)
                }
            }
        } else {
            Message(title: "Open the tracker once",
                    detail: "Open Helldivers 2 War Tracker so it can share the war data with this widget.")
        }
    }
}

/* ---------- registration ---------- */

struct HD2WarWidget: Widget {
    let kind = "HD2WarWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WarProvider()) { entry in
            WarWidgetView(entry: entry)
        }
        .configurationDisplayName("Helldivers 2 War Tracker")
        .description("The Major Order, your defense countdowns and pinned planets.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct HD2WidgetBundle: WidgetBundle {
    var body: some Widget {
        HD2WarWidget()
    }
}
