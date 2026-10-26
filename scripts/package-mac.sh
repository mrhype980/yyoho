#!/bin/bash
# Packs the Electron app, puts the widget inside it, signs everything and zips it.
#   usage: bash scripts/package-mac.sh arm64|x64        (run bash widget/build-widget.sh first)
set -euo pipefail
ARCH="${1:?usage: package-mac.sh arm64|x64}"
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
case "$ARCH" in
  arm64) LABEL=AppleSilicon ;;
  x64)   LABEL=Intel ;;
  *) echo "arch must be arm64 or x64"; exit 1 ;;
esac
NAME="Helldivers 2 War Tracker"
VERSION="$(node -p "require('./package.json').version")"
ELECTRON="$(node -p "require('./package.json').devDependencies.electron")"
APPEX="$ROOT/build/HD2Widget.appex"
[ -d "$APPEX" ] || { echo "Missing $APPEX. Run: bash widget/build-widget.sh"; exit 1; }

DIST="$ROOT/dist/$ARCH"; rm -rf "$DIST"; mkdir -p "$DIST" "$ROOT/out"
npx --no-install electron-packager . "$NAME" \
  --platform=darwin --arch="$ARCH" --electron-version="$ELECTRON" \
  --out="$DIST" --overwrite \
  --icon=build/icon.icns \
  --app-bundle-id=com.ishan.hd2wartracker \
  --app-version="$VERSION" --build-version="$VERSION" \
  --extend-info=build/extend-info.plist \
  --ignore='^/(build|dist|out|widget|scripts|node_modules|\.github|\.gitignore|README\.md|build-mac\.workflow\.yml)($|/)'

APP="$(ls -d "$DIST"/*/"$NAME.app")"
echo "Packed: $APP"

# The widget goes in Contents/PlugIns, where macOS looks for it.
mkdir -p "$APP/Contents/PlugIns"
rm -rf "$APP/Contents/PlugIns/HD2Widget.appex"
cp -R "$APPEX" "$APP/Contents/PlugIns/HD2Widget.appex"

# Sign from the inside out with an ad-hoc signature (no Apple developer account needed):
# 1. everything in the app (Electron's helpers and frameworks), 2. the widget again with its sandbox entitlements,
# 3. the app itself last, so its seal covers the widget.
codesign --force --deep --sign - "$APP"
codesign --force --sign - --entitlements widget/HD2Widget.entitlements "$APP/Contents/PlugIns/HD2Widget.appex"
codesign --force --sign - "$APP"

echo "--- checking the seal and the widget ---"
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -d --entitlements - "$APP/Contents/PlugIns/HD2Widget.appex" 2>&1 | grep -E "app-sandbox|home-relative-path" || { echo "widget entitlements missing"; exit 1; }
lipo -archs "$APP/Contents/PlugIns/HD2Widget.appex/Contents/MacOS/HD2Widget"

ZIP="$ROOT/out/Helldivers-2-War-Tracker-$LABEL.zip"
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
echo "Done: $ZIP"
