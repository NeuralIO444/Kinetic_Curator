#!/bin/bash
# Kinetic Curator — quick launch
# Double-click this in Finder, or run `./run.command` from a terminal.

cd "$(dirname "$0")"

echo "◈ KINETIC CURATOR — Launching Engine..."
echo

if [ ! -d "app" ]; then
  echo "Error: 'app' directory not found next to this script."
  read -p "Press enter to close..."
  exit 1
fi

cd app

# First-run install
if [ ! -d "node_modules" ]; then
  echo "First run — installing dependencies (this may take a minute)..."
  npm install || { read -p "Install failed. Press enter to close..."; exit 1; }
fi

# Build the WASM particle kernel if asbuild script exists and output is missing
if [ ! -f "public/particles.wasm" ] && npm run | grep -q "asbuild"; then
  echo "Building WASM particle kernel..."
  npm run asbuild
fi

# Open the browser to the dev URL after a short delay (Vite serves on 5173).
( sleep 2 && open "http://localhost:5173" ) &

echo
echo "Dev server is starting at http://localhost:5173"
echo "Press Ctrl-C in this window to stop, or run stop.command."
echo

npm run dev
