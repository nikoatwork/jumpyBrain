#!/usr/bin/env sh
set -eu

REF="${JUMPYBRAIN_INSTALL_REF:-master}"
RAW_BASE="${JUMPYBRAIN_RAW_BASE:-https://raw.githubusercontent.com/nikoatwork/jumpyBrain/${REF}}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node is required to run the jumpyBrain uninstaller." >&2
  exit 1
fi

if [ -f "scripts/public-uninstall.mjs" ]; then
  exec node scripts/public-uninstall.mjs "$@"
fi

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t jumpybrain-uninstall)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$TMP_DIR/scripts"
# The uninstaller shares the installer's manifest compatibility boundary.
for FILE in public-uninstall.mjs install-compatibility.mjs; do
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$RAW_BASE/scripts/$FILE" -o "$TMP_DIR/scripts/$FILE"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$TMP_DIR/scripts/$FILE" "$RAW_BASE/scripts/$FILE"
  else
    echo "curl or wget is required to download the jumpyBrain uninstaller." >&2
    exit 1
  fi
done

node "$TMP_DIR/scripts/public-uninstall.mjs" "$@"
