#!/usr/bin/env sh
set -eu
# Bootstrap selection is explicit and independent of the caller's directory.
INSTALLER_REF="${JUMPYBRAIN_INSTALLER_REF:-master}"
if [ -n "${JUMPYBRAIN_INSTALL_REF+x}" ]; then set -- --ref "$JUMPYBRAIN_INSTALL_REF" "$@"; fi
fail() {
  if [ "$JSON_OUTPUT" = 1 ]; then printf '{"schemaVersion":1,"state":"blocked","error":"%s"}\n' "$1"; fi
  printf '%s\n' "$1" >&2
  exit 1
}
JSON_OUTPUT=0
REMOTE_ONLY=0
for ARG in "$@"; do case "$ARG" in --json) JSON_OUTPUT=1;; --remote-only) REMOTE_ONLY=1;; esac; done
fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL --connect-timeout 15 --max-time 120 "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget --timeout=120 -qO "$2" "$1"
  else fail 'curl or wget is required to download jumpyBrain.'; fi
}
TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t jumpybrain-install)
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM
if [ -n "${JUMPYBRAIN_RAW_BASE:-}" ]; then
  RAW_BASE="$JUMPYBRAIN_RAW_BASE"
else
  # Resolve once so every helper comes from the same immutable installer revision.
  fetch "https://api.github.com/repos/nikoatwork/jumpyBrain/commits/$INSTALLER_REF" "$TMP_DIR/revision.json" || fail 'Could not resolve the installer revision.'
  SHA=$(sed -n 's/^[[:space:]]*"sha": "\([a-f0-9]*\)".*/\1/p' "$TMP_DIR/revision.json" | head -n 1)
  [ "${#SHA}" = 40 ] || fail 'Could not resolve the installer revision.'
  RAW_BASE="https://raw.githubusercontent.com/nikoatwork/jumpyBrain/$SHA"
fi
mkdir -p "$TMP_DIR/scripts/engine" "$TMP_DIR/integrations/macos-companion" "$TMP_DIR/integrations/electron"
HELPERS='scripts/bootstrap-node.sh scripts/public-install.mjs scripts/install-compatibility.mjs scripts/install-support.mjs scripts/installation-storage.mjs scripts/desktop-prerequisites.mjs scripts/qmd-install-check.mjs scripts/remote-target-origin.mjs scripts/macos-companion.mjs integrations/electron/update-release.mjs integrations/electron/install-shim.mjs integrations/electron/managed-integrations.mjs integrations/electron/update-retention.py integrations/electron/installation-retention.py integrations/macos-companion/update.py integrations/macos-companion/lifecycle.py'
# A remote-only CLI never provisions the search engine or the Mac app: skip their recipes.
[ "$REMOTE_ONLY" = 1 ] || HELPERS="$HELPERS scripts/setup-desktop.mjs scripts/engine/package.json scripts/engine/package-lock.json"
for FILE in $HELPERS; do
  fetch "$RAW_BASE/$FILE" "$TMP_DIR/$FILE" || fail 'Could not download the selected installer. Retry the same command.'
done
INSTALL_ROOT=
INSTALL_HOME="$HOME"
DRY_RUN=0
EXPECT=
for ARG in "$@"; do
  if [ "$EXPECT" = root ]; then INSTALL_ROOT=$ARG; EXPECT=; continue; fi
  if [ "$EXPECT" = home ]; then INSTALL_HOME="$ARG"; EXPECT=; continue; fi
  case "$ARG" in --install-root) EXPECT=root;; --home) EXPECT=home;; --dry-run|--help|-h) DRY_RUN=1;; esac
done
INSTALL_ROOT="${INSTALL_ROOT:-$INSTALL_HOME/.jumpybrain}"
case "$INSTALL_ROOT" in '~') INSTALL_ROOT="$INSTALL_HOME";; '~/'*) INSTALL_ROOT="$INSTALL_HOME/${INSTALL_ROOT#\~/}";; esac
NODE=$(sh "$TMP_DIR/scripts/bootstrap-node.sh" "$INSTALL_ROOT" "$DRY_RUN") || fail 'Node setup is incomplete. See the diagnostic above and rerun the same command.'
PATH="$(dirname "$NODE"):$PATH"
export PATH
JUMPYBRAIN_BOOTSTRAP_DIR="$TMP_DIR" "$NODE" "$TMP_DIR/scripts/public-install.mjs" "$@"
