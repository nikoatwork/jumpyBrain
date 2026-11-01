#!/usr/bin/env sh
# Private Node bootstrap. stdout is only the selected executable; progress is stderr.
set -eu
ROOT=$1
DRY=$2
if command -v node >/dev/null 2>&1 && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||a===22&&b>=12?0:1)' >/dev/null 2>&1; then
  command -v node
  exit 0
fi
[ "$DRY" != 1 ] || { echo 'Node 22.12+ is missing. A real install will download a private Node 24 runtime; no changes were made.' >&2; exit 1; }
case "$(uname -s)" in Darwin) PLATFORM=darwin;; Linux) PLATFORM=linux;; *) echo 'Private Node installation supports macOS and Linux.' >&2; exit 1;; esac
case "$(uname -m)" in arm64|aarch64) ARCH=arm64;; x86_64) ARCH=x64;; *) echo 'Private Node installation supports arm64 and x64.' >&2; exit 1;; esac
RUNTIMES="$ROOT/runtimes"
[ ! -L "$ROOT" ] && [ ! -L "$RUNTIMES" ] || { echo 'Refusing a linked runtime installation directory.' >&2; exit 1; }
mkdir -p "$RUNTIMES"
SCRATCH=$(mktemp -d "$RUNTIMES/.node-installing-XXXXXX")
PUBLISH_LOCK=
trap 'rm -rf "$SCRATCH"; if [ -n "$PUBLISH_LOCK" ]; then rmdir "$PUBLISH_LOCK"; fi' EXIT INT TERM
fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL --connect-timeout 15 --max-time 120 "$1" -o "$2"
  else wget --timeout=120 -qO "$2" "$1"; fi
}
fetch https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt "$SCRATCH/checksums"
LINE=$(awk -v platform="$PLATFORM" -v arch="$ARCH" '$2 ~ "^node-v24[.][0-9]+[.][0-9]+-" platform "-" arch "[.]tar[.]gz$" { print $1 " " $2 }' "$SCRATCH/checksums")
[ "$(printf '%s\n' "$LINE" | wc -l | tr -d ' ')" = 1 ] && [ -n "$LINE" ] || { echo 'Could not select one official Node archive.' >&2; exit 1; }
SHA=${LINE%% *}
FILE=${LINE#* }
case "$SHA" in *[!a-f0-9]*) echo 'Invalid Node checksum.' >&2; exit 1;; esac
[ "${#SHA}" = 64 ] || exit 1
VERSION=${FILE#node-}; VERSION=${VERSION%%-*}
TARGET="$RUNTIMES/${FILE%.tar.gz}"
if [ -e "$TARGET" ]; then
  [ ! -L "$TARGET" ] && [ -f "$TARGET/.jumpybrain-node-sha256" ] && [ "$(cat "$TARGET/.jumpybrain-node-sha256")" = "$SHA" ] || { echo 'Refusing an unowned existing runtime.' >&2; exit 1; }
else
  printf 'Installing private Node %s for %s/%s…\n' "$VERSION" "$PLATFORM" "$ARCH" >&2
  fetch "https://nodejs.org/dist/$VERSION/$FILE" "$SCRATCH/$FILE"
  if command -v shasum >/dev/null 2>&1; then ACTUAL=$(shasum -a 256 "$SCRATCH/$FILE" | cut -d ' ' -f 1)
  elif command -v sha256sum >/dev/null 2>&1; then ACTUAL=$(sha256sum "$SCRATCH/$FILE" | cut -d ' ' -f 1)
  else echo 'shasum or sha256sum is required to verify Node.' >&2; exit 1; fi
  [ "$ACTUAL" = "$SHA" ] || { echo 'Node archive checksum mismatch. Nothing was installed.' >&2; exit 1; }
  tar -xzf "$SCRATCH/$FILE" -C "$SCRATCH"
  printf '%s\n' "$SHA" > "$SCRATCH/${FILE%.tar.gz}/.jumpybrain-node-sha256"
  [ "$("$SCRATCH/${FILE%.tar.gz}/bin/node" --version)" = "$VERSION" ] || { echo 'This Node runtime cannot execute on this machine.' >&2; exit 1; }
  mkdir "$RUNTIMES/.publish-lock" || { echo 'Another Node bootstrap is publishing. Retry when it finishes.' >&2; exit 1; }
  PUBLISH_LOCK="$RUNTIMES/.publish-lock"
  [ ! -e "$TARGET" ] || { echo 'Another bootstrap installed this runtime. Retry to reuse it.' >&2; exit 1; }
  mv "$SCRATCH/${FILE%.tar.gz}" "$TARGET"
  rmdir "$PUBLISH_LOCK"; PUBLISH_LOCK=
fi
[ "$("$TARGET/bin/node" --version)" = "$VERSION" ] || { echo 'The private Node runtime cannot execute on this machine.' >&2; exit 1; }
printf '%s\n' "$TARGET/bin/node"
