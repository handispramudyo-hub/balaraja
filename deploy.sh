#!/bin/bash

# ============================================
# BALARAJA Deployment Script
# Jalankan di SERVER Rumahweb via SSH
# ============================================

set -e

echo "============================================"
echo "  BALARAJA - Deployment Script"
echo "============================================"

# --- Config ---
APP_DIR="/var/www/balaraja"  # Ganti sesuai path server
DB_NAME="balaraja"
DB_USER="balaraja_user"
DB_PASS="CHANGE_THIS_PASSWORD"  # Ganti password!

# --- 1. Buat direktori ---
echo ""
echo "[1/8] Membuat direktori aplikasi..."
sudo mkdir -p $APP_DIR
sudo chown -R $(whoami):$(whoami) $APP_DIR

# --- 2. Clone / Pull dari Git ---
echo ""
echo "[2/8] Clone repository..."
if [ -d "$APP_DIR/.git" ]; then
    cd $APP_DIR
    git pull origin main
else
    git clone YOUR_GITHUB_REPO_URL $APP_DIR
    cd $APP_DIR
fi

# --- 3. Setup Backend ---
echo ""
echo "[3/8] Setup backend..."
cd $APP_DIR/backend

# Install dependencies
composer install --no-dev --optimize-autoloader --no-interaction

# Copy .env
if [ ! -f .env ]; then
    cp .env.production .env
fi

# --- 4. Setup Database ---
echo ""
echo "[4/8] Setup database..."
# Login sebagai root MySQL dan buat database + user
mysql -u root -p <<EOF
CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
EOF

# --- 5. Laravel Setup ---
echo ""
echo "[5/8] Laravel setup..."
php artisan key:generate --force
php artisan migrate --force
php artisan db:seed --force
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Set permissions
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R 775 storage bootstrap/cache

# --- 6. Setup Frontend ---
echo ""
echo "[6/8] Build frontend..."
cd $APP_DIR/frontend
npm install
npm run build

# Copy build ke public backend
cp -r dist/* $APP_DIR/backend/public/

# --- 7. Apache/Nginx Config ---
echo ""
echo "[7/8] Checking web server..."
if command -v apache2 &> /dev/null; then
    echo "Apache detected. Creating virtual host..."
    sudo tee /etc/apache2/sites-available/balaraja.conf > /dev/null <<EOF
<VirtualHost *:80>
    ServerName balaraja.handispramudio.my.id
    DocumentRoot $APP_DIR/backend/public

    <Directory $APP_DIR/backend/public>
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/balaraja-error.log
    CustomLog \${APACHE_LOG_DIR}/balaraja-access.log combined
</VirtualHost>
EOF
    sudo a2ensite balaraja.conf
    sudo a2enmod rewrite
    sudo systemctl reload apache2
elif command -v nginx &> /dev/null; then
    echo "Nginx detected. Creating config..."
    sudo tee /etc/nginx/sites-available/balaraja > /dev/null <<EOF
server {
    listen 80;
    server_name balaraja.handispramudio.my.id;
    root $APP_DIR/backend/public;
    index index.php;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
        fastcgi_param SCRIPT_FILENAME \$realpath_root\$fastcgi_script_name;
        include fastcgi_params;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
EOF
    sudo ln -sf /etc/nginx/sites-available/balaraja /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx
fi

echo ""
echo "============================================"
echo "  DEPLOYMENT SELESAI!"
echo "============================================"
echo ""
echo "  Aplikasi: http://balaraja.handispramudio.my.id"
echo "  Login: admin@balaraja.com / password"
echo ""
echo "============================================"
