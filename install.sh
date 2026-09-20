#!/usr/bin/env sh
set -eu

REF="${JUMPYBRAIN_INSTALL_REF:-master}"
# The bootstrap and its dependencies must come from one current installer
# version; the requested runtime may predate those dependencies.
INSTALLER_REF="${JUMPYBRAIN_INSTALLER_REF:-master}"
RAW_BASE="${JUMPYBRAIN_RAW_BASE:-https://raw.githubusercontent.com/nikoatwork/jumpyBrain/${INSTALLER_REF}}"

if [ -n "${JUMPYBRAIN_INSTALL_REF+x}" ]; then
  set -- --ref "$REF" "$@"
fi

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
  exec node scripts/public-install.mjs "$@"
fi

TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t jumpybrain-install)
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT INT TERM

mkdir -p "$TMP_DIR/scripts" "$TMP_DIR/integrations/macos-companion"
for FILE in scripts/public-install.mjs scripts/remote-target-origin.mjs scripts/macos-companion.mjs integrations/macos-companion/update.py; do
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$RAW_BASE/$FILE" -o "$TMP_DIR/$FILE"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$TMP_DIR/$FILE" "$RAW_BASE/$FILE"
  else
    echo "curl or wget is required to download the jumpyBrain installer." >&2
    exit 1
  fi
done

node "$TMP_DIR/scripts/public-install.mjs" "$@"
