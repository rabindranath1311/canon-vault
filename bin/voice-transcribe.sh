#!/usr/bin/env bash
# Second Brain — voice memo transcription.
# Transcribes audio with whisper.cpp and writes a note straight into the vault,
# in the exact frontmatter shape CONVENTION.md specifies (task 7.7) — so the
# result passes the vault validator unmodified.
#
#     BRAIN_DIR="$HOME/Brain" bin/voice-transcribe.sh
#
# Install whisper.cpp first:
#     brew install whisper-cpp
#     mkdir -p ~/.whisper-models && curl -L \
#       https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin \
#       -o ~/.whisper-models/ggml-base.en.bin

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_brain_dir

INCOMING="${VOICE_INCOMING:-$HOME/Desktop/VoiceMemos}"
NOTES="$BRAIN_DIR/notes"
AUDIO="$BRAIN_DIR/attachments/voice"
MODEL="${WHISPER_MODEL:-$HOME/.whisper-models/ggml-base.en.bin}"

mkdir -p "$INCOMING" "$NOTES" "$AUDIO"

command -v whisper-cli >/dev/null 2>&1 || {
    echo "ERROR: whisper-cli not found. Install with: brew install whisper-cpp" >&2; exit 1; }
[ -f "$MODEL" ] || {
    echo "ERROR: whisper model not found at $MODEL" >&2; exit 1; }

shopt -s nullglob
audio_files=("$INCOMING"/*.m4a "$INCOMING"/*.mp3 "$INCOMING"/*.wav "$INCOMING"/*.mp4 "$INCOMING"/*.webm)
if [ ${#audio_files[@]} -eq 0 ]; then
    echo "no audio in $INCOMING — drop voice memos there and re-run."
    exit 0
fi

for src in "${audio_files[@]}"; do
    fname=$(basename "$src")
    stem="${fname%.*}"
    captured=$(stat -f "%Sm" -t "%Y-%m-%dT%H:%M:%S+00:00" "$src")
    title=$(emit_safe_title "Voice memo $stem")
    dest_audio="$AUDIO/$fname"
    md="$NOTES/$title.md"
    n=2
    while [ -f "$md" ]; do md="$NOTES/$title $n.md"; n=$((n + 1)); done

    echo "transcribing $fname ..."
    workdir=$(mktemp -d)
    ffmpeg -y -loglevel error -i "$src" -ar 16000 -ac 1 -c:a pcm_s16le "$workdir/audio.wav"
    whisper-cli -m "$MODEL" -f "$workdir/audio.wav" -otxt -of "$workdir/out" >/dev/null 2>&1
    transcript=$(sed -e 's/[[:space:]]*$//' "$workdir/out.txt")

    write_note "$md" "$(ulid)" "$title" "$captured" "$(utc_now)" "$captured" \
        "attachments/voice/$fname" "$transcript"

    mv "$src" "$dest_audio"
    rm -rf "$workdir"
    echo "  -> ${md#$BRAIN_DIR/}"
done

echo "done. ${#audio_files[@]} file(s) transcribed."
