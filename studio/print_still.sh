#!/bin/sh
# Print still: render at Nx then box-filter to 1000x700.
# Usage: studio/print_still.sh project.json out.png [scale]
set -e
PROJECT=${1:?project json}
OUT=${2:?out png}
SCALE=${3:-2}
HERE=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
ROOT=$(CDPATH= cd -- "$HERE/.." && pwd)
HI=$(mktemp /tmp/kc-print-XXXX.png)
python3 "$HERE/studio.py" render "$PROJECT" -o "$HI" --res "$SCALE" --sidecar
W=$((1000))
H=$((700))
ffmpeg -y -i "$HI" -vf "scale=${W}:${H}:flags=box" "$OUT"
echo "$OUT"
