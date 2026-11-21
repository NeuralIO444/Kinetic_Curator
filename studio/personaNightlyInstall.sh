#!/bin/bash
# personaNightlyInstall.sh — Persona Adapters A3 (#2396): install the nightly retrain job.
#
#   studio/personaNightlyInstall.sh --taste <your current taste.json export> [options]
#   studio/personaNightlyInstall.sh --seed-empty [options]   (only if there is no taste yet)
#
# What it does, in order (any failure stops it, loudly, with nothing loaded):
#   1. Resolves the interpreters and checks python3 can `import xgboost` — the fit's hard
#      dependency (A2's lesson: the sandbox and CI have no xgboost, the Studio must).
#   2. Sanity-checks the checkout carries the A0 → A2 chain.
#   3. Creates the data home (Q5) and seeds the canonical taste.json — from --taste, or an
#      explicit --seed-empty. There is no default: seeding from nothing would grow a
#      `personas` section in a file missing the existing taste/lois/chapters sections,
#      and importing that file later would wipe the heads the app already holds. An
#      existing canonical taste is NEVER overwritten by a re-install.
#   4. Renders the LaunchAgent plist from studio/launchd/ with the real absolute paths,
#      and validates its own output (plistlib parse + the ruled keys).
#   5. Runs the Q7 dry-run (the full chain against scratch copies). If it fails, the job
#      is NOT loaded.
#   6. Loads the agent (launchctl bootstrap; skipped with a note off-Mac or with --no-load).
#
# Options:
#   --taste <path>     seed taste export (required on first install unless --seed-empty)
#   --seed-empty       seed an empty {} taste instead (explicit opt-in; see above)
#   --checkout <dir>   the working clone (default: this script's repo)
#   --node <path>      node interpreter (default: node from PATH)
#   --python3 <path>   python3 interpreter (default: python3 from PATH)
#   --home <root>      home root to install under (default: $HOME) — the selfcheck's sandbox
#   --data-home <dir>  adapters data home (default: <root>/Library/Application Support/com.neuralio.kineticcurator/adapters)
#   --takes <dir>      takes dir    (default: <app data>/takes)
#   --ledgers <dir>    ledgers dir  (default: <app data>/ledgers)
#   --no-load          render + dry-run, but do not load the agent
set -uo pipefail

LABEL="com.neuralio.kineticcurator.persona-retrain"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECKOUT="$(cd "$SCRIPT_DIR/.." && pwd)"
SEED_TASTE=""
SEED_EMPTY=0
NODE_BIN=""
PYTHON_BIN=""
ROOT="${HOME:-}"
DATA_HOME=""
TAKES_DIR=""
LEDGERS_DIR=""
NO_LOAD=0

while [ $# -gt 0 ]; do
  case "$1" in
    --taste) SEED_TASTE="$2"; shift 2 ;;
    --seed-empty) SEED_EMPTY=1; shift ;;
    --checkout) CHECKOUT="$2"; shift 2 ;;
    --node) NODE_BIN="$2"; shift 2 ;;
    --python3) PYTHON_BIN="$2"; shift 2 ;;
    --home) ROOT="$2"; shift 2 ;;
    --data-home) DATA_HOME="$2"; shift 2 ;;
    --takes) TAKES_DIR="$2"; shift 2 ;;
    --ledgers) LEDGERS_DIR="$2"; shift 2 ;;
    --no-load) NO_LOAD=1; shift ;;
    *) echo "personaNightlyInstall: unknown argument: $1" >&2; exit 2 ;;
  esac
done

FAILS=0
pass() { echo "  PASS  $1"; }
fail() { echo "  FAIL  $1"; FAILS=$((FAILS + 1)); }
die() { echo "personaNightlyInstall: $1" >&2; exit 1; }

