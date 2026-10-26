#!/bin/bash
# Builds the gallery widget (HD2Widget.appex) with the Swift compiler that comes with Xcode or the Command Line Tools.
# No Xcode project is needed. The result runs on both Apple Silicon and Intel Macs (macOS 13 or newer).
#   usage: bash widget/build-widget.sh [output folder]      (default: build)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HERE/../build}"; mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"     # a relative folder is relative to where you run this from
cd "$HERE"
NAME=HD2Widget
APPEX="$OUT/$NAME.appex"
VERSION="$(node -p "require('../package.json').version" 2>/dev/null || echo 1.0.0)"
SDK="$(xcrun --sdk macosx --show-sdk-path)"

rm -rf "$APPEX" "$OUT/tmp"; mkdir -p "$APPEX/Contents/MacOS" "$OUT/tmp"

for ARCH in arm64 x86_64; do
  echo "Compiling for $ARCH ..."
  xcrun swiftc \
    -parse-as-library -swift-version 5 -O \
    -module-name HD2Widget \
    -sdk "$SDK" -target "$ARCH-apple-macos13.0" \
    -application-extension \
    -Xlinker -e -Xlinker _NSExtensionMain \
    -framework SwiftUI -framework WidgetKit -framework Foundation \
    Sources/*.swift \
    -o "$OUT/tmp/$NAME-$ARCH"
done

lipo -create "$OUT/tmp/$NAME-arm64" "$OUT/tmp/$NAME-x86_64" -output "$APPEX/Contents/MacOS/$NAME"
sed "s/__VERSION__/$VERSION/g" Info.plist > "$APPEX/Contents/Info.plist"
plutil -lint "$APPEX/Contents/Info.plist" HD2Widget.entitlements

# Ad-hoc signature with the sandbox entitlements (scripts/package-mac.sh signs the finished app around it afterwards).
codesign --force --sign - --entitlements HD2Widget.entitlements "$APPEX"
codesign --verify --strict --verbose=2 "$APPEX"
rm -rf "$OUT/tmp"
echo "Built $APPEX"
