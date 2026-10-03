#!/bin/bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
set -euo pipefail

YOUTUBE_REPO_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
YOUTUBE_INSTALL_DIR="/opt/wave-youtube"

echo ">>> Installing YouTube Music bridge..."
sudo apt-get install -y -qq python3-venv python3-pip php-curl curl unzip
if ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  echo "YouTube Music needs Python 3.10+; update the moOde operating system."
  exit 1
fi
sudo mkdir -p "$YOUTUBE_INSTALL_DIR"
sudo python3 -m venv "$YOUTUBE_INSTALL_DIR/venv"
sudo "$YOUTUBE_INSTALL_DIR/venv/bin/python" -m pip install --disable-pip-version-check \
  -r "$YOUTUBE_REPO_DIR/src/api/youtube-requirements.txt"
sudo install -m 644 "$YOUTUBE_REPO_DIR/src/api/youtube-music.py" "$YOUTUBE_INSTALL_DIR/youtube-music.py"
sudo install -m 644 "$YOUTUBE_REPO_DIR/src/api/youtube_solver.py" "$YOUTUBE_INSTALL_DIR/youtube_solver.py"
sudo install -m 644 "$YOUTUBE_REPO_DIR/src/api/youtube-solver.js" "$YOUTUBE_INSTALL_DIR/youtube-solver.js"
sudo install -m 644 "$YOUTUBE_REPO_DIR/src/api/wave-youtube-api.php" /var/www/wave-youtube-api.php
sudo install -d -m 700 -o www-data -g www-data /var/local/www/youtube-music

# A supported JS runtime is required by yt-dlp's YouTube challenge solver.
# Preserve an existing Deno/Node installation. Provision Deno on the 64-bit
# architectures for which upstream supplies binaries, keeping it in our own directory.
if ! env PATH="$YOUTUBE_INSTALL_DIR:$PATH" "$YOUTUBE_INSTALL_DIR/venv/bin/python" - "$YOUTUBE_INSTALL_DIR" <<'PY'
import importlib.util
import sys
sys.path.insert(0, sys.argv[1])
spec = importlib.util.spec_from_file_location("wave_youtube", sys.argv[1] + "/youtube-music.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
sys.exit(module.runtime_info() is None)
PY
then
  case "$(uname -m)" in
    aarch64|arm64) YOUTUBE_DENO_TARGET="aarch64-unknown-linux-gnu" ;;
    x86_64) YOUTUBE_DENO_TARGET="x86_64-unknown-linux-gnu" ;;
    *) YOUTUBE_DENO_TARGET="" ;;
  esac
  if [ -n "$YOUTUBE_DENO_TARGET" ]; then
    YOUTUBE_RUNTIME_TEMP=$(mktemp -d)
    trap 'rm -rf "$YOUTUBE_RUNTIME_TEMP"' EXIT
    YOUTUBE_DENO_ASSET="deno-$YOUTUBE_DENO_TARGET.zip"
    YOUTUBE_DENO_RELEASE="https://github.com/denoland/deno/releases/latest/download"
    curl -fsSL --retry 2 "$YOUTUBE_DENO_RELEASE/$YOUTUBE_DENO_ASSET" -o "$YOUTUBE_RUNTIME_TEMP/$YOUTUBE_DENO_ASSET"
    curl -fsSL --retry 2 "$YOUTUBE_DENO_RELEASE/$YOUTUBE_DENO_ASSET.sha256sum" -o "$YOUTUBE_RUNTIME_TEMP/checksum"
    (cd "$YOUTUBE_RUNTIME_TEMP" && sha256sum --check checksum)
    unzip -q "$YOUTUBE_RUNTIME_TEMP/$YOUTUBE_DENO_ASSET" -d "$YOUTUBE_RUNTIME_TEMP"
    sudo install -m 755 "$YOUTUBE_RUNTIME_TEMP/deno" "$YOUTUBE_INSTALL_DIR/deno"
  else
    echo "Install Node.js 22+ or Deno 2.3+ for YouTube audio on this architecture. Browsing remains available."
  fi
fi

sudo tee /etc/systemd/system/wave-youtube.service >/dev/null <<'EOF'
[Unit]
Description=WaveUI YouTube Music API and Audio Bridge
After=network-online.target mpd.service
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
Environment=PATH=/opt/wave-youtube:/usr/local/bin:/usr/bin:/bin
Environment=DENO_DIR=/var/local/www/youtube-music/deno-cache
ExecStart=/opt/wave-youtube/venv/bin/python /opt/wave-youtube/youtube-music.py
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/local/www/youtube-music

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now wave-youtube.service
sudo systemctl restart wave-youtube.service
