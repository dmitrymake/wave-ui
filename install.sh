#!/bin/bash

# Exit on error
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

echo "-------------------------------------------------------"
echo "Deploying WaveUI (Server Edition) to Port $PORT"
echo "-------------------------------------------------------"

# 1. Install Runtime Dependencies
echo ">>> [1/7] Installing dependencies..."
sudo apt-get update -qq
sudo apt-get install -y -qq websockify git mpc php-curl curl

echo ">>> Reloading PHP Service..."
sudo systemctl restart php*-fpm

# 2. Clone Repository
echo ">>> [2/7] Fetching code..."
if [ -d "$TEMP_DIR" ]; then sudo rm -rf "$TEMP_DIR"; fi
git clone "$REPO_URL" "$TEMP_DIR"

# 3. Setup Backend Files (PHP)
echo ">>> [3/7] Installing API & Backend Logic..."

sudo cp "$TEMP_DIR/src/api/wave-api.php" "$WEB_ROOT/"
sudo cp "$TEMP_DIR/src/api/wave-yandex-api.php" "$WEB_ROOT/"

if [ ! -d "$INC_DIR" ]; then sudo mkdir -p "$INC_DIR"; fi
sudo cp "$TEMP_DIR/src/api/yandex-music.php" "$INC_DIR/"

if [ ! -d "$BIN_DIR" ]; then sudo mkdir -p "$BIN_DIR"; fi
sudo cp "$TEMP_DIR/src/api/yandex-daemon.php" "$BIN_DIR/"

sudo chown root:root "$WEB_ROOT/wave-api.php" "$WEB_ROOT/wave-yandex-api.php"
sudo chmod 755 "$WEB_ROOT/wave-api.php" "$WEB_ROOT/wave-yandex-api.php"
sudo chown -R www-data:www-data "$INC_DIR" "$BIN_DIR"
sudo chmod +x "$BIN_DIR/yandex-daemon.php"

sudo mkdir -p /var/local/www
sudo chown www-data:www-data /var/local/www
sudo chmod 755 /var/local/www

# 4. Prepare Web Directory (Frontend)
echo ">>> [4/7] Moving frontend files to $FINAL_WEB_DIR..."
sudo mkdir -p "$FINAL_WEB_DIR"
if [ -d "$TEMP_DIR/dist" ]; then
  sudo cp -r "$TEMP_DIR/dist/." "$FINAL_WEB_DIR/"
else
  echo "ERROR: /dist folder not found in repository!"
  exit 1
fi
# Grant Nginx access
sudo chown -R www-data:www-data "$FINAL_WEB_DIR"
sudo chmod -R 755 "$FINAL_WEB_DIR"

# 5. Create Systemd Service for Websockify
echo ">>> [5/7] Setting up Websockify Bridge..."
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

sudo systemctl daemon-reload
sudo systemctl enable --now websockify-mpd.service

# 6. Create Systemd Service for Yandex Daemon (NEW!)
echo ">>> [6/7] Setting up Yandex Background Daemon..."
sudo bash -c "cat > /etc/systemd/system/wave-yandex.service" <<EOF
[Unit]
Description=WaveUI Yandex Music Daemon
After=network.target mpd.service

[Service]
Type=simple
User=www-data
ExecStart=/usr/bin/php $BIN_DIR/yandex-daemon.php
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now wave-yandex.service

# 7. Configure Nginx for Port 3000
echo ">>> [7/7] Configuring Nginx..."
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

    # Proxy covers from main Moode
    location /imagesw/ {
        proxy_pass http://127.0.0.1/imagesw/;
    }
    
    location /coverart.php {
        proxy_pass http://127.0.0.1/coverart.php;
    }
}
EOF

# Enable the site and restart Nginx
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

echo "-------------------------------------------------------"
echo "SUCCESSFULLY DEPLOYED!"
echo "-------------------------------------------------------"
echo "Access the new UI at: http://moode.local:$PORT"
echo "Or via IP: http://$(hostname -I | awk '{print $1}'):$PORT"
echo "-------------------------------------------------------"