echo "== persona nightly install =="
[ -n "$ROOT" ] || die "no home root (HOME unset and no --home given)"
APP_DATA="$ROOT/Library/Application Support/com.neuralio.kineticcurator"
DATA_HOME="${DATA_HOME:-$APP_DATA/adapters}"
TAKES_DIR="${TAKES_DIR:-$APP_DATA/takes}"
LEDGERS_DIR="${LEDGERS_DIR:-$APP_DATA/ledgers}"
LA_DIR="$ROOT/Library/LaunchAgents"
PLIST_OUT="$LA_DIR/$LABEL.plist"
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || echo '')}"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 2>/dev/null || echo '')}"
# A bare interpreter name (no slash) resolves through PATH, so the checks below and the
# rendered plist always carry an absolute path.
case "$NODE_BIN" in */*) ;; *) NODE_BIN="$(command -v "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")" ;; esac
case "$PYTHON_BIN" in */*) ;; *) PYTHON_BIN="$(command -v "$PYTHON_BIN" 2>/dev/null || echo "$PYTHON_BIN")" ;; esac

# ── 1–2. checks BEFORE anything is written or loaded ──────────────────────────────────────
echo "-- interpreters"
if [ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ]; then pass "node: $NODE_BIN"; else fail "node not found/executable: '${NODE_BIN:-<none>}'"; fi
if [ -n "$PYTHON_BIN" ] && [ -x "$PYTHON_BIN" ]; then pass "python3: $PYTHON_BIN"; else fail "python3 not found/executable: '${PYTHON_BIN:-<none>}'"; fi
if [ "$FAILS" -eq 0 ]; then
  if "$PYTHON_BIN" -c "import xgboost" 2>/dev/null; then
    pass "python3 imports xgboost"
  else
    fail "python3 cannot import xgboost — the trainer's fit needs it: $PYTHON_BIN -m pip install 'xgboost>=3'"
  fi
fi
echo "-- checkout"
for f in labelExtractor.mjs personaRows.mjs verify_persona_heads.mjs train_persona_heads.py personaNightly.sh; do
  if [ -f "$CHECKOUT/studio/$f" ]; then pass "studio/$f"; else fail "missing $CHECKOUT/studio/$f — is this checkout pulled past A3?"; fi
done
[ "$FAILS" -eq 0 ] || die "checks failed ($FAILS) — nothing written, nothing loaded"

# ── 3. data home + seed ────────────────────────────────────────────────────────────────────
echo "-- data home: $DATA_HOME"
mkdir -p "$DATA_HOME/scratch" "$LA_DIR" || die "cannot create $DATA_HOME or $LA_DIR"
if [ -f "$DATA_HOME/taste.json" ]; then
  pass "canonical taste already present — seed NOT overwritten (a re-install never clobbers trained heads)"
elif [ -n "$SEED_TASTE" ]; then
  [ -f "$SEED_TASTE" ] || die "seed taste not found: $SEED_TASTE"
  cp "$SEED_TASTE" "$DATA_HOME/taste.json" || die "cannot seed the canonical taste"
  pass "canonical taste seeded from $SEED_TASTE"
elif [ "$SEED_EMPTY" = "1" ]; then
  printf '{}' >"$DATA_HOME/taste.json" || die "cannot write the empty seed"
  pass "canonical taste seeded EMPTY (explicit --seed-empty)"
else
  die "no canonical taste at $DATA_HOME/taste.json and no seed given — pass --taste <your current taste export> (Pipeline → EXPORT TASTE), or --seed-empty if there is genuinely no taste yet. Seeding is never guessed: the wrong seed wipes the app's existing heads on a later import."
fi

# ── 4. render + self-validate the plist ───────────────────────────────────────────────────
echo "-- plist"
xml_escape() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
sed_escape() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }
render() { sed_escape "$(xml_escape "$1")"; }
TEMPLATE="$CHECKOUT/studio/launchd/$LABEL.plist"
[ -f "$TEMPLATE" ] || die "plist template missing: $TEMPLATE"
sed \
  -e "s|__CHECKOUT__|$(render "$CHECKOUT")|g" \
  -e "s|__NODE__|$(render "$NODE_BIN")|g" \
  -e "s|__PYTHON3__|$(render "$PYTHON_BIN")|g" \
  -e "s|__DATA_HOME__|$(render "$DATA_HOME")|g" \
  -e "s|__TAKES_DIR__|$(render "$TAKES_DIR")|g" \
  -e "s|__LEDGERS_DIR__|$(render "$LEDGERS_DIR")|g" \
  "$TEMPLATE" >"$PLIST_OUT" || die "cannot render the plist to $PLIST_OUT"
