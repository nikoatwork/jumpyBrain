#!/usr/bin/env sh
set -eu

REF="${JUMPYBRAIN_INSTALL_REF:-main}"
RAW_BASE="${JUMPYBRAIN_RAW_BASE:-https://raw.githubusercontent.com/nikoatwork/jumpyBrain/${REF}}"
SCRIPT_URL="$RAW_BASE/scripts/public-install.mjs"

if ! command -v node >/dev/null 2>&1; then
  echo "Node >=22 is required. Install Node, then rerun this installer." >&2
  exit 1
fi

NODE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node >=22 is required. Current: $(node -v)" >&2
  exit 1
fi

if [ -f "scripts/public-install.mjs" ]; then
  exec node scripts/public-install.mjs --ref "$REF" "$@"
fi

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t jumpybrain-install)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT INT TERM

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$SCRIPT_URL" -o "$TMP_DIR/public-install.mjs"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP_DIR/public-install.mjs" "$SCRIPT_URL"
else
  echo "curl or wget is required to download the jumpyBrain installer." >&2
  exit 1
fi

exec node "$TMP_DIR/public-install.mjs" --ref "$REF" "$@"
