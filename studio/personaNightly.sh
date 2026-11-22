#!/bin/bash
# personaNightly.sh — Persona Adapters A3 (#2396): the nightly retrain clock.
#
#   studio/personaNightly.sh [--dry-run]
#
# A dumb clock on top of A2's trainer (train_persona_heads.py): once a night it runs the
# A0 → A2 chain against the desktop app's own data and lets the trainer's watermark decide
# what actually retrains. The rulings on #2396 (Matt, 2026-11-21) are the contract:
#
#   Q1  File side only — this job trains a taste.json FILE; importing it into the app stays
#       the manual Pipeline → IMPORT TASTE step (the boot bridge is a later slice).
#   Q2  Nightly at ~03:30 (the LaunchAgent's calendar; a sleeping Studio coalesces the run
#       to next wake — harmless, because of the watermark).
#   Q3  Log only — a failed night is a section in the log, never a notification.
#   Q4  verify_persona_heads runs after training as a logged ALARM: PASS/FAIL is recorded,
#       it never gates and never un-ships.
#   Q5  Data home: ~/Library/Application Support/com.neuralio.kineticcurator/adapters/ —
#       the canonical taste.json, the persona-heads store beside it, scratch, the last
#       report, and this log. Takes and ledgers are read in place from the app's data dirs.
#   Q6  Runs from Matt's existing working clone, as-is; NEVER pulls. The trainer's presence
#       at the expected path is sanity-checked below and its absence is logged loudly.
#   Q7  --dry-run runs the FULL chain against scratch copies (a copy of the canonical taste
#       and a copy of the store, so versions and the watermark preview faithfully) and
#       prints what would ship; the real taste and store are byte-untouched.
#
# Configuration arrives by environment (the LaunchAgent sets every one of these to an
# absolute path — launchd's PATH is near-empty, so nothing here is guessed from PATH on
# the Studio):
#   KC_CHECKOUT      the working clone (default: this script's own repo)
#   KC_NODE          node interpreter    (default: node from PATH — terminal runs only)
#   KC_PYTHON3       python3 interpreter (default: python3 from PATH — terminal runs only)
#   KC_ADAPTERS_HOME the data home       (default: <app data>/adapters)
#   KC_TAKES_DIR     takes dir           (default: <app data>/takes)
#   KC_LEDGERS_DIR   ledgers dir         (default: <app data>/ledgers)
#
# This script NEVER passes --force and NEVER invokes rollback. Exit codes are honest:
# 0 = the night ran (a verify FAIL is an alarm inside a successful night, per Q4);
# 1 = the night failed (the failing step is named in the log); 3 = another run holds the
# lock and this run stood down; 2 = bad arguments.
set -uo pipefail

MODE=run
case "${1:-}" in
  "") ;;
  --dry-run) MODE=dry ;;
  -h | --help)
    echo "usage: personaNightly.sh [--dry-run]"
    exit 0
    ;;
  *)
    echo "personaNightly: unknown argument: $1 (usage: personaNightly.sh [--dry-run])" >&2
    exit 2
    ;;
esac
if [ $# -gt 1 ]; then
  echo "personaNightly: too many arguments" >&2
  exit 2
fi

# ── configuration ─────────────────────────────────────────────────────────────────────────
if [ -z "${HOME:-}" ]; then
  echo "personaNightly: HOME is not set — cannot resolve the data home" >&2
  exit 1
fi
APP_DATA="$HOME/Library/Application Support/com.neuralio.kineticcurator"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CHECKOUT="${KC_CHECKOUT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DATA_HOME="${KC_ADAPTERS_HOME:-$APP_DATA/adapters}"
TAKES_DIR="${KC_TAKES_DIR:-$APP_DATA/takes}"
LEDGERS_DIR="${KC_LEDGERS_DIR:-$APP_DATA/ledgers}"
NODE_BIN="${KC_NODE:-$(command -v node 2>/dev/null || echo node)}"
PYTHON_BIN="${KC_PYTHON3:-$(command -v python3 2>/dev/null || echo python3)}"
# A bare interpreter name resolves through PATH, so the checks below test a real path.
case "$NODE_BIN" in */*) ;; *) NODE_BIN="$(command -v "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")" ;; esac
case "$PYTHON_BIN" in */*) ;; *) PYTHON_BIN="$(command -v "$PYTHON_BIN" 2>/dev/null || echo "$PYTHON_BIN")" ;; esac

