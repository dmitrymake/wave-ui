#!/bin/bash
set -e

# --- CONFIGURATION ---
REPO_URL="https://github.com/dmitrymake/wave-ui.git"
TEMP_DIR="$HOME/wave-ui-source"
FINAL_WEB_DIR="/var/www/wave-ui"
WEB_ROOT="/var/www"
INC_DIR="/var/www/inc"
BIN_DIR="/var/www/bin"
NGINX_CONF="/etc/nginx/sites-available/wave-ui"
PHP_FPM_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
PORT=3000

echo ">>> [1/7] Installing dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq websockify git mpc php-curl curl

# Остановка старых сервисов
sudo systemctl stop wave-yandex.service || true
sudo systemctl stop websockify-mpd.service || true

# 2. Clone Repository
echo ">>> [2/7] Fetching code..."
if [ -d "$TEMP_DIR" ]; then sudo rm -rf "$TEMP_DIR"; fi
git clone "$REPO_URL" "$TEMP_DIR"

# 3. Setup Backend Files
echo ">>> [3/7] Installing API & Backend..."
sudo cp "$TEMP_DIR/src/api/wave-api.php" "$WEB_ROOT/"
sudo cp "$TEMP_DIR/src/api/wave-yandex-api.php" "$WEB_ROOT/"
if [ ! -d "$INC_DIR" ]; then sudo mkdir -p "$INC_DIR"; fi
sudo cp "$TEMP_DIR/src/api/yandex-music.php" "$INC_DIR/"
if [ ! -d "$BIN_DIR" ]; then sudo mkdir -p "$BIN_DIR"; fi
sudo cp "$TEMP_DIR/src/api/yandex-daemon.php" "$BIN_DIR/"

# Права на PHP файлы
sudo chown root:root "$WEB_ROOT/wave-api.php" "$WEB_ROOT/wave-yandex-api.php"
sudo chmod 755 "$WEB_ROOT/wave-api.php" "$WEB_ROOT/wave-yandex-api.php"
sudo chown -R www-data:www-data "$INC_DIR" "$BIN_DIR"
sudo chmod +x "$BIN_DIR/yandex-daemon.php"

# Хранилище токена
sudo mkdir -p /var/local/www
sudo chown www-data:www-data /var/local/www
sudo chmod 755 /var/local/www

# ОЧИСТКА И СОЗДАНИЕ ФАЙЛОВ СОСТОЯНИЯ (Критично)
sudo rm -f /tmp/wave_daemon.log
sudo rm -f /dev/shm/yandex_state.json
sudo rm -f /dev/shm/yandex_meta_cache.json

sudo touch /tmp/wave_daemon.log
sudo touch /dev/shm/yandex_state.json
sudo touch /dev/shm/yandex_meta_cache.json

sudo chown www-data:www-data /tmp/wave_daemon.log /dev/shm/yandex_state.json /dev/shm/yandex_meta_cache.json
sudo chmod 666 /tmp/wave_daemon.log
sudo chmod 777 /dev/shm/yandex_state.json
sudo chmod 777 /dev/shm/yandex_meta_cache.json

# 4. Frontend
sudo mkdir -p "$FINAL_WEB_DIR"
if [ -d "$TEMP_DIR/dist" ]; then
  sudo cp -r "$TEMP_DIR/dist/." "$FINAL_WEB_DIR/"
fi
sudo chown -R www-data:www-data "$FINAL_WEB_DIR"

# 5. Websockify Service
WEBSOCK_PATH=$(which websockify)
sudo bash -c "cat > /etc/systemd/system/websockify-mpd.service" <<EOF
[Unit]
Description=Websockify Bridge for MPD
After=network.target mpd.service

[Service]
Type=simple
User=$(whoami)
ExecStart=$WEBSOCK_PATH 0.0.0.0:8080 localhost:6600
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# 6. Yandex Daemon Service
sudo bash -c "cat > /etc/systemd/system/wave-yandex.service" <<EOF
[Unit]
Description=WaveUI Yandex Music Daemon
After=network.target mpd.service

[Service]
Type=simple
User=www-data
Group=www-data
ExecStart=/usr/bin/php /var/www/bin/yandex-daemon.php
Restart=always
RestartSec=5
# Упрощенный логгинг
StandardOutput=null
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable websockify-mpd.service
sudo systemctl start websockify-mpd.service
sudo systemctl enable wave-yandex.service
sudo systemctl start wave-yandex.service

# 7. Nginx
sudo bash -c "cat > $NGINX_CONF" <<EOF
server {
    listen $PORT;
    server_name _;
    root $FINAL_WEB_DIR;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
    location ~ \.php$ {
        root $WEB_ROOT;
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:$PHP_FPM_SOCK;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
    }
    location /imagesw/ { proxy_pass http://127.0.0.1/imagesw/; }
    location /coverart.php { proxy_pass http://127.0.0.1/coverart.php; }
}
EOF

sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
sudo systemctl restart nginx

echo "DONE. Check service: sudo systemctl status wave-yandex.service"
