#!/usr/bin/env bash
# File the next-generation feature issues via the GitHub CLI.
#
#   gh auth login
#   ./file-next-issues.sh              # file them
#   ./file-next-issues.sh --dry-run    # print without filing
#
# NOTE: issues #6 and #7 already open on the tracker ('Clean legacy folders...'
# and 'Improve panel density...') are chore/UX work, not render/engine work —
# checked, no overlap with n01-n07 below.
set -euo pipefail
REPO="NeuralIO444/Kinetic_Curator"
DRY=""
[[ "${1:-}" == "--dry-run" ]] && DRY="echo [dry-run]"
cd "$(dirname "$0")"

# NOTE: 'render' / 'engine' / 'research' labels don't exist yet on the
# tracker and this token lacks label-creation permission (403). Filing
# with 'enhancement' only; add the missing labels by hand once created.

$DRY gh issue create --repo "$REPO" \
  --title "Render pipeline: lift quality caps at render time, not just pixels" \
  --label "enhancement" \
  --body-file "bodies/n01.md"

$DRY gh issue create --repo "$REPO" \
  --title "Blend modes per shape (screen / multiply / overlay / plus-lighter)" \
  --label "enhancement" \
  --body-file "bodies/n02.md"

$DRY gh issue create --repo "$REPO" \
  --title "Weighted asset selection — replace round-robin i % length" \
  --label "enhancement" \
  --body-file "bodies/n03.md"

$DRY gh issue create --repo "$REPO" \
  --title "Gradient shading pass — GLOSS vs FLAT" \
  --label "enhancement" \
  --body-file "bodies/n04.md"

$DRY gh issue create --repo "$REPO" \
  --title "Accumulation buffer (HYPE BitmapCanvas-style trails)" \
  --label "enhancement" \
  --body-file "bodies/n05.md"

$DRY gh issue create --repo "$REPO" \
  --title "Batch edition render — N seeds to disk" \
  --label "enhancement" \
  --body-file "bodies/n06.md"

$DRY gh issue create --repo "$REPO" \
  --title "Global hue-rotate control" \
  --label "enhancement" --label "good first issue" \
  --body-file "bodies/n07.md"
