#!/usr/bin/env bash
set -euo pipefail
target="${1:?Provide an output MP4 path}"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'testsrc2=size=320x180:rate=15:duration=4' -f lavfi -i 'sine=frequency=440:sample_rate=16000:duration=4' -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest -movflags +faststart "$target"