for token in __CHECKOUT__ __NODE__ __PYTHON3__ __DATA_HOME__ __TAKES_DIR__ __LEDGERS_DIR__; do
  if grep -q "$token" "$PLIST_OUT"; then fail "placeholder $token survived rendering"; fi
done
if "$PYTHON_BIN" - "$PLIST_OUT" <<'PYEOF'
import plistlib, sys
with open(sys.argv[1], "rb") as fh:
    p = plistlib.load(fh)
assert p["Label"] == "com.neuralio.kineticcurator.persona-retrain", p.get("Label")
iv = p["StartCalendarInterval"]
assert iv["Hour"] == 3 and iv["Minute"] == 30, iv
assert p["ProgramArguments"][1].endswith("studio/personaNightly.sh"), p["ProgramArguments"]
env = p["EnvironmentVariables"]
for k in ("KC_CHECKOUT", "KC_NODE", "KC_PYTHON3", "KC_ADAPTERS_HOME", "KC_TAKES_DIR", "KC_LEDGERS_DIR"):
    assert env.get(k), k
PYEOF
then
  pass "rendered plist parses and carries the ruled keys: $PLIST_OUT"
else
  fail "rendered plist failed validation: $PLIST_OUT"
fi
[ "$FAILS" -eq 0 ] || die "plist step failed ($FAILS) — job NOT loaded"
chmod +x "$CHECKOUT/studio/personaNightly.sh" "$CHECKOUT/studio/personaNightlyInstall.sh" "$CHECKOUT/studio/personaNightlyUninstall.sh" 2>/dev/null || true

# ── 5. the Q7 dry-run, live, before anything is loaded ────────────────────────────────────
echo "-- dry-run (full chain against scratch copies)"
if KC_CHECKOUT="$CHECKOUT" KC_NODE="$NODE_BIN" KC_PYTHON3="$PYTHON_BIN" \
  KC_ADAPTERS_HOME="$DATA_HOME" KC_TAKES_DIR="$TAKES_DIR" KC_LEDGERS_DIR="$LEDGERS_DIR" \
  "$CHECKOUT/studio/personaNightly.sh" --dry-run; then
  pass "dry-run — read the night's section in $DATA_HOME/nightly.log"
else
  die "dry-run FAILED — the job is NOT loaded. The section in $DATA_HOME/nightly.log names the failing step; fix it and re-run install."
fi

# ── 6. load ────────────────────────────────────────────────────────────────────────────────
if [ "$NO_LOAD" = "1" ]; then
  echo "  SKIP  load (--no-load): plist is at $PLIST_OUT"
elif command -v launchctl >/dev/null 2>&1; then
  DOMAIN="gui/$(id -u)"
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  if launchctl bootstrap "$DOMAIN" "$PLIST_OUT" 2>/dev/null || launchctl load -w "$PLIST_OUT" 2>/dev/null; then
    pass "agent loaded ($DOMAIN/$LABEL) — nightly at 03:30"
  else
    fail "launchctl could not load $PLIST_OUT"
  fi
else
  echo "  SKIP  launchctl not found — plist installed at $PLIST_OUT but not loaded (expected anywhere but the Studio)"
fi
[ "$FAILS" -eq 0 ] || die "install finished with $FAILS failure(s) — see above"
echo "INSTALL OK — log: $DATA_HOME/nightly.log · report: $DATA_HOME/last-report.json"
echo "Heads reach the app by hand for now: after a night that ships, Pipeline → IMPORT TASTE, pointed at $DATA_HOME/taste.json (the boot bridge is the next slice)."
