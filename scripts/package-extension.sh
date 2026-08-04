#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
MANIFEST="$ROOT_DIR/manifest.json"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required to validate the release." >&2
  exit 1
fi

VERSION=$(node -e 'const manifest = require(process.argv[1]); process.stdout.write(manifest.version)' "$MANIFEST")
OUTPUT_DIR="$ROOT_DIR/dist"
STAGING_DIR=$(mktemp -d "${TMPDIR:-/tmp}/scroller-release.XXXXXX")
ARCHIVE="$OUTPUT_DIR/scroller-$VERSION.zip"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT INT TERM

node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$MANIFEST"
node --check "$ROOT_DIR/background.js"
node --check "$ROOT_DIR/content.js"

mkdir -p "$OUTPUT_DIR" "$STAGING_DIR/icons"
cp "$MANIFEST" "$ROOT_DIR/background.js" "$ROOT_DIR/content.js" "$STAGING_DIR/"
cp "$ROOT_DIR"/icons/icon-16.png "$ROOT_DIR"/icons/icon-32.png "$ROOT_DIR"/icons/icon-48.png "$ROOT_DIR"/icons/icon-128.png "$STAGING_DIR/icons/"

rm -f "$ARCHIVE"
(
  cd "$STAGING_DIR"
  zip -q -r "$ARCHIVE" manifest.json background.js content.js icons
)

echo "Created $ARCHIVE"
unzip -l "$ARCHIVE"
