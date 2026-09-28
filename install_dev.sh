#!/bin/bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2025 dmitrymake
set -e

# --- CONFIGURATION ---
REPO_URL="https://github.com/dmitrymake/wave-ui.git"
BRANCH="dev"
WEB_ROOT="/var/www"
INC_DIR="/var/www/inc"
BIN_DIR="/var/www/bin"
FINAL_WEB_DIR="/var/www/wave-ui"
NGINX_CONF="/etc/nginx/sites-available/wave-ui"
PHP_FPM_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
PORT=3000

echo "-------------------------------------------------------"
echo "UPDATING WaveUI (Branch: $BRANCH) - Code Only"
echo "-------------------------------------------------------"

# 1. Stop Services to release file locks
echo ">>> [1/5] Stopping services..."
sudo systemctl stop wave-yandex.service || true
# mpd/websockify stay up unless their configs change; restart at the end for safety

# 2. Fetching Code
echo ">>> [2/5] Fetching code from branch '$BRANCH'..."
if ! command -v git &>/dev/null; then
  echo "Error: git is not installed. Please install git first."
  exit 1
fi

TEMP_DIR=$(mktemp -d)
git clone -b "$BRANCH" "$REPO_URL" "$TEMP_DIR"

# 3. Backend Update
echo ">>> [3/5] Updating Backend Logic..."

# Ensure the directories exist (in case someone deleted them)
sudo mkdir -p "$INC_DIR"
sudo mkdir -p "$BIN_DIR"
sudo mkdir -p "/var/local/www"
sudo mkdir -p "/dev/shm/yandex_music"

# Copy the PHP files (overwrite existing ones)
sudo cp "$TEMP_DIR/src/api/wave-api.php" "$WEB_ROOT/"
sudo cp "$TEMP_DIR/src/api/wave-yandex-api.php" "$WEB_ROOT/"
sudo cp "$TEMP_DIR/src/api/yandex-music.php" "$INC_DIR/"
sudo cp "$TEMP_DIR/src/api/yandex-cache.php" "$INC_DIR/"
sudo cp "$TEMP_DIR/src/api/yandex-daemon.php" "$BIN_DIR/"

# Refresh ownership (in case it drifted)
sudo chown -R www-data:www-data "$WEB_ROOT"
sudo chown -R www-data:www-data "/var/local/www"
sudo chown -R www-data:www-data "/dev/shm/yandex_music"

# Daemon execute bit
sudo chmod +x "$BIN_DIR/yandex-daemon.php"
sudo chmod -R 777 "/dev/shm/yandex_music"

# 4. Frontend Update
echo ">>> [4/5] Updating Frontend Assets..."
sudo mkdir -p "$FINAL_WEB_DIR"

# IMPORTANT: clean the frontend dir before copying to drop stale builds
echo "Cleaning old frontend files..."
sudo rm -rf "$FINAL_WEB_DIR/*"

if [ -d "$TEMP_DIR/dist" ]; then
  sudo cp -r "$TEMP_DIR/dist/." "$FINAL_WEB_DIR/"
else
  echo "WARNING: /dist folder not found in repo! Frontend might be broken."
fi

sudo chown -R www-data:www-data "$FINAL_WEB_DIR"
sudo chmod -R 755 "$FINAL_WEB_DIR"

# 5. Restoring Services
echo ">>> [5/5] Restarting Services..."

# Refresh the daemon service config (in case repo params changed; note the hardcode below)
# Rewrite the service file to guarantee a clean config
sudo bash -c "cat > /etc/systemd/system/wave-yandex.service" <<EOF
[Unit]
Description=WaveUI Yandex Music Daemon
After=network.target mpd.service

[Service]
Type=simple
User=www-data
Group=www-data
ExecStart=/usr/bin/php $BIN_DIR/yandex-daemon.php
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl restart wave-yandex.service
sudo systemctl restart nginx

# Cleanup Temp
rm -rf "$TEMP_DIR"

echo "-------------------------------------------------------"
echo "UPDATE COMPLETE! (Branch: $BRANCH)"
echo "-------------------------------------------------------"
echo "URL: http://$(hostname -I | awk '{print $1}'):$PORT"
echo "Daemon Status:"
sudo systemctl status wave-yandex.service --no-pager
