import Foundation

// What the app writes (see app/widget-export.js). Every field is optional so an older or newer snapshot never breaks the widget.
struct Chip: Codable, Hashable {
    var cls: String?
    var text: String?
}

struct MajorOrder: Codable, Hashable {
    var title: String?
    var pct: Double?
    var expires: Double?          // epoch milliseconds, 0 = no end time
    var chip: Chip?
}

struct Defense: Codable, Hashable {
    var name: String?
    var pct: Double?
    var expires: Double?
    var risk: Bool?
    var color: String?
    var chip: Chip?
}

struct Pin: Codable, Hashable {
    var name: String?
    var pct: Double?
    var region: String?
    var color: String?
    var chip: Chip?
}

struct WarSnapshot: Codable, Hashable {
    var version: Int?
    var exportedAt: Double?
    var updatedAt: Double?
    var has: Bool?
    var defTotal: Int?
    var pinCount: Int?
    var mo: [MajorOrder]?
    var defs: [Defense]?
    var pins: [Pin]?
}

enum WarStore {
    // The widget runs in a sandbox, so its own "home" is a private container. The app's snapshot lives in the real
    // home folder; the widget's entitlements allow it to read exactly this one folder (widget/HD2Widget.entitlements).
    // The same path is in main.js (widgetDir): change them together.
    static var fileURL: URL {
        var home = NSHomeDirectory()
        if let pw = getpwuid(getuid()), let dir = pw.pointee.pw_dir {
            home = String(cString: dir)
        }
        return URL(fileURLWithPath: home)
            .appendingPathComponent("Library/Application Support/Helldivers 2 War Tracker/Widget/widget.json")
    }

    static func load() -> WarSnapshot? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(WarSnapshot.self, from: data)
    }
}

// Numbers worked out for one moment in time (the widget shows several moments from one snapshot, so the countdowns keep moving).
func formatLeft(_ seconds: TimeInterval) -> String {
    if seconds <= 0 { return "ended" }
    let total = Int(seconds)
    let d = total / 86400, h = (total % 86400) / 3600, m = (total % 3600) / 60
    if d >= 1 { return "\(d)d \(h)h" }
    if h >= 1 { return "\(h)h \(m)m" }
    return "\(max(m, 1))m"
}

func formatAge(_ seconds: TimeInterval) -> String {
    let m = Int(max(0, seconds) / 60)
    if m < 1 { return "just now" }
    if m < 60 { return "\(m)m ago" }
    return "\(m / 60)h ago"
}

struct OrderRow: Identifiable {
    let id: Int
    let title: String
    let pct: Double
    let left: String?
    let chip: Chip?
}

struct DefenseRow: Identifiable {
    let id: Int
    let name: String
    let pct: Double
    let left: String
    let risk: Bool
    let color: String
    let chip: Chip?
}

struct PinRow: Identifiable {
    let id: Int
    let name: String
    let pct: Double
    let region: String
    let color: String
    let chip: Chip?
}

enum Freshness { case fresh, ageing, stale }

struct WarView {
    var hasData: Bool
    var orders: [OrderRow]
    var defenses: [DefenseRow]
    var defenseTotal: Int
    var pins: [PinRow]
    var pinCount: Int
    var updated: String
    var freshness: Freshness

    init(_ s: WarSnapshot, at date: Date) {
        let nowMs = date.timeIntervalSince1970 * 1000
        hasData = s.has ?? false
        var os: [OrderRow] = []
        for (i, m) in (s.mo ?? []).enumerated() {
            let ex = m.expires ?? 0
            if ex > 0 && ex <= nowMs { continue }                      // already ended
            os.append(OrderRow(id: i, title: m.title ?? "Major Order", pct: min(100, max(0, m.pct ?? 0)),
                               left: ex > 0 ? formatLeft((ex - nowMs) / 1000) + " left" : nil, chip: m.chip))
        }
        orders = os
        var ds: [DefenseRow] = []
        for (i, d) in (s.defs ?? []).enumerated() {
            let ex = d.expires ?? 0
            if ex > 0 && ex <= nowMs { continue }
            ds.append(DefenseRow(id: i, name: d.name ?? "Planet", pct: min(100, max(0, d.pct ?? 0)),
                                 left: ex > 0 ? formatLeft((ex - nowMs) / 1000) : "", risk: d.risk ?? false,
                                 color: d.color ?? "#6ec6ff", chip: d.chip))
        }
        defenses = ds
        defenseTotal = ds.count
        var ps: [PinRow] = []
        for (i, p) in (s.pins ?? []).enumerated() {
            ps.append(PinRow(id: i, name: p.name ?? "Planet", pct: min(100, max(0, p.pct ?? 0)),
                             region: p.region ?? "", color: p.color ?? "#6ec6ff", chip: p.chip))
        }
        pins = ps
        pinCount = s.pinCount ?? ps.count
        let stamp = (s.updatedAt ?? 0) > 0 ? (s.updatedAt ?? 0) : (s.exportedAt ?? 0)
        let age = stamp > 0 ? (nowMs - stamp) / 1000 : 0
        updated = stamp > 0 ? "updated " + formatAge(age) : ""
        freshness = age < 600 ? .fresh : (age < 1800 ? .ageing : .stale)
    }
}

// What the gallery shows while you are choosing (believable numbers, like the designer in the app).
extension WarSnapshot {
    static func sample(at date: Date = Date()) -> WarSnapshot {
        let now = date.timeIntervalSince1970 * 1000
        return WarSnapshot(
            version: 1, exportedAt: now, updatedAt: now - 120_000, has: true, defTotal: 2, pinCount: 2,
            mo: [MajorOrder(title: "Liberate Meridia", pct: 63, expires: now + 52 * 3_600_000,
                            chip: Chip(cls: "ok", text: "On track"))],
            defs: [
                Defense(name: "Tibit", pct: 42.1, expires: now + 72 * 60_000, risk: true, color: "#ff5a52",
                        chip: Chip(cls: "bad", text: "Won't hold")),
                Defense(name: "Fenmire", pct: 78.4, expires: now + 185 * 60_000, risk: false, color: "#ffb300",
                        chip: Chip(cls: "ok", text: "Holds in ~43m"))
            ],
            pins: [
                Pin(name: "Mort", pct: 55.4, region: "", color: "#ffb300", chip: Chip(cls: "", text: "~2h 10m to liberate")),
                Pin(name: "Hellmire", pct: 12, region: "", color: "#ffb300", chip: Chip(cls: "", text: "Stalled"))
            ])
    }
}
