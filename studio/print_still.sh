#!/bin/sh
# Print still: render at Nx then box-filter to 1000x700.
# Usage: studio/print_still.sh /full/path/to/saved.project.json /tmp/print.png [scale]
set -e
PROJECT=${1:?project json}
OUT=${2:?out png}
SCALE=${3:-2}
HERE=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
HI=$(mktemp /tmp/kc-print.XXXXXX)
mv "$HI" "$HI.png"
HI="$HI.png"
python3 "$HERE/studio.py" render "$PROJECT" -o "$HI" --res "$SCALE" --sidecar
ffmpeg -y -i "$HI" -vf "scale=1000:700:flags=box" "$OUT"
echo "$OUT"
