# Helldivers 2 War Tracker (Mac app + widget)

Live Helldivers 2 war tracker with Stratagem Hero drills. Version 3.9.0 adds a **real macOS widget** (small, medium and large)
that you pick from the widget gallery. GitHub builds the app and the widget for you, so you do not need Xcode or any coding.

## Get the app (one-time setup, about 10 minutes)

1. Make a free account at github.com, then press **+ → New repository**. Name it anything (for example `hd2-war-tracker`),
   keep it **Private**, and press **Create repository**.
2. On the new repository page press **uploading an existing file**. Unzip this project, open the folder, select everything
   inside it (including the hidden `.github` folder: in Finder press **Cmd + Shift + .** to show it) and drag it into the
   browser. Press **Commit changes**.
3. Open the **Actions** tab. The **Build Mac app** job starts by itself (about 5 to 10 minutes). If you do not see it,
   see "If the Actions tab is empty" below.
4. When it shows a green tick, open the run and scroll to **Artifacts**. Download **Helldivers-2-War-Tracker-Mac**.
   Unzip it: inside are `Helldivers-2-War-Tracker-AppleSilicon.zip` (M1 and newer) and `...-Intel.zip`.
5. Unzip the one for your Mac, drag **Helldivers 2 War Tracker** into **Applications**, then **right-click it → Open → Open**
   (the first launch only; the app is not signed with an Apple developer account). If macOS still refuses, run this once in
   Terminal: `xattr -cr "/Applications/Helldivers 2 War Tracker.app"`

## Add the widget

1. Open the app once and leave it running. It writes the war numbers the widget shows.
2. Right-click the desktop (or open Notification Center) and choose **Edit Widgets**.
3. Search for **Helldivers** and drag the small, medium or large widget out.

The app's menu bar item and the **View** menu also have **Add to the macOS widget gallery…**, which shows these steps.

The widget shows the Major Order (percentage and time left), the most urgent defenses (time left and whether they will hold)
and your pinned planets. Its counters keep ticking between refreshes, but macOS decides how often a gallery widget may refresh,
so for second-by-second numbers use the floating desktop widget in the app.

## Updating

Change anything, upload the changed files, and the **Actions** tab builds a new copy. To get a download link that lasts,
make a release: **Releases → Draft a new release**, create the tag `v3.9.1` (or any `v` number), and publish. The zips
are attached to the release automatically.

## If the Actions tab is empty

GitHub only runs workflows stored in `.github/workflows/`. If the hidden folder did not upload, press **Add file → Create new file**,
type `.github/workflows/build-mac.yml` as the name (typing the slashes creates the folders), paste in everything from the file
`build-mac.workflow.yml` in this project, and commit.

## If the build fails

Open the failed run, click the red step, and copy the last 30 lines or so of red text. The widget step is the one most likely to need a fix,
because it was written without being able to compile it.

## How it fits together (for the curious)

| Part | Where |
| --- | --- |
| The app (Electron) | `main.js`, `preload.js`, `app/` |
| Turns the war data into a snapshot for the widget | `app/widget-export.js` (runs in the background check) |
| Writes the snapshot to `~/Library/Application Support/Helldivers 2 War Tracker/Widget/widget.json` | `main.js` (`widget:export`) |
| The widget (Swift, built without an Xcode project) | `widget/Sources/*.swift`, `widget/Info.plist`, `widget/HD2Widget.entitlements` |
| Builds the widget | `widget/build-widget.sh` |
| Packs the app, puts the widget in `Contents/PlugIns`, signs, zips | `scripts/package-mac.sh` |
| Runs all of that on a GitHub Mac | `.github/workflows/build-mac.yml` |

The widget is sandboxed, so it cannot see the app's data. It may read exactly one folder (the one above), declared in
`HD2Widget.entitlements`. If you ever change that folder, change it in `main.js`, `widget/Sources/Store.swift` and the
entitlements file together.

To try the widget with fixed numbers, copy `widget/sample/widget.json` to that folder (with the app closed).
