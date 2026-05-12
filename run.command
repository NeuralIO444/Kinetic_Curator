#!/bin/bash
# Move to the script's directory
cd "$(dirname "$0")"

echo "◈ KINETIC CURATOR - Launching Engine..."

# Navigate to app and run dev
if [ -d "app" ]; then
  cd app
  if [ ! -d "node_modules" ]; then
    echo "Installing dependencies (first run)..."
    npm install
  fi
  npm run dev
else
  echo "Error: 'app' directory not found."
  read -p "Press enter to close..."
fi
