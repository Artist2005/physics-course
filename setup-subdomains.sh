#!/usr/bin/env bash
set -euo pipefail

SUBDOMAIN="${1:-physics.sheua.com}"
ROOT_DOMAIN="sheua.com"
PHYSICS_DIR="/var/www/physics-course"
HUB_DIR="/var/www/sheua-hub"

echo "=== [1/4] Оновлюємо домен у файлах 3D-лабораторії на https://${SUBDOMAIN} ==="
if [ "${SUBDOMAIN}" != "physics.sheua.com" ]; then
  sudo sed -i "s|https://physics.sheua.com|https://${SUBDOMAIN}|g" "${PHYSICS_DIR}/sitemap.xml" "${PHYSICS_DIR}/robots.txt"
  sudo find "${PHYSICS_DIR}" -maxdepth 3 -name "*.html" -exec sed -i "s|https://physics.sheua.com|https://${SUBDOMAIN}|g" {} +
fi

echo "=== [2/4] Розгортаємо головний портал ${ROOT_DOMAIN} у ${HUB_DIR} з папки sheua-root ==="
sudo mkdir -p "${HUB_DIR}"
sudo cp -a "${PHYSICS_DIR}/sheua-root/." "${HUB_DIR}/"
sudo chown -R www-data:www-data "${HUB_DIR}"
sudo chmod -R 755 "${HUB_DIR}"

echo "=== [3/4] Налаштовуємо віртуальні хости Nginx для ${SUBDOMAIN} та ${ROOT_DOMAIN} ==="
sudo cp "${PHYSICS_DIR}/nginx-vm.conf" /etc/nginx/sites-available/physics-course
sudo sed -i "s/server_name _;/server_name ${SUBDOMAIN};/" /etc/nginx/sites-available/physics-course
sudo ln -sf /etc/nginx/sites-available/physics-course /etc/nginx/sites-enabled/physics-course

sudo tee /etc/nginx/sites-available/sheua-hub > /dev/null << EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${ROOT_DOMAIN} www.${ROOT_DOMAIN};

    root ${HUB_DIR};
    index index.html;
    charset utf-8;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/html text/javascript text/xml application/javascript application/json application/ld+json application/xml image/svg+xml;

    error_page 404 /404.html;

    if (\$host = www.${ROOT_DOMAIN}) {
        return 301 https://${ROOT_DOMAIN}\$request_uri;
    }

    location = /ads.txt {
        default_type text/plain;
        add_header Cache-Control "public, max-age=3600" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files /ads.txt =404;
    }

    location = /404.html {
        internal;
        add_header Cache-Control "no-cache" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
    }

    location / {
        add_header Cache-Control "no-cache" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header X-Frame-Options "SAMEORIGIN" always;
        try_files \$uri \$uri.html \$uri/ =404;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/sheua-hub /etc/nginx/sites-enabled/sheua-hub

sudo nginx -t
sudo systemctl reload nginx

echo "=== [4/4] Випускаємо HTTPS-сертифікати (Let's Encrypt) для ${ROOT_DOMAIN} та ${SUBDOMAIN} ==="
if command -v certbot >/dev/null 2>&1; then
  sudo certbot --nginx -d "${ROOT_DOMAIN}" -d "www.${ROOT_DOMAIN}" -d "${SUBDOMAIN}" --redirect --expand || true
fi

echo "Готово!"
