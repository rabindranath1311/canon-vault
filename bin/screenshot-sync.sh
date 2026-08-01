#!/usr/bin/env bash
# Second Brain — screenshot watcher.
# launchd runs this whenever the screenshot folder changes; new images are
# copied into the vault's attachments/, where the app's inspo grid picks up
# every image in the vault without needing a page for each one.
#
#     BRAIN_DIR="$HOME/Brain" bin/screenshot-sync.sh

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_brain_dir

SCREENSHOT_DIR="${SCREENSHOT_DIR:-$HOME/Desktop/Screenshots}"
DEST_ROOT="$BRAIN_DIR/attachments/screenshots"
LOG="$(log_dir)/screenshot-sync.log"

mkdir -p "$DEST_ROOT"

if [ ! -d "$SCREENSHOT_DIR" ]; then
    echo "$(utc_now) screenshot dir not found: $SCREENSHOT_DIR" >> "$LOG"
    exit 0
fi

find "$SCREENSHOT_DIR" -type f \
    \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.heic" -o -iname "*.webp" \) \
    -mmin -10 \
    -print0 | while IFS= read -r -d '' src; do
    fname=$(basename "$src")
    yyyymm=$(stat -f "%Sm" -t "%Y-%m" "$src")
    dest_dir="$DEST_ROOT/$yyyymm"
    mkdir -p "$dest_dir"
    dest="$dest_dir/$fname"
    if [ ! -f "$dest" ]; then
        cp "$src" "$dest"
        echo "$(utc_now) copied $fname -> attachments/screenshots/$yyyymm/" >> "$LOG"
    fi
done
