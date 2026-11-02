#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
WHISPER_DIR="$ROOT_DIR/.tools/whisper.cpp"

if [ ! -d "$WHISPER_DIR/.git" ]; then
  mkdir -p "$ROOT_DIR/.tools"
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git "$WHISPER_DIR"
fi

cmake -S "$WHISPER_DIR" -B "$WHISPER_DIR/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$WHISPER_DIR/build" --config Release -j2
sh "$WHISPER_DIR/models/download-ggml-model.sh" base

printf '\nWhisper.cpp siap digunakan.\nExecutable: %s\nModel: %s\n' \
  "$WHISPER_DIR/build/bin/whisper-cli" \
  "$WHISPER_DIR/models/ggml-base.bin"
