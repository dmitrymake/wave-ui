#!/bin/bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
set -euo pipefail

YANDEX_REPO_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
YANDEX_INSTALL_DIR="/opt/wave-yandex"
YANDEX_DATA_DIR="/var/local/www/yandex-music"
YANDEX_TOKEN_FILE="$YANDEX_DATA_DIR/token.dat"

echo ">>> Installing Yandex Music Python bridge..."
sudo apt-get install -y -qq python3-venv python3-pip php-curl curl
if ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  echo "Wave Yandex Music needs Python 3.10+; update the moOde operating system."
  exit 1
fi

# Provision dependencies before stopping the working service. Do not use system pip.
sudo mkdir -p "$YANDEX_INSTALL_DIR"
sudo python3 -m venv "$YANDEX_INSTALL_DIR/venv"
sudo "$YANDEX_INSTALL_DIR/venv/bin/python" -m pip install --disable-pip-version-check \
  -r "$YANDEX_REPO_DIR/src/api/yandex-requirements.txt"

# Keep the old PHP proxy/unit (and any previous Python version) for rollback.
# Credentials are deliberately not copied into a deployment artifact.
YANDEX_BACKUP="/var/backups/wave-yandex/$(date +%Y%m%d-%H%M%S)-$$"
sudo install -d -m 700 "$YANDEX_BACKUP"
YANDEX_BACKUP_PATHS=(/etc/systemd/system/wave-yandex.service /var/www/wave-yandex-api.php
                     "$YANDEX_INSTALL_DIR/yandex-music.py" "$YANDEX_INSTALL_DIR/yandex_client.py"
                     "$YANDEX_INSTALL_DIR/yandex_player.py" "$YANDEX_INSTALL_DIR/yandex_audio.py"
                     "$YANDEX_INSTALL_DIR/yandex-requirements.txt")
for path in "${YANDEX_BACKUP_PATHS[@]}"; do
  if sudo test -f "$path"; then
    sudo cp --parents -a "$path" "$YANDEX_BACKUP/"
  fi
done

rollback_yandex() {
  trap - ERR
  set +e
  echo "Yandex bridge installation failed; restoring $YANDEX_BACKUP."
  sudo systemctl stop wave-yandex.service
  for path in "${YANDEX_BACKUP_PATHS[@]}"; do
    if sudo test -f "$YANDEX_BACKUP$path"; then
      sudo cp -a "$YANDEX_BACKUP$path" "$path"
    fi
  done
  if sudo test -f "$YANDEX_BACKUP$YANDEX_INSTALL_DIR/yandex-requirements.txt"; then
    sudo "$YANDEX_INSTALL_DIR/venv/bin/python" -m pip install --disable-pip-version-check \
      -r "$YANDEX_BACKUP$YANDEX_INSTALL_DIR/yandex-requirements.txt"
  fi
  sudo systemctl daemon-reload
  if sudo test -f "$YANDEX_BACKUP/etc/systemd/system/wave-yandex.service"; then
    sudo systemctl restart wave-yandex.service
  fi
  echo "Inspect journalctl -u wave-yandex.service. No token was removed."
  exit 1
}
trap rollback_yandex ERR
sudo systemctl stop wave-yandex.service || true

for module in yandex-music.py yandex_client.py yandex_player.py yandex_audio.py yandex-requirements.txt; do
  sudo install -m 644 "$YANDEX_REPO_DIR/src/api/$module" "$YANDEX_INSTALL_DIR/$module"
done
sudo install -d -m 700 -o www-data -g www-data "$YANDEX_DATA_DIR"
sudo install -d -m 755 -o www-data -g www-data /dev/shm/yandex_music
if ! sudo test -f "$YANDEX_TOKEN_FILE"; then
  if sudo test -f /var/local/www/yandex_token.dat; then
    sudo install -m 600 -o www-data -g www-data /var/local/www/yandex_token.dat "$YANDEX_TOKEN_FILE"
    # Leave the legacy token in place for a PHP rollback, but make it private.
    sudo chmod 600 /var/local/www/yandex_token.dat
  else
    sudo install -m 600 -o www-data -g www-data /dev/null "$YANDEX_TOKEN_FILE"
  fi
fi
sudo chown www-data:www-data "$YANDEX_TOKEN_FILE"
sudo chmod 600 "$YANDEX_TOKEN_FILE"
sudo tee /etc/systemd/system/wave-yandex.service >/dev/null <<'EOF'
[Unit]
Description=WaveUI Yandex Music API, Radio and Audio Bridge
After=network-online.target mpd.service
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
ExecStart=/opt/wave-yandex/venv/bin/python /opt/wave-yandex/yandex-music.py
Restart=on-failure
RestartSec=5
TimeoutStopSec=60
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/local/www/yandex-music /dev/shm/yandex_music

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now wave-yandex.service || echo "Waiting for the Yandex bridge startup check..."
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 2 -H 'X-Wave-Proxy: 1' -H 'Content-Type: application/json' \
       -d '{"action":"get_state","params":{},"method":"GET"}' http://127.0.0.1:8767/api >/dev/null 2>&1; then
    sudo install -m 644 "$YANDEX_REPO_DIR/src/api/wave-yandex-api.php" /var/www/wave-yandex-api.php
    trap - ERR
    echo "Yandex Music bridge ready. Rollback files: $YANDEX_BACKUP"
    exit 0
  fi
  sleep 1
done
rollback_yandex
