# BALARAJA - Deployment Guide

## Prerequisites
- GitHub account
- SSH access ke Rumahweb (port 2223)
- cPanel access

## Step 1: Buat GitHub Repository
1. Buat repo baru di GitHub: `balaraja`
2. Set visibility: **Private** (karena ada credential)

## Step 2: Push dari Lokal
```bash
cd "D:\data dio\balaraja"
git remote add origin https://github.com/YOUR_USERNAME/balaraja.git
git add .
git commit -m "initial commit balaraja"
git push -u origin main
```

## Step 3: SSH ke Server
```bash
ssh -p 2223 hank7435@202.10.43.184
```

## Step 4: Install Node.js (jika belum ada)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

## Step 5: Clone & Setup
```bash
cd /home/hank7435
git clone https://github.com/YOUR_USERNAME/balaraja.git
cd balaraja/backend
composer install --no-dev --optimize-autoloader
cp .env.production .env
php artisan key:generate
```

## Step 6: Setup Database di cPanel
1. Login cPanel
2. MySQL Databases
3. Buat database: `balaraja`
4. Buat MySQL User: `balaraja_user` + password
5. Add User to Database → Grant **ALL PRIVILEGES**

## Step 7: Edit .env
```bash
nano backend/.env
```
Update:
```
DB_DATABASE=balaraja
DB_USERNAME=balaraja_user
DB_PASSWORD=password_dari_cpanel
```

## Step 8: Build Frontend & Deploy
```bash
cd /home/hank7435/balaraja/frontend
npm install
npm run build
cp -r dist/* ../backend/public/

cd ../backend
php artisan migrate --force
php artisan db:seed --force
php artisan config:cache
php artisan route:cache
chmod -R 775 storage bootstrap/cache
```

## Step 9: Setup Apache/Nginx di cPanel
1. cPanel → Domains / Addon Domains
2. Document Root: `/home/hank7435/balaraja/backend/public`

Atau gunakan `.htaccess` yang sudah ada di Laravel.

## Login
- URL: `http://202.10.43.184`
- Email: `admin@balaraja.com`
- Password: `password`

## Update Deployment
```bash
ssh -p 2223 hank7435@202.10.43.184
cd /home/hank7435/balaraja
git pull origin main
cd backend
composer install --no-dev --optimize-autoloader
cd ../frontend
npm install
npm run build
cp -r dist/* ../backend/public/
cd ../backend
php artisan migrate --force
php artisan config:cache
php artisan route:cache
```
