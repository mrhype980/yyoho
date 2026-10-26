import WidgetKit
import SwiftUI

struct WarEntry: TimelineEntry {
    let date: Date
    let snapshot: WarSnapshot?      // nil: the app has not written anything yet
}

struct WarProvider: TimelineProvider {
    func placeholder(in context: Context) -> WarEntry {
        WarEntry(date: Date(), snapshot: WarSnapshot.sample())
    }

    func getSnapshot(in context: Context, completion: @escaping (WarEntry) -> Void) {
        let snap = context.isPreview ? WarSnapshot.sample() : WarStore.load()
        completion(WarEntry(date: Date(), snapshot: snap))
    }

    // One read of the snapshot becomes a run of entries five minutes apart, so the "x left" counters keep ticking down
    // between refreshes. macOS decides how often the widget really gets to refresh; the app keeps the file current.
    func getTimeline(in context: Context, completion: @escaping (Timeline<WarEntry>) -> Void) {
        let snap = WarStore.load()
        let now = Date()
        var entries: [WarEntry] = []
        for i in 0..<13 {
            entries.append(WarEntry(date: now.addingTimeInterval(Double(i) * 300), snapshot: snap))
        }
        completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(15 * 60))))
    }
}