TASTE="$DATA_HOME/taste.json"
STORE="$DATA_HOME/persona-heads"
LOG="$DATA_HOME/nightly.log"
SCRATCH="$DATA_HOME/scratch"
REPORT="$DATA_HOME/last-report.json"
LOCK="$DATA_HOME/.nightly.lock"

mkdir -p "$DATA_HOME" "$SCRATCH" || {
  echo "personaNightly: cannot create the data home at $DATA_HOME" >&2
  exit 1
}

# ── the lock: two chains never run at once (a manual run can meet the scheduled one) ─────
lock_held=0
if mkdir "$LOCK" 2>/dev/null; then
  lock_held=1
else
  owner="$(cat "$LOCK/pid" 2>/dev/null || echo '?')"
  if [ "$owner" != "?" ] && kill -0 "$owner" 2>/dev/null; then
    line="persona nightly — $(date '+%Y-%m-%d %H:%M:%S %z') — SKIPPED: another run (pid $owner) holds the lock"
    echo "$line" >>"$LOG"
    [ -t 1 ] && echo "$line"
    exit 3
  fi
  echo "persona nightly: breaking a stale lock (owner pid ${owner} is gone)" >>"$LOG"
  rm -rf "$LOCK"
  if mkdir "$LOCK" 2>/dev/null; then
    lock_held=1
  else
    echo "persona nightly: could not take the lock at $LOCK" >>"$LOG"
    exit 3
  fi
fi
echo $$ >"$LOCK/pid"
trap 'if [ "$lock_held" = "1" ]; then rm -rf "$LOCK"; fi' EXIT

# ── the night's section: built in scratch, appended to the log whole, mirrored to a tty ──
SECTION="$(mktemp "$SCRATCH/.section.XXXXXX")" || exit 1
trap 'if [ "$lock_held" = "1" ]; then rm -rf "$LOCK"; fi; rm -f "$SECTION"' EXIT
{
  echo "── persona nightly — $(date '+%Y-%m-%d %H:%M:%S %z') — mode: $MODE"
  echo "   checkout:  $CHECKOUT"
  echo "   data home: $DATA_HOME"
  echo "   takes:     $TAKES_DIR"
  echo "   ledgers:   $LEDGERS_DIR"
  echo "   node:      $NODE_BIN"
  echo "   python3:   $PYTHON_BIN"
} >"$SECTION"

fail() {
  echo "FAIL: $1" >>"$SECTION"
  echo "── persona nightly — FAILED ($1)" >>"$SECTION"
  cat "$SECTION" >>"$LOG"
  [ -t 1 ] && cat "$SECTION"
  exit 1
}

# ── preflight: every missing piece is named loudly, before anything is touched (Q6) ─────
[ -d "$CHECKOUT" ] || fail "checkout not found: $CHECKOUT"
for f in labelExtractor.mjs personaRows.mjs queenRows.mjs verify_persona_heads.mjs train_persona_heads.py; do
  [ -f "$CHECKOUT/studio/$f" ] || fail "expected chain file missing: $CHECKOUT/studio/$f — is KC_CHECKOUT the working clone, and is it pulled past A2?"
done
[ -x "$NODE_BIN" ] || fail "node interpreter not executable: $NODE_BIN"
[ -x "$PYTHON_BIN" ] || fail "python3 interpreter not executable: $PYTHON_BIN"
[ -f "$TASTE" ] || fail "no canonical taste at $TASTE — seed it first (personaNightlyInstall.sh --taste <your taste export>)"
[ -d "$TAKES_DIR" ] || fail "takes dir not found: $TAKES_DIR — the nightly reads the DESKTOP app's data; a browser build keeps takes in Downloads instead"
[ -d "$LEDGERS_DIR" ] || fail "ledgers dir not found: $LEDGERS_DIR — the nightly reads the DESKTOP app's data"

