#!/usr/bin/env sh
set -eu

REF="${JUMPYBRAIN_INSTALL_REF:-main}"
RAW_BASE="${JUMPYBRAIN_RAW_BASE:-https://raw.githubusercontent.com/nikoatwork/jumpyBrain/${REF}}"
SCRIPT_URL="$RAW_BASE/scripts/public-uninstall.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "Node is required to run the jumpyBrain uninstaller." >&2
  exit 1
fi

if [ -f "scripts/public-uninstall.mjs" ]; then
  exec node scripts/public-uninstall.mjs "$@"
fi

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t jumpybrain-uninstall)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT INT TERM

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$SCRIPT_URL" -o "$TMP_DIR/public-uninstall.mjs"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP_DIR/public-uninstall.mjs" "$SCRIPT_URL"
else
  echo "curl or wget is required to download the jumpyBrain uninstaller." >&2
  exit 1
fi

exec node "$TMP_DIR/public-uninstall.mjs" "$@"
