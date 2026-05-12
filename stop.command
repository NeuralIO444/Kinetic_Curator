#!/bin/bash
# Kinetic Curator — stop the dev server.
# Double-click this in Finder, or run `./stop.command` from a terminal.

echo "◈ KINETIC CURATOR — stopping dev server..."

PIDS=$(lsof -ti:5173 2>/dev/null)
if [ -z "$PIDS" ]; then
  echo "Nothing running on port 5173."
  exit 0
fi

echo "Killing PID(s): $PIDS"
kill $PIDS 2>/dev/null

# Give them a beat to shut down cleanly, then force if still alive.
sleep 1
STILL=$(lsof -ti:5173 2>/dev/null)
if [ -n "$STILL" ]; then
  echo "Force-killing stragglers: $STILL"
  kill -9 $STILL 2>/dev/null
fi

echo "Stopped."
