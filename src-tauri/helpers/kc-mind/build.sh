#!/bin/sh
# build.sh — #1463: build the kc-mind helper for the desktop app's sidecar slot.
#
#   sh build.sh <out-file>
#
# Tries, in order, and never fails the app build:
#   1. swiftc with Foundation Models (macOS 26 SDK)      → the real helper
#   2. swiftc with -D KC_NO_FM (older SDK)               → always reports "unavailable"
#   3. no swiftc at all (not a Mac, no Xcode tools)      → a tiny shell stub that reports "unavailable"
# In cases 2 and 3 the app runs on the rules backend, silently; the reason is in the helper's status reply.
set -u
OUT="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="$HERE/main.swift"
mkdir -p "$(dirname "$OUT")"
TMP="$OUT.tmp.$$"

if command -v swiftc >/dev/null 2>&1 && [ "$(uname)" = "Darwin" ]; then
  if swiftc -O -swift-version 5 -o "$TMP" "$SRC" 2>"$TMP.log"; then
    mv "$TMP" "$OUT"; rm -f "$TMP.log"; echo "kc-mind: built with Foundation Models"; exit 0
  fi
  echo "kc-mind: Foundation Models build failed, building the unavailable variant:" >&2
  head -20 "$TMP.log" >&2
  if swiftc -O -swift-version 5 -D KC_NO_FM -o "$TMP" "$SRC" 2>>"$TMP.log"; then
    mv "$TMP" "$OUT"; rm -f "$TMP.log"; echo "kc-mind: built WITHOUT Foundation Models (rules only)"; exit 0
  fi
  echo "kc-mind: swiftc failed; writing the shell stub" >&2
  head -20 "$TMP.log" >&2
  rm -f "$TMP" "$TMP.log"
fi

cat > "$OUT" <<'STUB'
#!/bin/sh
# kc-mind stub: no Swift toolchain was available when the app was built. Always unavailable; the rules answer.
while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p')
  [ -z "$id" ] && continue
  case "$line" in
    *'"op":"status"'*|*'"op": "status"'*) printf '{"id":%s,"available":false,"reason":"helper not built (no Swift toolchain)"}\n' "$id" ;;
    *) printf '{"id":%s,"reply":null,"error":"unavailable"}\n' "$id" ;;
  esac
done
STUB
chmod +x "$OUT"
echo "kc-mind: wrote the shell stub (rules only)"
exit 0
