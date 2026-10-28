#!/bin/sh
# Download any model weights missing from backend/ (used by the Dockerfile).
#
# - sam_vit_b_01ec64.pth (358 MB) is over GitHub's 100 MB file limit, so it is
#   always fetched from Meta's public URL.
# - yolov8n.pt (privacy blur) is the stock Ultralytics release asset.
# - best.pt and ultrabestroad.pt are our own trained weights. They must either
#   be committed (see .gitignore) or be downloadable from WEIGHTS_BASE_URL,
#   e.g. a GitHub Release: WEIGHTS_BASE_URL=https://github.com/<owner>/<repo>/releases/download/<tag>
set -eu

fetch() { # fetch <path> <url>
  if [ -s "$1" ]; then
    echo "have $1"
  else
    echo "fetching $1"
    mkdir -p "$(dirname "$1")"
    curl -fsSL --retry 3 -o "$1" "$2"
  fi
}

fetch sam_files/sam_vit_b_01ec64.pth https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth
fetch yolov8n.pt https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt

for w in best.pt ultrabestroad.pt; do
  if [ ! -s "$w" ]; then
    if [ -z "${WEIGHTS_BASE_URL:-}" ]; then
      echo "ERROR: $w is missing. Commit it (see .gitignore) or set WEIGHTS_BASE_URL." >&2
      exit 1
    fi
    fetch "$w" "$WEIGHTS_BASE_URL/$w"
  fi
done
