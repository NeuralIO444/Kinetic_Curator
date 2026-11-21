#!/bin/bash
# personaNightlyUninstall.sh — Persona Adapters A3 (#2396): remove the nightly schedule.
#
#   studio/personaNightlyUninstall.sh [--home <root>]
#
# Boots the LaunchAgent out and removes its plist — and NOTHING else. The data home
# (the canonical taste.json, the persona-heads store with every shipped version and the
# history, the logs) is deliberately left untouched: removing a schedule must never
# destroy rollback history. Delete the data home by hand if you ever truly mean to.
set -uo pipefail

LABEL="com.neuralio.kineticcurator.persona-retrain"
ROOT="${HOME:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --home) ROOT="$2"; shift 2 ;;
    *) echo "personaNightlyUninstall: unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$ROOT" ] || { echo "personaNightlyUninstall: no home root (HOME unset and no --home given)" >&2; exit 1; }

APP_DATA="$ROOT/Library/Application Support/com.neuralio.kineticcurator"
PLIST="$ROOT/Library/LaunchAgents/$LABEL.plist"

if command -v launchctl >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload -w "$PLIST" 2>/dev/null || true
fi
if [ -f "$PLIST" ]; then
  rm "$PLIST"
  echo "removed: $PLIST (agent booted out first, where launchctl was available)"
else
  echo "no plist at $PLIST — nothing to remove"
fi
echo "data home left untouched: $APP_DATA/adapters (canonical taste, persona-heads store, logs — all kept)"
exit 0
