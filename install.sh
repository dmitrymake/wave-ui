#!/bin/bash
set -e

# --- CONFIGURATION ---
REPO_URL="https://github.com/dmitrymake/wave-ui.git"
WEB_ROOT="/var/www"
INC_DIR="/var/www/inc"
BIN_DIR="/var/www/bin"
FINAL_WEB_DIR="/var/www/wave-ui"
NGINX_CONF="/etc/nginx/sites-available/wave-ui"
PHP_FPM_SOCK=$(ls /run/php/php*-fpm.sock | head -n 1)
PORT=3000

echo "-------------------------------------------------------"
echo "Deploying WaveUI (Industrial Edition) to Port $PORT"
echo "-------------------------------------------------------"

# 1. Cleaning up previous mess
echo ">>> [1/7] Cleaning environment..."
sudo systemctl stop wave-yandex.service || true
sudo systemctl stop websockify-mpd.service || true
sudo rm -rf /dev/shm/yandex_music/
sudo rm -f /tmp/wave_daemon.log

# 2. Dependencies
echo ">>> [2/7] Installing dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq websockify git mpc php-curl curl

# 3. Fetching Code
echo ">>> [3/7] Fetching code..."
TEMP_DIR=$(mktemp -d)
git clone "$REPO_URL" "$TEMP_DIR"

# 4. Backend Installation
echo ">>> [4/7] Installing API & Backend Logic..."

# Создаем структуру директорий
sudo mkdir -p "$INC_DIR"
sudo mkdir -p "$BIN_DIR"
sudo mkdir -p "/var/local/www"
sudo mkdir -p "/dev/shm/yandex_music"

# Копируем PHP файлы
sudo cp "$TEMP_DIR/src/api/wave-api.php" "$WEB_ROOT/"
sudo cp "$TEMP_DIR/src/api/wave-yandex-api.php" "$WEB_ROOT/"
sudo cp "$TEMP_DIR/src/api/yandex-music.php" "$INC_DIR/"
sudo cp "$TEMP_DIR/src/api/yandex-daemon.php" "$BIN_DIR/"

# Выставляем владельца один раз на всё дерево
sudo chown -R www-data:www-data "$WEB_ROOT"
sudo chown -R www-data:www-data "/var/local/www"
sudo chown -R www-data:www-data "/dev/shm/yandex_music"

# Права на исполнение демона и доступ к SHM
sudo chmod +x "$BIN_DIR/yandex-daemon.php"
sudo chmod -R 777 "/dev/shm/yandex_music"

# 5. Frontend Installation
echo ">>> [5/7] Installing Frontend Assets..."
sudo mkdir -p "$FINAL_WEB_DIR"
if [ -d "$TEMP_DIR/dist" ]; then
  sudo cp -r "$TEMP_DIR/dist/." "$FINAL_WEB_DIR/"
else
  echo "WARNING: /dist folder not found, check repository structure!"
fi
sudo chown -R www-data:www-data "$FINAL_WEB_DIR"
sudo chmod -R 755 "$FINAL_WEB_DIR"

# 6. Service Configuration
echo ">>> [6/7] Configuring Systemd Services..."

# Websockify Service
sudo bash -c "cat > /etc/systemd/system/websockify-mpd.service" <<EOF
[Unit]
Description=Websockify Bridge for MPD
After=network.target mpd.service

[Service]
Type=simple
User=$(whoami)
ExecStart=$(which websockify) 0.0.0.0:8080 localhost:6600
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Yandex Daemon Service (Strict www-data execution)
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

# Restart all services
sudo systemctl daemon-reload
sudo systemctl enable --now websockify-mpd.service
sudo systemctl enable --now wave-yandex.service

# 7. Nginx Configuration
echo ">>> [7/7] Configuring Nginx on Port $PORT..."
sudo bash -c "cat > $NGINX_CONF" <<EOF
server {
    listen $PORT;
    server_name _;

    root $FINAL_WEB_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API Proxy to PHP files in root
    location ~ \.php$ {
        root $WEB_ROOT;
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:$PHP_FPM_SOCK;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
    }

    # Proxy covers and assets from main Moode
    location /imagesw/ {
        proxy_pass http://127.0.0.1/imagesw/;
    }
    
    location /coverart.php {
        proxy_pass http://127.0.0.1/coverart.php;
    }
}
EOF

# Enable Nginx site
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Cleanup Temp
rm -rf "$TEMP_DIR"

echo "-------------------------------------------------------"
echo "DEPLOYMENT COMPLETE!"
echo "-------------------------------------------------------"
echo "URL: http://$(hostname -I | awk '{print $1}'):$PORT"
echo "Daemon Log: tail -f /tmp/wave_daemon.log"
echo "-------------------------------------------------------"

sudo systemctl status wave-yandex.service --no-pager