# ── the chain (A0 → A2, the audit's §2 sequence) ──────────────────────────────────────────
# run_chain <labeled> <rows> <taste> <report> — stops at the first failing step and returns
# its exit code. The trainer is called WITHOUT --store (the store lives beside the taste it
# is pointed at — Q5's law, and what makes the dry-run's isolation automatic), WITHOUT
# --force (the watermark rules), and rollback is never invoked from here.
run_chain() {
  local labeled="$1" rows="$2" taste="$3" report="$4" queenrows="$5" rc=0
  echo "+ labelExtractor"
  "$NODE_BIN" "$CHECKOUT/studio/labelExtractor.mjs" --takes "$TAKES_DIR" --ledgers "$LEDGERS_DIR" --out "$labeled" || return $?
  echo "+ personaRows"
  "$NODE_BIN" "$CHECKOUT/studio/personaRows.mjs" --labeled "$labeled" --takes "$TAKES_DIR" --out "$rows" || return $?
  echo "+ queenRows"
  "$NODE_BIN" "$CHECKOUT/studio/queenRows.mjs" --labeled "$labeled" --takes "$TAKES_DIR" --out "$queenrows" || return $?
  echo "+ train_persona_heads train"
  "$PYTHON_BIN" "$CHECKOUT/studio/train_persona_heads.py" train --rows "$rows" --taste "$taste" --report "$report" || return $?
  echo "+ train_persona_heads chemistry"
  "$PYTHON_BIN" "$CHECKOUT/studio/train_persona_heads.py" chemistry --rows "$rows" --taste "$taste" || return $?
  echo "+ train_persona_heads queen"
  "$PYTHON_BIN" "$CHECKOUT/studio/train_persona_heads.py" queen --rows "$queenrows" --taste "$taste" || return $?
  echo "+ verify_persona_heads (alarm only — Q4)"
  "$NODE_BIN" "$CHECKOUT/studio/verify_persona_heads.mjs" --taste "$taste" --rows "$rows" --report "$report"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "VERIFY: PASS"
  else
    echo "VERIFY: FAIL — alarm only (Q4): the night's ships stand; trainer and app validators disagree — see $report and $STORE/history.jsonl (the trainer's rollback command is the remedy, run by hand)"
  fi
  return 0
}

if [ "$MODE" = "dry" ]; then
  DRYDIR="$SCRATCH/dry-run"
  rm -rf "$DRYDIR"
  mkdir -p "$DRYDIR"
  cp "$TASTE" "$DRYDIR/taste.json" || fail "dry-run: cannot copy the canonical taste"
  if [ -d "$STORE" ]; then
    cp -R "$STORE" "$DRYDIR/persona-heads" || fail "dry-run: cannot copy the store"
  fi
  echo "DRY-RUN: the full chain runs against copies in $DRYDIR — the canonical taste and store are not touched."
  run_chain "$DRYDIR/labeled.json" "$DRYDIR/rows.json" "$DRYDIR/taste.json" "$DRYDIR/report.json" "$DRYDIR/queen-rows.json" >>"$SECTION" 2>&1
  rc=$?
  if [ "$rc" -ne 0 ]; then
    fail "dry-run chain step failed (exit $rc) — the copies are kept in $DRYDIR for inspection"
  fi
  echo "DRY-RUN: complete — what would ship is in the trainer lines above; copies kept in $DRYDIR" >>"$SECTION"
  echo "── persona nightly — dry-run OK" >>"$SECTION"
else
  run_chain "$SCRATCH/labeled.json" "$SCRATCH/rows.json" "$TASTE" "$REPORT" "$SCRATCH/queen-rows.json" >>"$SECTION" 2>&1
  rc=$?
  if [ "$rc" -ne 0 ]; then
    fail "chain step failed (exit $rc) — taste and store are as the trainer's no-desync law leaves them; see the step output above"
  fi
  echo "── persona nightly — OK" >>"$SECTION"
fi

cat "$SECTION" >>"$LOG"
[ -t 1 ] && cat "$SECTION"
exit 0
